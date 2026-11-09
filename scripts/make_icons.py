#!/usr/bin/env python3
"""Draws every Pilina icon from one set of shapes.

The mark: the right half of a cut log (bark, wood, growth rings) is the bowl of a P,
and a red kerf line is its stem. Small sizes (32 px and below) use a simpler version.

Run from the repository root:  python3 scripts/make_icons.py
Needs Pillow (pip install pillow). Writes web/public/* and desktop/icons/*.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

# ---- Colours ----
BG = '#F3EADB'  # cream tile
BG_TOP, BG_BOTTOM = '#F7F0E4', '#ECE0CB'  # macOS tile gradient
BARK = '#7E5233'
WOOD = '#E9C894'
RING = '#C79A5F'
PITH = '#B0844C'
KERF = '#D8432B'  # the cut line; the app's rip-cut orange would be '#E8743F'

U = 1 / 120  # the mark is designed on a 120-unit tile


def wobble(phi, amount, seed):
    """A gentle, repeatable irregularity so the log doesn't look machined."""
    return 1 + amount * (math.sin(5 * phi + seed) * 0.6 + math.sin(11 * phi + 2.1 * seed) * 0.4)


def half_disc(cx, cy, r, amount, seed, n=160):
    pts = []
    for i in range(n + 1):
        phi = -math.pi / 2 + math.pi * i / n
        rr = r * wobble(phi, amount, seed)
        pts.append((cx + rr * math.cos(phi), cy + rr * math.sin(phi)))
    return pts


def half_band(cx, cy, r, width, amount, seed, n=120):
    outer = half_disc(cx, cy, r + width / 2, amount, seed, n)
    inner = half_disc(cx, cy, r - width / 2, amount, seed, n)
    return outer + inner[::-1]


def mark(simple=False):
    """Shapes in tile units (0..1): ('poly', points, colour) or ('circle', cx, cy, r, colour)."""
    cx, cy, R = 49 * U, 52 * U, 30 * U
    shapes = [('poly', half_disc(cx, cy, R, 0.022, 0.7), BARK)]
    shapes.append(('poly', half_disc(cx, cy, R - 4.5 * U, 0.012, 1.3), WOOD))
    if simple:
        shapes.append(('poly', half_band(cx, cy, 13 * U, 3.2 * U, 0.01, 2.0), RING))
    else:
        for r, seed in ((19.5, 2.0), (13, 2.6), (6.5, 3.1)):
            shapes.append(('poly', half_band(cx, cy, r * U, 1.7 * U, 0.012, seed), RING))
        shapes.append(('circle', cx + 1.5 * U, cy, 1.8 * U, PITH))
    # Kerf line (the stem): a rounded bar, with a small gap before the log's cut face.
    w = (7 if simple else 5) * U
    x = 44 * U - w / 2  # leaves a visible kerf gap before the log's cut face
    shapes.append(('bar', x, 18 * U, 104 * U, w, KERF))
    return shapes


def place(shapes, scale=1.0, centre=(0.5, 0.5)):
    """Scale the mark around a point (used to fit the maskable safe zone)."""
    ox, oy = centre

    def t(p):
        return (ox + (p[0] - ox) * scale, oy + (p[1] - oy) * scale)

    out = []
    for s in shapes:
        if s[0] == 'poly':
            out.append(('poly', [t(p) for p in s[1]], s[2]))
        elif s[0] == 'circle':
            x, y = t((s[1], s[2]))
            out.append(('circle', x, y, s[3] * scale, s[4]))
        else:
            x, y1 = t((s[1], s[2]))
            _, y2 = t((s[1], s[3]))
            out.append(('bar', x, y1, y2, s[4] * scale, s[5]))
    return out


# ---- SVG ----
def svg_shapes(shapes, size, offset=0.0, tile=None):
    tile = tile or size
    f = lambda v: f'{offset + v * tile:.1f}'
    parts = []
    for s in shapes:
        if s[0] == 'poly':
            d = 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in s[1]) + ' Z'
            parts.append(f'  <path d="{d}" fill="{s[2]}"/>')
        elif s[0] == 'circle':
            parts.append(f'  <circle cx="{f(s[1])}" cy="{f(s[2])}" r="{s[3] * tile:.1f}" fill="{s[4]}"/>')
        else:
            x, y1, y2, w = s[1], s[2], s[3], s[4]
            parts.append(
                f'  <rect x="{f(x)}" y="{f(y1)}" width="{w * tile:.1f}" height="{(y2 - y1) * tile:.1f}" '
                f'rx="{w * tile / 2:.1f}" fill="{s[5]}"/>'
            )
    return '\n'.join(parts)


