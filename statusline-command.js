#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execP = util.promisify(exec);
const fsp = fs.promises;

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const sep = c(90, '|');

const VERSION = '1.10.0';
const FIVEH_CACHE_TTL_MS = 60 * 1000;
const RAW_URL = 'https://raw.githubusercontent.com/stanlrt/simple-claude-code-status-line/main/statusline-command.js';
const AUTO_UPDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const HOOK_TAG = 'simple-claude-code-status-line:auto-update';

function runAutoUpdate() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const stamp = path.join(claudeDir, '.statusline-last-update-check');

  // Fast-path throttle: 99% of session starts hit this and exit immediately.
  // Done BEFORE spawning anything, so the hook returns in tens of milliseconds.
  try {
    if (fs.existsSync(stamp)) {
      const age = Date.now() - fs.statSync(stamp).mtimeMs;
      if (age < AUTO_UPDATE_INTERVAL_MS) {
        process.exit(0);
      }
    }
  } catch {}

  // Stale: bump timestamp now so concurrent starts don't all queue updates.
  try { fs.writeFileSync(stamp, String(Date.now())); } catch {}

  if (process.env.SIMPLE_STATUSLINE_DETACHED) {
    // Detached child: actually fetch + write
    runUpdate();
    return;
  }

  // Spawn the detached child. windowsHide prevents a console window flash on Windows.
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [__filename, 'auto-update'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, SIMPLE_STATUSLINE_DETACHED: '1' },
  });
  child.unref();
  process.exit(0);
}

function runUpdate() {
  const https = require('https');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const scriptDest = path.join(claudeDir, 'simple-claude-code-status-line.js');

  console.log(c(90, `Fetching ${RAW_URL} ...`));
  https.get(RAW_URL, res => {
    if (res.statusCode !== 200) {
      console.error(c(31, '✗') + ` HTTP ${res.statusCode} from GitHub`);
      process.exit(1);
    }
    let body = '';
    res.setEncoding('utf8');
    res.on('data', d => body += d);
    res.on('end', () => {
      if (!body.includes('VERSION =')) {
        console.error(c(31, '✗') + ` Downloaded file looks invalid (no VERSION). Aborting.`);
        process.exit(1);
      }
      const m = body.match(/const VERSION = ['"]([^'"]+)['"]/);
      const newVersion = m ? m[1] : '?';
      try {
        if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
        fs.writeFileSync(scriptDest, body);
        console.log(c(32, '✓') + ` Updated ${scriptDest} (${VERSION} → ${newVersion})`);
        console.log(c(90, '  Re-running install to refresh slash commands and settings...'));
        const { spawnSync } = require('child_process');
        const r = spawnSync(process.execPath, [scriptDest, 'init'], { stdio: 'inherit' });
        process.exit(r.status || 0);
      } catch (e) {
        console.error(c(31, '✗') + ` Failed to write: ${e.message}`);
        process.exit(1);
      }
    });
  }).on('error', e => {
    console.error(c(31, '✗') + ` Network error: ${e.message}`);
    process.exit(1);
  });
}

const COMPACT_COMMAND_MD = `---
description: Toggle compact mode for the status line
allowed-tools: Bash
---

!\`f="$HOME/.claude/.statusline-mode"; cur=$(cat "$f" 2>/dev/null); if [ "$cur" = "compact" ]; then echo "full" > "$f"; echo "compact mode: OFF (forced full)"; else echo "compact" > "$f"; echo "compact mode: ON (forced compact)"; fi\`

Report the new compact mode state to the user in one short sentence.
`;

const UPDATE_COMMAND_MD = `---
description: Update the status line to the latest version from GitHub
allowed-tools: Bash
---

!\`node "$HOME/.claude/simple-claude-code-status-line.js" update\`

Report the new installed version (look for the "Updated ... (X → Y)" line in the output) and remind the user to restart Claude Code.
`;

