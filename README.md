# Mic Drop

A rap battle party game for the web. Draw a card, spit a verse, let the room decide.

- **Crew Battle** — 2 or 3 crews trade bars one-on-one. With three, the crew
  sitting out judges and everyone rotates (each crew battles twice, judges
  once). Bout win = 1 point, mic drop = 2, ties go to sudden death. MVP at the end.
- **King of the Hill** — everyone joins one line. The challenger raps first,
  the king answers, the room picks. Winner stays, loser goes to the back of the
  line. Three in a row and you're on fire.
- **Beat Lab** — a 16-step drum machine (kick, snare, clap, hats with rolls,
  open hat, rim, 808 with notes, chords). Save beats to *My Beats* and battle on
  them, download a WAV, or share a link.

Every bout runs the same way: flip cards (Burn/Boast + Rhyme, sometimes a
Twist for both), the bell starts the clock and drops a beat, verse, hand-off,
verse, decision. Judges can tap the winner or use the **crowd meter** (the
room cheers for each rapper and the mic measures it). A **MIC DROP** during a
verse ends the bout on the spot for double points. The soundboard has an air
horn, applause, the bell, a DJ pull-up and next beat.

The Beats player is a two-deck mixer with tempo sync, a crossfader and
auto-mix, and the **visualizer** shows MilkDrop-style visuals (like the old
media players) for whatever's playing.

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
under `music/` (`lofi/`, `boombap/`, `trap/`, `hype/`) and list them in
`music/manifest.json`. New genres work the same way: make a folder and add it
to the manifest. Beats saved in the Beat Lab show up automatically under
*My Beats*.

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
index.html              Entry point (top bar, home poster, rules)
styles/main.css         All styling (paper / night themes)
js/
  main.js               Boot + screen routing
  state.js              Persistent settings + run-time state
  ui.js                 DOM helpers, dialog, toast, stamp
  icons.js              Inline SVG icons
  cards.js              Card decks (burn / boast / rhyme / twist)
  bout.js               One bout: cards, clock, mic drop, decision, soundboard
  crowd.js              Crowd meter (microphone)
  teamBattle.js         Crew Battle setup, rotation, results
  kingOfHill.js         King of the Hill line, streaks, results
  beatlab.js            Beat Lab screen (step sequencer)
  synth.js              Drum machine voices + step player
  beatstore.js          Saved beats, offline render, WAV, share links
  mixer.js              Two-deck beat-matching engine
  music.js              Beats drawer (decks, crossfader, tracks)
  visualizer.js         Full-screen MilkDrop visualizer
  sfx.js                Synthesised sound effects + soundboard
  fire.js, stagefx.js   Background fire
  settings.js           Settings drawer
data/                   burns, boasts, rhymes, twists
music/                  Beats (per-genre folders) + manifest.json
vendor/butterchurn/     Visualizer library + presets (MIT, loaded on demand)
tools/make_beats.py     Regenerates the bundled beats
assets/                 Icons, favicon
manifest.json           PWA manifest
service-worker.js       Offline cache
```

## Credits

- Visualizer: [butterchurn](https://github.com/jberg/butterchurn) and
  butterchurn-presets by Jordan Berg, MIT licence (see `vendor/butterchurn/`).
- Beats, drum sounds and sound effects are synthesised by the app and
  `tools/make_beats.py`.

## To do

- [ ] Take screenshots and write itch.io page copy
- [ ] More burn / boast / rhyme / twist cards
- [ ] Revisit the background fire

## Adding your own beats

Drop files in `music/<genre>/` and list them in `music/manifest.json`. For beat-matched mixing give each
track `bpm` and `bars`, and make sure the first downbeat is at 0:00 and the file is a whole number of bars
(so it loops cleanly):

```json
{ "file": "my-beat.mp3", "title": "My Beat", "artist": "Me", "bpm": 92, "bars": 32 }
```

Tracks without `bpm` still play and blend, just without tempo-locking.