def svg_web(rounded=True, scale=1.0):
    S = 512
    bg = f'<rect width="{S}" height="{S}" rx="112" fill="{BG}"/>' if rounded else f'<rect width="{S}" height="{S}" fill="{BG}"/>'
    body = svg_shapes(place(mark(), scale), S)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">\n  {bg}\n{body}\n</svg>\n'


def svg_macos():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <!-- macOS icon grid: 824 px rounded square centred on a 1024 canvas, with a soft shadow. -->
  <defs>
    <filter id="s" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.22"/>
    </filter>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{BG_TOP}"/>
      <stop offset="1" stop-color="{BG_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#g)" filter="url(#s)"/>
{svg_shapes(mark(), 1024, offset=100, tile=824)}
</svg>
'''


# ---- PNG (drawn at 4x, then downsampled) ----
def hex_rgba(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def draw_shapes(img, shapes, offset, tile):
    d = ImageDraw.Draw(img)
    for s in shapes:
        if s[0] == 'poly':
            d.polygon([(offset + x * tile, offset + y * tile) for x, y in s[1]], fill=hex_rgba(s[2]))
        elif s[0] == 'circle':
            x, y, r = offset + s[1] * tile, offset + s[2] * tile, s[3] * tile
            d.ellipse([x - r, y - r, x + r, y + r], fill=hex_rgba(s[4]))
        else:
            x, y1, y2, w = offset + s[1] * tile, offset + s[2] * tile, offset + s[3] * tile, s[4] * tile
            d.rounded_rectangle([x, y1, x + w, y2], radius=w / 2, fill=hex_rgba(s[5]))


def png_web(size, rounded=True, scale=1.0, simple=False):
    k = 4
    S = size * k
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 112 / 512, fill=hex_rgba(BG))
    else:
        d.rectangle([0, 0, S, S], fill=hex_rgba(BG))
    draw_shapes(img, place(mark(simple), scale), 0, S)
    return img.resize((size, size), Image.LANCZOS)


def png_macos(size, simple=None):
    simple = size <= 32 if simple is None else simple
    k = 4
    S = size * k
    t0, ts = S * 100 / 1024, S * 824 / 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    # soft shadow
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [t0, t0 + S * 12 / 1024, t0 + ts, t0 + ts + S * 12 / 1024], radius=ts * 185 / 824, fill=(0, 0, 0, 56)
    )
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(S * 14 / 1024)))
    # gradient tile
    grad = Image.new('RGBA', (S, S))
    top, bot = hex_rgba(BG_TOP), hex_rgba(BG_BOTTOM)
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        a = min(max((y - t0) / ts, 0), 1)
        gd.line([(0, y), (S, y)], fill=tuple(round(top[i] + (bot[i] - top[i]) * a) for i in range(4)))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([t0, t0, t0 + ts, t0 + ts], radius=ts * 185 / 824, fill=255)
    img.paste(grad, (0, 0), mask)
    draw_shapes(img, mark(simple), t0, ts)
    return img.resize((size, size), Image.LANCZOS)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pub, ico = os.path.join(root, 'web', 'public'), os.path.join(root, 'desktop', 'icons')

    # Web app (PWA). Maskable icons keep the mark inside the 80% safe zone.
    open(os.path.join(pub, 'icon.svg'), 'w').write(svg_web())
    open(os.path.join(pub, 'icon-maskable.svg'), 'w').write(svg_web(rounded=False, scale=0.8))
    png_web(192).save(os.path.join(pub, 'icon-192.png'))
    png_web(512).save(os.path.join(pub, 'icon-512.png'))
    png_web(192, rounded=False, scale=0.8).save(os.path.join(pub, 'icon-maskable-192.png'))
    png_web(512, rounded=False, scale=0.8).save(os.path.join(pub, 'icon-maskable-512.png'))
    png_web(180, rounded=False).save(os.path.join(pub, 'apple-touch-icon.png'))
    png_web(32, simple=True).save(os.path.join(pub, 'favicon-32.png'))

    # Mac app (Tauri)
    open(os.path.join(ico, 'icon-macos.svg'), 'w').write(svg_macos())
    png_macos(32).save(os.path.join(ico, '32x32.png'))
    png_macos(128).save(os.path.join(ico, '128x128.png'))
    png_macos(256).save(os.path.join(ico, '128x128@2x.png'))
    png_macos(512).save(os.path.join(ico, 'icon.png'))
    big = png_macos(1024)
    big.save(os.path.join(ico, 'icon.icns'), append_images=[png_macos(s) for s in (16, 32, 64, 128, 256, 512)])
    png_macos(256).save(
        os.path.join(ico, 'icon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (256, 256)],
        append_images=[png_macos(s) for s in (16, 32, 48)],
    )
    print('Icons written to web/public and desktop/icons.')


if __name__ == '__main__':
    main()
