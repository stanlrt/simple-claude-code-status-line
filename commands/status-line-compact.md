---
description: Toggle compact mode for the status line
allowed-tools: Bash
---

!`f="$HOME/.claude/.statusline-compact-forced"; [ -e "$f" ] && rm -f "$f" && echo "compact mode: OFF" || { touch "$f" && echo "compact mode: ON"; }`

Report the new compact mode state to the user in one short sentence.
