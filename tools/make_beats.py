#!/usr/bin/env python3
"""Synthesise the Mic Drop beat library (stdlib only, needs ffmpeg for mp3).

    python3 tools/make_beats.py

Every track is an exact whole number of bars at a rap-friendly tempo, with the
first downbeat at sample 0 and tails wrapped around the loop point, so tracks
loop seamlessly and the in-app mixer can beat-match them. Drums sit in a clear
pocket and the mids stay open for a vocal. The first and last bars are
drums + bass only so transitions blend cleanly.

Writes music/<genre>/<slug>.mp3 and rewrites music/manifest.json.
"""
import json, math, os, random, shutil, struct, subprocess, tempfile, wave
from multiprocessing import Pool

SR = 32000
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TAU = math.pi * 2
BARS = 32


def note(n):
    return 440.0 * 2 ** ((n - 69) / 12)


class Mix:
    """Stereo bus. Writes wrap around the end so the loop has no seam."""
    def __init__(self, bars, bpm):
        self.bar = 240.0 / bpm
        self.n = int(round(bars * self.bar * SR))
        self.l = [0.0] * self.n
        self.r = [0.0] * self.n

    def add(self, t, samples, gain=1.0, pan=0.0):
        i0 = int(t * SR); n = self.n
        gl = gain * (1 - max(0, pan)); gr = gain * (1 + min(0, pan))
        for k, s in enumerate(samples):
            i = (i0 + k) % n
            self.l[i] += s * gl; self.r[i] += s * gr


# ---- instruments ----
def kick(length=0.4, f0=140, f1=44, drive=1.5, decay=7):
    out = []; ph = 0.0
    for i in range(int(length * SR)):
        t = i / SR
        ph += TAU * (f1 + (f0 - f1) * math.exp(-t * 30)) / SR
        out.append(math.tanh(math.sin(ph) * drive) * math.exp(-t * decay))
    return out

def sub808(freq, length=0.8, decay=2.6, glide_to=None):
    out = []; ph = 0.0
    for i in range(int(length * SR)):
        t = i / SR
        f = freq * (1 + 1.0 * math.exp(-t * 45))
        if glide_to and t > length * .5:
            f = freq + (glide_to - freq) * min(1, (t - length * .5) / (length * .4))
        ph += TAU * f / SR
        env = min(1, t * 300) * math.exp(-t * decay)
        out.append(math.tanh(math.sin(ph) * 2.0) * env)
    return out

def snare(length=0.26, tone=185, noise=0.8, tight=15):
    rnd = random.Random(7); out = []
    for i in range(int(length * SR)):
        t = i / SR
        body = math.sin(TAU * tone * t * (1 + .25 * math.exp(-t * 60))) * math.exp(-t * 26)
        n = (rnd.random() * 2 - 1) * math.exp(-t * tight) * noise
        out.append(body * .7 + n)
    return out

def clap(length=0.22):
    rnd = random.Random(11); out = []
    for i in range(int(length * SR)):
        t = i / SR
        burst = sum(math.exp(-((t - d) ** 2) * 9e4) for d in (0, .011, .022)) * .7
        out.append((rnd.random() * 2 - 1) * (burst + math.exp(-t * 18) * .5))
    return out

def rim(length=0.08):
    return [math.sin(TAU * 1700 * i / SR) * math.exp(-i / SR * 90) * .6 for i in range(int(length * SR))]

def hat(length=0.06, seed=1, decay=70):
    rnd = random.Random(seed); out = []; prev = 0.0
    for i in range(int(length * SR)):
        x = rnd.random() * 2 - 1
        out.append((x - prev) * math.exp(-i / SR * decay)); prev = x
    return out

def tone(freq, length, kind='sine', decay=4, attack=0.01):
    out = []
    for i in range(int(length * SR)):
        t = i / SR
        p = TAU * freq * t
        if kind == 'sine': s = math.sin(p)
        elif kind == 'tri': s = 2 / math.pi * math.asin(math.sin(p))
        elif kind == 'saw': s = 2 * ((freq * t) % 1) - 1
        elif kind == 'rhodes':
            s = math.sin(p) + .45 * math.sin(2 * p) * math.exp(-t * 6) + .12 * math.sin(7 * p) * math.exp(-t * 22)
        elif kind == 'pluck':
            s = math.sin(p) + .5 * math.sin(2 * p) * math.exp(-t * 9) + .25 * math.sin(3 * p) * math.exp(-t * 14)
        else: s = math.tanh(math.sin(p) * 4)
        out.append(s * min(1, t / attack) * math.exp(-t * decay))
    return out

