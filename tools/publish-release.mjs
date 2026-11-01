#!/usr/bin/env node
// Release coordination helper only. No application code is edited here.
// Default is a read-only dry-run gate. Mutating flags:
//   --prepare       write release/SHA256SUMS.txt from fresh artifacts (only
//                   when latest.yml version/names agree with package.json).
//   --upload-draft  gate Green, then create (or reuse) draft release
//                   v<package.json version> at the exact HEAD commit and
//                   upload the native-space assets (idempotent on match).
//   --publish       gate Green, then flip the matching draft to published.
// Refusals: dirty tree, stale latest.yml, SHA mismatch, credential bytes
// bundled, no green CI run for the exact HEAD commit, overwrite of a
// published release, or a differing asset already on a draft.
// Auth: GCM `git credential fill` (protocol=https host=github.com) held in
// memory only; HTTPS to api.github.com / uploads.github.com only, fixed
// hosts, redirects refused (never follow an auth redirect); tokens/keys
// are never printed.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const OWNER = 'duschino-source'
const REPO = 'pocketbench-windows'
const API_HOST = 'api.github.com'
const UPLOAD_HOST = 'uploads.github.com'
const ALLOWED_HOSTS = new Set([API_HOST, UPLOAD_HOST])

function sh(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 30000 }).trim()
}
export function nativeNames(version) {
  // electron-builder output names with explicit hyphen artifactName
  // (package.json nsis/portable artifactName). electron-builder PORTABLE
  // emits no .blockmap, so only the NSIS blockmap exists. latest.yml
  // normalizes to these hyphen names; never rename outputs by hand.
  return {
    setup: `PocketBench-Setup-${version}.exe`,
    portable: `PocketBench-${version}.exe`,
    setupBlockmap: `PocketBench-Setup-${version}.exe.blockmap`,
  }
}
export function requiredAssets(version) {
  const n = nativeNames(version)
  // 5 required assets only: setup + portable + NSIS blockmap + feed + hash.
  return [n.setup, n.portable, n.setupBlockmap, 'latest.yml', 'SHA256SUMS.txt']
}
// Minimal latest.yml reader (electron-builder output shape only).
export function parseLatestYml(text) {
  const get = (re) => (text.match(re) || [])[1] || null
  const urls = [...text.matchAll(/url:\s*(.+)/g)].map((m) => m[1].trim())
  return {
    version: get(/^version:\s*(.+)/m),
    path: get(/^path:\s*(.+)/m),
    sha512: get(/^sha512:\s*(.+)/m),
    firstUrl: urls[0] || null,
  }
}
export function verifyShaLines(sumsText, digests) {
  // digests: Map basename -> hex. Returns missing/mismatched basenames.
  const problems = []
  const lines = sumsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const seen = new Set()
  for (const line of lines) {
    const m = line.match(/^([0-9a-f]{64})\s+(.+)$/i)
    if (!m) { problems.push(`malformed line: ${line.slice(0, 60)}`); continue }
    const [, hex, name] = m
    seen.add(name)
    if (!digests.has(name)) { problems.push(`unexpected file in SHA256SUMS.txt: ${name}`); continue }
    if (digests.get(name) !== hex.toLowerCase()) problems.push(`sha256 mismatch: ${name}`)
  }
  for (const name of digests.keys()) if (!seen.has(name)) problems.push(`missing from SHA256SUMS.txt: ${name}`)
  return problems
}
export function parseArgs(raw) {
  const flags = new Set(raw)
  return {
    prepare: flags.has('--prepare'),
    uploadDraft: flags.has('--upload-draft'),
    publish: flags.has('--publish'),
    skipCi: flags.has('--skip-ci'),
    selfTest: flags.has('--self-test'),
    help: flags.has('--help') || flags.has('-h'),
  }
}
function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
function gcmToken() {
  const env = { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' }
  const out = execFileSync('git', ['credential', 'fill'], {
    input: `protocol=https\nhost=github.com\nusername=${OWNER}\n\n`,
    encoding: 'utf8', timeout: 30000, env,
  })
  const password = Object.fromEntries(
    out.split('\n').filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/).slice(0, 2)),
  ).password
  if (!password) throw new Error('GCM credential unavailable (no token in memory).')
  return password
}
function assertFixedHost(url, what) {
  const host = new URL(url).hostname
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`${what}: refusing non-GitHub destination (${host})`)
}
async function checkedFetch(url, token, options = {}, what = 'GitHub request') {
  assertFixedHost(url, what)
  const res = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(120000) })
  if (res.status >= 300 && res.status < 400) {
    // Never follow an authenticated redirect (token would leak); fail loudly.
    throw new Error(`${what}: refusing redirect (${res.status} to ${(res.headers.get('location') || '').slice(0, 80)})`)
  }
  return res
}
async function gh(path, token, method = 'GET', body) {
  const url = `https://${API_HOST}${path}`
  const res = await checkedFetch(url, token, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'User-Agent': 'PocketBench-release',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, `GitHub API ${method} ${path}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`)
  return res.json()
}
async function uploadAsset(uploadUrl, token, filePath, name, contentType = 'application/octet-stream') {
  // Strip the GitHub URI template ('{?name,label}') BEFORE parsing or
  // appending params; new URL() on the raw template throws/400s.
  const url = new URL(uploadUrl.split('{', 1)[0])
  if (url.hostname !== UPLOAD_HOST) throw new Error('Unexpected upload destination')
  url.searchParams.set('name', name)
  url.searchParams.set('label', name)
  const bytes = readFileSync(filePath)
  const res = await checkedFetch(url.toString(), token, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'User-Agent': 'PocketBench-release',
      Accept: 'application/vnd.github+json',
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
    },
    body: bytes,
  }, `asset upload ${name}`)
  if (!res.ok) throw new Error(`Asset upload ${res.status} for ${name}`)
  return res.json()
}

