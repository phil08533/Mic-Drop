#!/usr/bin/env python3
"""Generate the flame art in assets/ (stdlib only).

    python3 tools/make_flames.py
"""
import math, os, random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
W, H = 1600, 400


def tongue(cx, base_w, h, rnd, y0=H):
    """One flame tongue as a path: wide base, S-curved tip."""
    lean = rnd.uniform(-.35, .35) * base_w
    tip_x, tip_y = cx + lean, y0 - h
    l, r = cx - base_w / 2, cx + base_w / 2
    k = rnd.uniform(.35, .6)
    return (f"M{l:.0f} {y0} "
            f"C{l - base_w * .1:.0f} {y0 - h * .35:.0f} {cx - base_w * .45 + lean * .3:.0f} {y0 - h * k:.0f} {tip_x:.0f} {tip_y:.0f} "
            f"C{cx + base_w * .45 + lean * .3:.0f} {y0 - h * (k + .1):.0f} {r + base_w * .15:.0f} {y0 - h * .3:.0f} {r:.0f} {y0} Z")


def layer(seed, count, hmin, hmax, wmin, wmax):
    rnd = random.Random(seed)
    parts = []
    x = -40
    while x < W + 40:
        bw = rnd.uniform(wmin, wmax)
        h = rnd.uniform(hmin, hmax) * (0.75 + 0.25 * math.sin(x / 210))
        parts.append(tongue(x + bw / 2, bw, h, rnd))
        x += bw * rnd.uniform(.45, .7)
    return ' '.join(parts)


def strip(name, layers, defs):
    body = ''.join(f'<path d="{layer(*a)}" fill="{f}"/>' for a, f in layers)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="none">'
           f'<defs>{defs}</defs>{body}</svg>')
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(svg)


grad = lambda i, a, b, c: (f'<linearGradient id="{i}" x1="0" y1="1" x2="0" y2="0">'
                           f'<stop offset="0" stop-color="{a}"/><stop offset=".55" stop-color="{b}"/>'
                           f'<stop offset="1" stop-color="{c}" stop-opacity="0"/></linearGradient>')

# back: deep red/orange, tall.  mid: orange.  front: yellow core, short.
strip('flames-back.svg', [((1, 0, 200, 380, 120, 220), 'url(#g)')], grad('g', '#7a1208', '#d92f0f', '#ff5a1f'))
strip('flames-mid.svg',  [((2, 0, 140, 300, 90, 170), 'url(#g)')],  grad('g', '#c4260c', '#ff6a1f', '#ffa43a'))
strip('flames-front.svg', [((3, 0, 80, 210, 70, 130), 'url(#g)')],  grad('g', '#ff7a1f', '#ffb03a', '#ffe9a0'))

# Hero art: a single big flame wrapped around a microphone, used on the home screen.
hero = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520">
<defs>
<linearGradient id="o" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b3200a"/><stop offset=".5" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ffb03a"/></linearGradient>
<linearGradient id="i" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff8a1f"/><stop offset="1" stop-color="#fff0b0"/></linearGradient>
<linearGradient id="m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2c2c38"/><stop offset=".45" stop-color="#6c6c7c"/><stop offset="1" stop-color="#1a1a22"/></linearGradient>
</defs>
<path d="M200 10C230 90 330 130 340 270C348 380 290 470 200 480C110 470 52 380 62 270C70 200 120 170 130 110C160 140 170 150 180 170C190 120 190 60 200 10Z" fill="url(#o)"/>
<path d="M200 120C220 180 285 215 290 300C294 380 255 440 200 446C145 440 106 380 110 300C114 250 150 232 156 190C175 214 183 222 190 236C196 190 194 160 200 120Z" fill="url(#i)" opacity=".9"/>
<rect x="188" y="330" width="24" height="170" rx="10" fill="#14141a"/>
<ellipse cx="200" cy="300" rx="52" ry="62" fill="url(#m)" stroke="#0e0e10" stroke-width="6"/>
<g stroke="#0e0e10" stroke-width="3" opacity=".55"><path d="M152 285H248M152 300H248M152 315H248M156 270H244M160 330H240" /></g>
<rect x="170" y="352" width="60" height="14" rx="5" fill="#ff4d2e"/>
</svg>'''
with open(os.path.join(OUT, 'flame-mic.svg'), 'w') as f:
    f.write(hero)
