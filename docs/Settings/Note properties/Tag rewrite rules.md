---
title: Published tag rewrite rules
description: Rewrite tags in published frontmatter with ordered regular expression replacements.
created: 2026-07-05T00:00:00Z+0200
modified: 2026-07-05T00:00:00Z+0200
publish: true
tags: [settings/frontmatter]
default_value: No rules
---

Published tag rewrite rules transform tags only in the frontmatter written to Quartz. They do not edit source notes and they do not rewrite Markdown body text.

Each rule has:

- **Enabled**: turn a rule on or off without deleting it.
- **Pattern**: a JavaScript regular expression source, such as `^d/character/(.+)$`, or a slash-delimited expression, such as `/^d\/character\/(.+)$/`.
- **Replacement**: a JavaScript replacement string. Capture groups such as `$1` are supported.

Rules run in order against each published tag. After all rules run, empty strings are removed from the published tags list. To remove a tag entirely, match the whole tag (for example, `^private$`) and leave the replacement blank. Partial matches remove only the matching text. Source tags remain unchanged.

Example:

| Input tag | Pattern | Replacement | Published tag |
| --- | --- | --- | --- |
| `d/character/12thday` | `^d/character/(.+)$` | `tag/character/$1+dnd` | `tag/character/12thday+dnd` |

Invalid regex rules are skipped during publishing. The settings UI marks obviously invalid patterns so they can be fixed before publishing.
