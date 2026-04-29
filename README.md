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
| `🗿` / `🗿🗿` / `🗿🗿🗿` | Caveman mode intensity: lite / full / ultra (requires [caveman plugin](https://github.com/JuliusBrussee/caveman)) |
| `Claude Sonnet 4.6` | Current model |
| `▸ opus` | Advisor model (if configured via `advisorModel` in settings.json) |
| `████████░░ 78%` | Context window usage bar — see below |
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

## Context window bar

10 blocks = 0–100% of the model's context window. Color reflects usage level.

**Default mode** (no `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` set, or threshold ≥ 90%):

| Usage | Color | Example |
|-------|-------|---------|
| 0–50% | 🟢 Green | `████░░░░░░ 40%` |
| 50–75% | 🟡 Yellow | `██████░░░░ 60%` |
| 75%+ | 🔴 Red | `████████░░ 80%` |

**Divider mode** (when `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` is set below 90%):

A `|` marker splits the bar at the autocompact threshold. Blocks past it are red — compaction will fire soon.

```
████░░|░░░░  60% used, autocompact at 60% → safe
████████|██  80% used, past autocompact at 70% → compacting soon
```

To enable divider mode, set in your `~/.claude/settings.json` env section:

```json
{
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "70"
  }
}
```

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
