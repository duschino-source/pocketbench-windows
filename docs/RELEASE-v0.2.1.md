# PocketBench 0.2.1

The repair workspace now puts scan findings ahead of the symptom form. First run has one offline scan action. Opening a repair brings its review into focus; Back restores the originating view and keyboard focus. Windows findings, app capability labels, and Settings follow the same quieter black layout.

Repair impact, administrator requirements, undo limits, sources, and detailed evidence remain accessible. Apply is disabled during all busy states, including execution of the same plan. The executor and trusted-publisher installation gate remain unchanged.

This version incorporates the repository's newer build optimizations, batched service scan, lazy-loaded views, signing documentation, and gated release workflow.

Validation: 167 unit tests passed; 8 environment-gated tests were skipped locally. The UI fixture checks cover cold scan, category presets, free text, app targeting, plan focus/Back, and blocked or previously executed plans. These fixtures do not perform repairs on the user's computer. Native repair and installer verification run separately on disposable Windows CI.

Before submission: record the three-minute demo against the final build, upload it, and complete the human eligibility/team/track and submission steps in USER-CHECKLIST.md and SUBMISSION.md. Public distribution remains subject to the documented publisher-verification gate; a development certificate is not equivalent to a trusted production publisher.
