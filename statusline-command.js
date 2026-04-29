#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const sep = c(90, '|');

let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let json = {};
  try { json = JSON.parse(raw); } catch {}

  const model = json.model?.display_name || json.model?.id || 'Unknown';
  const home = process.env.HOME || process.env.USERPROFILE || '';

  let cols = 0;
  const tries = [
    () => parseInt(execSync('tput cols </dev/tty', { encoding: 'utf8', shell: '/bin/bash', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 10),
    () => parseInt(execSync('stty size </dev/tty', { encoding: 'utf8', shell: '/bin/bash', stdio: ['ignore', 'pipe', 'ignore'] }).split(' ')[1], 10),
    () => { const m = execSync('mode con', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/Columns:\s+(\d+)/i); return m ? parseInt(m[1], 10) : 0; },
    () => parseInt(execSync('powershell -NoProfile -Command "$Host.UI.RawUI.WindowSize.Width"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 10),
    () => parseInt(process.env.COLUMNS, 10),
  ];
  for (const fn of tries) {
    try { const v = fn(); if (v && v > 0) { cols = v; break; } } catch {}
  }
  if (!cols) cols = 999;

  let advisorModel = '';
  try {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.advisorModel) advisorModel = settings.advisorModel;
  } catch {}

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

  const ti = json.context_window?.total_input_tokens || 0;
  const to = json.context_window?.total_output_tokens || 0;
  const cw = json.context_window?.current_usage?.cache_creation_input_tokens || 0;
  const cr = json.context_window?.current_usage?.cache_read_input_tokens || 0;
  const fresh = json.context_window?.current_usage?.input_tokens || 0;
  const cost = (ti * 3 + to * 15 + cw * 3.75 + cr * 0.30) / 1000000;

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

  const sessionId = json.session_id || 'default';
  const cacheFile = path.join(os.tmpdir(), `claude-statusline-git-${sessionId}`);
  const CACHE_TTL = 5000;

  let gitPart = '';
  try {
    let cacheData = null;
    if (fs.existsSync(cacheFile)) {
      const age = Date.now() - fs.statSync(cacheFile).mtimeMs;
      if (age < CACHE_TTL) cacheData = fs.readFileSync(cacheFile, 'utf8');
    }
    if (!cacheData) {
      const workDir = json.workspace?.current_dir || process.cwd();
      execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: workDir });
      const branch = execSync('git branch --show-current', { encoding: 'utf8', cwd: workDir }).trim();
      const staged = execSync('git diff --cached --numstat', { encoding: 'utf8', cwd: workDir }).trim().split('\n').filter(Boolean).length;
      const modified = execSync('git diff --numstat', { encoding: 'utf8', cwd: workDir }).trim().split('\n').filter(Boolean).length;
      const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', cwd: workDir }).trim().split('\n').filter(Boolean).length;
      let behind = 0;
      try { behind = parseInt(execSync('git rev-list HEAD..@{u} --count', { encoding: 'utf8', cwd: workDir }).trim()) || 0; } catch {}
      cacheData = `${branch}|${staged}|${modified}|${untracked}|${behind}`;
      fs.writeFileSync(cacheFile, cacheData);
    }
    const [branch, staged, modified, untracked, behind] = cacheData.split('|');
    if (branch) {
      let status = c(36, `⎇ ${branch}`);
      if (+staged)    status += ' ' + c(32, `+${staged}`);
      if (+modified)  status += ' ' + c(33, `~${modified}`);
      if (+untracked) status += ' ' + c(90, `?${untracked}`);
      if (+behind)    status += ' ' + c(35, `↓${behind}`);
      gitPart = status;
    }
  } catch {}

  let cavemanHeads = 0;
  try {
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
    const mode = fs.readFileSync(path.join(claudeDir, '.caveman-active'), 'utf8').trim();
    if (mode === 'lite' || mode === 'wenyan-lite') cavemanHeads = 1;
    else if (mode === 'full' || mode === 'wenyan' || mode === 'wenyan-full') cavemanHeads = 2;
    else if (mode === 'ultra' || mode === 'wenyan-ultra') cavemanHeads = 3;
  } catch {}

  const claudeDirCompact = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const forcedCompact = fs.existsSync(path.join(claudeDirCompact, '.statusline-compact-forced'));
  const threshRaw = process.env.COMPACT_STATUS_LINE_THRESHOLD;
  const thresh = threshRaw !== undefined ? parseInt(threshRaw, 10) : 140;
  const compact = forcedCompact || thresh === 0 ? true : cols < thresh;

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
    parts.push(c(35, `$${cost.toFixed(1)}`));
    parts.push(c(32, cwd));
  } else {
    const modelDisplay = advisorModel
      ? c(36, model) + c(90, ` ▸ ${advisorModel}`)
      : c(36, model);
    parts.push(modelDisplay);
    parts.push(ctx_display);
    parts.push(cacheDisplay);
    if (gitPart) parts.push(gitPart);
    parts.push(c(35, `$${cost.toFixed(4)}`));
    parts.push(c(32, cwd));
  }

  process.stdout.write(parts.join(` ${sep} `) + '\n');
});
