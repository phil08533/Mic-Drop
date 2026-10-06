#!/usr/bin/env python3
"""Synthesise the Mic Drop beat library (stdlib only, needs ffmpeg for mp3).

    python3 tools/make_beats.py

Writes music/<genre>/<slug>.mp3 and rewrites music/manifest.json.
All sounds are generated from scratch, so the tracks are original and royalty free.
"""
import json, math, os, random, struct, subprocess, tempfile, wave

SR = 32000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TAU = math.pi * 2


def note(n):  # MIDI -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)


class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.l = [0.0] * self.n
        self.r = [0.0] * self.n

    def add(self, t, samples, gain=1.0, pan=0.0):
        i0 = int(t * SR)
        gl = gain * (1 - max(0, pan)); gr = gain * (1 + min(0, pan))
        n = self.n
        for k, s in enumerate(samples):
            i = i0 + k
            if i >= n: break
            self.l[i] += s * gl; self.r[i] += s * gr


# ---- instruments (return list of samples) ----
def kick(length=0.38, f0=130, f1=42, drive=1.6, decay=7):
    out = []; ph = 0.0
    for i in range(int(length * SR)):
        t = i / SR
        f = f1 + (f0 - f1) * math.exp(-t * 28)
        ph += TAU * f / SR
        out.append(math.tanh(math.sin(ph) * drive) * math.exp(-t * decay))
    return out

def sub808(freq, length=0.7, decay=3.2):
    out = []; ph = 0.0
    for i in range(int(length * SR)):
        t = i / SR
        f = freq * (1 + 1.2 * math.exp(-t * 40))
        ph += TAU * f / SR
        env = min(1, t * 400) * math.exp(-t * decay)
        out.append(math.tanh(math.sin(ph) * 2.2) * env)
    return out

def snare(length=0.22, tone=190, noise=0.8):
    rnd = random.Random(7); out = []
    for i in range(int(length * SR)):
        t = i / SR
        body = math.sin(TAU * tone * t) * math.exp(-t * 28)
        n = (rnd.random() * 2 - 1) * math.exp(-t * 17) * noise
        out.append(body * 0.6 + n)
    return out

def clap(length=0.2):
    rnd = random.Random(11); out = []
    for i in range(int(length * SR)):
        t = i / SR
        burst = sum(math.exp(-((t - d) ** 2) * 9e4) for d in (0, .011, .022)) * 0.7
        out.append((rnd.random() * 2 - 1) * (burst + math.exp(-t * 20) * .5))
    return out

def hat(length=0.06, seed=1, decay=70):
    rnd = random.Random(seed); out = []; prev = 0.0
    for i in range(int(length * SR)):
        t = i / SR
        x = rnd.random() * 2 - 1
        hp = x - prev; prev = x  # crude high-pass
        out.append(hp * math.exp(-t * decay))
    return out

def tone(freq, length, kind='sine', decay=4, attack=0.01, vib=0.0):
    out = []
    for i in range(int(length * SR)):
        t = i / SR
        f = freq * (1 + vib * math.sin(TAU * 5 * t))
        p = TAU * f * t
        if kind == 'sine':
            s = math.sin(p)
        elif kind == 'tri':
            s = 2 / math.pi * math.asin(math.sin(p))
        elif kind == 'saw':
            s = 2 * ((f * t) % 1) - 1
        elif kind == 'pluck':
            s = math.sin(p) + .5 * math.sin(2 * p) * math.exp(-t * 9) + .25 * math.sin(3 * p) * math.exp(-t * 14)
        else:  # square-ish
            s = math.tanh(math.sin(p) * 4)
        env = min(1, t / attack) * math.exp(-t * decay)
        out.append(s * env)
    return out

def chord(notes, length, kind='tri', decay=2.2, detune=0.003):
    voices = [tone(note(n) * (1 + d), length, kind, decay, 0.02)
              for n in notes for d in (-detune, detune)]
    return [sum(v[i] for v in voices) / len(voices) for i in range(len(voices[0]))]


def lowpass(x, cutoff):
    a = 1 - math.exp(-TAU * cutoff / SR); y = 0.0; out = []
    for s in x:
        y += a * (s - y); out.append(y)
    return out


def vinyl(mix, seed=3, level=0.012):
    rnd = random.Random(seed)
    for i in range(mix.n):
        x = (rnd.random() * 2 - 1) * level * 0.4
        if rnd.random() < 0.0004: x += (rnd.random() * 2 - 1) * level * 6
        mix.l[i] += x; mix.r[i] += x