function runInstall() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const commandsDir = path.join(claudeDir, 'commands');
  const compactCmdPath = path.join(commandsDir, 'status-line-compact.md');
  const scriptDest = path.join(claudeDir, 'simple-claude-code-status-line.js');
  const cmd = `node "${scriptDest}"`;

  try {
    if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

    // Copy this script to a stable location so the status line doesn't run npx on every render
    fs.copyFileSync(__filename, scriptDest);
    console.log(c(32, '✓') + ` Copied renderer to ${scriptDest}`);

    let settings = {};
    if (fs.existsSync(settingsPath)) {
      try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {
        const backup = settingsPath + '.bak.' + Date.now();
        fs.copyFileSync(settingsPath, backup);
        console.error(c(33, `Existing settings.json was invalid JSON. Backed up to ${backup}`));
        settings = {};
      }
    }
    const prev = settings.statusLine;
    settings.statusLine = { type: 'command', command: cmd };

    // SessionStart hook: detached background auto-update, throttled to once per 7 days
    const hookCmd = `node "${scriptDest}" auto-update`;
    settings.hooks = settings.hooks || {};
    const sessionHooks = Array.isArray(settings.hooks.SessionStart) ? settings.hooks.SessionStart : [];
    // Remove any prior copies of our hook (match by command substring)
    const filtered = sessionHooks
      .map(group => {
        if (!group || !Array.isArray(group.hooks)) return group;
        return { ...group, hooks: group.hooks.filter(h => !(h && typeof h.command === 'string' && h.command.includes('simple-claude-code-status-line') && h.command.includes('auto-update'))) };
      })
      .filter(group => group && Array.isArray(group.hooks) && group.hooks.length > 0);
    filtered.push({ hooks: [{ type: 'command', command: hookCmd }] });
    settings.hooks.SessionStart = filtered;

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(c(32, '✓') + ` Set statusLine in ${settingsPath}`);
    if (prev && (prev.command !== cmd || prev.type !== 'command')) {
      console.log(c(90, `  (replaced previous: ${JSON.stringify(prev)})`));
    }
    console.log(c(32, '✓') + ` Wired SessionStart hook for weekly auto-update`);

    if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true });
    fs.writeFileSync(compactCmdPath, COMPACT_COMMAND_MD);
    console.log(c(32, '✓') + ` Installed /status-line-compact slash command into ${compactCmdPath}`);
    const updateCmdPath = path.join(commandsDir, 'update-status-line.md');
    fs.writeFileSync(updateCmdPath, UPDATE_COMMAND_MD);
    console.log(c(32, '✓') + ` Installed /update-status-line slash command into ${updateCmdPath}`);

    console.log(c(36, `  Version: ${VERSION}`));

    console.log(c(90, '  Restart Claude Code to see it.'));
    process.exit(0);
  } catch (e) {
    console.error(c(31, '✗') + ` Failed: ${e.message}`);
    process.exit(1);
  }
}

function fivehCachePath() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return path.join(claudeDir, '.statusline-5h-cache.json');
}

function runRefresh5h() {
  // Detached background: shell out to ccusage, parse JSON, write cache. Never blocks render.
  const { spawn } = require('child_process');
  const child = spawn('npx', ['-y', 'ccusage@latest', 'blocks', '--active', '-j', '--token-limit', 'max'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
    shell: true,
  });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', d => out += d);
  child.on('error', () => process.exit(0));
  child.on('close', () => {
    try {
      const parsed = JSON.parse(out);
      const blocks = parsed.blocks || [];
      const active = blocks.find(b => b.isActive) || blocks[blocks.length - 1];
      if (!active) { process.exit(0); }
      const tokens = active.totalTokens || (active.tokenCounts && (active.tokenCounts.inputTokens + active.tokenCounts.outputTokens + (active.tokenCounts.cacheCreationInputTokens || 0) + (active.tokenCounts.cacheReadInputTokens || 0))) || 0;
      const limit = active.tokenLimitStatus?.limit || parsed.tokenLimit || 0;
      const cost = active.costUSD || 0;
      const remainingMin = active.projection?.remainingMinutes ?? null;
      const pct = limit > 0 ? Math.round(tokens / limit * 100) : null;
      const data = { updatedAt: Date.now(), pct, tokens, limit, cost, remainingMin };
      fs.writeFileSync(fivehCachePath(), JSON.stringify(data));
    } catch {}
    process.exit(0);
  });
}

