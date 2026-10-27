# Pallet Office

Ofis pixel untuk session Claude Code. Setiap session muncul sebagai Pokémon: masuk ikut pintu, duduk di meja masa bekerja (baca, edit, run, web), pergi ke **Pusat Pokémon** bila perlukan kau, lepak di **Sudut Chill** bila siap, dan keluar bila session tamat. Subagent masuk sebagai helper kecil di sebelah meja tuannya.

**Demo:** https://kengkorok.github.io/pallet-office/ (replay hari kerja olok-olok, bukan data sebenar)

Server Node tanpa dependency dan frontend HTML biasa. Tiada aset Nintendo dalam repo; sprite dimuat masa runtime dari [PokeAPI/sprites](https://github.com/PokeAPI/sprites).

## Mula cepat (5 minit)

Perlu: **Node 18+**, `curl`, dan Claude Code.

```bash
git clone https://github.com/Kengkorok/pallet-office.git ~/pallet-office
cd ~/pallet-office
node server.js
```

Buka http://127.0.0.1:4400. Ofis masih kosong sebab belum ada session.

Nak tengok dulu tanpa Claude Code? Buka terminal kedua:

```bash
node demo.js
```

## Sambung ke Claude Code

1. Pastikan `hook.sh` boleh dijalankan:
   ```bash
   chmod +x ~/pallet-office/hook.sh
   ```
2. Buka `~/.claude/settings.json` dan salin blok `"hooks"` dari [`hooks.example.json`](hooks.example.json) ke dalamnya.
   - Kalau fail tu dah ada blok `"hooks"`, gabungkan setiap event; jangan tulis ganti hook sedia ada.
   - Kalau repo bukan di `~/pallet-office`, tukar path `$HOME/pallet-office/hook.sh`.
3. Buka session Claude Code baharu di mana-mana projek. Pokémon dia patut masuk ofis.

Hook ni selamat: `hook.sh` hantar event dengan timeout 1 saat, tak print apa-apa dan sentiasa `exit 0`. Kalau ofis tak jalan, Claude Code langsung tak terasa.

Nak buang? Padam blok `hooks` tu dari `settings.json`.

## Tukar Pokémon

Semua dalam [`config.json`](config.json). Server reload sendiri bila fail ni disimpan, tak perlu restart. Refresh browser je.

```json
{
  "projects": [
    { "name": "PoGo Wave Radar", "match": ["pogo-wave-radar"], "dex": 81, "pokemon": "Magnemite" },
    { "name": "Home", "exact": ["/home/korok"], "dex": 143, "pokemon": "Snorlax" }
  ],
  "fallback": [ { "dex": 133, "pokemon": "Eevee" } ],
  "helpers":  [ { "dex": 16, "pokemon": "Pidgey" } ]
}
```

| Medan | Maksud |
| --- | --- |
| `name` | Nama projek yang tertera bawah Pokémon |
| `match` | Senarai perkataan; kalau mana-mana ada dalam folder session (`cwd`), projek ni dipilih |
| `exact` | Path folder yang mesti sama tepat (sesuai untuk folder home) |
| `dex` | Nombor Pokédex nasional. Ini yang tentukan sprite |
| `pokemon` | Nama untuk label sahaja |
| `fallback` | Projek yang tiada dalam senarai dapat salah satu Pokémon ni (sama setiap kali untuk projek yang sama) |
| `helpers` | Pokémon untuk subagent (helper kecil) |

Projek dibaca dari atas ke bawah; yang pertama padan menang. Jadi letak padanan yang lebih spesifik di atas.

**Cari nombor dex:** cari nama Pokémon di [pokemondb.net/pokedex](https://pokemondb.net/pokedex/national), ambil nombor `#`. Contoh: Pikachu `25`, Lucario `448`, Garchomp `445`, Rayquaza `384`.

**Sprite:** dex 1–649 dapat GIF beranimasi (gaya Black/White). Dex di atas 649 guna gambar statik. Sprite besar (legenda) dikecilkan supaya muat bilik.

## Jalan di server rumah (Docker / CasaOS)

```bash
cp .env.example .env      # isi TAILSCALE_IP, dapat dari: tailscale ip -4
docker compose up -d --build
```

Port dibuka di `127.0.0.1` (untuk hook) dan IP Tailscale sahaja, bukan LAN atau internet. Buka `http://<tailscale-ip>:4400` dari phone atau laptop dalam tailnet. `config.json` dipasang read-only, jadi edit fail dalam folder repo.

Kalau Claude Code jalan di **mesin lain**, set dalam env Claude Code:

```bash
export PALLET_URL=http://<tailscale-ip>:4400
```

Nak kunci sikit? Isi `PALLET_TOKEN` dalam `.env` dan set `PALLET_TOKEN` yang sama dalam env Claude Code.

## Rakam dan replay

- Tekan **⏺ Rakam** di ofis (atau jalan `RECORD=1 node server.js`). Event disimpan ke `recordings/*.ndjson`. Yang disimpan cuma state yang dah ditapis, bukan prompt atau isi fail.
- Buka `/replay.html` untuk main balik.
- Rakaman demo siap: `replay.html?src=recordings/demo.ndjson&autoplay=1&loop=1`.

Nak rakam demo baru tanpa campur session sebenar, guna server berasingan:

```bash
PORT=4402 RECORD=1 node server.js
node demo.js http://127.0.0.1:4402
```

**Letak demo dalam website statik** (macam GitHub Pages): salin `public/office.js`, `public/office.css`, `public/replay.html`, `public/replay.js` dan satu fail `.ndjson`, kemudian buka `replay.html?src=demo.ndjson&autoplay=1&loop=1`. Kalau guna rakaman sebenar, semak dulu nama projek dan fail dalamnya.

## Macam mana ia berfungsi

```
Claude Code hook ─► hook.sh ─► POST /event ─► server.js ─► SSE /stream ─► public/ (canvas)
```

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

Prompt, isi fail dan command penuh dibuang terus di server. Yang sampai ke browser cuma label pendek: nama fail, `description` Bash atau hostname.

### Env server

| Env | Default | Guna |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Alamat server |
| `PORT` | `4400` | Port |
| `RECORD` | kosong | `1` = rakam dari mula |
| `PALLET_TOKEN` | kosong | Token rahsia; `hook.sh` kena guna yang sama |
| `CONFIG` | `config.json` | Path config lain |
| `DEBUG` | kosong | `1` = log setiap event |

## Masalah biasa

- **Pokémon tak masuk:** pastikan `node server.js` jalan, `hook.sh` boleh dijalankan, dan session Claude Code dibuka *selepas* hooks ditambah. Cuba `DEBUG=1 node server.js` untuk tengok event masuk.
- **Sprite kosong:** browser perlu internet untuk muat sprite dari `raw.githubusercontent.com`.
- **Container gagal start lepas reboot:** Tailscale lambat naik. Jalan `docker compose up -d` sekali lagi.

## Kredit

Sprite dari [PokeAPI/sprites](https://github.com/PokeAPI/sprites). Pokémon © Nintendo / Game Freak / The Pokémon Company. Ini projek hobi, bukan rasmi dan tiada kaitan dengan mereka.
