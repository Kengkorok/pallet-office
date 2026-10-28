'use strict';
// Pallet Office: takes raw Claude Code hook JSON on POST /event, keeps a small
// in-memory picture of every live session and streams it to the browser over SSE.
// No dependencies. Only short labels (file names, Bash descriptions) ever leave
// this process: prompts, file contents and full commands are dropped on arrival.

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 4400;
const TOKEN = process.env.PALLET_TOKEN || '';
const CONFIG_PATH = process.env.CONFIG || path.join(__dirname, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const REC_DIR = process.env.RECORD_DIR || path.join(__dirname, 'recordings');
const MAX_BODY = 16 * 1024 * 1024; // Write/Edit payloads carry whole files
const FEED_SIZE = 80;
const WORKING = new Set(['thinking', 'reading', 'editing', 'running', 'web', 'delegating']);
const STALE_WORKING_MS = 20 * 60 * 1000; // session crashed mid-task
const STALE_IDLE_MS = 3 * 60 * 60 * 1000; // forgotten terminal
const STALE_HELPER_MS = 30 * 60 * 1000;

const residents = new Map(); // project name -> permanent Pokémon, one per config project
const sessions = new Map(); // session_id -> resident it drives, or a temporary visitor
const feed = [];
const clients = new Set();
let recording = null; // { file, started, stream }
let helperSeq = 0;
let config = loadConfig();
syncResidents();
fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => {
  config = loadConfig();
  syncResidents();
  console.log('[config] reloaded');
});

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { projects: c.projects || [], fallback: c.fallback || [], helpers: c.helpers || [] };
  } catch (err) {
    console.error(`[config] ${CONFIG_PATH}: ${err.message}`);
    return { projects: [], fallback: [{ dex: 133, pokemon: 'Eevee' }], helpers: [{ dex: 16, pokemon: 'Pidgey' }] };
  }
}

// Configured projects live on the map all the time; sessions only change what they do.
function syncResidents() {
  const names = new Set(config.projects.map((p) => p.name));
  for (const [name, r] of residents) {
    if (names.has(name) || r.sid) continue;
    residents.delete(name);
    send({ type: 'leave', id: r.id });
  }
  for (const p of config.projects) {
    let r = residents.get(p.name);
    if (!r) {
      r = { id: `res:${p.name}`, permanent: true, sid: null, project: p.name, state: 'idle', detail: '',
        since: Date.now(), changedAt: Date.now(), lastSeen: Date.now(), helpers: [], tools: 0 };
      residents.set(p.name, r);
    }
    Object.assign(r, { dex: p.dex, pokemon: p.pokemon, label: p.pokemon });
    if (clients.size) changed(r);
  }
}

function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function identify(cwd) {
  const dir = String(cwd || '').replace(/\/+$/, '');
  for (const p of config.projects) {
    if ((p.exact || []).includes(dir) || (p.match || []).some((m) => dir.includes(m))) {
      return { project: p.name, dex: p.dex, pokemon: p.pokemon };
    }
  }
  const project = path.basename(dir) || 'Tak dikenali';
  const pool = config.fallback.length ? config.fallback : [{ dex: 133, pokemon: 'Eevee' }];
  const pick = pool[hash(project) % pool.length];
  return { project, dex: pick.dex, pokemon: pick.pokemon };
}

