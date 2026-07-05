---
title: Publish folder
description: Route an individual note to a subfolder inside the configured Quartz content folder.
created: 2026-07-05T00:00:00Z+0200
modified: 2026-07-05T00:00:00Z+0200
publish: true
tags: [settings/frontmatter]
default_value: Empty
---

The `publishFolder` note property changes where a Markdown note is written in your Quartz repository.

```yaml
---
publish: true
publishFolder: characters
---
```

If your Quartz content folder is `content`, a note named `Campaign/Characters/Ada.md` with `publishFolder: characters` is published as `content/characters/Ada.md`.

`publishFolder` is a folder path, not a filename. The published note keeps its source filename. Nested folders such as `characters/npcs` are supported. Leading slashes are ignored, backslashes are treated as folder separators, and parent traversal such as `../private` is stripped so published files stay inside the configured content folder.

Leaving `publishFolder` empty or removing it preserves the normal vault-relative publish path.