# ---- pattern helpers ----
def steps(bpm, bars, per_bar=16):
    sd = 60.0 / bpm * 4 / per_bar
    return sd, bars * per_bar

def render(mix, path):
    peak = max(max(map(abs, mix.l)), max(map(abs, mix.r)), 1e-9)
    g = 0.89 / peak
    # short fade in/out so loops don't click
    fade = int(0.02 * SR)
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 'x.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            buf = bytearray()
            for i in range(mix.n):
                f = min(1, i / fade, (mix.n - i) / fade)
                buf += struct.pack('<hh', int(max(-1, min(1, mix.l[i] * g * f)) * 32767),
                                   int(max(-1, min(1, mix.r[i] * g * f)) * 32767))
            w.writeframes(bytes(buf))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame',
                        '-b:a', '112k', path], check=True)


# ---- track recipes ----
def lofi(bpm, prog, seed, swing=0.07):
    rnd = random.Random(seed)
    bars = len(prog) * 2
    sd, n = steps(bpm, bars)
    m = Mix(sd * n + 1.5)
    K, S = kick(0.3, 100, 48, 1.1, 9), snare(0.2, 170, 0.45)
    chords = [lowpass(chord(c, sd * 16, 'tri', 1.3), 2400) for c in prog]
    bass = [tone(note(c[0] - 12), sd * 7, 'sine', 2.5) for c in prog]
    for s in range(n):
        t = s * sd + (swing * sd if s % 2 else 0)
        bar = s // 16; st = s % 16; pi = (bar // 2) % len(prog)
        if st in (0, 10) or (st == 7 and bar % 2): m.add(t, K, .9)
        if st in (4, 12): m.add(t, S, .5, .1)
        if st % 2 == 0 and rnd.random() < .95: m.add(t, hat(.05, s, 90), .13 * (1 if st % 4 == 0 else .6), -.2)
        if st == 0 and bar % 2 == 0: m.add(t, chords[pi], .33); m.add(t, bass[pi], .6)
        if st in (6, 14) and rnd.random() < .7:
            nn = rnd.choice(prog[pi][1:]) + 12
            m.add(t, lowpass(tone(note(nn), .4, 'pluck', 5), 3000), .22, rnd.uniform(-.5, .5))
    vinyl(m, seed)
    return m

