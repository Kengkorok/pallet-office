# Pallet Office

Ofis pixel untuk session Claude Code. Setiap session muncul sebagai Pokémon: masuk ikut pintu, duduk di meja masa kerja (baca, edit, run, web), pergi **Pusat Pokémon** bila perlukan kau, lepak di **Sudut Chill** bila siap, dan keluar bila session tamat. Subagent masuk sebagai helper kecil sebelah meja tuan dia.

Kod ditulis sendiri dari kosong. Tiada aset Nintendo dalam repo: sprite dimuat masa runtime dari [PokeAPI/sprites](https://github.com/PokeAPI/sprites).

## Macam mana jalan

```
Claude Code hook ─► hook.sh ─► POST /event ─► server.js ─► SSE /stream ─► public/ (canvas)
```

- `server.js`: Node tanpa dependency. Simpan session dalam memori, tukar hook event jadi state, stream ke browser. Prompt, isi fail dan command penuh dibuang terus; yang keluar cuma label pendek (nama fail, `description` Bash, hostname).
- `hook.sh`: hantar JSON hook dengan `curl -m 1`, sentiasa `exit 0` dan tak print apa-apa, jadi Claude Code tak pernah tersekat walaupun ofis mati.
- `config.json`: projek → Pokémon. `match` = substring dalam `cwd`, `exact` = path tepat. Projek lain dapat Pokémon dari `fallback`, subagent dari `helpers`. Server reload sendiri bila fail ni berubah.

| Event | State | Tempat |
| --- | --- | --- |
| SessionStart | idle | masuk, ke Sudut Chill |
| UserPromptSubmit | thinking | meja |
| PreToolUse Read/Grep/Glob | reading | meja |
| PreToolUse Edit/Write | editing | meja |
| PreToolUse Bash | running | meja |
| PreToolUse WebFetch/WebSearch | web | meja |
| PreToolUse Task/Agent | delegating + helper masuk | meja |
| PermissionRequest / Notification | waiting | Pusat Pokémon |
| Stop | done | Sudut Chill |
| SubagentStop | helper balik | |
| SessionEnd | keluar | pintu |

## Jalan terus (tanpa Docker)

```bash
node server.js            # http://127.0.0.1:4400
node demo.js              # session olok-olok untuk test
```

Env: `HOST` (default `127.0.0.1`), `PORT` (`4400`), `RECORD=1` (rakam dari mula), `PALLET_TOKEN` (optional, hook.sh kena guna token sama), `DEBUG=1`.

## CasaOS / Docker (Tailscale sahaja)

```bash
cp .env.example .env      # isi TAILSCALE_IP dari: tailscale ip -4
docker compose up -d --build
```

Port dibuka di `127.0.0.1` (untuk hook) dan IP Tailscale sahaja, bukan LAN. Buka `http://<tailscale-ip>:4400` dari phone/laptop dalam tailnet. Kalau container gagal start lepas reboot sebab Tailscale lambat naik, `docker compose up -d` sekali lagi.

## Hook Claude Code

Salin blok `hooks` dalam `hooks.example.json` ke `~/.claude/settings.json`. Kalau ofis jalan di mesin lain, set `PALLET_URL=http://<ip>:4400` dalam env Claude Code.

## Rakam & replay

Tekan **⏺ Rakam** (atau `RECORD=1`). Event disimpan ke `recordings/*.ndjson` (state yang dah ditapis, bukan JSON hook mentah). Buka `replay.html` untuk main balik.

Ada satu rakaman siap: `recordings/demo.ndjson` (hari olok-olok: Portfolio, Masjid MTU, PoGo Wave Radar, Buku Mewarna, Ship Dashboard dengan Rayquaza, Pallet Office dan Snorlax lepak). Buka `replay.html?src=recordings/demo.ndjson&autoplay=1&loop=1`. Nak rakam semula tanpa campur session sebenar, guna server berasingan: `PORT=4402 RECORD=1 node server.js` kemudian `node demo.js http://127.0.0.1:4402`.

Untuk demo statik di portfolio: salin `public/office.js`, `public/office.css`, `public/replay.html`, `public/replay.js` dan satu rakaman, kemudian buka `replay.html?src=demo.ndjson&autoplay=1&loop=1`. Rakaman `node demo.js` paling selamat sebab tiada data sebenar. Kalau guna rakaman sebenar, semak dulu nama projek/fail dalam tu.
