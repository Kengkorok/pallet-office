'use strict';
// Plays a made-up workday into the office through the same POST /event path the
// real hooks use. Handy for testing the page, and for recording a portfolio demo
// that contains no real prompts, paths or commands. Everyone keeps working in rounds
// until the time is up, with four helpers on long background jobs throughout.
//   node demo.js [http://127.0.0.1:4400] [seconds, default 180]

const URL_BASE = process.argv[2] || process.env.PALLET_URL || 'http://127.0.0.1:4400';
const HOME = '/home/demo';
const SECONDS = Number(process.argv[3] || process.env.DEMO_SECONDS) || 180;
const until = Date.now() + SECONDS * 1000;
const going = () => Date.now() < until;
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
  // Background subagents: one Task call each, then they keep at their steps until the
  // demo ends. Resolves once they're hired; `.done` settles when they clock off.
  const crew = async (agents) => {
    for (const a of agents) {
      const tool_use_id = `t${++toolSeq}`;
      await ev('PreToolUse', { tool_name: 'Task', tool_input: { subagent_type: a.type, description: a.type }, tool_use_id });
      await ev('PostToolUse', { tool_name: 'Task', tool_use_id });
    }
    const done = Promise.all(agents.map(async (a, i) => {
      const who = { agent_id: a.id, agent_type: a.type };
      await sleep(400 + i * 600);
      await ev('SubagentStart', who);
      for (let n = 0; going(); n++) {
        const [name, input, ms] = a.steps[n % a.steps.length];
        await tool(name, input, ms, who);
        await sleep(800 + Math.random() * 1200);
      }
      await ev('SubagentStop', who);
    }));
    return { done };
  };
  return { ev, tool, ask, crew };
}

// One resident's day: a prompt, a round of tools, a short breather, repeat.
async function resident({ id, dir, start = 0, crew, rounds }) {
  await sleep(start);
  const s = session(id, dir);
  await s.ev('SessionStart', { source: 'startup' });
  await sleep(1500);
  let helpers = null;
  for (let i = 0; going(); i++) {
    await s.ev('UserPromptSubmit');
    if (crew && !helpers) helpers = await s.crew(crew);
    await rounds[i % rounds.length](s);
    await s.ev('Stop');
    await sleep(3000 + Math.random() * 3000);
  }
  if (helpers) await helpers.done;
  await s.ev('SessionEnd', { reason: 'exit' });
}

const bash = (description) => ({ command: description, description });

