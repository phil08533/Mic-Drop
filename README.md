# Mic Drop

A rap battle party game for the web. Two modes:

- **Crew Battle** — three teams. Oldest combined age battles first; the team
  to their left judges. Players draw a Burn or Boast card and a Rhyme card,
  then trade bars one-on-one down the lineup.
- **King of the Hill (Solo)** — pass-and-play, anyone can jump in. Each
  challenger draws three cards. Winner stays on the mic until they get booted.

Built as a static web app so it can ship to itch.io and be installed from
Chrome (Add to Home Screen / Install app) for offline play.

## Run it locally

No build step. From the project root:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

A static server is required because the app loads JSON via `fetch()` and uses
ES module imports — opening `index.html` directly with `file://` will not
work in most browsers.

## Adding music

Drop audio files (`.mp3`, `.ogg`, `.m4a`, or `.wav`) into the genre folders
under `music/`:

```
music/
├── lofi/
├── boombap/
├── trap/
└── electronic/
```

Then list them in `music/manifest.json` so the in-game player can find them.
You can add new genres just by creating a folder and adding it to the
manifest — the music player picks them up automatically.

## Shipping to itch.io

1. Zip the project root (everything except `.git`).
2. On itch.io create a new HTML project, upload the zip, and tick
   "This file will be played in the browser".
3. Set the viewport to `1280 x 800` (or whatever you prefer — the layout
   is responsive).

## Installing from Chrome

The app ships a Web App Manifest and service worker. Open the deployed site
in Chrome and choose **Install Mic Drop** from the address bar / menu, or on
mobile, **Add to Home Screen**. After install it works offline.

## Project layout

```
index.html              Entry point
styles/main.css         All styling
js/
  main.js               Boot + screen routing
  state.js              Persistent settings + run-time state
  ui.js                 Small DOM helpers
  cards.js              Card deck loader + draw logic
  teamBattle.js         Crew Battle screens + flow
  kingOfHill.js         Solo mode screens + flow
  music.js              Music player
  settings.js           Settings panel
data/
  burns.json            Burn prompts
  boasts.json           Boast prompts
  rhymes.json           Rhyme word sets
music/                  Audio files (per-genre folders) + manifest.json
assets/                 Icons, favicon
manifest.json           PWA manifest
service-worker.js       Offline cache
```

## Status / TODO

- [x] Project scaffolding, PWA manifest, service worker
- [x] Main menu + screen routing
- [x] Card decks (burns / boasts / rhymes) with draw logic
- [x] Crew Battle setup screen
- [x] Crew Battle flow (rotation, judging, scoring)
- [x] King of the Hill setup + flow
- [x] Music player with genre folders
- [x] Settings panel (volume, SFX, reduced motion, dark/light)
- [x] Polished hand-styled UI (no generic gradient look)
- [x] App icon + favicon
- [ ] Drop real audio tracks into `music/<genre>/` folders
- [ ] Take screenshots and write itch.io page copy
- [ ] Optional: more burn / boast / rhyme cards (community-add friendly)