def chord(notes, length, kind='rhodes', decay=1.6, detune=0.0025):
    voices = [tone(note(n) * (1 + d), length, kind, decay, 0.015) for n in notes for d in (-detune, detune)]
    return [sum(v[i] for v in voices) / len(voices) for i in range(len(voices[0]))]

def lowpass(x, cutoff):
    a = 1 - math.exp(-TAU * cutoff / SR); y = 0.0; out = []
    for s in x:
        y += a * (s - y); out.append(y)
    return out

def vinyl(mix, seed=3, level=0.01):
    rnd = random.Random(seed)
    for i in range(mix.n):
        x = (rnd.random() * 2 - 1) * level * .4
        if rnd.random() < .0004: x += (rnd.random() * 2 - 1) * level * 6
        mix.l[i] += x; mix.r[i] += x


# ---- shared bits ----
# minor-key progressions as (root offset, chord tones relative to root). 4 bars each, repeated.
PROGS = {
    'i-VI-III-VII': [(0, (0, 3, 7, 10)), (-4, (0, 4, 7, 11)), (3, (0, 4, 7, 11)), (-2, (0, 4, 7, 10))],
    'i-iv-VI-V':    [(0, (0, 3, 7, 10)), (5, (0, 3, 7, 10)), (-4, (0, 4, 7, 11)), (-5, (0, 4, 7, 10))],
    'i-VII-VI-VII': [(0, (0, 3, 7, 10)), (-2, (0, 4, 7)), (-4, (0, 4, 7, 11)), (-2, (0, 4, 7))],
    'i-i-iv-V':     [(0, (0, 3, 7, 10)), (0, (0, 3, 7, 10)), (5, (0, 3, 7, 10)), (-5, (0, 4, 7, 10))],
}

class Song:
    def __init__(self, bpm, root, seed, prog, swing=0.0, vinyl_level=0.0):
        self.bpm, self.root, self.rnd = bpm, root, random.Random(seed)
        self.seed, self.prog, self.swing, self.vl = seed, PROGS[prog], swing, vinyl_level
        self.m = Mix(BARS, bpm)
        self.sd = self.m.bar / 16
        self.steps = BARS * 16

    def t(self, s, human=0.004):
        """Time of 16th step s with swing + a touch of human feel."""
        t = s * self.sd + (self.swing * self.sd if s % 2 else 0)
        return max(0, t + self.rnd.uniform(-human, human))

    def hot(self, bar):   # bars where melodic layers play (not first 2 / last 4)
        return 2 <= bar < BARS - 4

    def chord_at(self, bar):
        return self.prog[bar % 4]

    def finish(self):
        if self.vl: vinyl(self.m, self.seed, self.vl)
        return self.m


def boombap(bpm, root, seed, prog, kick_pat, melody):
    s = Song(bpm, root, seed, prog, swing=0.12, vinyl_level=.008)
    m, rnd = s.m, s.rnd
    K, S = kick(.4, 125, 46, 1.35, 8), snare(.28, 200, .85)
    chords = {}
    for step in range(s.steps):
        bar, st = divmod(step, 16)
        t = s.t(step)
        pat = kick_pat[bar % len(kick_pat)]
        if st in pat: m.add(t, K, .95 + rnd.uniform(-.05, .03))
        if st in (4, 12): m.add(t, S, .85 + rnd.uniform(-.06, .04))
        if st == 15 and bar % 4 == 3: m.add(t, S, .25)             # ghost into next bar
        if st % 2 == 0: m.add(t, hat(.045, step, 85), (.2 if st % 4 == 0 else .13) * rnd.uniform(.8, 1.1), -.15)
        elif rnd.random() < .22: m.add(t, hat(.03, step + 500, 110), .06, .15)
        if st == 10 and bar % 8 == 7: m.add(t, hat(.2, step, 18), .13)  # open hat turnaround
        # sub bass follows kicks, rooted on the chord
        if st in pat:
            r, _ = s.chord_at(bar)
            m.add(t, lowpass(tone(note(root + r - 24), s.sd * 3.2, 'sine', 3.6), 380), .85)
        # soft stab on the "and" of 2, only in the body of the song
        if s.hot(bar) and st in melody:
            r, tones = s.chord_at(bar)
            key = (bar % 4, st)
            if key not in chords:
                chords[key] = lowpass(chord([root + r + tt for tt in tones], s.sd * 3.5, 'rhodes', 4.0), 1900)
            m.add(t, chords[key], .34, rnd.uniform(-.25, .25))
    return s.finish()


