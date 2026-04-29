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

  let advisorModel = '';
  try {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.advisorModel) advisorModel = settings.advisorModel;
  } catch {}

  const pct = json.context_window?.used_percentage;
  let ctx_display;
  if (pct != null) {
    const filled = Math.round(pct / 10);
    ctx_display = '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${Math.round(pct)}%`;
  } else {
    ctx_display = '░'.repeat(10) + ' --%';
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

  const parts = [];
  const modelDisplay = advisorModel
    ? c(36, model) + c(90, ` ▸ ${advisorModel}`)
    : c(36, model);
  parts.push(modelDisplay);
  parts.push(c(33, ctx_display));
  parts.push(cacheDisplay);
  if (gitPart) parts.push(gitPart);
  parts.push(c(35, `$${cost.toFixed(4)}`));
  parts.push(c(32, cwd));

  process.stdout.write(parts.join(` ${sep} `) + '\n');
});