async function runGate({ checkCi }) {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  const commit = sh('git', ['rev-parse', 'HEAD'])
  const dirty = sh('git', ['status', '--short'])
  const names = nativeNames(version)
  const report = { version, commit, dirty: dirty.split('\n').filter(Boolean).slice(0, 10), checks: [] }
  const fail = (name, detail) => report.checks.push({ name, ok: false, detail })
  const pass = (name, detail) => report.checks.push({ name, ok: true, detail })

  // 1. Frozen tree required.
  if (dirty) fail('frozen-tree', 'Working tree has uncommitted changes; no release from a moving tree.')
  else pass('frozen-tree', `HEAD ${commit.slice(0, 7)} clean`)

  // 2. Hyphen artifacts present (explicit artifactName in package.json).
  // Stale win-unpacked copy is not proof. Never rename outputs by hand.
  const missing = Object.values(names).filter((n) => !existsSync(join(ROOT, 'release', n)))
  const emptyBlocks = [names.setupBlockmap]
    .filter((n) => existsSync(join(ROOT, 'release', n)) && statSync(join(ROOT, 'release', n)).size === 0)
  const latestYml = join(ROOT, 'release', 'latest.yml')
  const sums = join(ROOT, 'release', 'SHA256SUMS.txt')
  if (missing.length) fail('native-artifacts', 'Missing: ' + missing.join(', '))
  else pass('native-artifacts', 'setup + portable + NSIS blockmap present with hyphen names (portable emits no blockmap)')
  if (emptyBlocks.length) fail('native-artifacts', 'Empty blockmap: ' + emptyBlocks.join(', '))
  if (!existsSync(latestYml)) fail('latest.yml', 'release/latest.yml missing')
  if (!existsSync(sums)) fail('SHA256SUMS.txt', 'release/SHA256SUMS.txt missing (run with --prepare)')

  // 3. latest.yml must reference the hyphen setup name (electron-builder
  // feed matches the explicit artifactName) and must carry the current
  // package version; a stale latest.yml fails here.
  if (existsSync(latestYml)) {
    const parsed = parseLatestYml(readFileSync(latestYml, 'utf8'))
    const decodedUrl = parsed.firstUrl ? decodeURIComponent(parsed.firstUrl) : null
    if (parsed.version !== version) fail('latest.yml-version', `STALE latest.yml version=${parsed.version} package=${version}; rebuild after freeze so generated metadata agrees.`)
    else if (parsed.path !== names.setup || (decodedUrl !== names.setup && parsed.firstUrl !== names.setup))
      fail('latest.yml-names', `latest.yml path/url must equal "${names.setup}"; got path="${parsed.path}" url="${parsed.firstUrl}". Do not rename artifacts by hand.`)
    else pass('latest.yml-names', `latest.yml matches "${names.setup}"`)
    const ymlFiles = readdirSync(join(ROOT, 'release')).filter((f) => f.endsWith('.yml'))
    if (!ymlFiles.some((f) => f.toLowerCase().includes('portable'))) {
      report.checks.push({ name: 'portable-yml', ok: true, detail: 'note: portable has no separate yml in this electron-builder config; updater uses latest.yml + NSIS blockmap', advisory: true })
    }
  }

  // 4. SHA256 proof.
  if (existsSync(sums) && !missing.length) {
    const digests = new Map([
      [names.setup, sha256File(join(ROOT, 'release', names.setup))],
      [names.portable, sha256File(join(ROOT, 'release', names.portable))],
    ])
    const problems = verifyShaLines(readFileSync(sums, 'utf8'), digests)
    if (problems.length) fail('sha256-proof', problems.join('; '))
    else pass('sha256-proof', 'SHA256SUMS.txt matches both exes')
    report.digests = { setupSha256: digests.get(names.setup), portableSha256: digests.get(names.portable) }
  }

  // 5. Secrets scan: exact key bytes must not be bundled; report booleans only.
  try {
    const asar = join(ROOT, 'release', 'win-unpacked', 'resources', 'app.asar')
    if (!existsSync(asar)) {
      report.checks.push({ name: 'secrets-scan', ok: true, detail: 'app.asar not present; scan on next dist output', advisory: true })
    } else {
      const bytes = readFileSync(asar)
      const keyFile = process.env.POCKETBENCH_KEY_FILE
      const envKey = (process.env.MODEL_API_KEY || '').trim()
      let checked = 0, found = false
      const probe = (secret) => {
        if (!secret || secret.length < 20) return
        checked++
        if (bytes.includes(Buffer.from(secret))) found = true
      }
      if (keyFile && existsSync(keyFile)) probe(readFileSync(keyFile, 'utf8').replace(/^\uFEFF/, '').trim())
      probe(envKey)
      const tokenPath = join(ROOT, '.local', 'gateway-token')
      if (existsSync(tokenPath)) probe(readFileSync(tokenPath, 'utf8').trim())
      if (found) fail('secrets-scan', 'Exact credential bytes detected in app.asar bundle.')
      else pass('secrets-scan', `asar scanned (${bytes.length} bytes, ${checked} credential source(s) probed by bytes, none bundled)`)
    }
  } catch (e) { fail('secrets-scan', String(e.message || e).slice(0, 160)) }

  // 6. Exact-commit CI green gate (read-only API). Version is derived from
  // package.json (never hardcoded); the green run must match exact HEAD SHA.
  if (!checkCi) {
    report.checks.push({ name: 'ci-gate', ok: true, detail: 'skipped by flag (dry-run only)', advisory: true })
  } else {
    let token = null
    try {
      token = gcmToken()
      const runs = await gh(`/repos/${OWNER}/${REPO}/actions/runs?head_sha=${commit}&per_page=20`, token)
      const list = (runs && runs.workflow_runs) || []
      const ok = list.find((r) => r.head_sha === commit && r.conclusion === 'success')
      const any = list.filter((r) => r.head_sha === commit)
      if (ok) pass('ci-gate', `green run ${ok.id} for exact commit ${commit.slice(0, 7)}`)
      else fail('ci-gate', any.length ? `no successful run for exact commit ${commit.slice(0, 7)} (${any.length} run(s): ${any.map((r) => r.status + '/' + r.conclusion).join(', ')})` : `no CI runs for exact commit ${commit.slice(0, 7)}`)
      report.ciRuns = any.map((r) => ({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion }))
    } catch (e) { fail('ci-gate', String(e.message || e).slice(0, 200)) }
    finally { token = null } // drop in-memory credential reference
  }

  report.ok = report.checks.filter((c) => !c.advisory).every((c) => c.ok)
  return report
}

