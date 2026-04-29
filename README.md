# simple-claude-code-status-line

A rich status line for [Claude Code](https://claude.ai/code) showing cache metrics, context window usage, git status, cost tracking, and current directory.

## Preview

- On a normal turn:

  <img width="1916" height="132" alt="image" src="https://github.com/user-attachments/assets/e784416b-d18a-43d3-815f-6fea99da507d" />

- On a cache miss/bust turn:

  <img width="2009" height="136" alt="image" src="https://github.com/user-attachments/assets/2f0151c9-dc87-48c0-a1ed-c3aa0c8e8cfd" />

## Installation

### Prerequs

- [Claude Code](https://claude.ai/code)
- Node.js on PATH

### Option A — Claude Code plugin (recommended)

```
/install-plugin https://github.com/stanlrt/simple-claude-code-status-line
```

Then run `/statusline-setup` and Claude will handle the rest.

### Option B — Manual

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

> **Note:** Use the absolute path. The `~` shorthand is not expanded in the command value.

## What each symbol means

| Symbol | Meaning |
|--------|---------|
| `🗿` | Caveman mode active (requires [caveman plugin](https://github.com/JuliusBrussee/caveman)) |
| `Claude Sonnet 4.6` | Current model |
| `▸ opus` | Advisor model (if configured via `advisorModel` in settings.json) |
| `████████░░ 78%` | Context window usage — 10 blocks, each = 10% |
| `hit:87%` | Cache hit rate this turn. Green ≥50%, yellow <50%, red 0% |
| `fresh:1.2k` | Uncached input tokens this turn — what you pay full price for |
| `write:46.3k` | Tokens written to cache this turn (only shown when nonzero). Spikes on first turn or after a bust |
| `BUST` | Cache miss detected (red). Appears when `hit:0%` and input is substantial |
| `⎇ main` | Current git branch |
| `+2` | Staged files (green) |
| `~1` | Modified files (yellow) |
| `?3` | Untracked files (gray) |
| `↓2` | Commits behind remote (purple) |
| `$0.0042` | Estimated cumulative session cost in USD |
| `~/projects/myapp` | Current working directory |

## Cache metrics explained

Claude Code caches your context (system prompt, conversation history) server-side. Each turn the API reports:

- **`cache_read_input_tokens`** — tokens served from cache (~90% cheaper)
- **`cache_creation_input_tokens`** — tokens written to cache (charged at 125% of normal)
- **`input_tokens`** — uncached tokens processed at full price

**hit%** = `cache_read / (cache_read + input_tokens)` — higher is better.

### What causes a cache BUST?

- Switching models (each model has its own cache namespace)
- Cache TTL expiry (5 min default, up to 1 hr with extended cache)
- Starting a new session or running `/clear`
- Context compaction (Claude Code rewrites the context prefix)
- System prompt changes (editing `CLAUDE.md`, toggling plugins, or changing settings mid-session)
  
## License

MIT