def lofi(bpm, root, seed, prog):
    s = Song(bpm, root, seed, prog, swing=0.18, vinyl_level=.012)
    m, rnd = s.m, s.rnd
    K, S = kick(.34, 105, 48, 1.1, 9), lowpass(snare(.24, 170, .5, 20), 5500)
    pad = {}
    for step in range(s.steps):
        bar, st = divmod(step, 16)
        t = s.t(step, .006)
        if st in (0, 9, 11) and not (st == 11 and bar % 2): m.add(t, K, .9 * rnd.uniform(.9, 1))
        if st in (4, 12): m.add(t, S, .62)
        if st % 2 == 0: m.add(t, lowpass(hat(.05, step, 85), 9000), .13 * rnd.uniform(.6, 1.1), -.2)
        r, tones = s.chord_at(bar)
        if st in (0, 9, 11) and not (st == 11 and bar % 2):
            m.add(t, lowpass(tone(note(root + r - 24), s.sd * 4, 'sine', 3), 320), .8)
        if s.hot(bar) and st == 0:
            if bar % 4 not in pad:
                pad[bar % 4] = lowpass(chord([root + r + tt for tt in tones], s.sd * 15, 'rhodes', 1.3), 1700)
            m.add(t, pad[bar % 4], .38)
        if s.hot(bar) and st in (6, 14) and rnd.random() < .45:
            nn = root + r + 12 + rnd.choice(tones)
            m.add(t, lowpass(tone(note(nn), .45, 'pluck', 5), 2600), .14, rnd.uniform(-.4, .4))
    return s.finish()


def trap(bpm, root, seed, prog, melody_every=2):
    s = Song(bpm, root, seed, prog, swing=0.0)
    m, rnd = s.m, s.rnd
    K, C, SN = kick(.32, 115, 50, 1.9, 10), clap(), snare(.22, 215, .7)
    bells = {}
    for step in range(s.steps):
        bar, st = divmod(step, 16)
        t = s.t(step, .002)
        # half-time backbeat on beat 3 (what most rappers ride)
        if st == 8: m.add(t, C, .85); m.add(t, SN, .4)
        kicks = {0, 10} | ({6} if bar % 2 else {7}) | ({13} if bar % 4 == 3 else set())
        if st in kicks: m.add(t, K, .9)
        # 16th hats, accented, with rolls
        m.add(t, hat(.04, step, 100), .17 * (1 if st % 4 == 0 else .55 if st % 2 else .8), .2)
        if st in (7, 15) and bar % 2 == 1: m.add(t + s.sd / 2, hat(.03, step + 9, 110), .1, -.2)
        if st == 14 and bar % 4 == 3:
            for j in range(3): m.add(t + j * s.sd * 2 / 3, hat(.03, step + j, 100), .12)
        if st in (0, 10) or (st == 6 and bar % 2):
            r, _ = s.chord_at(bar)
            nxt = s.chord_at(bar + 1)[0]
            glide = note(root + nxt - 24) if st == 10 and bar % 4 == 3 else None
            m.add(t, sub808(note(root + r - 24), s.sd * 6, 2.4, glide), .9 if st == 0 else .7)
        if s.hot(bar) and bar % melody_every == 0 and st in (0, 6, 12):
            r, tones = s.chord_at(bar)
            nn = root + r + 12 + tones[(st // 6) % len(tones)]
            if nn not in bells:
                bells[nn] = lowpass(tone(note(nn), .9, 'sine', 3.2, .004), 3800)
            m.add(t, bells[nn], .15, rnd.uniform(-.4, .4))
    return s.finish()


def hype(bpm, root, seed, prog):
    """Bouncy party-rap pocket, ~100-110 bpm: stabs + funky bass, clap on 2 and 4."""
    s = Song(bpm, root, seed, prog, swing=0.06)
    m, rnd = s.m, s.rnd
    K, C = kick(.36, 135, 48, 1.7, 8.5), clap()
    stabs = {}
    for step in range(s.steps):
        bar, st = divmod(step, 16)
        t = s.t(step, .003)
        if st in (0, 3, 8, 10) or (st == 6 and bar % 2): m.add(t, K, .92 * rnd.uniform(.93, 1))
        if st in (4, 12): m.add(t, C, .7); m.add(t, snare(.2, 230, .5), .3)
        if st in (6, 14): m.add(t, hat(.14, step, 28), .15, .25)         # open hat on the offbeat
        elif st % 2 == 0: m.add(t, hat(.035, step, 110), .13, -.2)
        elif rnd.random() < .3: m.add(t, hat(.03, step + 7, 120), .06, .2)
        r, tones = s.chord_at(bar)
        if st in (0, 3, 8, 10) or (st == 6 and bar % 2):
            nn = root + r - 24 + (12 if st in (3, 10) else 0)
            m.add(t, lowpass(tone(note(nn), s.sd * 2.6, 'saw', 5.5), 520), .55)
        if s.hot(bar) and st in (2, 6, 11):
            key = (bar % 4, st)
            if key not in stabs:
                stabs[key] = lowpass(chord([root + r + tt for tt in tones], s.sd * 1.6, 'saw', 7, .004), 1700)
            m.add(t, stabs[key], .22, rnd.uniform(-.3, .3))
    return s.finish()


def render(mix, path):
    peak = max(max(map(abs, mix.l)), max(map(abs, mix.r)), 1e-9)
    g = 0.88 / peak
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 'x.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            buf = bytearray()
            for i in range(mix.n):
                buf += struct.pack('<hh', int(max(-1, min(1, mix.l[i] * g)) * 32767),
                                   int(max(-1, min(1, mix.r[i] * g)) * 32767))
            w.writeframes(bytes(buf))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame',
                        '-b:a', '128k', path], check=True)