function doPrepare(version) {
  // Write SHA256SUMS.txt only when fresh artifacts + metadata agree.
  // --prepare must not require any old/existing checksum to regenerate:
  // it recomputes from the current release/ exes unconditionally (after
  // the latest.yml agreement checks above).
  const names = nativeNames(version)
  const latestYml = join(ROOT, 'release', 'latest.yml')
  if (!existsSync(latestYml)) throw new Error('Refusing --prepare: release/latest.yml missing; rebuild first.')
  const parsed = parseLatestYml(readFileSync(latestYml, 'utf8'))
  if (parsed.version !== version) {
    throw new Error(`Refusing --prepare: stale latest.yml version=${parsed.version} package=${version}; rebuild so generated metadata agrees.`)
  }
  const decodedUrl = parsed.firstUrl ? decodeURIComponent(parsed.firstUrl) : null
  if (parsed.path !== names.setup || (decodedUrl !== names.setup && parsed.firstUrl !== names.setup)) {
    throw new Error(`Refusing --prepare: latest.yml path/url must equal native "${names.setup}".`)
  }
  for (const n of Object.values(names)) {
    if (!existsSync(join(ROOT, 'release', n))) throw new Error(`Refusing --prepare: missing fresh artifact ${n}.`)
  }
  const lines = [names.setup, names.portable].map((n) => `${sha256File(join(ROOT, 'release', n))}  ${n}`)
  writeFileSync(join(ROOT, 'release', 'SHA256SUMS.txt'), lines.join('\n') + '\n')
  console.log(`Prepared SHA256SUMS.txt for ${version} (${lines.length} files).`)
}