// Start times keep the helper order fixed: Pidgey, Rattata, Caterpie, Magikarp.
const cast = [
  { id: 'demo-portfolio', dir: 'Kengkorok.github.io', start: 500,
    crew: [{ id: 'p1', type: 'Explore', steps: [
      ['Glob', { pattern: 'assets/**/*.mp4' }, 1800],
      ['Read', { file_path: 'main.js' }, 2000],
      ['Grep', { pattern: 'data-lang' }, 1500],
      ['Read', { file_path: 'styles.css' }, 1800],
    ] }],
    rounds: [
      async (s) => {
        await s.tool('Read', { file_path: 'index.html' });
        await s.tool('Edit', { file_path: 'index.html' }, 2500);
        await s.tool('Edit', { file_path: 'styles.css' }, 2000);
        await s.tool('Bash', bash('Preview laman'), 3000);
      },
      async (s) => {
        await s.tool('Edit', { file_path: 'main.js' }, 2500);
        await s.ask('Bash', { command: 'git push', description: 'Push ke GitHub' }, 4000, 2000);
      },
    ] },
  { id: 'demo-masjid', dir: 'repos/masjidMTU-website', start: 3000,
    crew: [{ id: 'm1', type: 'code-reviewer', steps: [
      ['Read', { file_path: 'jadual-solat.tsx' }, 2500],
      ['Read', { file_path: 'kuliah-mingguan.tsx' }, 2000],
      ['Grep', { pattern: 'useEffect' }, 1500],
    ] }],
    rounds: [
      async (s) => {
        await s.tool('Read', { file_path: 'src/app/page.tsx' }, 1800);
        await s.tool('Edit', { file_path: 'jadual-solat.tsx' }, 3000);
        await s.tool('Bash', bash('Run test'), 1000);
        await s.ev('PostToolUseFailure', { tool_name: 'Bash' });
        await sleep(1500);
        await s.tool('Edit', { file_path: 'jadual-solat.tsx' }, 2000);
        await s.tool('Bash', bash('Run test lagi'), 3500);
      },
      async (s) => {
        await s.tool('Edit', { file_path: 'kuliah-mingguan.tsx' }, 2500);
        await s.tool('Bash', bash('Build preview'), 4000);
      },
    ] },
  { id: 'demo-ship', dir: 'ship-dashboard', start: 6000,
    crew: [
      { id: 'r1', type: 'Explore', steps: [
        ['Glob', { pattern: '**/*.yml' }, 2000],
        ['Read', { file_path: 'compose.yaml' }, 2500],
        ['Grep', { pattern: 'healthcheck' }, 1500],
      ] },
      { id: 'r2', type: 'general-purpose', steps: [
        ['WebFetch', { url: 'https://docs.docker.com/compose/' }, 3000],
        ['Read', { file_path: 'ingest.js' }, 2000],
        ['Bash', bash('Semak log'), 2500],
      ] },
    ],
    rounds: [
      async (s) => {
        await s.tool('TodoWrite', {}, 1500);
        await s.tool('Edit', { file_path: 'ingest.js' }, 2500);
        await s.ask('Bash', { command: 'docker compose up -d', description: 'Deploy ke CasaOS' }, 4000, 4000);
      },
      async (s) => {
        await s.tool('Read', { file_path: 'dashboard.html' }, 1800);
        await s.tool('Edit', { file_path: 'dashboard.html' }, 3000);
      },
    ] },
  { id: 'demo-radar', dir: 'pogo-wave-radar', start: 9000,
    rounds: [
      async (s) => {
        await s.tool('WebSearch', { query: 'pokemon go spotlight hour' }, 2500);
        await s.tool('WebFetch', { url: 'https://leekduck.com/events/' }, 2500);
        await s.tool('Write', { file_path: 'src/waves.ts' }, 3000);
      },
      async (s) => {
        await s.tool('Read', { file_path: 'src/parser.ts' }, 1500);
        await s.tool('Bash', bash('Build radar'), 3000);
      },
    ] },
  { id: 'demo-mewarna', dir: 'coloring-book', start: 12000,
    rounds: [
      async (s) => {
        await s.tool('Read', { file_path: 'canvas.js' }, 2000);
        await s.tool('Edit', { file_path: 'palette.js' }, 2500);
        await s.ask('Write', { file_path: 'gambar/kucing.svg' }, 4000, 2500);
      },
      async (s) => {
        await s.tool('Bash', bash('Cuba warna kucing'), 3000);
        await s.tool('Edit', { file_path: 'canvas.js' }, 2500);
      },
    ] },
  { id: 'demo-pallet', dir: 'pallet-office', start: 15000,
    rounds: [
      async (s) => {
        await s.tool('Read', { file_path: 'server.js' }, 2000);
        await s.tool('Edit', { file_path: 'office.js' }, 3000);
      },
      async (s) => {
        await s.tool('Edit', { file_path: 'office.css' }, 2500);
        await s.tool('Bash', bash('Main demo'), 3000);
      },
    ] },
  { id: 'demo-home', dir: '', start: 18000,
    rounds: [
      async (s) => {
        await s.tool('Bash', bash('Semak storan'), 2500);
        await s.tool('Bash', bash('Semak container'), 2500);
      },
      async (s) => {
        await s.tool('Read', { file_path: '.zshrc' }, 2000);
        await s.tool('Edit', { file_path: '.zshrc' }, 2500);
        await s.ev('Notification', { message: 'Claude is waiting for your input' });
        await sleep(3000);
      },
    ] },
];

Promise.all(cast.map(resident)).then(() => console.log('demo siap'), (err) => {
  console.error(`tak dapat sambung ke ${URL_BASE}: ${err.message}`);
  process.exit(1);
});