def boombap(bpm, root, seed):
    rnd = random.Random(seed)
    sd, n = steps(bpm, 16)
    m = Mix(sd * n + 1.5)
    K, S = kick(0.34, 120, 46, 1.4, 8), snare(0.24, 200, 0.9)
    minor = [0, 3, 5, 7, 10]
    patt = [[0], [0], [3], [0], [5], [3], [0], [7]]
    for s in range(n):
        t = s * sd; bar = s // 16; st = s % 16
        kp = {0, 7, 10} if bar % 4 != 3 else {0, 7, 10, 14}
        if st in kp: m.add(t, K, 1.0)
        if st in (4, 12): m.add(t, S, .8)
        if st % 2 == 0: m.add(t, hat(.045, s, 85), .16 if st % 4 else .22)
        if st == 15 and bar % 2: m.add(t, hat(.18, s, 22), .14)
        if st in (0, 3, 8, 11) or (st == 14 and bar % 4 == 3):
            deg = patt[(bar // 2) % len(patt)][0]
            m.add(t, lowpass(tone(note(root + deg - 12), sd * 3, 'sine', 3.5), 600), .8)
        if st == 0 and bar % 4 == 0:
            m.add(t, lowpass(chord([root + 12, root + 15, root + 19, root + 22], sd * 32, 'saw', .9), 1500), .22)
        if st in (2, 10) and bar % 2 == 0:
            m.add(t, lowpass(tone(note(root + 24 + rnd.choice(minor)), .3, 'pluck', 6), 3500), .18, .3)
    vinyl(m, seed, .008)
    return m

def trap(bpm, root, seed):
    rnd = random.Random(seed)
    sd, n = steps(bpm, 16)
    m = Mix(sd * n + 2)
    K, C = kick(0.3, 110, 50, 1.8, 10), clap()
    for s in range(n):
        t = s * sd; bar = s // 16; st = s % 16
        # half-time snare on beat 3
        if st == 8: m.add(t, C, .85); m.add(t, snare(.2, 210, .7), .45)
        kp = {0, 6, 10} | ({13} if bar % 2 else set()) | ({3} if bar % 4 == 3 else set())
        if st in kp: m.add(t, K, .9)
        # rolling hats with occasional 1/32 bursts and triplet fills
        m.add(t, hat(.04, s, 100), .15 * (1 if st % 2 == 0 else .6), .2)
        if st in (3, 7, 11, 15) and rnd.random() < .6:
            m.add(t + sd / 2, hat(.035, s + 99, 110), .11, -.2)
        if st == 14 and bar % 4 == 3:
            for j in range(3): m.add(t + j * sd / 3, hat(.035, s + j, 100), .13)
        if st in (0, 6, 10) or (st == 13 and bar % 2):
            deg = [0, 0, -2, -4][bar % 4]
            m.add(t, sub808(note(root - 24 + deg), sd * 5.5), .95 if st == 0 else .75)
    # eerie bell melody
    mel = [12, 15, 19, 15, 22, 19, 15, 12]
    for b in range(16):
        for j, d in enumerate(mel):
            if rnd.random() < .55 or j == 0:
                tt = b * 16 * sd + j * 2 * sd
                m.add(tt, lowpass(tone(note(root + d + 12), .6, 'sine', 3.5, .005, .002), 4500), .16, rnd.uniform(-.4, .4))
    return m

def electronic(bpm, root, seed):
    rnd = random.Random(seed)
    sd, n = steps(bpm, 16)
    m = Mix(sd * n + 1.5)
    K = kick(0.3, 150, 50, 2.0, 9)
    arp = [0, 7, 12, 15, 19, 15, 12, 7]
    for s in range(n):
        t = s * sd; bar = s // 16; st = s % 16
        if st % 4 == 0 and bar >= 1: m.add(t, K, .9)
        if st % 4 == 2: m.add(t, hat(.08, s, 40), .22)
        if st in (4, 12) and bar >= 4: m.add(t, clap(), .5)
        if st % 2 == 1 and bar >= 2: m.add(t, hat(.03, s, 120), .1, .3)
        if st % 4 != 0 and bar >= 1:  # offbeat bass
            deg = [0, 0, -4, -2][(bar // 2) % 4]
            m.add(t, lowpass(tone(note(root - 12 + deg), sd * 1.6, 'saw', 6), 500 + 400 * math.sin(bar / 3)), .5)
        if bar >= 3:  # arp lead
            d = arp[s % 8] + [0, 0, -4, -2][(bar // 2) % 4]
            m.add(t, lowpass(tone(note(root + 12 + d), sd * 1.5, 'sq', 7), 2500 + 1500 * math.sin(s / 40)), .13, math.sin(s / 6) * .6)
        if st == 0 and bar % 4 == 0:
            m.add(t, lowpass(chord([root, root + 7, root + 12, root + 15], sd * 64, 'saw', .35), 1200), .2)
    return m


TRACKS = {
    'lofi': [
        ('Rainy Window', 'rainy-window', lambda: lofi(72, [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]], 1)),
        ('Late Night Cypher', 'late-night-cypher', lambda: lofi(80, [[50, 53, 57, 60], [55, 58, 62, 65], [48, 52, 55, 59], [53, 57, 60, 64]], 2)),
    ],
    'boombap': [
        ('Basement Tapes', 'basement-tapes', lambda: boombap(90, 57, 3)),
        ('Concrete Jungle', 'concrete-jungle', lambda: boombap(94, 52, 4)),
    ],
    'trap': [
        ('Smoke Signals', 'smoke-signals', lambda: trap(140, 48, 5)),
        ('Cold Chain', 'cold-chain', lambda: trap(150, 45, 6)),
    ],
    'electronic': [
        ('Neon Booth', 'neon-booth', lambda: electronic(124, 45, 7)),
        ('Overclock', 'overclock', lambda: electronic(132, 50, 8)),
    ],
}
NAMES = {'lofi': 'Lo-Fi', 'boombap': 'Boom Bap', 'trap': 'Trap', 'electronic': 'Electronic'}

if __name__ == '__main__':
    manifest = {'$schema': 'List the audio files inside each genre folder. Paths are relative to /music/.', 'genres': []}
    for gid, tracks in TRACKS.items():
        os.makedirs(os.path.join(ROOT, 'music', gid), exist_ok=True)
        entry = {'id': gid, 'name': NAMES[gid], 'tracks': []}
        for title, slug, fn in tracks:
            print('rendering', gid, slug, flush=True)
            render(fn(), os.path.join(ROOT, 'music', gid, slug + '.mp3'))
            entry['tracks'].append({'file': slug + '.mp3', 'title': title, 'artist': 'Mic Drop House Band'})
        manifest['genres'].append(entry)
    with open(os.path.join(ROOT, 'music', 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2); f.write('\n')