const clip = (s, n = 28) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const base = (f) => (f ? path.basename(String(f)) : '');
function host(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// tool_name + tool_input -> [state, short detail]. Never returns raw input.
function describeTool(name, input = {}) {
  switch (name) {
    case 'Read': return ['reading', base(input.file_path)];
    case 'Grep': return ['reading', 'cari dalam kod'];
    case 'Glob': return ['reading', `cari ${clip(input.pattern, 22)}`];
    case 'LS': return ['reading', base(input.path)];
    case 'Edit':
    case 'MultiEdit':
    case 'Write': return ['editing', base(input.file_path)];
    case 'NotebookEdit': return ['editing', base(input.notebook_path)];
    case 'Bash': return ['running', clip(input.description || String(input.command || '').trim().split(/\s+/)[0])];
    case 'BashOutput':
    case 'KillShell': return ['running', 'tengok proses'];
    case 'WebFetch': return ['web', host(input.url)];
    case 'WebSearch': return ['web', clip(input.query, 32)];
    case 'Task':
    case 'Agent': return ['delegating', clip(input.subagent_type || input.description || 'helper', 24)];
    case 'TodoWrite': return ['thinking', 'susun plan'];
  }
  if (String(name).startsWith('mcp__')) return ['running', clip(String(name).split('__').pop(), 24)];
  return ['thinking', clip(name, 24)];
}

// Claude Code's notification text, in Safwan's words.
function notice(message) {
  const m = String(message || '');
  const perm = m.match(/permission to use (\S+)/i);
  if (perm) return `minta izin guna ${perm[1]}`;
  if (/waiting for your input/i.test(m)) return 'tunggu arahan kau';
  return m || 'tengok sekejap';
}

const VERB = {
  thinking: (d) => d || 'tengah fikir',
  reading: (d) => (d.startsWith('cari') ? d : `baca ${d}`),
  editing: (d) => `edit ${d}`,
  running: (d) => `jalan: ${d}`,
  web: (d) => `layari ${d}`,
  delegating: (d) => `hantar helper (${d})`,
};

const level = (s) => 5 + Math.floor(s.tools / 8);

function publicSession(s) {
  return {
    id: s.id, label: s.label, project: s.project, dex: s.dex, pokemon: s.pokemon, permanent: !!s.permanent,
    live: !s.permanent || !!s.sid, lv: level(s), state: s.state, detail: s.detail, since: s.since, changedAt: s.changedAt,
    helpers: s.helpers.map((h) => ({ id: h.id, dex: h.dex, pokemon: h.pokemon, kind: h.kind, state: h.state, detail: h.detail })),
  };
}

function send(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(line);
  if (recording) recording.stream.write(JSON.stringify({ t: Date.now() - recording.started, msg }) + '\n');
}

function pushFeed(s, text, who = s) {
  const item = { t: Date.now(), sid: s.id, name: who.label || who.pokemon, dex: who.dex, project: s.project, state: who.state, text };
  feed.push(item);
  if (feed.length > FEED_SIZE) feed.shift();
  send({ type: 'feed', item });
}

const changed = (s) => send({ type: 'session', session: publicSession(s) });

function arrive(p) {
  const id = identify(p.cwd);
  const home = residents.get(id.project);
  if (home && !home.sid) {
    Object.assign(home, { sid: p.session_id, since: Date.now(), lastSeen: Date.now() });
    sessions.set(p.session_id, home);
    changed(home);
    pushFeed(home, 'mula kerja');
    return home;
  }
  // A second session on the same project, or a project not in config.json.
  const twins = [...sessions.values()].filter((o) => o.project === id.project).length;
  const s = {
    id: p.session_id, sid: p.session_id, ...id, label: twins ? `${id.pokemon} #${twins + 1}` : id.pokemon,
    state: 'idle', detail: '', since: Date.now(), changedAt: Date.now(), lastSeen: Date.now(), helpers: [], tools: 0,
  };
  sessions.set(p.session_id, s);
  changed(s);
  pushFeed(s, `datang tolong (${s.project})`);
  return s;
}

function leave(s, why) {
  sessions.delete(s.sid);
  if (s.permanent) {
    s.sid = null;
    s.helpers = [];
    setState(s, 'idle', '');
    changed(s);
    pushFeed(s, why || 'rehat dulu');
    return;
  }
  send({ type: 'leave', id: s.id });
  pushFeed(s, why || 'balik');
}

function spawnHelper(s, kind, toolUseId) {
  const pool = config.helpers.length ? config.helpers : [{ dex: 16, pokemon: 'Pidgey' }];
  const pick = pool[helperSeq++ % pool.length];
  const h = {
    id: `h${helperSeq}`, toolUseId, agentId: null, kind: kind || 'helper',
    dex: pick.dex, pokemon: pick.pokemon, label: pick.pokemon, state: 'thinking', detail: kind || '', lastSeen: Date.now(),
  };
  s.helpers.push(h);
  return h;
}

// Events fired inside a subagent carry agent_id; tie each id to one helper.
function helperFor(s, p) {
  let h = s.helpers.find((x) => x.agentId === p.agent_id);
  if (h || p.hook_event_name === 'SubagentStop') return h || null;
  h = s.helpers.find((x) => !x.agentId) || spawnHelper(s, p.agent_type);
  h.agentId = p.agent_id;
  if (p.agent_type) h.kind = p.agent_type;
  return h;
}

function setState(target, state, detail = '') {
  if (target.state !== state) target.changedAt = Date.now();
  target.state = state;
  target.detail = detail;
  target.lastSeen = Date.now();
}

function handle(p) {
  const ev = p.hook_event_name;
  if (!ev || !p.session_id) return;
  let s = sessions.get(p.session_id);
  if (ev === 'SessionEnd') {
    if (s) leave(s, p.reason === 'clear' ? 'clear, rehat dulu' : undefined);
    return;
  }
  if (!s) s = arrive(p);
  s.lastSeen = Date.now();
  const helper = p.agent_id ? helperFor(s, p) : null;
  const who = helper || s;

  switch (ev) {
    case 'SessionStart':
      if (p.source === 'resume') pushFeed(s, 'sambung kerja lama');
      break;
    case 'UserPromptSubmit':
      setState(s, 'thinking', '');
      pushFeed(s, 'dapat arahan baru');
      break;
    case 'PreToolUse': {
      const [state, detail] = describeTool(p.tool_name, p.tool_input || {});
      setState(who, state, detail);
      if (state === 'delegating' && !helper) spawnHelper(s, detail, p.tool_use_id);
      pushFeed(s, VERB[state](detail), who);
      const lv = level(s);
      s.tools++;
      if (level(s) > lv) pushFeed(s, `naik ke Lv ${level(s)}! 🎉`);
      break;
    }
    case 'PostToolUse':
    case 'PostToolUseFailure':
      setState(who, 'thinking', '');
      if (ev === 'PostToolUseFailure') pushFeed(s, `${p.tool_name} tak jadi`, who);
      break;
    case 'PermissionRequest':
      setState(s, 'waiting', `izin ${clip(p.tool_name, 20)}`);
      pushFeed(s, `minta izin guna ${p.tool_name} — perlukan kau!`);
      break;
    case 'Notification': {
      const msg = notice(p.message);
      setState(s, 'waiting', clip(msg, 40));
      pushFeed(s, `perlukan kau: ${clip(msg, 60)}`);
      break;
    }
    case 'Stop':
      setState(s, 'done', 'siap');
      pushFeed(s, 'siap, tunggu arahan seterusnya');
      break;
    case 'SubagentStart':
      if (helper) pushFeed(s, `helper ${helper.kind} masuk kerja`, helper);
      break;
    case 'SubagentStop': {
      const gone = helper || s.helpers[0];
      if (gone) {
        s.helpers = s.helpers.filter((h) => h !== gone);
        pushFeed(s, 'helper siap & balik', gone);
      }
      if (s.state === 'delegating' && !s.helpers.length) setState(s, 'thinking', '');
      break;
    }
    case 'PreCompact':
      setState(s, 'thinking', 'kemas memori');
      break;
    default:
      return;
  }
  changed(s);
}

setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) {
    const limit = WORKING.has(s.state) ? STALE_WORKING_MS : STALE_IDLE_MS;
    if (now - s.lastSeen > limit) { leave(s, 'senyap lama, rehat dulu'); continue; }
    const before = s.helpers.length;
    s.helpers = s.helpers.filter((h) => now - h.lastSeen < STALE_HELPER_MS);
    if (s.helpers.length !== before) changed(s);
  }
}, 60 * 1000).unref();

