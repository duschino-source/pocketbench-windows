<#
.SYNOPSIS
  Disposable version-to-version installer upgrade test for PocketBench.
.DESCRIPTION
  Release-coordination owned. Runs ONLY on GitHub-hosted disposable CI
  (RUNNER_TEMP) or an explicitly authorized disposable VM
  (POCKETBENCH_DISPOSABLE_VM=1). Refuses on a developer host.

  Flow (all in disposable temp dirs, never the real %APPDATA%):
    1. Install OLD version silently (/S) to a temp dir.
    2. Seed state WITHOUT a real key:
       - launch old binary with --data-dir=<temp profile> --smoke once,
         then write a marker state.json history entry + a dummy
         meta-credential.bin via the app's own --import-key-file=<file>
         path (dummy bytes "DUMMY-UPGRADE-TEST-KEY-..." only), then
         DELETE the seed key file. No real key is ever read.
       - create .pocketbench/backup-*.json + budget.jsonl markers.
    3. Install NEW version silently (/S) over the same dir.
    4. Launch new binary with the SAME --data-dir --smoke.
    5. Assert preserved: state.json history length grew-or-equal and old
       entries byte-identical, backup fixture bytes identical plus all
       backup names present, budget.jsonl bytes identical, credential
       file present with unchanged SHA256 (hash compared, never printed;
       hasApiKey via smoke is not emitted).
    6. Writes upgrade-result.json for the workflow artifact.

  Credential bytes are never printed. Dummy key file is deleted after seeding.
.PARAMETER OldInstaller
  Path to the previous-version installer (e.g. release/PocketBench-Setup-0.1.1.exe).
.PARAMETER NewInstaller
  Path to the candidate installer (e.g. release/PocketBench-Setup-0.2.0.exe).
.PARAMETER OutFile
  Where to write upgrade-result.json.
#>
param(
  [Parameter(Mandatory = $true)][string]$OldInstaller,
  [Parameter(Mandatory = $true)][string]$NewInstaller,
  [string]$OutFile = '.local/upgrade-result.json'
)
$ErrorActionPreference = 'Stop'

# --- Disposable guard (mirrors tools/prepare-disposable-demo.ps1 policy) ---
$model = [string](Get-CimInstance Win32_ComputerSystem).Model
$isGhRunner = ($env:RUNNER_TEMP -and (Test-Path -LiteralPath $env:RUNNER_TEMP))
$isDisposableVm = ($env:POCKETBENCH_DISPOSABLE_VM -eq '1' -and
  ($model -match 'Virtual Machine|VMware|VirtualBox|QEMU|KVM|Parallels' -or $env:USERNAME -eq 'WDAGUtilityAccount'))
if (-not ($isGhRunner -or $isDisposableVm)) {
  throw 'Upgrade test refused: run only on disposable GitHub-hosted CI (RUNNER_TEMP) or an authorized disposable VM. No installers were launched.'
}
foreach ($p in @($OldInstaller, $NewInstaller)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "Installer missing: $p" }
}
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('pb-upgrade-' + [Guid]::NewGuid().ToString('N'))
$installRoot = Join-Path $scratch 'install'
$profile = Join-Path $scratch 'profile'
New-Item -ItemType Directory -Path $installRoot, $profile -Force | Out-Null
$result = [ordered]@{ ok = $false; old = $OldInstaller; new = $NewInstaller; profile = $profile }

function Invoke-InstalledBinary([string]$label) {
  $binary = Join-Path $installRoot 'PocketBench.exe'
  if (-not (Test-Path -LiteralPath $binary)) { throw "$label binary missing: $binary" }
  $proc = Start-Process -FilePath $binary -ArgumentList @('--smoke', "--data-dir=$profile") -WindowStyle Hidden -PassThru
  if (-not $proc.WaitForExit(180000)) { throw "$label launch timed out." }
  $smoke = Get-Content -LiteralPath (Join-Path $profile 'smoke-result.json') -Raw | ConvertFrom-Json
  if (-not $smoke.ok) { throw "$label smoke failed: $($smoke.error)" }
  return $smoke
}