async function ensureDraft(version, commit, token) {
  const tag = `v${version}`
  const existing = await gh(`/repos/${OWNER}/${REPO}/releases/tags/${tag}`, token)
  if (existing) {
    if (!existing.draft) throw new Error(`Refusing: release ${tag} is already published (id ${existing.id}); never overwrite a published release.`)
    if (existing.target_commitish && existing.target_commitish !== commit) {
      // Draft pinned to another commit: allow only same-commit reuse.
      throw new Error(`Refusing: draft ${tag} targets ${existing.target_commitish}, HEAD is ${commit}.`)
    }
    console.log(`Reusing existing draft ${tag} (id ${existing.id}).`)
    return existing
  }
  const created = await gh(`/repos/${OWNER}/${REPO}/releases`, token, 'POST', {
    tag_name: tag,
    name: tag,
    target_commitish: commit,
    draft: true,
    prerelease: false,
    generate_release_notes: false,
  })
  if (!created || !created.id) throw new Error('Draft creation returned no release id.')
  console.log(`Created draft ${tag} (id ${created.id}) at ${commit.slice(0, 7)}.`)
  return created
}

async function syncAssets(release, version, token) {
  // Idempotent skip requires GitHub-reported digest (SHA256) to equal the
  // local file hash — size alone is never enough. If GitHub reports no
  // digest for an existing asset, download its bytes from the fixed
  // allowed upload host WITHOUT any credential and compare hashes; never
  // blind-accept on missing digest.
  const local = requiredAssets(version).map((n) => {
    const p = join(ROOT, 'release', n)
    return { name: n, size: statSync(p).size, sha256: sha256File(p) }
  })
  const remote = await gh(`/repos/${OWNER}/${REPO}/releases/${release.id}/assets?per_page=100`, token)
  const byName = new Map((remote || []).map((a) => [a.name, a]))
  for (const { name, size, sha256 } of local) {
    const hit = byName.get(name)
    if (hit && hit.size === size && hit.state === 'uploaded') {
      const remoteDigest = (hit.digest || '').replace(/^sha256:/i, '').toLowerCase()
      if (remoteDigest && remoteDigest === sha256) {
        console.log(`Asset idempotent match (sha256), skipping: ${name} (${size} bytes).`)
        continue
      }
      if (!remoteDigest) {
        // No digest reported: fetch bytes from fixed host, no credential.
        const dl = hit.browser_download_url || hit.url
        assertFixedHost(dl, `digest re-check for ${name}`)
        const res = await fetch(dl, { redirect: 'manual', signal: AbortSignal.timeout(120000) })
        if (res.status >= 300 && res.status < 400) throw new Error(`digest re-check for ${name}: refusing redirect (${res.status})`)
        if (!res.ok) throw new Error(`digest re-check for ${name}: HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        const remoteHash = createHash('sha256').update(buf).digest('hex')
        if (buf.length === size && remoteHash === sha256) {
          console.log(`Asset idempotent match (downloaded-bytes sha256), skipping: ${name} (${size} bytes).`)
          continue
        }
        throw new Error(`Refusing: draft already carries differing asset ${name} (hash differs; digest was missing, bytes compared). Delete it manually after review; never silently replace.`)
      }
      throw new Error(`Refusing: draft already carries differing asset ${name} (remote digest ${remoteDigest.slice(0, 12) || 'none'} vs local sha256 ${sha256.slice(0, 12)}). Delete it manually after review; never silently replace.`)
    }
    if (hit) {
      throw new Error(`Refusing: draft already carries differing asset ${name} (remote ${hit.size} bytes vs local ${size} bytes). Delete it manually after review; never silently replace.`)
    }
    const ctype = name.endsWith('.yml') ? 'text/yaml' : name.endsWith('.txt') ? 'text/plain' : 'application/octet-stream'
    await uploadAsset(release.upload_url, token, join(ROOT, 'release', name), name, ctype)
    console.log(`Uploaded ${name} (${size} bytes).`)
  }
  return local
}

async function verifyDraftAssets(release, version, token) {
  const remote = await gh(`/repos/${OWNER}/${REPO}/releases/${release.id}/assets?per_page=100`, token)
  const byName = new Map((remote || []).map((a) => [a.name, a]))
  const problems = []
  for (const name of requiredAssets(version)) {
    const hit = byName.get(name)
    const size = statSync(join(ROOT, 'release', name)).size
    if (!hit) problems.push(`missing remote asset: ${name}`)
    else if (hit.size !== size) problems.push(`size drift: ${name} (remote ${hit.size} vs local ${size})`)
    else if (hit.state !== 'uploaded') problems.push(`incomplete upload state: ${name} (${hit.state})`)
  }
  return problems
}

async function doUploadDraft(report, token) {
  const draft = await ensureDraft(report.version, report.commit, token)
  await syncAssets(draft, report.version, token)
  const problems = await verifyDraftAssets(draft, report.version, token)
  if (problems.length) throw new Error('Draft asset verification failed: ' + problems.join('; '))
  console.log(`Draft v${report.version} verified with all ${requiredAssets(report.version).length} required assets.`)
  return draft
}

async function doPublish(report, token) {
  const tag = `v${report.version}`
  const existing = await gh(`/repos/${OWNER}/${REPO}/releases/tags/${tag}`, token)
  if (!existing) throw new Error(`Refusing --publish: no draft ${tag} exists; run --upload-draft first.`)
  if (!existing.draft) throw new Error(`Refusing: ${tag} is already published; never overwrite a published release.`)
  const problems = await verifyDraftAssets(existing, report.version, token)
  if (problems.length) throw new Error('Refusing --publish: ' + problems.join('; '))
  await gh(`/repos/${OWNER}/${REPO}/releases/${existing.id}`, token, 'PATCH', { draft: false })
  console.log(`Published ${tag} (id ${existing.id}).`)
}

function selfTest() {
  const assert = (cond, msg) => { if (!cond) { console.error(`SELF-TEST FAIL: ${msg}`); process.exitCode = 1 } }
  // hyphen artifactNames (explicit nsis/portable artifactName); no portable blockmap.
  const n = nativeNames('0.2.0')
  assert(n.setup === 'PocketBench-Setup-0.2.0.exe', 'setup hyphen name')
  assert(n.portable === 'PocketBench-0.2.0.exe', 'portable hyphen name')
  assert(n.setupBlockmap === 'PocketBench-Setup-0.2.0.exe.blockmap', 'setup blockmap name')
  assert(!('portableBlockmap' in n), 'no portable blockmap (electron-builder PORTABLE emits none)')
  // latest.yml parser matches hyphen shape.
  const parsed = parseLatestYml('version: 0.2.0\npath: PocketBench-Setup-0.2.0.exe\nsha512: abc=\nfiles:\n  - url: PocketBench-Setup-0.2.0.exe\n')
  assert(parsed.version === '0.2.0', 'parser version')
  assert(parsed.path === n.setup, 'parser path hyphen')
  assert(decodeURIComponent(parsed.firstUrl) === n.setup, 'parser url decodes to hyphen')
  // stale version detected.
  const stale = parseLatestYml('version: 0.1.1\npath: PocketBench-Setup-0.1.1.exe\n')
  assert(stale.version !== '0.2.0', 'stale version differs')
  assert(stale.path !== nativeNames('0.2.0').setup, 'old hyphen asset is version-scoped (accept as previous, refuse as current)')
  // sha lines verifier.
  const dig = new Map([['a.exe', '0'.repeat(64)]])
  assert(verifyShaLines(`${'0'.repeat(64)}  a.exe`, dig).length === 0, 'sha ok')
  assert(verifyShaLines(`${'f'.repeat(64)}  a.exe`, dig).length === 1, 'sha mismatch caught')
  assert(verifyShaLines('garbage line', dig).length >= 1, 'malformed caught')
  // URI-template strip check: upload_url carries '{?name,label}'.
  const tmpl = 'https://uploads.github.com/repos/o/r/releases/1/assets{?name,label}'
  const stripped = new URL(tmpl.split('{', 1)[0])
  assert(stripped.searchParams.get('name') === null, 'template must be stripped before params')
  stripped.searchParams.set('name', 'a.exe')
  assert(stripped.search.includes('name=a.exe'), 'params append after strip')
  // arg parser.
  const p0 = parseArgs(['--upload-draft', '--publish'])
  assert(p0.uploadDraft && p0.publish, 'arg parser flags')
  assert(requiredAssets('0.2.0').length === 5, 'five required assets')
  if (process.exitCode) console.error('self-test FAILED')
  else console.log('self-test PASS: hyphen names/parser/sha/args (5 required assets: setup+portable+NSIS blockmap+latest.yml+SHA256SUMS).')
}

const argv = process.argv.slice(2)
const flags = parseArgs(argv)
if (flags.help) {
  console.log('Usage: node tools/publish-release.mjs [--prepare] [--upload-draft] [--publish] [--skip-ci] [--self-test]\nDefault: read-only dry-run gate. --skip-ci is dry-run only and refused with mutate flags.')
  process.exit(0)
}
if (flags.selfTest) {
  selfTest()
} else if (flags.prepare && !flags.uploadDraft && !flags.publish) {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  try {
    doPrepare(version)
  } catch (e) { console.error(String(e.message || e)); process.exitCode = 2 }
} else if (flags.uploadDraft || flags.publish) {
  if (flags.skipCi) {
    console.error('Refusing: --skip-ci is dry-run only; mutate flags require the exact-SHA green CI gate.')
    process.exitCode = 2
  } else {
    let token = null
    try {
      const report = await runGate({ checkCi: true })
      console.log(JSON.stringify(report, null, 2))
      if (!report.ok) {
        console.error('RELEASE GATE: BLOCKED — see failed checks above. No upload/publish performed.')
        process.exitCode = 1
      } else {
        token = gcmToken()
        const draft = await doUploadDraft(report, token)
        if (flags.publish) {
          await doPublish(report, token)
        } else {
          console.log('DRAFT READY (still a draft; publish only with --publish after review).')
        }
      }
    } catch (e) { console.error(String(e.message || e).slice(0, 300)); process.exitCode = 2 }
    finally { token = null }
  }
} else {
  const report = await runGate({ checkCi: !flags.skipCi })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) { console.error('RELEASE GATE: BLOCKED — see failed checks above. No commit/push/publish performed.'); process.exitCode = 1 }
  else console.log('RELEASE GATE: DRY-RUN PASS (no upload, no publish). Re-run with --upload-draft/--publish only after root code-freeze approval.')
}
