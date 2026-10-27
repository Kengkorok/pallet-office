// Live view: wires the office to the server's SSE stream and the record button.
(function () {
  const $ = (id) => document.getElementById(id);
  const recBtn = $('rec');

  function showStats(s) {
    $('s-total').textContent = s.total;
    $('s-working').textContent = s.working;
    $('s-waiting').textContent = s.waiting;
    document.title = s.waiting ? `(${s.waiting}) Pallet Office` : 'Pallet Office';
  }

  function showRecord(msg) {
    recBtn.classList.toggle('rec-on', msg.on);
    recBtn.textContent = msg.on ? '⏹ Stop rakam' : '⏺ Rakam';
    recBtn.title = msg.on ? msg.file : 'Rakam event ke recordings/';
  }

  const office = PalletOffice.createOffice($('office'), $('feed'), {
    onStats: showStats,
    onMessage: (msg) => { if (msg.type === 'record') showRecord(msg); },
  });

  const live = $('live');
  const stream = new EventSource('stream');
  stream.onopen = () => { live.classList.add('on'); live.textContent = 'live'; };
  stream.onerror = () => { live.classList.remove('on'); live.textContent = 'terputus, cuba lagi…'; };
  stream.onmessage = (e) => office.apply(JSON.parse(e.data));

  recBtn.addEventListener('click', async () => {
    const res = await fetch('api/record', { method: 'POST' });
    if (res.status === 401) alert('Server guna PALLET_TOKEN — rakam dari terminal dengan RECORD=1.');
  });
})();
