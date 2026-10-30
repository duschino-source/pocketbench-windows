# Integration contract

Use src/shared/contracts.ts as the shared interface. Do not change its public shapes without coordinating. No code may execute web content or model-produced shell text. Repository work is limited to this directory. Host Windows repairs must never run during development; use the lab engine and test profiles for mutations.

## Windows engine

Export class WindowsEngine from src/main/windows.ts. Constructor `(dataDirectory: string, options?: { labRoot?: string })`. Methods: `scan(): Promise<SystemSnapshot>`, `capabilities(snapshot: SystemSnapshot, appId?: string): RepairCapability[]`, `validateStep(step: RepairStep, snapshot: SystemSnapshot): RepairStep`, `execute(step: RepairStep): Promise<StepExecution>`, `verify(step: RepairStep, execution: StepExecution): Promise<VerificationResult>`, `undo(execution: StepExecution): Promise<VerificationResult>`.

validateStep must reject invalid operations and targets, derive privileges/impact/reversibility itself, require currently discovered identifiers, and verify all paths stay in explicit per-app roots. Main stores plans; apply accepts only a stored plan ID. Restart never kills arbitrary processes. Cache quarantine excludes cookies, logins, browsing history, documents, and game saves. Protect junctions and symlinks. System integrity repair is explicitly not reversible. Windows UAC helper accepts only fixed operation IDs, never shell strings. User app package operations are capability checked. Never touch Windows security controls or managed policies.

## Research engine (subsequent task)

Export `investigate(request, snapshot, capabilities, modelClient, onProgress): Promise<RepairPlan>`. Model client is a metered Responses API client supplied by main. Research outputs and independent review are validated against the contracts. Community-only steps require independent corroboration or isolated reproduction, and local operations remain the authority.

## Renderer

Use window.pocketbench only. No Node, filesystem, credentials, arbitrary IPC channels, or direct outbound network. Shared types imported from ../shared/contracts. Desktop 1280x820; minimum 980x680; keyboard accessible, 100–200% scaling. App starts with real empty/loading states, never fabricated problems, counts, cost, or success. Mark isolated lab mode conspicuously. Use FluentProvider/webDarkTheme and custom restrained charcoal layout with muted blue accent. Navigation: Overview, Windows, Apps, Activity, Settings. Sources and repair impact visible before Apply fix. Show pending reboot distinctly. Use text labels with status colors.

## Budget and credentials

Muse Spark 1.3 Standard only. Coding requests use http://127.0.0.1:43187/v1, provider pocketbench, with a local token file under ignored .local/. The gateway owns the real key and a durable $90 ledger. Do not read, copy, or print the real key. Do not change budgets or gateway settings. No external model providers or extra workers. Distributed app uses its own user-supplied key encrypted with Electron safeStorage. Never embed the development key.
