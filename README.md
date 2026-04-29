# Cache-Aware CC Status Line

A rich status line for [Claude Code](https://claude.ai/code) showing the usual (Git, costs, models...) but also cache metrics and compaction+context usage. Why does it matter? Because cached tokens count 90% less towards your usage limit/API costs.

## Preview

- On a normal turn:

  Normal
  <img width="2250" height="127" alt="image" src="https://github.com/user-attachments/assets/15b78ef6-e27c-4f80-8ff5-91da700c1ca5" />

  Compact
  <img width="1536" height="131" alt="image" src="https://github.com/user-attachments/assets/0f66503e-3301-4d34-bd54-88874bad5ac3" />


- On a cache miss/bust turn:

  Normal
  <img width="2491" height="121" alt="image" src="https://github.com/user-attachments/assets/b1e9d6b7-30eb-4fa9-b259-338df59f2e02" />

  Compact 
  <img width="1503" height="131" alt="image" src="https://github.com/user-attachments/assets/6f99d77e-d186-4aa5-a7ca-e8f39d367731" />


## Installation

### Prerequs

- [Claude Code](https://claude.ai/code)
- Node.js on PATH

### Option A — npm (recommended)

```
npx -y simple-claude-code-status-line
```

That's it. The command writes the `statusLine` entry into `~/.claude/settings.json` for you. Restart Claude Code to see it.

> Run again any time to repair/reset the entry. Existing settings are preserved.
>
> If detection fails on your shell, force install mode explicitly: `npx -y simple-claude-code-status-line init`

### Option B — Claude Code plugin

```
/plugin marketplace add https://github.com/stanlrt/simple-claude-code-status-line.git
/plugin install simple-claude-code-status-line@simple-claude-code-status-line
```

Then run `/statusline-setup` and Claude will handle the rest.

> [!NOTE]
> Plugin install uses `git clone`. If your global git config rewrites HTTPS to SSH (`url.<x>.insteadOf` rule), the clone will fail with a host key error. Use Option A or Option C.

### Option C — Manual

1. Copy `statusline-command.js` to `~/.claude/statusline-command.js`

2. Add to `~/.claude/settings.json`:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node /absolute/path/to/.claude/statusline-command.js"
     }
   }
   ```

  > [!IMPORTANT]
  >  Use the absolute path. The `~` shorthand is not expanded in the command value.

## Normal mode

### Symbols

| Symbol              | Meaning                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `🗿` / `🗿🗿` / `🗿🗿🗿`  | Caveman mode intensity: lite / full / ultra (requires [caveman plugin](https://github.com/JuliusBrussee/caveman)) |
| `Claude Sonnet 4.6` | Current model                                                                                                     |
| `▸ opus`            | Advisor model (if configured via `advisorModel` in settings.json)                                                 |
| `████████░░ 78%`    | Context window usage bar — see below                                                                              |
| `hit:87%`           | Cache hit rate this turn. Green ≥50%, yellow <50%, red 0%                                                         |
| `fresh:1.2k`        | Uncached input tokens this turn — what you pay full price for                                                     |
| `write:46.3k`       | Tokens written to cache this turn (only shown when nonzero). Spikes on first turn or after a bust                 |
| `BUST`              | Cache miss detected (red). Appears when `hit:0%` and input is substantial                                         |
| `⎇ main`            | Current git branch                                                                                                |
| `+2`                | Staged files (green)                                                                                              |
| `~1`                | Modified files (yellow)                                                                                           |
| `?3`                | Untracked files (gray)                                                                                            |
| `↓2`                | Commits behind remote (purple)                                                                                    |
| `$0.0042`           | Estimated cumulative session cost in USD                                                                          |
| `~/projects/myapp`  | Current working directory                                                                                         |

### Context window bar

The entire bar represents your model's context window (100% means it is fully saturated). 

| Usage  | Color    | Example          |
| ------ | -------- | ---------------- |
| 0–50%  | White    | `████░░░░░░ 40%` |
| 50–75% | 🟡 Yellow | `██████░░░░ 60%` |
| 75%+   | 🔴 Red    | `████████░░ 80%` |

The `|` marker indicates your auto-compact threshold (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`).

```
████░░|░░░░  60% used, below autocompact threshold
████████|█░  80% used, past autocompact → will auto-compact at end of turn
```

`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` defaults to 95%, and can be customised in your `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "70"
  }
}
```

## Compact mode

### How to enable

In native terminals (Mac/Linux CLI), the status line auto-switches to a compact layout. You can also toggle it manually:

- Set `COMPACT_STATUS_LINE_THRESHOLD` env var to `0` in your `~/.claude/settings.json` (default `140`).
- Run `/status-line-compact` to switch compact mode on/off.
- Set `.statusline-mode` file to `compact` or `full` in your `~/.claude` directory.

### Symbols

<img width="1536" height="131" alt="image" src="https://github.com/user-attachments/assets/0f66503e-3301-4d34-bd54-88874bad5ac3" />

| Symbol                              | Meaning                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `O`/`S`/`H` + version, optional `+` | Current model (**O**pus/**S**onnet/**H**aiku) + version; `+` suffix for 1M context                |
| lowercase letter                    | Advisor model                                                                                     |
| `78%`, `(95)` when shown            | Context window usage; threshold in parentheses only when `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` is set |
| `h87%`, `BUST`                      | Cache hit rate during last turn, or cache bust                                                    |
| `⎇ main`                            | Current git branch — no staged / modified / untracked counts                                      |
| `$0.0`                              | Estimated cumulative session cost in USD                                                          |

## Understanding cache

### What are the metrics?

Claude Code caches your context (system prompt, conversation history) server-side. Each turn the API reports:

- **`cache_read_input_tokens`** — tokens served from cache, not inferred again **(-90% cheaper)**
- **`cache_creation_input_tokens`** — tokens written to cache **(125% more expensive)**
- **`input_tokens`** — uncached tokens processed **(100%, normal price)**

**hit%** = `cache_read / (cache_read + input_tokens)` — higher is better.

### What causes a cache BUST?

- Switching models (each model has its own KV cache namespace)
- Cache TTL expiry (5 min default, up to 1 hr with extended cache)
- Starting a new session
- Running `/clear`
- Context compaction (Claude Code rewrites the context prefix)
- System prompt changes (editing `CLAUDE.md`, toggling plugins, or changing settings mid-session)
