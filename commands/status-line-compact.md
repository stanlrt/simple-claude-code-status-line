---
description: Toggle compact mode for the status line
allowed-tools: Bash
---

!`f="$HOME/.claude/.statusline-mode"; cur=$(cat "$f" 2>/dev/null); if [ "$cur" = "compact" ]; then echo "full" > "$f"; echo "compact mode: OFF (forced full)"; else echo "compact" > "$f"; echo "compact mode: ON (forced compact)"; fi`

Report the new compact mode state to the user in one short sentence.
