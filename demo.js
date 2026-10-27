'use strict';
// Plays a made-up workday into the office through the same POST /event path the
// real hooks use. Handy for testing the page, and for recording a portfolio demo
// that contains no real prompts, paths or commands.
//   node demo.js [http://127.0.0.1:4400]

const URL_BASE = process.argv[2] || process.env.PALLET_URL || 'http://127.0.0.1:4400';
const HOME = '/home/demo';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body) {
  await fetch(`${URL_BASE}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pallet-token': process.env.PALLET_TOKEN || '' },
    body: JSON.stringify(body),
  });
}

function session(id, cwd) {
  const ev = (hook_event_name, extra = {}) => post({ hook_event_name, session_id: id, cwd, ...extra });
  const tool = async (tool_name, tool_input, ms = 1200, extra = {}) => {
    await ev('PreToolUse', { tool_name, tool_input, tool_use_id: `${tool_name}-${Math.random()}`, ...extra });
    await sleep(ms);
    await ev('PostToolUse', { tool_name, ...extra });
  };
  return { ev, tool };
}

async function portfolio() {
  const s = session('demo-portfolio', `${HOME}/Kengkorok.github.io`);
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(2500);
  await s.ev('UserPromptSubmit');
  await sleep(1500);
  await s.tool('Read', { file_path: 'index.html' });
  await s.tool('Grep', { pattern: 'hero' });
  await s.tool('Edit', { file_path: 'styles.css' }, 1800);
  await s.tool('Bash', { command: 'npx serve', description: 'Preview laman' }, 2200);
  await s.ev('PermissionRequest', { tool_name: 'Bash' });
  await sleep(5000);
  await s.tool('Bash', { command: 'git push', description: 'Push ke GitHub' }, 1500);
  await s.ev('Stop');
  await sleep(4000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

async function radar() {
  await sleep(4000);
  const s = session('demo-radar', `${HOME}/pogo-wave-radar`);
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(1500);
  await s.ev('UserPromptSubmit');
  await s.tool('WebSearch', { query: 'pokemon go event schedule' }, 1500);
  await s.tool('Task', { subagent_type: 'Explore', description: 'Cari parser' }, 300);
  await s.ev('SubagentStart', { agent_id: 'a1', agent_type: 'Explore' });
  await s.tool('Glob', { pattern: 'src/**/*.ts' }, 1500, { agent_id: 'a1', agent_type: 'Explore' });
  await s.tool('Read', { file_path: 'src/parser.ts' }, 2000, { agent_id: 'a1', agent_type: 'Explore' });
  await s.ev('SubagentStop', { agent_id: 'a1', agent_type: 'Explore' });
  await sleep(800);
  await s.tool('Write', { file_path: 'src/waves.ts', content: '…' }, 2000);
  await s.ev('Stop');
  await sleep(3000);
  await s.ev('Notification', { message: 'Claude is waiting for your input' });
  await sleep(5000);
  await s.ev('SessionEnd', { reason: 'exit' });
}

Promise.all([portfolio(), radar()]).then(() => console.log('demo siap'), (err) => {
  console.error(`tak dapat sambung ke ${URL_BASE}: ${err.message}`);
  process.exit(1);
});
