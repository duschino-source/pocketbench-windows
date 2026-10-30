# Focused repair integration contracts

The original Windows engine is checkpointed. The orchestrator now owns windows.ts, policy.ts, and resources/windows/scan.ps1 and will replace the incomplete monolithic integration. Do not edit those files.

## Native worker

Own native.ts, resources/windows/user.ps1, elevate.ps1, request-elevation.ps1, and tests/windows-native-unit.test.ts. Export:

- `runScript<T = any>(name: 'scan.ps1' | 'user.ps1', args?: Record<string,string>, timeoutMs?: number): Promise<T>` — fixed script files only; validated argument names; no shell text.
- `userOperation<T = any>(operation: string, args?: Record<string,string>): Promise<T>` — invokes user.ps1 with a fixed operation allow-list.
- `elevatedOperation(operation: 'flushDns'|'startService'|'integrityRepair', dataDirectory: string, serviceName?: string): Promise<{success:boolean;output:string;exitCode:number;pendingReboot:boolean;data?:Record<string,unknown>}>` — real RunAs UAC using a fixed launcher and a unique JSON receipt, safe readable outcome on rejection; no inference of success from process launch.

Required user operations and response shapes:

- getProxy / clearProxy / restoreProxy: proxy state `{enable:number,server:string,hasEnable:boolean,hasServer:boolean,enableKind:string,serverKind:string}`; clear returns `{before,after}`; restore takes `StateBase64` containing complete original state. Preserve literal data, original value existence and registry types.
- getStartup: array `{id,name,command,kind}` (array even singleton/zero); disableStartup takes Name; restoreStartup takes StateBase64 with `{name,command,kind}`.
- proxyPolicy: `{pinned:string}`; read policy keys conservatively, error must not masquerade as unmanaged.
- checkService takes ServiceName -> `{status:string}`.
- checkProcess/requestClose take ExpectedExe (full absolute validated executable ending firefox.exe/steam.exe/obsidian.exe) -> `{found:number,remaining:number,requested?:number}`. Limit to this exact executable path and current user. Never force kill.
- checkHealth: `{healthy:boolean,pendingReboot:boolean,summary:string}` using independent read-only Windows health/reboot checks; do not modify system state.
- getDnsCache: `{count:number}`.

Resolve scripts via POCKETBENCH_RESOURCES (set by main for unpacked resources), fallback source/cwd resources. Strip UTF-8 BOM on JSON receipts. param() is the first PowerShell statement. Receipt creation must refuse overwrite, reject links and unexpected output locations. No logs or command arguments contain a key. Tests must not mutate the developer host.

## App worker

Own apps.ts, lab.ts, tests/windows-apps.test.ts. Export class `AppRepairs` with constructor `(dataDirectory: string, lab: LabGuard, getApp: (id:string)=>Promise<AppTarget>)` and methods:

- `capabilities(app:AppTarget): OperationId[]` (available local operations; no fake repair/update capabilities)
- `constraints(app:AppTarget, operation:OperationId): string` with exact params JSON examples (appId, packageId, setting/value).
- `validate(step:RepairStep,snapshot:SystemSnapshot): RepairStep` (derive target, privileges, exact affected resources and reversible impact; reject retargeted params and unsupported extras)
- `execute(step:RepairStep):Promise<StepExecution>`
- `verify(step:RepairStep,execution:StepExecution):Promise<VerificationResult>`
- `undo(execution:StepExecution):Promise<VerificationResult>`
- `diagnostics(app:AppTarget):DiagnosticEvidence[]` (read-only; no fixture creation or file changes during discovery)

Support actual live cache quarantine, Firefox proxy prefs, Obsidian appearance config, polite restart with real relaunch and verification, and exact-discovered-ID winget update for generic apps. app.repairPackage only when a reliable installed repair capability is established, otherwise never advertise it. getApp re-reads authoritative inventory; never invent app identity in live mode. In lab mode getApp may return an explicit fixture app, and roots MUST be lab-only, never mixed with real installation or APPDATA roots. No host mutations in tests.

Use native.ts userOperation('checkProcess'/'requestClose',{ExpectedExe:fullPath}) for exact process handling; Node spawn(shell:false) may relaunch the validated existing executable. If a running app must close for cache/config edits, disclose it in locally derived impact and close politely before changes; if closure is refused, stop with no changes. Relaunch if previously running. Multi-profile Firefox must require a uniquely identified default profile; never pick a random profile. Discover Firefox through APPDATA/profiles.ini and LOCALAPPDATA caches; Obsidian vaults through obsidian.json recorded roots, plus .obsidian/appearance.json. Cache directories are a strict family allow-list; never touch cookies/history/logins/documents/saves or follow reparse points. Confine all paths including backups. Undo must refuse if current state diverged from the recorded after fingerprint.

LabGuard already supports live backup storage under dataDirectory. Keep its APIs compatible; harden path/backup validation as needed. Quarantine moves data and does not promise free disk space on the same volume. Keep implementations focused. Write useful tests and finish promptly; report concrete unsupported cases.