function maybeSpawn5hRefresh(cacheAge) {
  if (cacheAge !== null && cacheAge < FIVEH_CACHE_TTL_MS) return;
  // Lock so concurrent renders don't all spawn npx
  const lock = fivehCachePath() + '.lock';
  try {
    const st = fs.statSync(lock);
    if (Date.now() - st.mtimeMs < 30000) return; // refresh in flight
  } catch {}
  try { fs.writeFileSync(lock, String(Date.now())); } catch {}
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [__filename, 'refresh-5h'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

// Explicit subcommands / flags
const isUpdate = process.argv.includes('update') || process.argv.includes('--update');
const isAutoUpdate = process.argv.includes('auto-update');
const isInit = process.argv.includes('init') || process.argv.includes('install') || process.argv.includes('--install');
const isRefresh5h = process.argv.includes('refresh-5h');

if (isRefresh5h) {
  runRefresh5h();
} else if (isAutoUpdate) {
  runAutoUpdate();
} else if (isUpdate) {
  runUpdate();
} else if (isInit) {
  runInstall();
} else {

// Detection: Claude Code pipes JSON within milliseconds. If no data arrives in 150ms,
// assume direct user invocation (npx <pkg>) and run install. isTTY alone is unreliable
// across Windows shells / npm wrappers, so we trust the data signal instead.
let raw = '';
let gotData = false;
let decided = false;

const timer = setTimeout(() => {
  if (!gotData && !decided) {
    decided = true;
    runInstall();
  }
}, 150);

process.stdin.on('data', d => {
  gotData = true;
  raw += d;
});
process.stdin.on('end', async () => {
  if (decided) return;
  decided = true;
  clearTimeout(timer);
  if (!raw.trim()) {
    runInstall();
    return;
  }
  let json = {};
  try { json = JSON.parse(raw); } catch {}

  const model = json.model?.display_name || json.model?.id || 'Unknown';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const workDir = json.workspace?.current_dir || process.cwd();
  const sessionId = json.session_id || 'default';
  const cacheFile = path.join(os.tmpdir(), `claude-statusline-git-${sessionId}`);
  const CACHE_TTL = 5000;

  // Width probes: race in priority order with a hard cap. powershell on Windows
  // can take 1-3s cold; we don't wait for stragglers once a higher-priority one
  // resolves with a valid value.
  const widthProbes = [
    Promise.resolve(parseInt(process.env.COLUMNS, 10) || 0), // env: instant, highest priority
    execP('tput cols </dev/tty', { shell: '/bin/bash', timeout: 200 }).then(r => parseInt(r.stdout.trim(), 10)),
    execP('stty size </dev/tty', { shell: '/bin/bash', timeout: 200 }).then(r => parseInt(r.stdout.trim().split(' ')[1], 10)),
    execP('mode con', { timeout: 300 }).then(r => { const m = r.stdout.match(/Columns:\s+(\d+)/i); return m ? parseInt(m[1], 10) : 0; }),
    execP('powershell -NoProfile -Command "$Host.UI.RawUI.WindowSize.Width"', { timeout: 500 }).then(r => parseInt(r.stdout.trim(), 10)),
  ].map(p => p.catch(() => 0));

  const widthPromise = new Promise(resolve => {
    const results = new Array(widthProbes.length).fill(undefined);
    let pending = widthProbes.length;
    const cap = setTimeout(() => resolve(pickFirstValid(results)), 200);
    widthProbes.forEach((p, i) => p.then(v => {
      results[i] = (v && v > 0) ? v : 0;
      pending--;
      const winner = pickFirstValid(results);
      // resolve early once we have the highest-priority result whose dependencies (earlier
      // probes) have all reported, so we never wait on a low-priority slow probe.
      if (winner > 0) {
        let stable = true;
        for (let j = 0; j < i; j++) if (results[j] === undefined) { stable = false; break; }
        if (stable) { clearTimeout(cap); resolve(winner); return; }
      }
      if (pending === 0) { clearTimeout(cap); resolve(winner); }
    }));
  });
  function pickFirstValid(arr) {
    for (const v of arr) if (v && v > 0) return v;
    return 0;
  }

  const advisorPromise = fsp.readFile(path.join(home, '.claude', 'settings.json'), 'utf8')
    .then(s => { try { return JSON.parse(s).advisorModel || ''; } catch { return ''; } })
    .catch(() => '');

  const cavemanPromise = fsp.readFile(path.join(claudeDir, '.caveman-active'), 'utf8')
    .then(t => t.trim()).catch(() => '');

  const forcedModePromise = fsp.readFile(path.join(claudeDir, '.statusline-mode'), 'utf8')
    .then(t => t.trim()).catch(() => '');

  const fivehPromise = (async () => {
    const cachePath = fivehCachePath();
    let data = null;
    let age = null;
    try {
      const raw = await fsp.readFile(cachePath, 'utf8');
      data = JSON.parse(raw);
      age = Date.now() - (data.updatedAt || 0);
    } catch {}
    maybeSpawn5hRefresh(age);
    return data;
  })();

  const GIT_TIMEOUT = 800;
  const gitPromise = (async () => {
    try {
      const stat = await fsp.stat(cacheFile).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs < CACHE_TTL) {
        return await fsp.readFile(cacheFile, 'utf8');
      }
      await execP('git rev-parse --git-dir', { cwd: workDir, timeout: GIT_TIMEOUT });
      const [branchR, stagedR, modifiedR, untrackedR, behindR] = await Promise.all([
        execP('git branch --show-current', { cwd: workDir, timeout: GIT_TIMEOUT }),
        execP('git diff --cached --numstat', { cwd: workDir, timeout: GIT_TIMEOUT }),
        execP('git diff --numstat', { cwd: workDir, timeout: GIT_TIMEOUT }),
        execP('git ls-files --others --exclude-standard', { cwd: workDir, timeout: GIT_TIMEOUT }),
        execP('git rev-list HEAD..@{u} --count', { cwd: workDir, timeout: GIT_TIMEOUT }).catch(() => ({ stdout: '0' })),
      ]);
      const cacheData = [
        branchR.stdout.trim(),
        stagedR.stdout.trim().split('\n').filter(Boolean).length,
        modifiedR.stdout.trim().split('\n').filter(Boolean).length,
        untrackedR.stdout.trim().split('\n').filter(Boolean).length,
        parseInt(behindR.stdout.trim(), 10) || 0,
      ].join('|');
      fsp.writeFile(cacheFile, cacheData).catch(() => {}); // fire-and-forget
      return cacheData;
    } catch { return ''; }
  })();

  const [widthVal, advisorModel, cavemanMode, forcedMode, gitCache, fivehData] = await Promise.all([
    widthPromise,
    advisorPromise,
    cavemanPromise,
    forcedModePromise,
    gitPromise,
    fivehPromise,
  ]);

  let fivehFull = '';
  let fivehCompact = '';
  if (fivehData && fivehData.pct != null) {
    const p = fivehData.pct;
    const color = p < 50 ? 32 : p < 75 ? 33 : 31;
    fivehFull = c(color, ` 5h:${p}%`);
    fivehCompact = c(color, ` ${p}%`);
  }

  let cols = widthVal || 999;

  const pct = json.context_window?.used_percentage;
  const autocompactPct = parseFloat(process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) || 95;
  const BLOCKS = 10;
  let ctx_display;
  if (pct == null) {
    ctx_display = c(90, '░'.repeat(BLOCKS) + ' --%');
  } else {
    const filled = Math.round(pct / 10);
    const divBlock = Math.round(autocompactPct / 10);
    const showDiv = divBlock < 9;
    if (showDiv) {
      const preFilled = Math.min(filled, divBlock);
      const postFilled = Math.max(0, filled - divBlock);
      const preEmpty = divBlock - preFilled;
      const postEmpty = (BLOCKS - divBlock) - postFilled;
      ctx_display =
        (preFilled ? c(37, '█'.repeat(preFilled)) : '') +
        (preEmpty  ? '░'.repeat(preEmpty)          : '') +
        c(90, '|') +
        (postFilled ? c(31, '█'.repeat(postFilled)) : '') +
        (postEmpty  ? '░'.repeat(postEmpty)         : '') +
        ` ${Math.round(pct)}%`;
    } else {
      const color = pct < 50 ? 37 : pct < 75 ? 33 : 31;
      ctx_display = c(color, '█'.repeat(filled) + '░'.repeat(BLOCKS - filled) + ` ${Math.round(pct)}%`);
    }
  }

  let cwd = json.workspace?.current_dir || json.cwd || '?';
  if (home && cwd.startsWith(home)) cwd = '~' + cwd.slice(home.length);

  const cw = json.context_window?.current_usage?.cache_creation_input_tokens || 0;
  const cr = json.context_window?.current_usage?.cache_read_input_tokens || 0;
  const fresh = json.context_window?.current_usage?.input_tokens || 0;
  const cost = json.cost?.total_cost_usd ?? 0;

  const hitDenom = cr + fresh;
  const hitPct = hitDenom > 0 ? Math.round(cr / hitDenom * 100) : null;
  const bust = cr === 0 && (fresh + cw) > 200;
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  let cacheParts = [];
  if (bust) cacheParts.push(c(31, 'BUST'));
  if (hitPct !== null) {
    const hitColor = hitPct === 0 ? 31 : hitPct < 50 ? 33 : 32;
    cacheParts.push(c(hitColor, `hit:${hitPct}%`));
  }
  cacheParts.push(c(90, `fresh:${fmt(fresh)}`));
  if (cw > 0) cacheParts.push(c(90, `write:${fmt(cw)}`));
  const cacheDisplay = cacheParts.join(' ');

  let gitPart = '';
  if (gitCache) {
    const [branch, staged, modified, untracked, behind] = gitCache.split('|');
    if (branch) {
      let status = c(36, `⎇ ${branch}`);
      if (+staged)    status += ' ' + c(32, `+${staged}`);
      if (+modified)  status += ' ' + c(33, `~${modified}`);
      if (+untracked) status += ' ' + c(90, `?${untracked}`);
      if (+behind)    status += ' ' + c(35, `↓${behind}`);
      gitPart = status;
    }
  }

  let cavemanHeads = 0;
  if (cavemanMode === 'lite' || cavemanMode === 'wenyan-lite') cavemanHeads = 1;
  else if (cavemanMode === 'full' || cavemanMode === 'wenyan' || cavemanMode === 'wenyan-full') cavemanHeads = 2;
  else if (cavemanMode === 'ultra' || cavemanMode === 'wenyan-ultra') cavemanHeads = 3;

  const threshRaw = process.env.COMPACT_STATUS_LINE_THRESHOLD;
  const thresh = threshRaw !== undefined ? parseInt(threshRaw, 10) : 140;
  const compact = forcedMode === 'compact' ? true
                : forcedMode === 'full' ? false
                : thresh === 0 ? true
                : cols < thresh;

  const parts = [];
  if (cavemanHeads > 0) parts.push('🗿'.repeat(cavemanHeads));

  if (compact) {
    const abbrev = (name) => {
      const lower = name.toLowerCase();
      let prefix = '';
      if (lower.includes('opus')) prefix = 'O';
      else if (lower.includes('sonnet')) prefix = 'S';
      else if (lower.includes('haiku')) prefix = 'H';
      else return name.split(' ')[0];
      const v = name.match(/(\d+\.\d+)/);
      const ext = /1m/i.test(name) ? '+' : '';
      return `${prefix}${v ? v[1] : ''}${ext}`;
    };
    const modelShort = abbrev(model);
    const advShort = advisorModel ? advisorModel.charAt(0).toLowerCase() : '';
    parts.push(advShort
      ? c(36, modelShort) + c(90, ` ▸ ${advShort}`)
      : c(36, modelShort));

    let ctxShort;
    if (pct == null) {
      ctxShort = c(90, '--%');
    } else {
      const showThresh = autocompactPct < 95;
      const color = (showThresh && pct >= autocompactPct) ? 31
                  : pct < 50 ? 37 : pct < 75 ? 33 : 31;
      ctxShort = c(color, `${Math.round(pct)}%`) + (showThresh ? c(90, ` (${autocompactPct})`) : '');
    }
    parts.push(ctxShort);

    if (bust) {
      parts.push(c(31, 'BUST'));
    } else if (hitPct !== null) {
      const hitColor = hitPct === 0 ? 31 : hitPct < 50 ? 33 : 32;
      parts.push(c(hitColor, `h${hitPct}%`));
    }

    if (gitPart) {
      const branchOnly = gitPart.split(' ').slice(0, 2).join(' ');
      parts.push(branchOnly);
    }
    parts.push(c(35, `$${cost.toFixed(1)}`) + fivehCompact);
    parts.push(c(32, cwd));
  } else {
    const modelDisplay = advisorModel
      ? c(36, model) + c(90, ` ▸ ${advisorModel}`)
      : c(36, model);
    parts.push(modelDisplay);
    parts.push(ctx_display);
    parts.push(cacheDisplay);
    if (gitPart) parts.push(gitPart);
    parts.push(c(35, `$${cost.toFixed(4)}`) + fivehFull);
    parts.push(c(32, cwd));
  }

  process.stdout.write(parts.join(` ${sep} `) + '\n');
});
}