# (genre, title, slug, bpm, builder)
BA = [{0, 7, 10}, {0, 7, 10}, {0, 5, 7, 10}, {0, 7, 10, 14}]
BB = [{0, 6, 10}, {0, 6, 10}, {0, 6, 9, 10}, {0, 3, 6, 10, 14}]
TRACKS = [
    ('lofi', 'Rainy Window', 'rainy-window', 76, lambda: lofi(76, 57, 1, 'i-VI-III-VII')),
    ('lofi', 'Late Night Cypher', 'late-night-cypher', 82, lambda: lofi(82, 50, 2, 'i-iv-VI-V')),
    ('lofi', 'Slow Burn', 'slow-burn', 86, lambda: lofi(86, 53, 3, 'i-VII-VI-VII')),
    ('boombap', 'Basement Tapes', 'basement-tapes', 88, lambda: boombap(88, 57, 4, 'i-VI-III-VII', BA, {10})),
    ('boombap', 'Concrete Jungle', 'concrete-jungle', 92, lambda: boombap(92, 52, 5, 'i-i-iv-V', BB, {6, 10})),
    ('boombap', 'Corner Store', 'corner-store', 95, lambda: boombap(95, 55, 6, 'i-iv-VI-V', BA, {10})),
    ('trap', 'Smoke Signals', 'smoke-signals', 134, lambda: trap(134, 48, 7, 'i-VI-III-VII')),
    ('trap', 'Cold Chain', 'cold-chain', 140, lambda: trap(140, 45, 8, 'i-VII-VI-VII')),
    ('trap', 'Night Shift', 'night-shift', 146, lambda: trap(146, 43, 9, 'i-iv-VI-V', 4)),
    ('hype', 'Block Party', 'block-party', 100, lambda: hype(100, 50, 10, 'i-VII-VI-VII')),
    ('hype', 'Victory Lap', 'victory-lap', 104, lambda: hype(104, 53, 11, 'i-VI-III-VII')),
    ('hype', 'Spotlight', 'spotlight', 108, lambda: hype(108, 48, 12, 'i-iv-VI-V')),
]
NAMES = {'lofi': 'Lo-Fi', 'boombap': 'Boom Bap', 'trap': 'Trap', 'hype': 'Hype'}


def job(i):
    gid, title, slug, bpm, fn = TRACKS[i]
    print('rendering', gid, slug, flush=True)
    render(fn(), os.path.join(ROOT, 'music', gid, slug + '.mp3'))


if __name__ == '__main__':
    # clear previous generated output (leave anything not generated by this script alone)
    for gid in NAMES:
        os.makedirs(os.path.join(ROOT, 'music', gid), exist_ok=True)
    old = os.path.join(ROOT, 'music', 'electronic')
    if os.path.isdir(old): shutil.rmtree(old)
    for gid in NAMES:
        for f in os.listdir(os.path.join(ROOT, 'music', gid)):
            if f.endswith('.mp3'): os.remove(os.path.join(ROOT, 'music', gid, f))
    with Pool() as p:
        p.map(job, range(len(TRACKS)))
    manifest = {'$schema': 'Each track: file, title, artist, bpm, bars. bpm+bars (first downbeat at 0:00) enable beat-matched mixing. Paths are relative to /music/<genre>/.',
                'genres': []}
    for gid, name in NAMES.items():
        manifest['genres'].append({'id': gid, 'name': name, 'tracks': [
            {'file': slug + '.mp3', 'title': title, 'artist': 'Mic Drop House Band', 'bpm': bpm, 'bars': BARS}
            for g, title, slug, bpm, _ in TRACKS if g == gid]})
    with open(os.path.join(ROOT, 'music', 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2); f.write('\n')