function startRecording() {
  fs.mkdirSync(REC_DIR, { recursive: true });
  const file = `office-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
  recording = { file, started: Date.now(), stream: fs.createWriteStream(path.join(REC_DIR, file)) };
  recording.stream.write(JSON.stringify({ t: 0, msg: snapshot() }) + '\n');
  console.log(`[record] ${file}`);
}

function stopRecording() {
  recording.stream.end();
  console.log(`[record] stopped ${recording.file}`);
  recording = null;
}

const visitors = () => [...sessions.values()].filter((s) => !s.permanent);
const snapshot = () => ({ type: 'snapshot', sessions: [...residents.values(), ...visitors()].map(publicSession), feed });
const recordStatus = () => ({ type: 'record', on: !!recording, file: recording && recording.file });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.ndjson': 'application/x-ndjson', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function serveFile(res, dir, rel) {
  const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(dir + path.sep)) return notFound(res);
  fs.readFile(file, (err, buf) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const authorised = (req) => !TOKEN || req.headers['x-pallet-token'] === TOKEN;

function readBody(req, cb) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size <= MAX_BODY) chunks.push(c);
  });
  req.on('end', () => cb(size > MAX_BODY ? null : Buffer.concat(chunks).toString('utf8')));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://office');

  if (req.method === 'POST' && url.pathname === '/event') {
    if (!authorised(req)) return json(res, 401, { error: 'token' });
    return readBody(req, (body) => {
      res.writeHead(body === null ? 413 : 204);
      res.end();
      if (body === null) return;
      try {
        const p = JSON.parse(body);
        if (process.env.DEBUG) console.log(`[event] ${p.hook_event_name} ${p.tool_name || ''} ${String(p.session_id).slice(0, 8)}`);
        handle(p);
      } catch (err) {
        console.error(`[event] bad payload: ${err.message}`);
      }
    });
  }

  if (req.method === 'GET' && url.pathname === '/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-cache',
      connection: 'keep-alive', 'x-accel-buffering': 'no',
    });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    res.write(`data: ${JSON.stringify(recordStatus())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/record') {
    if (!authorised(req)) return json(res, 401, { error: 'token' });
    recording ? stopRecording() : startRecording();
    const status = recordStatus();
    for (const c of clients) c.write(`data: ${JSON.stringify(status)}\n\n`);
    return json(res, 200, status);
  }

  if (req.method === 'GET' && url.pathname === '/api/recordings') {
    fs.readdir(REC_DIR, (err, files) => json(res, 200, (files || []).filter((f) => f.endsWith('.ndjson')).sort().reverse()));
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/recordings/')) {
    return serveFile(res, REC_DIR, decodeURIComponent(url.pathname.slice('/recordings/'.length)));
  }

  if (req.method === 'GET') {
    return serveFile(res, PUBLIC_DIR, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)));
  }

  notFound(res);
});

if (process.env.RECORD) startRecording();

server.listen(PORT, HOST, () => console.log(`Pallet Office buka di http://${HOST}:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (recording) stopRecording();
    process.exit(0);
  });
}