try {
  # 1. Old version install (silent NSIS: /S /D=dir).
  $p = Start-Process -FilePath $OldInstaller -ArgumentList @('/S', "/D=$installRoot") -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Old installer exit code $($p.ExitCode)." }
  $result.oldInstalled = $true

  # 2a. First smoke run creates profile state files.
  $oldSmoke = Invoke-InstalledBinary 'old'
  $result.oldSmoke = [ordered]@{ appCount = $oldSmoke.appCount; diagnostics = $oldSmoke.diagnosticCount }

  # 2b. Seed preservation markers: history entry, backup blob, budget line.
  # Backup root mirrors the app's LabGuard.cacheDir() live path:
  # <dataDir>/.pocketbench (NOT the lab subdir; shipping backups live in
  # the trusted data directory so undo works without lab mode). Verify
  # the engine contract first; fail loudly if it moved.
  $appMain = Join-Path $PSScriptRoot '../src/main/windows/lab.ts'
  $labSrc = Get-Content -LiteralPath $appMain -Raw
  if ($labSrc -notmatch "join\(this\.dataDirectory,\s*'\.pocketbench'\)") {
    throw 'Engine backup contract moved (LabGuard.cacheDir live path changed); update this test to the inspected path.'
  }
  $stateFile = Join-Path $profile 'state.json'
  $stateBefore = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { [pscustomobject]@{ history = @() } }
  $beforeHistoryJson = @($stateBefore.history) | ConvertTo-Json -Depth 8 -Compress
  $marker = [pscustomobject]@{ id = 'upgrade-test-marker'; planId = 'upgrade-test-plan'; status = 'fixed'; finishedAt = '2026-01-01T00:00:00.000Z' }
  $state = $stateBefore
  $state.history = @($marker) + @($state.history)
  $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $stateFile -Encoding UTF8
  $cacheDir = Join-Path $profile '.pocketbench'
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  $backupFixture = [ordered]@{ id = 'upgrade-test-backup'; kind = 'upgrade-test'; createdAt = '2026-01-01T00:00:00.000Z'; note = 'fixture-content-marker' }
  $backupFixture | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $cacheDir 'backup-upgrade-test.json') -Encoding UTF8
  $backupFixtureJson = $backupFixture | ConvertTo-Json -Compress
  'upgrade-test-budget-marker' | Set-Content -LiteralPath (Join-Path $profile 'budget.jsonl') -Encoding UTF8
  $budgetBefore = Get-Content -LiteralPath (Join-Path $profile 'budget.jsonl') -Raw

  # 2c. Seed encrypted dummy credential through the app's own import path,
  # then delete the seed file. Dummy only; never a real key.
  # Note: --import-key-file=<path> has existed since the first commit (2374a20);
  # semantics unchanged (single key 20-1000 chars -> safeStorage encrypt to
  # meta-credential.bin). Dummy bytes deleted right after seeding.
  $keyFile = Join-Path $profile 'upgrade-dummy-key.txt'
  'DUMMY-UPGRADE-TEST-KEY-0123456789abcdef' | Set-Content -LiteralPath $keyFile -Encoding UTF8 -NoNewline
  $binary = Join-Path $installRoot 'PocketBench.exe'
  $imp = Start-Process -FilePath $binary -ArgumentList @("--data-dir=$profile", "--import-key-file=$keyFile", '--smoke') -WindowStyle Hidden -PassThru
  if (-not $imp.WaitForExit(180000)) { throw 'Credential seed launch timed out.' }
  Remove-Item -LiteralPath $keyFile -Force -ErrorAction SilentlyContinue
  $credFile = Join-Path $profile 'meta-credential.bin'
  if (-not (Test-Path -LiteralPath $credFile)) { throw 'Credential seed failed: meta-credential.bin missing.' }
  $result.dummyCredentialSeeded = $true
  $credBytesBefore = (Get-Item -LiteralPath $credFile).Length
  $credHashBefore = (Get-FileHash -LiteralPath $credFile -Algorithm SHA256).Hash

  $before = [ordered]@{
    historyIds  = @($state.history | ForEach-Object { $_.id })
    backups     = @(Get-ChildItem -LiteralPath $cacheDir -Filter 'backup-*.json' | ForEach-Object { $_.Name })
    budgetBytes = (Get-Item -LiteralPath (Join-Path $profile 'budget.jsonl')).Length
  }

  # 3. New version install over the same root.
  $p = Start-Process -FilePath $NewInstaller -ArgumentList @('/S', "/D=$installRoot") -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "New installer exit code $($p.ExitCode)." }
  $result.newInstalled = $true

  # 4. Launch new binary against the SAME profile.
  $newSmoke = Invoke-InstalledBinary 'new'
  $result.newSmoke = [ordered]@{ appCount = $newSmoke.appCount; diagnostics = $newSmoke.diagnosticCount }

  # 5. Preservation assertions (fixture CONTENTS compared byte-for-byte, never
  # just presence; credential bytes hashed, never printed).
  $after = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  $afterIds = @($after.history | ForEach-Object { $_.id })
  $missingHistory = @($before.historyIds | Where-Object { $afterIds -notcontains $_ })
  $afterHistoryJson = @($after.history | Where-Object { $_.id -ne 'upgrade-test-marker' }) | ConvertTo-Json -Depth 8 -Compress
  $historyContentIntact = ($afterHistoryJson -eq $beforeHistoryJson)
  $afterBackups = @(Get-ChildItem -LiteralPath $cacheDir -Filter 'backup-*.json' | ForEach-Object { $_.Name })
  $missingBackups = @($before.backups | Where-Object { $afterBackups -notcontains $_ })
  $afterBackupJson = Get-Content -LiteralPath (Join-Path $cacheDir 'backup-upgrade-test.json') -Raw | ConvertFrom-Json | ConvertTo-Json -Compress
  $backupContentIntact = ($afterBackupJson -eq $backupFixtureJson)
  $afterBudget = Get-Content -LiteralPath (Join-Path $profile 'budget.jsonl') -Raw
  $budgetContentIntact = ($afterBudget -eq $budgetBefore)
  $credHashAfter = (Get-FileHash -LiteralPath (Join-Path $profile 'meta-credential.bin') -Algorithm SHA256).Hash
  $credBytesAfter = (Get-Item -LiteralPath (Join-Path $profile 'meta-credential.bin')).Length
  $checks = [ordered]@{
    historyPreserved  = ($missingHistory.Count -eq 0 -and $historyContentIntact)
    backupsPreserved  = ($missingBackups.Count -eq 0 -and $backupContentIntact)
    budgetPreserved   = $budgetContentIntact
    credentialPresent = (Test-Path -LiteralPath (Join-Path $profile 'meta-credential.bin'))
    credentialBytesUnchanged = ($credHashBefore -eq $credHashAfter -and $credBytesBefore -eq $credBytesAfter)
  }
  $result.checks = $checks
  $result.missingHistory = $missingHistory
  $result.missingBackups = $missingBackups
  $result.historyContentIntact = $historyContentIntact
  $result.backupContentIntact = $backupContentIntact
  $result.budgetContentIntact = $budgetContentIntact
  $result.ok = ($checks.historyPreserved -and $checks.backupsPreserved -and $checks.budgetPreserved -and $checks.credentialPresent -and $checks.credentialBytesUnchanged)
  if (-not $result.ok) { throw 'Upgrade preservation check failed.' }
  Write-Output 'Upgrade test passed: settings/history/backups/credential-file preserved across installer versions.'
}
finally {
  New-Item -ItemType Directory -Path (Split-Path -Parent $OutFile) -Force | Out-Null
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutFile -Encoding UTF8
  # Leave scratch for debugging on failure; remove on success to keep runners clean.
  if ($result.ok -and (Test-Path -LiteralPath $scratch)) { Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue }
}
