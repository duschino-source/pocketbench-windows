# PocketBench architecture

The renderer uses React and Fluent UI through a sandboxed, context-isolated Electron preload. Its public interface is src/shared/contracts.ts. Only the main process accesses local diagnostic data, encrypted credentials, model requests, stored repair plans, backups, and execution receipts.

## Repair flow

1. Scan Windows and installed applications without changing settings.
2. Research the symptom and installed version using Muse Spark 1.3 Standard and Meta web search. Redact credentials and user identifiers before transmission.
3. Produce structured steps using the available local capabilities.
4. Review applicability, source quality, security implications, and verification independently. Source identities are derived from actual search citations, not model labels. Community evidence needs corroboration from independent publishers.
5. Validate operations and discovered targets locally. The renderer can apply only a stored plan ID. Arbitrary shell text is never an execution interface.
6. Disclose interruption, privileges, affected resources, and backup coverage. Revalidate before applying.
7. Execute fixed local operations, save receipts, and independently check postconditions. Command success alone cannot produce a Fixed result.

Backups restore supported settings and quarantined caches. System and package repair operations do not promise complete reversal. A reboot-dependent repair remains Pending verification.

## Budget

One local gateway meters coding and development-demo calls. It binds only to loopback and requires a random local token. It restricts model IDs and request size, reserves a conservative maximum token/search cost before contacting Meta, then settles using returned usage. Unknown usage retains its reservation. Cached input is conservatively charged at the uncached rate. Search queries are counted from returned actions; missing search accounting retains the conservative charge. Unexpected billing is held for reconciliation.

The $90 gateway cap governs requests made through this application; unrelated use of the same provider account is outside its control. Distributed installations have a separate local ledger and a user-supplied key. Windows safeStorage encrypts that key; plaintext fallback is refused.

## Development isolation

Host development uses read-only scans and disposable application-data labs. Native mutation tests are additionally guarded to run only in GitHub-hosted disposable Windows runners, with original state restored in finally blocks. Public CI receives no API key. Live research tests use the local metered gateway and do not execute changes against the developer's Windows installation.
