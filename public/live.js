// Live view: wires the office to the server's SSE stream, plus the top-bar buttons.
(function () {
  const $ = (id) => document.getElementById(id);
  const recBtn = $('rec');
  const soundBtn = $('sound');
  let audio = null;
  let lastWaiting = 0;

  // Two soft blips, synthesised so no sound files ship with the page.
  function ding() {
    if (!audio) return;
    [660, 880].forEach((f, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      const t = audio.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    });
  }

  function showStats(s) {
    document.title = s.waiting ? `(${s.waiting}) Pallet Office` : 'Pallet Office';
    if (s.waiting > lastWaiting) ding();
    lastWaiting = s.waiting;
  }

  function showRecord(msg) {
    recBtn.classList.toggle('rec-on', msg.on);
    recBtn.textContent = msg.on ? '⏹ Stop rakam' : '⏺ Rakam';
    recBtn.title = msg.on ? msg.file : 'Rakam event ke recordings/';
  }

  const office = PalletOffice.createOffice($('office'), {
    feed: $('feed'),
    team: { list: $('team'), summary: $('team-summary') },
    onStats: showStats,
  });

  const live = $('live');
  const stream = new EventSource('stream');
  stream.onopen = () => { live.classList.add('on'); live.title = 'live'; };
  stream.onerror = () => { live.classList.remove('on'); live.title = 'terputus, cuba lagi…'; };
  stream.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'record') showRecord(msg);
    else office.apply(msg);
  };

  recBtn.addEventListener('click', async () => {
    const res = await fetch('api/record', { method: 'POST' });
    if (res.status === 401) alert('Server guna PALLET_TOKEN — rakam dari terminal dengan RECORD=1.');
  });

  soundBtn.addEventListener('click', () => {
    audio = audio ? null : new AudioContext();
    soundBtn.classList.toggle('on', !!audio);
    if (audio) ding();
  });

  $('full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
})();
