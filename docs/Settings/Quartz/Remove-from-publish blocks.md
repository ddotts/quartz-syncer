---
title: Remove-from-publish blocks
description: Hide source-only Markdown sections from the published Quartz copy.
created: 2026-07-05T00:00:00Z+0200
modified: 2026-07-05T00:00:00Z+0200
publish: true
tags: [settings/quartz]
default_value: Disabled unless markers are present
---

Quartz Syncer can remove source-only Markdown sections during publishing. Add a start marker before the private section and an end marker after it:

```markdown
<!-- quartz-syncer:remove-start -->
This draft note, private table, or Obsidian-only text will not be published.
<!-- quartz-syncer:remove-end -->
```

The source note is not changed. Only the compiled Markdown sent to Quartz omits the marked section.

Use the command palette command `Quartz Syncer: Insert remove-from-publish block` to insert an empty block or wrap the current selection.

Markers must be balanced. If a note has a missing start marker, missing end marker, or nested remove block, Quartz Syncer reports a compile issue for that note before publishing. Other notes can still be compiled.
