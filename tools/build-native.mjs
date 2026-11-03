import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds the Rust engine addon (native/engine) and places the loadable
// module next to its crate as pocketbench-engine.node. On Windows the
// MSVC linker must be in the environment (use a VS Developer shell);
// CI runners provide it. Local checkouts may keep the toolchain under
// .local/cargo (see .local/rustup), which is gitignored.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crateDir = join(root, 'native', 'engine');
const localCargo = join(root, '.local', 'cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
const cargo = process.env.CARGO || (existsSync(localCargo) ? localCargo : 'cargo');

const built = spawnSync(cargo, ['build', '--release', '--features', 'napi,windows-reads', '--manifest-path', join(crateDir, 'Cargo.toml')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    RUSTUP_HOME: process.env.RUSTUP_HOME || join(root, '.local', 'rustup'),
    CARGO_HOME: process.env.CARGO_HOME || join(root, '.local', 'cargo'),
  },
});
if (built.status !== 0) {
  console.error('Native engine build failed. In a VS Developer shell, retry: npm run build:native');
  process.exit(built.status ?? 1);
}

const artifact =
  process.platform === 'win32'
    ? join(crateDir, 'target', 'release', 'pocketbench_engine.dll')
    : process.platform === 'darwin'
      ? join(crateDir, 'target', 'release', 'libpocketbench_engine.dylib')
      : join(crateDir, 'target', 'release', 'libpocketbench_engine.so');
const target = join(crateDir, 'pocketbench-engine.node');
copyFileSync(artifact, target);
console.log(`Native engine ready: ${target}`);
