# Three-minute PocketBench demo

Record in a disposable Windows VM with internet access. Use an approved account and your own API key in Settings. Never display the key. Install PocketBench and Firefox, launch Firefox once to create a profile, then close Firefox before preparing faults.

The preparation script refuses to run unless the machine identifies as a VM and you explicitly set `POCKETBENCH_DISPOSABLE_VM=1`. It saves the original proxy, time-service state, and Firefox preference bytes before introducing demo faults. It is a developer tool, not a production repair operation.

## Preparation

1. In the disposable VM, install PocketBench and Firefox. Configure the Meta key in PocketBench Settings and confirm the budget.
2. Close Firefox. In a VM PowerShell session set `$env:POCKETBENCH_DISPOSABLE_VM='1'`, then run `./tools/prepare-disposable-demo.ps1` from the source checkout.
3. Open PocketBench and scan. Use the actual VM and its actual installed-app inventory throughout the recording.
4. After recording, run the preparation script with `-Restore`, then discard the VM.

## Recording script

- **0:00–0:15 — Problem and new work.** “PocketBench repairs Windows and installed apps from one place. All custom features shown here were built during the hackathon. Meta Muse Spark investigates, researches, and reviews each repair.” Show the real Windows overview and app inventory.
- **0:15–0:55 — Windows network.** Describe the stale manual proxy. Show an official source, the affected user proxy settings, backup coverage, and Apply fix. Show the independent registry verification and the recorded change.
- **0:55–1:35 — Windows service.** Investigate: “Windows time synchronization is unavailable; W32Time is stopped.” Show that the proposed action starts this specific service. Apply, respond to Windows UAC if shown, and show the independent Running check.
- **1:35–2:30 — App repair from the internet.** Select Firefox, explain that pages still fail through its app-specific manual proxy, and investigate. Show the Mozilla citation and review result, then Apply fix. Show Firefox reopened and loading a page, along with the saved-setting verification.
- **2:30–2:50 — Reliability.** Show Activity, supported Undo, source concerns, and the rule that unverified outcomes remain Needs validation or Failed. Explain that community fixes require independent corroboration and local capability checks.
- **2:50–3:00 — Close.** “The output is a changed and checked computer, with a record of what happened.” Show the repository and Windows download.

Keep the total at or below three minutes. If cutting out waiting time, label the cut or speed-up. Do not portray fixtures, cached research, or a lab simulation as live Windows execution. The automated CI fault tests provide additional evidence of real Windows proxy, service, and startup repairs.
