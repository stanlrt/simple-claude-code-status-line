---
name: statusline-setup
description: >
  Set up the simple-claude-code-status-line status bar for Claude Code.
  Copies the statusline script to ~/.claude/ and patches settings.json.
  Use when the user says "set up status line", "install status line", "configure status bar",
  or invokes /statusline-setup.
---

Install the simple-claude-code-status-line status bar. Steps:

## 1. Detect paths

- Home dir: `process.env.HOME` (Mac/Linux) or `process.env.USERPROFILE` (Windows)
- Target script path: `~/.claude/statusline-command.js`
- Settings path: `~/.claude/settings.json`

## 2. Copy the script

Read the file at `${CLAUDE_PLUGIN_ROOT}/statusline-command.js` and write it to `~/.claude/statusline-command.js`.

Use the absolute path (not `~/`) in all file operations.

## 3. Patch settings.json

Read `~/.claude/settings.json`. Add or replace the `statusLine` key:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /ABSOLUTE/PATH/TO/.claude/statusline-command.js"
  }
}
```

Replace `/ABSOLUTE/PATH/TO/` with the actual home directory path. Never use `~` in the command value — Claude Code does not expand it.

Merge carefully: preserve all existing settings. Only add/replace `statusLine`.

## 4. Confirm

Tell the user:
- Script written to: `~/.claude/statusline-command.js`
- Settings updated: `~/.claude/settings.json`
- The status line will appear at the bottom of Claude Code after the next session start or `/reset`.

## Notes

- Requires Node.js installed and available on PATH.
- On Windows with Git Bash, home path looks like `/c/Users/username` — use this form in the command value.
- On Mac/Linux, use `/Users/username` or `/home/username`.
- Do not hardcode any path — always derive from the actual home directory at install time.
