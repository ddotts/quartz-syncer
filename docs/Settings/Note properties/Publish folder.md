---
title: Publish folder
description: Select a repository and destination folder with the publish note property.
created: 2026-07-05T00:00:00Z+0200
modified: 2026-09-18T00:00:00Z+0200
publish: true
tags: [settings/frontmatter]
default_value: Inherit the note path
---

The `publish` note property selects a configured repository target and an optional destination folder. Configure named targets in Git settings; target keys must not contain `/`.

```yaml
---
publish: docs/characters/npcs
---
```

For a note at `Campaign/Characters/Ada.md`, with Quartz content folder `content`:

| Publish value | Repository | Published path |
| --- | --- | --- |
| `true` (boolean) | Default | `content/Campaign/Characters/Ada.md` |
| `docs` | Target named `docs` | `content/Campaign/Characters/Ada.md` |
| `docs/characters/npcs` | Target named `docs` | `content/characters/npcs/Ada.md` |
| `docs/root` | Target named `docs` | `content/Ada.md` |
| `docs/root/child` | Target named `docs` | `content/root/child/Ada.md` |

Only the exact suffix `root` selects the content root. The filename stays unchanged. Folder routing applies to Markdown notes; special file types retain their existing paths. Unknown or disabled keys do not mark notes for publishing unless publishing all notes by default is enabled.

Within the folder suffix, leading slashes are ignored, backslashes are treated as folder separators, and parent traversal segments such as `..` are stripped. An empty folder suffix inherits the note's vault-relative path.

This replaces the separate `publishFolder` property, which is no longer read. Change `publish: docs` plus `publishFolder: characters` to `publish: docs/characters`, then remove `publishFolder`. If a note previously used `publish: true` with `publishFolder`, first configure a named target for its repository and use that key in the combined value.
