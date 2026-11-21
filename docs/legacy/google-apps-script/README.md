# Google Apps Script source baseline

These are the source files supplied in the original workspace, retained for comparison and function mapping. They are reference files, not a second production implementation. Next.js does not execute these `.gs` files.

`webhook.gs`, `leave_logic.gs`, `helpers.gs`, and `line_messaging.gs` are byte-identical copies. Their SHA-256 hashes are in `manifest.json`. `config.gs` preserves its functions but replaces Sheet/Calendar IDs, LINE credentials, administrator LINE IDs and the debug profile user ID with placeholders. Never restore real configuration values in this archive.

See [function mapping](../../line-bot-function-mapping.md) for all original functions and [remaining differences](../../line-bot-differences.md) for differences between the old and new systems. `lib/line/messages.test.ts` executes the archived message builders in a test-only sandbox and compares their JSON with the ported builders. Production does not use `vm` or evaluate archived code.
