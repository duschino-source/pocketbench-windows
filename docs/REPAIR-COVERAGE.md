# Executable repair coverage

Every installed registry or current-user MSIX/Store entry can be investigated with live internet research. An executable plan additionally requires a supported local operation, applicable sources, independent review, and valid current targets.

## Windows

- Clear the current user's manual proxy, with original state backup, managed-policy refusal, independent readback, and guarded undo.
- Flush the resolver cache, then independently check cache state and Windows name resolution.
- Start an explicitly selected service from the fixed service allow-list. The app does not change the service startup type. A stopped Manual service alone is not reported as broken.
- Repair the Windows image and protected files through DISM followed by SFC. A fresh read-only integrity check is required for a verified result; reboot-dependent or unconfirmed results remain pending or failed.
- Disable one eligible current-user startup entry and restore its original value. Security-related entries and machine-wide startup entries are excluded.
- Measure memory, logical CPU count/load, disk availability, startup entries, and recent update error events. A low-space warning does not claim that moving a cache to the same drive frees space.

## Applications

- Update an exact WinGet package discovered through an unambiguous complete name/version match. This works beyond the three deeper app integrations. Verification requires an installed version change. Packages with truncated/ambiguous identities or unavailable manager data are not offered updates.
- Firefox: clear a broken manual proxy in a uniquely identified default profile. A user.js override takes precedence over prefs.js. Only the supported No proxy setting is writable.
- Obsidian: reset a broken custom theme in a uniquely identified open vault. Notes and vault content are preserved.
- Firefox, Steam, Obsidian: quarantine narrowly allow-listed cache directories, with executable/link refusal and restoration. A running app is asked to close politely; it may relaunch after the repair. The app never force-kills.
- Restart a known app executable and independently verify that it is running again.

## Honest limits

Package repair is not advertised without reliable repair-capability detection. Config changes cover the explicit settings above; unknown application settings, multiple ambiguous profiles/vaults, managed settings, and arbitrary downloaded scripts do not become executable actions. Cache moves across volumes can fail safely. An app that refuses to close requires the user's attention. Undo refuses to overwrite new edits or newly created cache data. System/package repairs are not claimed to be fully reversible.

The Windows installer is unsigned. No credential is bundled: distributed users enter their own Meta key, which is encrypted locally by Windows. The recorded verification results describe the checks that ran; they do not guarantee resolution of every possible underlying application defect.
