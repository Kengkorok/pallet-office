'use strict';
// Plays a made-up workday into the office through the same POST /event path the
// real hooks use. Handy for testing the page, and for recording a portfolio demo
// that contains no real prompts, paths or commands.
//   node demo.js [http://127.0.0.1:4400]

const URL_BASE = process.argv[2] || process.env.PALLET_URL || 'http://127.0.0.1:4400';
const HOME = '/home/demo';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PACE = 1.6; // stretch tool calls so the stroll and the bubbles keep in step
let toolSeq = 0;

async function post(body) {
  await fetch(`${URL_BASE}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pallet-token': process.env.PALLET_TOKEN || '' },
    body: JSON.stringify(body),
  });
}

function session(id, dir) {
  const cwd = `${HOME}/${dir}`;
  const ev = async (hook_event_name, extra = {}) => {
    await post({ hook_event_name, session_id: id, cwd, ...extra });
    // Residents stroll at 2.4 tiles/s; give them time to reach the desk or the centre.
    if (hook_event_name === 'UserPromptSubmit' || hook_event_name === 'PermissionRequest' || hook_event_name === 'Notification') await sleep(5000);
  };
  const tool = async (tool_name, tool_input, ms = 1500, extra = {}) => {
    const tool_use_id = `t${++toolSeq}`;
    await ev('PreToolUse', { tool_name, tool_input, tool_use_id, ...extra });
    await sleep(ms * PACE);
    await ev('PostToolUse', { tool_name, tool_use_id, ...extra });
  };
  const ask = async (tool_name, tool_input, waitMs, ms) => {
    await ev('PermissionRequest', { tool_name, tool_input });
    await sleep(waitMs);
    await tool(tool_name, tool_input, ms);
  };
  // Subagents: Task call, then each agent runs its own steps under its agent_id.
  const delegate = async (agents) => {
    const ids = [];
    for (const a of agents) {
      const tool_use_id = `t${++toolSeq}`;
      ids.push(tool_use_id);
      await ev('PreToolUse', { tool_name: 'Task', tool_input: { subagent_type: a.type, description: a.type }, tool_use_id });
    }
    await Promise.all(agents.map(async (a, i) => {
      const who = { agent_id: a.id, agent_type: a.type };
      await sleep(400 + i * 600);
      await ev('SubagentStart', who);
      for (const [name, input, ms] of a.steps) await tool(name, input, ms, who);
      await ev('SubagentStop', who);
    }));
    for (const tool_use_id of ids) await ev('PostToolUse', { tool_name: 'Task', tool_use_id });
  };
  return { ev, tool, ask, delegate };
}

async function portfolio() {
  const s = session('demo-portfolio', 'Kengkorok.github.io');
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(3000);
  await s.ev('UserPromptSubmit');
  await sleep(1500);
  await s.tool('Read', { file_path: 'index.html' });
  await s.tool('Read', { file_path: 'styles.css' }, 1200);
  await s.delegate([{ id: 'p1', type: 'Explore', steps: [
    ['Glob', { pattern: 'assets/**/*.mp4' }, 1800],
    ['Read', { file_path: 'main.js' }, 2000],
  ] }]);
  await s.tool('Edit', { file_path: 'index.html' }, 2500);
  await s.tool('Edit', { file_path: 'styles.css' }, 2000);
  await s.tool('Bash', { command: 'npx serve', description: 'Preview laman' }, 3000);
  await s.ask('Bash', { command: 'git push', description: 'Push ke GitHub' }, 6000, 2000);
  await s.ev('Stop');
  await sleep(9000);
  await s.ev('UserPromptSubmit');
  await s.tool('Edit', { file_path: 'main.js' }, 2500);
  await s.tool('Bash', { command: 'git commit', description: 'Commit tweak animasi' }, 1500);
  await s.ev('Stop');
  await sleep(12000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

async function masjid() {
  await sleep(3000);
  const s = session('demo-masjid', 'repos/masjidMTU-website');
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(2000);
  await s.ev('UserPromptSubmit');
  await s.tool('Read', { file_path: 'src/app/page.tsx' }, 1800);
  await s.tool('Grep', { pattern: 'waktuSolat' }, 1500);
  await s.tool('Edit', { file_path: 'jadual-solat.tsx' }, 3000);
  await s.tool('Bash', { command: 'npm test', description: 'Run test' }, 1000);
  await s.ev('PostToolUseFailure', { tool_name: 'Bash' });
  await sleep(1500);
  await s.tool('Edit', { file_path: 'jadual-solat.tsx' }, 2000);
  await s.tool('Bash', { command: 'npm test', description: 'Run test lagi' }, 3500);
  await s.delegate([{ id: 'm1', type: 'code-reviewer', steps: [
    ['Read', { file_path: 'jadual-solat.tsx' }, 2500],
    ['Read', { file_path: 'kuliah-mingguan.tsx' }, 2000],
  ] }]);
  await s.tool('Edit', { file_path: 'kuliah-mingguan.tsx' }, 2500);
  await s.ev('Stop');
  await sleep(5000);
  await s.ev('Notification', { message: 'Claude is waiting for your input' });
  await sleep(14000);
  await s.ev('UserPromptSubmit');
  await s.tool('Bash', { command: 'npm run build', description: 'Build preview' }, 4000);
  await s.ev('Stop');
  await sleep(8000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

async function radar() {
  await sleep(9000);
  const s = session('demo-radar', 'pogo-wave-radar');
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(1500);
  await s.ev('UserPromptSubmit');
  await s.tool('WebSearch', { query: 'pokemon go spotlight hour' }, 2500);
  await s.tool('WebFetch', { url: 'https://leekduck.com/events/' }, 2500);
  await s.tool('Read', { file_path: 'src/parser.ts' }, 1500);
  await s.tool('Write', { file_path: 'src/waves.ts' }, 3000);
  await s.tool('Bash', { command: 'npm run build', description: 'Build radar' }, 3000);
  await s.ev('Stop');
  await sleep(7000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

async function mewarna() {
  await sleep(15000);
  const s = session('demo-mewarna', 'coloring-book');
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(2000);
  await s.ev('UserPromptSubmit');
  await s.tool('Read', { file_path: 'canvas.js' }, 2000);
  await s.tool('Edit', { file_path: 'palette.js' }, 2500);
  await s.ask('Write', { file_path: 'gambar/kucing.svg' }, 5000, 2500);
  await s.tool('Bash', { command: 'npx serve', description: 'Cuba warna kucing' }, 3000);
  await s.ev('Stop');
  await sleep(20000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

async function rayquaza() {
  await sleep(22000);
  const s = session('demo-ship', 'ship-dashboard');
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(1500);
  await s.ev('UserPromptSubmit');
  await s.tool('TodoWrite', {}, 1500);
  await s.delegate([
    { id: 'r1', type: 'Explore', steps: [
      ['Glob', { pattern: '**/*.yml' }, 2000],
      ['Read', { file_path: 'compose.yaml' }, 2500],
    ] },
    { id: 'r2', type: 'general-purpose', steps: [
      ['WebFetch', { url: 'https://docs.docker.com/compose/' }, 3000],
      ['Read', { file_path: 'ingest.js' }, 2000],
    ] },
  ]);
  await s.tool('Edit', { file_path: 'ingest.js' }, 2500);
  await s.ask('Bash', { command: 'docker compose up -d', description: 'Deploy ke CasaOS' }, 5000, 4000);
  await s.ev('Stop');
  await sleep(8000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

async function palletOffice() {
  await sleep(32000);
  const s = session('demo-pallet', 'pallet-office');
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(1500);
  await s.ev('UserPromptSubmit');
  await s.tool('Read', { file_path: 'server.js' }, 2000);
  await s.tool('Edit', { file_path: 'office.js' }, 3000);
  await s.tool('Bash', { command: 'node demo.js', description: 'Main demo' }, 3000);
  await s.ev('Stop');
  await sleep(6000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

async function snorlax() {
  await sleep(40000);
  const s = session('demo-home', '');
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(18000);
  await s.ev('Notification', { message: 'Claude is waiting for your input' });
  await sleep(6000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

const runs = [portfolio, masjid, radar, mewarna, rayquaza, palletOffice, snorlax];
Promise.all(runs.map((f) => f())).then(() => console.log('demo siap'), (err) => {
  console.error(`tak dapat sambung ke ${URL_BASE}: ${err.message}`);
  process.exit(1);
});
