# -*- coding: utf-8 -*-
"""
小柯機器人三國志遊戲：半身頭像產生器（原創向量插畫，SVG，無外部圖檔）

以程序化方式組合膚色、臉型、眉眼、鬍鬚、頭冠／頭盔、服裝、披風、兵器與背景紋章，
畫出東漢末年風格的半身像：
  - 玩家頭像 40 張（男女各 20）、AI 軍師 30 張 → web/assets/portraits/{id}.svg
  - 遊戲武將（依能力值與姓名雜湊決定外觀，名將另有招牌造型）→ web/assets/officers/{id}.svg
  - web/assets/portraits/index.json（玩家頭像與軍師清單）
  - tools/_portrait_sheet.html（總覽頁，檢查用，不隨遊戲發佈）

完全決定性：同樣的資料每次輸出相同。
用法：python tools/gen_portraits.py
"""
import hashlib
import json
import math
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from sanguo import data  # noqa: E402

OUT_P = os.path.join(ROOT, 'web', 'assets', 'portraits')
OUT_O = os.path.join(ROOT, 'web', 'assets', 'officers')
SHEET = os.path.join(ROOT, 'tools', '_portrait_sheet.html')

W, H = 256, 320          # 輸出尺寸
FW, FH = 240, 300        # 繪圖座標（中心線 x=120），整體放大 1.0667 倍
MIRROR = 'matrix(-1 0 0 1 240 0)'
HAIR = '#1b1512'
INK = '#2a1a10'

SKIN = {
    'pale': '#f8e2d0', 'fair': '#f6dcc4', 'light': '#f0cfae', 'warm': '#e8bb93', 'tan': '#d29b6e',
    'bronze': '#b97a4f', 'dark': '#7f5236', 'red': '#b8442f',
}


# ---------------------------------------------------------------- 小工具
def shade(hexc, amt):
    n = int(hexc[1:], 16)
    r, g, b = (n >> 16) & 255, (n >> 8) & 255, n & 255

    def f(c):
        v = c * (1 + amt) if amt < 0 else c + (255 - c) * amt
        return max(0, min(255, int(round(v))))
    return '#%02x%02x%02x' % (f(r), f(g), f(b))


def num(x):
    if isinstance(x, int):
        return str(x)
    s = '%.1f' % x
    return s[:-2] if s.endswith('.0') else s


def sym(inner):
    """左半邊內容 + 對中心線 x=120 的鏡像。"""
    return inner + f'<g transform="{MIRROR}">{inner}</g>'


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1])


def seeded(key):
    return random.Random(int(hashlib.md5(key.encode('utf-8')).hexdigest()[:12], 16))


class Pen:
    """每張圖獨立的 id 產生器（加前綴，內嵌到同一 DOM 也不會撞名）。"""

    def __init__(self, pid):
        self.pid, self.k = pid, 0

    def id(self, tag):
        self.k += 1
        return f'{self.pid}{tag}{self.k}'


DEFAULTS = dict(
    skin='light', face=None, brow='straight', eye='calm', gaze=0, nose='line', mouth='neutral', age='young',
    beard='none', hairColor=None, beardColor=None, eyeColor=INK, head='bun', headColor='#2c3a5a',
    helm='#8a8f98', crest='tassel', crestColor='#c0392b', plates=False, helmFur=False,
    outfit='robe', main='#3a4a6a', trim='#d8b45a', plate=None, lace=None, armor='lamellar', scarf=None,
    cloak=None, prop='none', propSide='right', tassel='#c0392b', flower='#f7c8d6', mark=None,
    bg=('#3a4a5a', '#121a22'), emblem='mirror', scene='mountain', turn=0, tilt=0, build='normal',
    acc=(), fringe='part', lip='#c8323a', fur='#efe6d6', flagColor=None, ribbon=None,
)


# ---------------------------------------------------------------- 背景
def background(pen, c, rng):
    b0, b1 = c['bg']
    g = pen.id('bg')
    s = (f'<defs><radialGradient id="{g}" cx="50%" cy="36%" r="80%"><stop offset="0" stop-color="{shade(b0, .18)}"/>'
         f'<stop offset=".55" stop-color="{b0}"/><stop offset="1" stop-color="{b1}"/></radialGradient></defs>'
         f'<rect width="{FW}" height="{FH}" fill="url(#{g})"/>')
    sc = c['scene']
    # 遠景
    if sc == 'mountain':
        s += ('<path d="M0 196 L50 150 L80 172 L128 118 L170 166 L210 138 L240 158 V300 H0 Z" fill="#fff" opacity=".05"/>'
              '<path d="M0 214 L34 170 L58 190 L96 146 L132 186 L160 162 L196 196 L222 174 L240 190 V300 H0 Z" fill="#000" opacity=".2"/>')
    elif sc == 'waves':
        for k, y in enumerate((178, 198, 218, 238)):
            d = f'M{-10 + (k % 2) * 12} {y}' + ' q10 -9 20 0 t20 0' * 7
            s += f'<path d="{d}" fill="none" stroke="#fff" stroke-opacity="{.16 - k * .02:.2f}" stroke-width="2.5"/>'
    elif sc == 'moon':
        s += ('<circle cx="190" cy="60" r="44" fill="#fff6d0" opacity=".08"/>'
              '<circle cx="190" cy="60" r="28" fill="#fff6d0" opacity=".8"/>'
              '<path d="M176 52 q8 -4 12 2 M194 70 q6 -2 8 4" stroke="#e8d8a0" stroke-width="2" fill="none" opacity=".7"/>')
    elif sc == 'bamboo':
        s += '<g fill="#0b2a14" opacity=".35">'
        for x, w in ((14, 7), (34, 6), (212, 7), (229, 5)):
            s += f'<rect x="{x}" y="0" width="{w}" height="{FH}"/>'
            for y in range(24 + x % 30, FH, 52):
                s += f'<rect x="{x - 1}" y="{y}" width="{w + 2}" height="3"/>'
        for x, y, a in ((44, 60, 30), (50, 150, -20), (204, 90, -30), (198, 40, 210), (26, 110, 200)):
            s += f'<ellipse cx="{x}" cy="{y}" rx="16" ry="3.5" transform="rotate({a} {x} {y})"/>'
        s += '</g>'
    elif sc == 'wall':
        d = 'M0 196'
        for x in range(0, 240, 24):
            d += f' H{x + 12} V186 H{x + 24} V196'
        s += f'<path d="{d} V300 H0 Z" fill="#000" opacity=".22"/>'
        s += '<path d="M150 150 L170 132 L190 150 Z M156 150 h28 v46 h-28 Z" fill="#000" opacity=".16"/>'
    elif sc == 'flame':
        for x, h, o in ((12, 90, .28), (44, 60, .22), (196, 80, .28), (226, 104, .24)):
            s += (f'<path d="M{x - 18} 300 C{x - 22} {300 - h * .5} {x - 4} {300 - h * .6} {x} {300 - h} '
                  f'C{x + 6} {300 - h * .6} {x + 22} {300 - h * .5} {x + 18} 300 Z" fill="#ff8a2a" opacity="{o}"/>')
        s += '<g fill="#ffc35a" opacity=".55">' + ''.join(
            f'<circle cx="{rng.randint(10, 230)}" cy="{rng.randint(40, 230)}" r="{rng.choice((1, 1.5, 2))}"/>'
            for _ in range(14)) + '</g>'
    elif sc == 'snow':
        s += '<path d="M0 200 L40 176 L84 196 L130 164 L180 192 L240 170 V300 H0 Z" fill="#fff" opacity=".12"/>'
        s += '<g fill="#fff" opacity=".6">' + ''.join(
            f'<circle cx="{rng.randint(4, 236)}" cy="{rng.randint(4, 240)}" r="{rng.choice((1, 1.5, 2, 2.5))}"/>'
            for _ in range(36)) + '</g>'
    elif sc == 'reeds':
        s += '<g stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none">'
        for x in (8, 18, 30, 206, 218, 232):
            s += f'<path d="M{x} 300 Q{x + 4} 220 {x + 14} {150 + x % 40}"/>'
        s += '</g><path d="M0 230 q30 -6 60 0 t60 0 t60 0 t60 0" stroke="#fff" stroke-opacity=".12" stroke-width="2" fill="none"/>'
    elif sc == 'flowers':
        s += '<g fill="#ffd0e0" opacity=".45">' + ''.join(
            (lambda x, y, a: f'<ellipse cx="{x}" cy="{y}" rx="4" ry="2.4" transform="rotate({a} {x} {y})"/>')(
                rng.randint(8, 232), rng.randint(10, 240), rng.randint(0, 180)) for _ in range(22)) + '</g>'
        s += '<path d="M0 40 Q40 52 70 30 M70 30 q10 -4 16 4" stroke="#3a2418" stroke-opacity=".4" stroke-width="3" fill="none"/>'
    elif sc == 'stars':
        s += '<g fill="#fff">' + ''.join(
            f'<circle cx="{rng.randint(4, 236)}" cy="{rng.randint(4, 200)}" r="{rng.choice((.8, 1, 1.2, 1.6))}" '
            f'opacity="{rng.choice((.4, .6, .8))}"/>' for _ in range(30)) + '</g>'
    elif sc == 'desert':
        s += ('<circle cx="58" cy="70" r="22" fill="#ffe0a0" opacity=".35"/>'
              '<path d="M0 206 Q60 180 120 200 T240 190 V300 H0 Z" fill="#000" opacity=".18"/>'
              '<path d="M0 226 Q80 204 160 224 T240 214 V300 H0 Z" fill="#000" opacity=".14"/>')
    elif sc == 'clouds':
        s += '<path d="M0 220 Q60 200 120 214 T240 206 V300 H0 Z" fill="#fff" opacity=".07"/>'
    # 紋章（祥雲、銅鏡、日輪、回紋）
    em = c['emblem']
    if em == 'mirror':
        s += ('<g fill="none" stroke="#fff" stroke-opacity=".11" transform="translate(120 116)">'
              '<circle r="100" stroke-width="2"/><circle r="92" stroke-width="7" stroke-dasharray="2 7"/>'
              '<circle r="80" stroke-width="1.5"/><circle r="64" stroke-width="1" stroke-dasharray="10 5"/></g>')
    elif em == 'sun':
        s += ('<g fill="none" stroke="#fff" transform="translate(120 116)">'
              '<circle r="96" stroke-width="44" stroke-opacity=".06" stroke-dasharray="6 14"/>'
              '<circle r="72" stroke-width="2" stroke-opacity=".13"/></g>')
    elif em == 'lattice':
        s += ('<g fill="none" stroke="#fff" stroke-opacity=".1" transform="translate(120 116) rotate(45)">'
              '<rect x="-76" y="-76" width="152" height="152" stroke-width="3"/>'
              '<rect x="-64" y="-64" width="128" height="128" stroke-width="1.5" stroke-dasharray="8 4"/></g>')
    if em in ('cloud', 'mirror', 'sun', 'lattice'):
        curl = 'q0 -9 9 -9 q9 0 9 9 q0 5 -5 5 q-5 0 -5 -5 m10 4 h22'
        pts = ((14, 52), (176, 36), (196, 118)) if em == 'cloud' else ((16, 62), (190, 34))
        s += '<g fill="none" stroke="#fff" stroke-opacity=".15" stroke-width="2.6" stroke-linecap="round">'
        for x, y in pts:
            s += f'<path d="M{x} {y} {curl}"/>'
        s += '</g>'
    return s


# ---------------------------------------------------------------- 兵器與道具
def back_prop(pen, c):
    p, tr, ts = c['prop'], c['trim'], c['tassel']
    s = ''
    if p == 'glaive':      # 偃月刀
        s = (f'<rect x="196" y="20" width="7" height="280" fill="#5a3a1e"/>'
             f'<path d="M199 6 C232 28 234 80 205 98 L199 98 Z" fill="#d4dbe1" stroke="#7a8a96" stroke-width="2"/>'
             f'<path d="M203 20 C222 38 222 72 205 88" stroke="#a8b4be" stroke-width="2" fill="none"/>'
             f'<path d="M199 34 L188 24 L192 40 Z" fill="#d4dbe1"/><circle cx="200" cy="102" r="7" fill="{tr}"/>'
             f'<path d="M196 100 q-14 10 -6 28 M198 104 q-6 12 2 26" stroke="{ts}" stroke-width="5" fill="none"/>')
    elif p == 'spear':
        s = (f'<rect x="200" y="30" width="6" height="270" fill="#5a3a22"/>'
             f'<path d="M203 4 L214 40 L203 52 L192 40 Z" fill="#d6dde3" stroke="#7a8a96" stroke-width="2"/>'
             f'<path d="M203 10 V46" stroke="#9aa6b0" stroke-width="1.2"/>'
             f'<path d="M194 54 q9 16 18 0 q-3 22 -9 26 q-6 -4 -9 -26 Z" fill="{ts}"/>')
    elif p == 'snakeSpear':  # 丈八蛇矛
        s = (f'<rect x="200" y="40" width="6" height="260" fill="#3a2a1a"/>'
             f'<path d="M203 0 L209 12 Q213 20 205 28 Q197 36 206 44 L203 52 L200 44 Q191 36 199 28 Q207 20 197 12 Z" '
             f'fill="#d6dde3" stroke="#6a7a86" stroke-width="1.5"/>'
             f'<path d="M194 54 q9 16 18 0 q-3 22 -9 26 q-6 -4 -9 -26 Z" fill="{ts}"/>')
    elif p == 'halberd':   # 方天畫戟
        s = (f'<rect x="200" y="22" width="6" height="278" fill="#4a3020"/>'
             f'<path d="M203 2 L211 30 L195 30 Z" fill="#d6dde3"/>'
             f'<path d="M206 34 C228 36 232 60 214 70 C220 56 216 46 206 46 Z" fill="#d6dde3" stroke="#7a8a96" stroke-width="1.5"/>'
             f'<path d="M200 34 C178 36 174 60 192 70 C186 56 190 46 200 46 Z" fill="#d6dde3" stroke="#7a8a96" stroke-width="1.5"/>'
             f'<path d="M198 74 q-10 14 -4 30 M208 74 q10 14 4 30" stroke="{ts}" stroke-width="4" fill="none"/>')
    elif p == 'axe':
        s = (f'<rect x="200" y="20" width="7" height="280" fill="#4a3020"/><path d="M203 4 L209 22 L197 22 Z" fill="#cfd6dc"/>'
             f'<path d="M207 34 C238 34 244 82 232 100 C224 88 216 84 207 84 Z" fill="#cfd6dc" stroke="#6a7a86" stroke-width="2"/>'
             f'<path d="M200 44 L186 38 L186 72 L200 66 Z" fill="#a8b4be"/><circle cx="214" cy="58" r="4" fill="{tr}"/>')
    elif p == 'bow':
        s = (f'<path d="M206 40 C250 120 250 200 206 280" stroke="#6a3a1a" stroke-width="7" fill="none"/>'
             f'<path d="M206 40 C250 120 250 200 206 280" stroke="{tr}" stroke-width="7" fill="none" stroke-dasharray="4 30"/>'
             f'<path d="M206 40 L206 280" stroke="#efe6d0" stroke-width="1.5"/>')
    elif p in ('twinHalberds', 'twinBlades'):
        if p == 'twinHalberds':
            w = (f'<rect x="117" y="40" width="6" height="200" fill="#3a2a1a"/><path d="M120 18 L127 42 L113 42 Z" fill="#cfd6dc"/>'
                 f'<path d="M123 46 C142 48 146 70 130 78 C134 66 132 58 123 58 Z" fill="#cfd6dc" stroke="#6a7a86"/>'
                 f'<path d="M117 82 q-8 10 -2 22" stroke="{ts}" stroke-width="4" fill="none"/>')
        else:
            w = (f'<path d="M117 30 Q131 60 124 170 L116 170 Q122 70 117 30 Z" fill="#d6dde3" stroke="#6a7a86" stroke-width="1.5"/>'
                 f'<rect x="110" y="168" width="20" height="6" rx="2" fill="{tr}"/><rect x="116" y="174" width="8" height="30" fill="#3a2a1a"/>'
                 f'<circle cx="120" cy="208" r="5" fill="none" stroke="{tr}" stroke-width="2.5"/>')
        s = f'<g transform="rotate(-32 120 250)">{w}</g><g transform="rotate(32 120 250)">{w}</g>'
    elif p == 'flag':
        fc = c['flagColor'] or c['main']
        s = (f'<rect x="30" y="8" width="5" height="292" fill="#4a3020"/><circle cx="32.5" cy="8" r="5" fill="{tr}"/>'
             f'<path d="M35 18 H96 L88 30 L96 42 L88 54 L96 66 L88 78 L96 90 H35 Z" fill="{fc}" stroke="{tr}" stroke-width="2"/>'
             f'<circle cx="62" cy="54" r="14" fill="none" stroke="{tr}" stroke-width="3"/><circle cx="62" cy="54" r="5" fill="{tr}"/>')
    elif p == 'fishingRod':
        s = '<path d="M30 300 L64 30" stroke="#6a4a2a" stroke-width="5"/><path d="M64 30 Q74 80 70 150" stroke="#ddd" stroke-width="1" fill="none"/>'
    if s and c['propSide'] == 'left':
        s = f'<g transform="{MIRROR}">{s}</g>'
    return s


def front_prop(pen, c):
    p, tr = c['prop'], c['trim']
    s = ''
    if p == 'featherFan':
        rays = ''.join(f'<path d="M0 -4 L{num(math.sin(math.radians(a)) * 30)} {num(-math.cos(math.radians(a)) * 76)}"/>'
                       for a in (-60, -40, -20, 0, 20, 40, 60))
        s = (f'<g transform="translate(190 266) rotate(-14) scale(.84)"><path d="M0 0 C-32 -20 -36 -72 0 -88 C36 -72 32 -20 0 0 Z" '
             f'fill="#f6f3ec" stroke="#c8c0b0" stroke-width="2"/><g stroke="#cfc6b4" stroke-width="1.2">{rays}</g>'
             f'<path d="M-20 -60 C-10 -70 10 -70 20 -60" stroke="#8a8a8a" stroke-width="1" fill="none"/>'
             f'<rect x="-4" y="0" width="8" height="40" rx="3" fill="#6a3a1a"/><circle cy="2" r="5" fill="{tr}"/></g>')
    elif p == 'scroll':
        s = (f'<g transform="translate(158 238) rotate(-12)"><rect width="60" height="20" rx="4" fill="#efe2bf" stroke="#b89a5a" stroke-width="2"/>'
             f'<rect x="-6" y="-3" width="8" height="26" rx="3" fill="#7a4a2a"/><rect x="58" y="-3" width="8" height="26" rx="3" fill="#7a4a2a"/>'
             f'<path d="M8 7 h40 M8 13 h30" stroke="#8a6a3a" stroke-width="1.5"/><path d="M30 20 q2 10 -4 16" stroke="{tr}" stroke-width="2" fill="none"/></g>')
    elif p == 'book':      # 竹簡
        slats = ''.join(f'<rect x="{i * 7}" width="6" height="42" rx="1" fill="#dcc48e" stroke="#9a7a3a" stroke-width=".8"/>' for i in range(7))
        s = (f'<g transform="translate(166 232) rotate(-14)">{slats}'
             f'<path d="M-1 9 H50 M-1 33 H50" stroke="#8a2a1a" stroke-width="1.6"/>'
             f'<path d="M3 14 v12 M10 16 v8 M17 14 v14 M24 15 v10 M31 14 v12" stroke="#4a3a2a" stroke-width="1.2"/>'
             f'<ellipse cx="54" cy="21" rx="8" ry="21" fill="#c8ac74" stroke="#9a7a3a"/></g>')
    elif p == 'sword':
        s = (f'<g transform="translate(184 300) rotate(-14)"><path d="M-3.5 -24 V-118 L0 -128 L3.5 -118 V-24 Z" fill="#d6dde3" stroke="#8a96a0"/>'
             f'<path d="M0 -122 V-26" stroke="#9aa6b0"/><rect x="-14" y="-26" width="28" height="7" rx="3" fill="{tr}"/>'
             f'<rect x="-3" y="-20" width="6" height="22" fill="#4a2a1a"/><circle cy="4" r="4" fill="{tr}"/></g>')
    elif p == 'saber':     # 環首刀
        s = (f'<g transform="translate(184 300) rotate(-12)"><path d="M-4 -24 V-118 Q-2 -130 5 -132 Q3 -120 4 -110 V-24 Z" fill="#d6dde3" stroke="#7a8a96"/>'
             f'<rect x="-9" y="-26" width="18" height="5" rx="2" fill="{tr}"/><rect x="-3" y="-21" width="6" height="20" fill="#3a2a1a"/>'
             f'<circle cy="6" r="6" fill="none" stroke="{tr}" stroke-width="2.5"/></g>')
    elif p == 'mace':
        s = (f'<g transform="translate(190 300) rotate(-16)"><rect x="-4" y="-110" width="8" height="110" fill="#5a5a60"/>'
             f'<rect x="-10" y="-146" width="20" height="40" rx="4" fill="#9aa0a8" stroke="#5a5a60" stroke-width="2"/>'
             f'<path d="M-10 -136 h20 M-10 -126 h20 M-10 -116 h20" stroke="#5a5a60" stroke-width="1.5"/></g>')
    elif p == 'whip':      # 鐵鞭
        segs = ''.join(f'<rect x="-5" y="{-30 - i * 16}" width="10" height="14" rx="3" fill="#8a9098" stroke="#4a4e56"/>' for i in range(7))
        s = (f'<g transform="translate(186 300) rotate(-16)">{segs}<rect x="-12" y="-28" width="24" height="5" rx="2" fill="{tr}"/>'
             f'<rect x="-3" y="-24" width="6" height="22" fill="#3a2a1a"/></g>')
    elif p == 'flower':
        petals = ''.join(
            f'<ellipse cx="{num(math.cos(math.radians(a)) * 9)}" cy="{num(math.sin(math.radians(a)) * 9)}" rx="9" ry="6" '
            f'transform="rotate({a} {num(math.cos(math.radians(a)) * 9)} {num(math.sin(math.radians(a)) * 9)})" fill="{c["flower"]}" '
            f'stroke="#d48aa0" stroke-width="1"/>' for a in (0, 72, 144, 216, 288))
        s = f'<g transform="translate(182 238)">{petals}<circle r="5" fill="#f4c430"/><path d="M0 12 q-6 20 -16 40" stroke="#3a7a3a" stroke-width="3" fill="none"/></g>'
    elif p == 'peony':
        fl = c['flower']
        s = (f'<g transform="translate(180 236)"><path d="M-14 12 q-10 10 -4 22 M10 14 q8 10 4 22" stroke="#3a7a3a" stroke-width="5" fill="none"/>'
             f'<circle r="18" fill="{fl}"/><circle r="12" fill="{shade(fl, .25)}"/><circle r="5" fill="{shade(fl, .5)}"/>'
             f'<path d="M-12 -6 q6 -8 12 -2 q6 -8 12 2" stroke="{shade(fl, -.25)}" stroke-width="1.5" fill="none"/></g>')
    elif p == 'fanRound':  # 團扇
        s = (f'<g transform="translate(178 224)"><rect x="-3" y="24" width="6" height="36" fill="#6a3a1a"/><circle r="26" fill="#f4ecd8" stroke="{tr}" stroke-width="3"/>'
             f'<path d="M-14 6 q8 -18 16 -4 q8 -14 14 2" stroke="#7a9a6a" stroke-width="2" fill="none"/>'
             f'<circle cx="8" cy="-8" r="5" fill="#e88a8a" opacity=".8"/><path d="M0 60 q-4 10 2 16" stroke="#d84a5a" stroke-width="2" fill="none"/></g>')
    elif p == 'pipa':
        s = (f'<g transform="translate(172 232) rotate(-24)"><ellipse cy="18" rx="24" ry="30" fill="#b06a2a" stroke="#6a3a1a" stroke-width="2"/>'
             f'<rect x="-4" y="-46" width="8" height="40" fill="#8a4a1a"/><circle cy="22" r="6" fill="#3a1a0a"/>'
             f'<path d="M-2 -40 v66 M2 -40 v66" stroke="#f0e0c0" stroke-width=".8"/></g>')
    elif p == 'qin':       # 古琴
        strings = ''.join(f'<path d="M-88 {y} L88 {y - 2}" stroke="#f0e2c0" stroke-width=".8"/>' for y in (-6, -3, 0, 3, 6))
        hui = ''.join(f'<circle cx="{x}" cy="-11" r="1.4" fill="#f4ecd0"/>' for x in range(-70, 71, 14))
        s = (f'<g transform="translate(120 282) rotate(-5)"><path d="M-98 -10 Q0 -20 98 -12 L98 10 Q0 4 -98 10 Z" fill="#5a2e14" stroke="#2a1408" stroke-width="2"/>'
             f'{strings}{hui}<rect x="70" y="-12" width="5" height="22" fill="#2a1408"/><path d="M98 -4 q8 4 4 18" stroke="{tr}" stroke-width="2" fill="none"/></g>')
    elif p == 'ribbon':
        rb = c['ribbon'] or '#f7b7d0'
        s = f'<path d="M150 300 C170 250 230 260 214 210 C204 180 236 170 240 150" stroke="{rb}" stroke-width="7" fill="none" opacity=".9"/>'
    elif p == 'drum':
        s = (f'<g transform="translate(184 254)"><path d="M-30 -32 L-6 -6" stroke="#6a3a1a" stroke-width="4"/><circle cx="-31" cy="-33" r="4" fill="#c0392b"/>'
             f'<ellipse rx="27" ry="21" fill="#a8323a" stroke="{tr}" stroke-width="3"/><ellipse rx="21" ry="15" fill="#e8d8b0"/>'
             f'<circle r="5" fill="none" stroke="#a8323a" stroke-width="1.5"/></g>')
    elif p == 'brush':
        s = '<g transform="translate(184 236) rotate(-30)"><rect x="-3" y="-44" width="6" height="52" fill="#6a3a1a"/><path d="M-4 8 Q0 26 4 8 Z" fill="#1a1a1a"/></g>'
    elif p == 'cup':
        s = ('<g transform="translate(180 242)"><path d="M-16 -10 h32 l-5 22 h-22 Z" fill="#c8a24a" stroke="#7a5a1a" stroke-width="2"/>'
             '<path d="M-16 -10 q-8 0 -8 -6 M16 -10 q8 0 8 -6" stroke="#7a5a1a" stroke-width="2" fill="none"/>'
             '<rect x="-3" y="12" width="6" height="8" fill="#c8a24a"/><rect x="-10" y="20" width="20" height="4" rx="2" fill="#c8a24a"/></g>')
    elif p == 'flute':
        holes = ''.join(f'<circle cx="{x}" cy="0" r="1.6" fill="#3a2a1a"/>' for x in (-20, -10, 0, 10, 20))
        s = f'<g transform="translate(176 250) rotate(-36)"><rect x="-46" y="-4" width="92" height="8" rx="3" fill="#7a9a4a" stroke="#4a6a2a"/>{holes}<path d="M-46 0 q-6 14 0 26" stroke="#c0392b" stroke-width="2" fill="none"/></g>'
    elif p == 'gourd':
        s = ('<g transform="translate(184 246) rotate(-10)"><circle cy="-14" r="9" fill="#d8a83a" stroke="#8a6a1a" stroke-width="1.5"/>'
             '<circle cy="8" r="15" fill="#d8a83a" stroke="#8a6a1a" stroke-width="1.5"/><rect x="-3" y="-28" width="6" height="7" fill="#6a3a1a"/>'
             '<path d="M-7 -6 q7 4 14 0" stroke="#c0392b" stroke-width="2.5" fill="none"/><path d="M6 -4 q8 14 2 26" stroke="#c0392b" stroke-width="1.5" fill="none"/></g>')
    elif p == 'whisk':     # 拂塵
        strands = ''.join(f'<path d="M0 0 Q{d} 30 {d * 2} 64"/>' for d in (-6, -3, 0, 3, 6, 8))
        s = (f'<g transform="translate(182 214) rotate(-18)"><rect x="-3" y="-40" width="6" height="42" rx="2" fill="#6a3a1a"/>'
             f'<circle cy="-42" r="4" fill="{tr}"/><g stroke="#f4f2ea" stroke-width="2.4" fill="none">{strands}</g></g>')
    elif p == 'hoop':      # 繡繃
        s = (f'<g transform="translate(180 246)"><circle r="22" fill="#f6efe0"/>'
             f'<path d="M-8 6 q4 -12 10 -4 q6 -10 10 2" stroke="#d84a5a" stroke-width="2.4" fill="none"/>'
             f'<circle cx="-2" cy="-6" r="4" fill="#e88aa0"/><circle cx="8" cy="-10" r="3" fill="#f4c430"/>'
             f'<path d="M-12 10 q10 4 18 -2" stroke="#3a8a5a" stroke-width="2" fill="none"/>'
             f'<circle r="22" fill="none" stroke="#b8864a" stroke-width="4"/><path d="M14 -24 L26 -40" stroke="#ccc" stroke-width="1.5"/>'
             f'<path d="M26 -40 q8 10 -6 18" stroke="#d84a5a" stroke-width="1" fill="none"/></g>')
    elif p == 'fishBasket':
        s = ('<g transform="translate(182 250)"><path d="M-22 -12 Q-24 26 -10 28 L10 28 Q24 26 22 -12 Z" fill="#b89a5a" stroke="#6a5a2a" stroke-width="2"/>'
             '<path d="M-20 0 H20 M-20 12 H20 M-12 -12 V28 M0 -12 V28 M12 -12 V28" stroke="#7a6a3a" stroke-width="1.2"/>'
             '<ellipse cy="-12" rx="22" ry="5" fill="#8a6a3a"/><path d="M-4 -14 Q4 -34 14 -36 L10 -28 L18 -26 Z" fill="#9ab0c0" stroke="#5a7080"/></g>')
    elif p == 'gear':      # 機關木輪
        s = (f'<g transform="translate(182 248)"><circle r="16" fill="none" stroke="#a8743a" stroke-width="9" stroke-dasharray="5 4.2"/>'
             f'<circle r="14" fill="#c8945a" stroke="#6a3a1a" stroke-width="1.5"/><circle r="5" fill="{tr}"/>'
             f'<path d="M0 -14 V14 M-14 0 H14" stroke="#6a3a1a" stroke-width="2"/>'
             f'<circle cx="-20" cy="-28" r="8" fill="none" stroke="#a8743a" stroke-width="5" stroke-dasharray="3 3"/><circle cx="-20" cy="-28" r="3" fill="#6a3a1a"/></g>')
    if s and c['propSide'] == 'left':
        s = f'<g transform="{MIRROR}">{s}</g>'
    return s


# ---------------------------------------------------------------- 身體與服裝
def shoulders(c, female):
    if c['build'] == 'burly':
        return 'M0 300 C4 236 60 210 120 207 C180 210 236 236 240 300 Z'
    if female:
        return 'M28 300 C34 252 72 228 120 224 C168 228 206 252 212 300 Z'
    return 'M12 300 C18 244 66 218 120 214 C174 218 222 244 228 300 Z'


def cloak_back(c, female):
    if not c['cloak']:
        return ''
    k = c['cloak']
    if female:
        d = 'M14 300 C14 262 50 230 120 224 C190 230 226 262 226 300 Z'
    else:
        d = 'M-4 300 C-2 250 46 214 120 208 C194 214 242 250 244 300 Z'
    return f'<path d="{d}" fill="{shade(k, -.3)}"/>'


def cloak_front(c, female):
    k = c['cloak']
    if not k:
        return ''
    if female:
        left = 'M28 300 C32 256 62 232 96 228 C84 250 78 276 82 300 Z'
    elif c['build'] == 'burly':
        left = 'M0 300 C4 240 50 214 92 210 C80 240 74 270 78 300 Z'
    else:
        left = 'M12 300 C16 250 54 222 92 216 C80 242 74 272 78 300 Z'
    fold = '<path d="M40 300 C40 274 52 252 70 236" stroke="#000" stroke-opacity=".2" stroke-width="3" fill="none"/>'
    return sym(f'<path d="{left}" fill="{k}"/>{fold}') + \
        f'<circle cx="96" cy="228" r="5" fill="{c["trim"]}"/><circle cx="144" cy="228" r="5" fill="{c["trim"]}"/>'


def lamellar_pattern(pen, plate, lace):
    pid = pen.id('pl')
    return pid, (f'<defs><pattern id="{pid}" width="9" height="11" patternUnits="userSpaceOnUse">'
                 f'<rect width="9" height="11" fill="{shade(plate, -.35)}"/>'
                 f'<rect x=".6" y=".5" width="7.8" height="9.6" rx="1.6" fill="{plate}"/>'
                 f'<path d="M0 10.2 H9" stroke="{lace}" stroke-width="1.8"/><circle cx="4.5" cy="3" r=".8" fill="{shade(plate, -.4)}"/>'
                 f'</pattern></defs>')


def scale_pattern(pen, plate, line):
    pid = pen.id('sc')
    return pid, (f'<defs><pattern id="{pid}" width="14" height="10" patternUnits="userSpaceOnUse">'
                 f'<rect width="14" height="10" fill="{plate}"/>'
                 f'<path d="M0 10 Q7 -2 14 10" fill="none" stroke="{line}" stroke-width="1.4"/></pattern></defs>')


def body(pen, c, female):
    g = pen.id('rb')
    m, tr = c['main'], c['trim']
    o = c['outfit']
    s = (f'<defs><linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{shade(m, .12)}"/>'
         f'<stop offset="1" stop-color="{shade(m, -.38)}"/></linearGradient></defs>')
    sh = shoulders(c, female)
    burly = c['build'] == 'burly'
    if o == 'brawler':
        sk = SKIN.get(c['skin'], c['skin'])
        s += f'<path d="{sh}" fill="{shade(sk, -.1)}"/>'
        s += (f'<path d="M78 262 Q98 276 117 264 M123 264 Q142 276 162 262" stroke="{shade(sk, -.4)}" stroke-width="2.4" fill="none"/>'
              f'<path d="M120 236 V300 M104 286 q-6 8 -4 14 M136 286 q6 8 4 14" stroke="{shade(sk, -.35)}" stroke-width="1.6" fill="none"/>')
        vest = 'M0 300 C4 236 60 210 92 208 C82 230 76 264 84 300 Z' if burly else 'M12 300 C18 244 66 218 94 215 C84 236 78 266 84 300 Z'
        s += sym(f'<path d="{vest}" fill="url(#{g})"/><path d="{vest}" fill="none" stroke="{tr}" stroke-width="3"/>')
        s += f'<path d="M56 228 L176 300" stroke="#5a3a1e" stroke-width="9"/><path d="M56 228 L176 300" stroke="{tr}" stroke-width="2" stroke-dasharray="3 9"/>'
        s += f'<rect x="56" y="290" width="128" height="10" fill="#4a2a14"/><rect x="110" y="288" width="20" height="12" rx="2" fill="{tr}"/>'
        return s
    s += f'<path d="{sh}" fill="url(#{g})"/>'
    if o in ('armor', 'armorWhite', 'armorLady', 'robeArmor'):
        lady = o == 'armorLady'
        white = o == 'armorWhite'
        plate = c['plate'] or ('#eef1f4' if white else shade(m, -.12))
        lace = c['lace'] or (shade(tr, -.15) if not white else '#7a96c0')
        if o == 'robeArmor':
            s += f'<path d="M92 222 L120 278 L128 266 L104 222 Z" fill="{tr}"/><path d="M148 222 L120 278 L112 266 L136 222 Z" fill="{shade(tr, -.08)}"/>'
        s += cloak_front(c, female)
        if o == 'robeArmor':
            chest = 'M70 300 L76 270 Q120 262 164 270 L170 300 Z'
        elif lady:
            chest = 'M74 300 L82 244 Q120 232 158 244 L166 300 Z'
        elif burly:
            chest = 'M58 300 L68 236 Q120 222 172 236 L182 300 Z'
        else:
            chest = 'M64 300 L74 240 Q120 228 166 240 L176 300 Z'
        if c['armor'] == 'scale':
            pid, d = scale_pattern(pen, plate, shade(plate, -.4) if white else shade(tr, -.25))
        else:
            pid, d = lamellar_pattern(pen, plate, lace)
        s += d + f'<path d="{chest}" fill="url(#{pid})" stroke="{shade(plate, -.45)}" stroke-width="2"/>'
        if o != 'robeArmor':
            # 領巾
            if c['scarf']:
                s += f'<path d="M96 222 Q120 238 144 222 L148 232 Q120 250 92 232 Z" fill="{c["scarf"]}"/>'
            cy = 268 if lady else 266
            r = 12 if lady else 15
            s += (f'<circle cx="120" cy="{cy}" r="{r}" fill="{tr}" stroke="{shade(tr, -.4)}" stroke-width="2.5"/>'
                  f'<circle cx="120" cy="{cy}" r="{r * .55:.1f}" fill="{shade(tr, .4)}"/>')
        else:
            s += f'<path d="M86 228 L120 286 L154 228" fill="none" stroke="{tr}" stroke-width="4"/>'
        # 肩甲
        if c['armor'] == 'scale':
            x, cy, rx, ry, r = (56, 250, 22, 16, 6) if lady else (44, 244, 32 if burly else 30, 22, 9)
            if burly:
                x = 36
            pa = (f'<ellipse cx="{x}" cy="{cy + 2}" rx="{rx}" ry="{ry}" fill="{shade(plate, -.1)}" stroke="{tr}" stroke-width="3"/>'
                  f'<circle cx="{x}" cy="{cy}" r="{r}" fill="{tr}" stroke="{shade(tr, -.45)}" stroke-width="1.5"/>'
                  f'<circle cx="{x}" cy="{cy}" r="{r * .45:.1f}" fill="{shade(tr, .45)}"/>'
                  f'<circle cx="{x - 14}" cy="{cy + 6}" r="2.4" fill="{tr}"/><circle cx="{x + 14}" cy="{cy + 6}" r="2.4" fill="{tr}"/>')
        else:
            x0, y0, rx = (56, 240, 22) if lady else ((36, 230, 32) if burly else (44, 234, 30))
            if o == 'robeArmor':
                y0 += 4
            pa = ''
            for i in range(3):
                pa += (f'<path d="M{x0 - rx + i * 2} {y0 + i * 10} Q{x0} {y0 - 16 + i * 10} {x0 + rx - i * 2} {y0 + i * 10} '
                       f'L{x0 + rx - i * 2 - 2} {y0 + 12 + i * 10} Q{x0} {y0 - 2 + i * 10} {x0 - rx + i * 2 + 2} {y0 + 12 + i * 10} Z" '
                       f'fill="{shade(plate, -.08 * i)}" stroke="{lace}" stroke-width="2"/>')
        s += sym(pa)
        s += f'<rect x="{78 if lady else 66}" y="292" width="{84 if lady else 108}" height="8" fill="{shade(tr, -.3)}"/>'
        s += f'<path d="M112 290 h16 l-3 10 h-10 Z" fill="{tr}"/>'
        return s
    # 交領袍服
    rich, sage, cloak = o == 'robeRich', o == 'robeSage', o == 'cloak'
    inner = c['lace'] or tr
    s += f'<path d="M92 222 L120 278 L128 266 L104 222 Z" fill="{inner}"/><path d="M148 222 L120 278 L112 266 L136 222 Z" fill="{shade(inner, -.08)}"/>'
    s += f'<path d="M96 224 L120 270 L144 224" fill="none" stroke="{shade(m, -.45)}" stroke-width="2"/>'
    # 外領緣
    s += f'<path d="M88 220 L120 284 L152 220" fill="none" stroke="{tr}" stroke-width="5" stroke-opacity=".9"/>'
    if rich:
        s += f'<g fill="none" stroke="{tr}" stroke-width="2" opacity=".85">'
        pts = ((70, 262), (170, 262), (88, 290), (152, 290)) if female else ((62, 262), (178, 262), (84, 290), (156, 290))
        for x, y in pts:
            s += f'<circle cx="{x}" cy="{y}" r="8"/><circle cx="{x}" cy="{y}" r="3" fill="{tr}"/>'
        s += '</g>'
    if sage:
        s += sym(f'<path d="M40 300 C60 256 90 236 104 226" stroke="{tr}" stroke-width="6" fill="none" opacity=".55"/>')
    if cloak:
        x0 = 28 if female else 12
        s += (f'<path d="M{x0} 300 C{x0 + 4} 250 {x0 + 32 if female else 50} 228 100 220 L120 236 L140 220 '
              f'C{240 - x0 - 32 if female else 190} 228 {240 - x0 - 4} 250 {240 - x0} 300 Z" fill="{shade(m, -.05)}" opacity=".92"/>'
              f'<path d="M100 222 Q120 246 140 222" fill="none" stroke="{c["fur"]}" stroke-width="7" stroke-linecap="round" opacity=".92"/>')
    if o == 'furCoat':
        fur = c['fur']
        pts = [bez((84, 222), (96, 240), (144, 240), (156, 222), t / 8) for t in range(9)]
        s += ''.join(f'<circle cx="{num(x)}" cy="{num(y)}" r="9" fill="{fur}"/>' for x, y in pts)
        s += ''.join(f'<circle cx="{num(x)}" cy="{num(y + 2)}" r="4" fill="{shade(fur, -.12)}"/>' for x, y in pts[::2])
    if o == 'hanfu':
        sl = c['ribbon'] or shade(tr, -.05)
        s += sym(f'<path d="M40 300 C42 262 62 238 96 230" stroke="{sl}" stroke-width="9" fill="none" opacity=".7" stroke-linecap="round"/>')
    s += cloak_front(c, female)
    s += f'<rect x="{72 if female else 60}" y="290" width="{96 if female else 120}" height="10" fill="{shade(tr, -.2)}"/>'
    return s


# ---------------------------------------------------------------- 頭部
FACES = {
    'oval': 'M76 116 C76 82 96 68 120 68 C144 68 164 82 164 116 C164 150 152 176 120 186 C88 176 76 150 76 116 Z',
    'square': 'M75 116 C75 80 96 67 120 67 C144 67 165 80 165 116 C165 150 161 170 144 180 Q120 192 96 180 C79 170 75 150 75 116 Z',
    'long': 'M78 114 C78 78 98 64 120 64 C142 64 162 78 162 114 C162 154 150 180 120 191 C90 180 78 154 78 114 Z',
    'round': 'M74 118 C74 82 96 68 120 68 C144 68 166 82 166 118 C166 156 150 180 120 185 C90 180 74 156 74 118 Z',
    'fem': 'M78 118 C78 84 98 70 120 70 C142 70 162 84 162 118 C162 150 146 176 120 184 C94 176 78 150 78 118 Z',
    'femSlim': 'M80 118 C80 85 99 71 120 71 C141 71 160 85 160 118 C160 149 145 173 120 181 C95 173 80 149 80 118 Z',
    'femRound': 'M77 118 C77 84 98 70 120 70 C142 70 163 84 163 118 C163 152 148 174 120 181 C92 174 77 152 77 118 Z',
}
FACE_LEFT = {'oval': 76, 'square': 75, 'long': 78, 'round': 74, 'fem': 78, 'femSlim': 80, 'femRound': 77}

BROWS = {   # 左眉（內端靠近 x=114），右眉以鏡像畫出
    'sword': 'M86 105 Q100 107 114 112 L113 117 Q100 112 87 110 Z',
    'thick': 'M83 103 Q100 105 116 112 L114 120 Q100 114 84 111 Z',
    'straight': 'M88 109 Q100 106 113 108 L113 112 Q100 110 88 112 Z',
    'willow': 'M89 110 Q101 103 114 108 Q101 106 89 111 Z',
    'arched': 'M88 111 Q100 100 114 106 Q100 103 88 112 Z',
    'white': 'M84 110 Q98 101 114 106 L113 111 Q100 107 88 113 Q83 118 80 124 Z',
    'knit': 'M87 110 Q100 108 114 103 L114 107 Q100 112 87 113 Z',
    'thin': 'M89 109 Q100 105 113 108 L113 110 Q100 108 89 111 Z',
}
EYES = {   # 內眼角 y、上緣控制點、外眼角 y、下緣控制點
    'calm': (125, 118, 125, 130), 'phoenix': (126, 116.5, 121, 128), 'fierce': (124.5, 115.5, 121.5, 129),
    'round': (124, 113, 124, 134), 'gentle': (125, 117, 124.5, 131), 'narrow': (125, 120.5, 123.5, 128),
    'old': (125, 119, 126, 129), 'wide': (124, 113.5, 123, 133),
}


def eye(pen, c, cx, d, female):
    yi, yt, yo, yb = EYES[c['eye']]
    xi, xo = cx - d * 11, cx + d * 11
    shape = f'M{xi} {yi} Q{cx} {yt} {xo} {yo} Q{cx} {yb} {xi} {yi} Z'
    cid = pen.id('e')
    px = cx + c['gaze'] * 2.2
    pr = 5 if c['eye'] in ('round', 'wide') else 4.6
    py = (yi + yo) / 4 + (yt + yb) / 4
    s = (f'<clipPath id="{cid}"><path d="{shape}"/></clipPath><path d="{shape}" fill="#fffaf2"/>'
         f'<g clip-path="url(#{cid})"><circle cx="{num(px)}" cy="{num(py)}" r="{pr}" fill="{c["eyeColor"]}"/>'
         f'<circle cx="{num(px)}" cy="{num(py)}" r="2.2" fill="#000"/><circle cx="{num(px + 1.6)}" cy="{num(py - 1.7)}" r="1.4" fill="#fff"/></g>')
    s += f'<path d="M{xi} {yi} Q{cx} {yt} {xo} {yo}" fill="none" stroke="{INK}" stroke-width="{2.6 if female else 2.3}" stroke-linecap="round"/>'
    s += f'<path d="M{xi} {yi} Q{cx} {yb} {xo} {yo}" fill="none" stroke="{INK}" stroke-width=".9" stroke-opacity=".55"/>'
    if c['eye'] in ('fierce', 'phoenix') and not female:
        s += f'<path d="M{xi + d * 2} {yi - 4} Q{cx} {yt - 4} {xo + d} {yo - 4}" fill="none" stroke="{INK}" stroke-width="1" stroke-opacity=".45"/>'
    if female:
        s += f'<path d="M{xo - d * 1} {yo - 1} l{d * 5} -3.5" stroke="{INK}" stroke-width="1.6" stroke-linecap="round"/>'
    if c['age'] == 'old' or c['eye'] == 'old':
        s += f'<path d="M{xi + d * 3} {yi + 6} Q{cx} {yb + 4} {xo - d * 2} {yo + 5}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1"/>'
    return s


def face_parts(pen, c, female, skin):
    s = ''
    hc = c['hairColor'] or (('#d8d8d8' if c['age'] == 'old' else HAIR))
    bc = '#e8e8e8' if c['brow'] == 'white' else (c['beardColor'] if c['age'] == 'old' and c['beardColor'] else hc)
    s += sym(f'<path d="{BROWS[c["brow"]]}" fill="{bc}"/>')
    if 'eyepatch' in c['acc']:
        s += eye(pen, c, 140, 1, female)
        s += ('<path d="M87 117 Q100 112 113 117 L111 132 Q100 137 89 132 Z" fill="#141414"/>'
              '<path d="M88 118 L74 104 M112 116 L164 94" stroke="#141414" stroke-width="2.5"/>')
    else:
        s += eye(pen, c, 100, -1, female) + eye(pen, c, 140, 1, female)
    dk = shade(skin, -.35)
    # 鼻
    if female:
        s += f'<path d="M121 136 Q119 146 115 150 Q120 153 125 150" fill="none" stroke="{dk}" stroke-width="1.6" stroke-linecap="round"/>'
    elif c['nose'] == 'broad':
        s += (f'<path d="M118 128 Q116 144 109 149 Q112 155 120 153 Q128 155 131 149 Q124 144 122 128" fill="none" stroke="{dk}" stroke-width="1.8" stroke-linecap="round"/>'
              f'<ellipse cx="120" cy="146" rx="5" ry="3" fill="#fff" opacity=".12"/>')
    elif c['nose'] == 'hook':
        s += f'<path d="M119 126 Q126 142 118 151 Q122 154 127 150" fill="none" stroke="{dk}" stroke-width="1.8" stroke-linecap="round"/>'
    else:
        s += f'<path d="M120 128 Q117 146 114 150 Q120 154 126 150" fill="none" stroke="{dk}" stroke-width="1.8" stroke-linecap="round"/>'
    # 腮紅
    if female:
        s += '<ellipse cx="95" cy="146" rx="10" ry="6" fill="#ff7a8a" opacity=".28"/><ellipse cx="145" cy="146" rx="10" ry="6" fill="#ff7a8a" opacity=".28"/>'
    elif c['skin'] not in ('red', 'dark', 'bronze'):
        s += '<ellipse cx="94" cy="148" rx="9" ry="5" fill="#d07060" opacity=".15"/><ellipse cx="146" cy="148" rx="9" ry="5" fill="#d07060" opacity=".15"/>'
    # 嘴
    mo = c['mouth']
    if female:
        lp = c['lip']
        if mo == 'smile':
            s += f'<path d="M109 162 Q115 160 120 162 Q125 160 131 162 Q120 172 109 162 Z" fill="{lp}"/><path d="M109 162 Q120 167 131 162" stroke="{shade(lp, -.4)}" stroke-width="1" fill="none"/>'
        else:
            s += f'<path d="M110 163 Q115 159 120 161 Q125 159 130 163 Q120 170 110 163 Z" fill="{lp}"/><path d="M110 163 Q120 165 130 163" stroke="{shade(lp, -.4)}" stroke-width="1" fill="none"/>'
    else:
        ml = '#6a2a20'
        mouths = {
            'neutral': 'M108 164 Q120 168 132 164', 'smile': 'M107 162 Q120 172 133 162',
            'frown': 'M108 168 Q120 161 132 168', 'stern': 'M110 165 L130 165', 'smirk': 'M108 165 Q122 168 133 160',
        }
        if mo == 'shout':
            s += ('<path d="M105 161 Q120 158 135 161 Q132 179 120 180 Q108 179 105 161 Z" fill="#4a1410"/>'
                  '<path d="M107 162 Q120 160 133 162 L132 166 Q120 164 108 166 Z" fill="#f4efe6"/>')
        else:
            s += f'<path d="{mouths.get(mo, mouths["neutral"])}" fill="none" stroke="{ml}" stroke-width="2.4" stroke-linecap="round"/>'
    # 年長皺紋
    if c['age'] == 'old':
        s += sym(f'<path d="M107 145 Q100 154 103 164" fill="none" stroke="{dk}" stroke-width="1.3" stroke-opacity=".7"/>'
                 f'<path d="M84 122 l-5 -2 M84 127 l-5 1" stroke="{dk}" stroke-width="1" stroke-opacity=".7"/>')
        s += f'<path d="M102 93 Q120 89 138 93 M106 99 Q120 96 134 99" fill="none" stroke="{dk}" stroke-width="1" stroke-opacity=".5"/>'
    elif c['age'] == 'mid' and not female:
        s += sym(f'<path d="M108 146 Q103 153 105 160" fill="none" stroke="{dk}" stroke-width="1.1" stroke-opacity=".45"/>')
    if 'scar' in c['acc']:
        s += f'<path d="M146 128 L156 152 M147 136 l6 -2 M150 144 l6 -2" stroke="{shade(skin, -.45)}" stroke-width="1.8" stroke-linecap="round"/>'
    if female and c['mark']:
        s += f'<path d="M120 93 C114 99 116 105 120 107 C124 105 126 99 120 93 Z" fill="{c["mark"]}"/><circle cx="120" cy="101" r="1.5" fill="#ffe8a0"/>'
    if c['skin'] == 'red':
        s += '<path d="M96 98 q24 -8 48 0" stroke="#7a2414" stroke-width="1.5" fill="none" opacity=".6"/>'
    return s


def beard(c):
    b = c['beard']
    if b == 'none':
        return ''
    col = c['beardColor'] or c['hairColor'] or ('#e4e4e4' if c['age'] == 'old' else HAIR)
    line = shade(col, -.3) if col != HAIR else '#3a2a20'
    must = f'<path d="M104 157 Q120 150 136 157 Q128 161 120 159 Q112 161 104 157 Z" fill="{col}"/>'
    if b == 'long':
        return (must + f'<path d="M98 162 Q94 226 120 262 Q146 226 142 162 Q132 176 120 176 Q108 176 98 162 Z" fill="{col}"/>'
                f'<path d="M110 178 Q112 218 120 250 M130 178 Q128 218 120 250 M120 180 V254" stroke="{line}" stroke-width="1.2" fill="none"/>'
                f'<path d="M104 157 Q96 162 94 172 M136 157 Q144 162 146 172" stroke="{col}" stroke-width="3" fill="none" stroke-linecap="round"/>')
    if b == 'full':
        return (f'<path d="M80 136 Q84 176 104 190 Q120 200 136 190 Q156 176 160 136 Q152 160 136 168 Q120 172 104 168 Q88 160 80 136 Z" fill="{col}"/>'
                f'<path d="M84 150 l-6 8 M90 166 l-6 8 M156 150 l6 8 M150 166 l6 8 M110 190 l-2 10 M130 190 l2 10 M120 194 v10" stroke="{col}" stroke-width="4" stroke-linecap="round"/>'
                + must)
    if b == 'tiger':   # 虎鬚
        pts = []
        for i in range(17):
            a = math.radians(-8 + i * 196 / 16)
            r = 64 if i % 2 == 0 else 52
            pts.append(f'{num(120 + math.cos(a) * r * .92)} {num(132 + math.sin(a) * r)}')
        outer = 'M' + ' L'.join(pts)
        return (f'<path d="{outer} L78 134 Q86 164 104 170 Q120 176 136 170 Q154 164 162 134 Z" fill="{col}"/>'
                f'<path d="M100 158 Q120 148 140 158 L150 152 L140 162 Q120 158 100 162 L90 152 Z" fill="{col}"/>')
    if b == 'goatee':
        return (f'<path d="M106 156 Q120 151 134 156 Q130 160 120 159 Q110 160 106 156 Z" fill="{col}"/>'
                f'<path d="M112 172 Q120 202 128 172 Q120 178 112 172 Z" fill="{col}"/>')
    if b == 'mustache':
        return must + f'<path d="M114 173 Q120 182 126 173 Q120 176 114 173 Z" fill="{col}"/>'
    if b == 'thin':
        return (f'<path d="M106 160 Q112 154 120 156 Q128 154 134 160 Q128 158 120 159 Q112 158 106 160 Z" fill="{col}"/>'
                f'<path d="M107 159 Q103 162 102 168 M133 159 Q137 162 138 168" stroke="{col}" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
                f'<path d="M115 173 Q120 176 125 173 Q124 194 120 214 Q116 194 115 173 Z" fill="{col}"/>')
    if b == 'chinstrap':
        return (f'<path d="M78 132 Q82 174 120 188 Q158 174 162 132 L156 134 Q150 166 120 176 Q90 166 84 134 Z" fill="{col}"/>' + must)
    if b == 'stubble':
        return (f'<path d="M82 146 Q88 180 120 188 Q152 180 158 146 Q150 172 120 176 Q90 172 82 146 Z" fill="{col}" opacity=".3"/>'
                f'<path d="M104 157 Q120 151 136 157 Q120 162 104 157 Z" fill="{col}" opacity=".3"/>'
                f'<path d="M110 172 Q120 184 130 172 Q120 178 110 172 Z" fill="{col}" opacity=".3"/>')
    return ''


def head(pen, c, female):
    skin = SKIN.get(c['skin'], c['skin'])
    sk2 = shade(skin, -.16)
    g = pen.id('sk')
    face = c['face'] or ('fem' if female else 'oval')
    fl = FACE_LEFT[face]
    s = f'<defs><radialGradient id="{g}" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="{shade(skin, .1)}"/><stop offset="1" stop-color="{sk2}"/></radialGradient></defs>'
    # 耳
    turn = c['turn']
    big = 'bigEars' in c['acc']
    ry = 20 if big else 14
    for side, x in ((-1, fl - 1), (1, 241 - fl)):
        far = turn == side
        rx = 5 if far else 8
        ex = x - side * 2 if far else x
        s += f'<ellipse cx="{ex}" cy="{134 if big else 132}" rx="{rx}" ry="{ry}" fill="{sk2}"/>'
        if female and 'noEarrings' not in c['acc']:
            s += (f'<circle cx="{ex}" cy="148" r="3.2" fill="#e8c86a"/><path d="M{ex} 151 v10" stroke="#e8c86a" stroke-width="1.5"/>'
                  f'<circle cx="{ex}" cy="163" r="3" fill="#7ac0a0"/>')
    s += f'<path d="{FACES[face]}" fill="url(#{g})"/>'
    if turn:
        # 轉向側的陰影
        x = 120 + turn * 34
        s += f'<ellipse cx="{x}" cy="132" rx="14" ry="34" fill="#000" opacity=".07"/>'
    parts = face_parts(pen, c, female, skin) + beard(c)
    if turn:
        parts = f'<g transform="translate({turn * 3.5} 0)">{parts}</g>'
    return s + parts


def neck(c, female):
    skin = SKIN.get(c['skin'], c['skin'])
    sk2 = shade(skin, -.16)
    if c['build'] == 'burly':
        d = 'M98 172 L96 220 Q120 236 144 220 L142 172 Z'
    elif female:
        d = 'M106 174 L106 222 Q120 232 134 222 L134 174 Z'
    else:
        d = 'M104 176 L104 222 Q120 234 136 222 L136 176 Z'
    return f'<path d="{d}" fill="{sk2}"/><path d="M104 182 Q120 200 136 182 L136 196 Q120 208 104 196 Z" fill="#000" opacity=".14"/>'


# ---------------------------------------------------------------- 髮型與頭飾
def hair_cap(c, hc):
    return f'<path d="M74 118 C70 72 96 54 120 54 C144 54 170 72 166 118 C160 96 146 86 120 86 C94 86 80 96 74 118 Z" fill="{hc}"/>'


def topknot(hc, y=52):
    return f'<ellipse cx="120" cy="{y}" rx="15" ry="11" fill="{hc}"/>'


def helmet(pen, c, lady=False):
    metal, tr, crest, cc = c['helm'], c['trim'], c['crest'], c['crestColor']
    s = ''
    top = 46 if lady else 44
    if crest == 'pheasant':
        f = (f'<path d="M114 36 C96 -2 50 -4 14 22 C50 4 92 6 110 40 Z" fill="{cc}"/>'
             f'<path d="M112 36 C94 4 54 0 22 20" stroke="#4a2410" stroke-width="3" fill="none" stroke-dasharray="5 6"/>')
        s += sym(f)
    elif crest == 'wing':
        f = (f'<path d="M80 94 C58 86 42 64 42 36 C50 50 58 56 66 58 C58 48 58 38 62 28 C70 46 78 58 92 72 Z" fill="{cc}" stroke="{shade(cc, -.35)}" stroke-width="1.5"/>'
             f'<path d="M78 86 C64 76 54 60 48 46 M84 78 C74 66 68 52 64 38" stroke="{shade(cc, -.3)}" stroke-width="1.2" fill="none"/>')
        s += sym(f)
    elif crest == 'horn':
        s += sym(f'<path d="M82 70 C64 52 60 30 66 14 C72 40 86 52 98 58 Z" fill="{tr}" stroke="{shade(tr, -.4)}" stroke-width="1.5"/>')
    if lady:
        s += f'<path d="M76 108 C72 64 96 46 120 46 C144 46 168 64 164 108 C156 90 144 82 120 82 C96 82 84 90 76 108 Z" fill="{metal}" stroke="{tr}" stroke-width="3"/>'
    else:
        s += f'<path d="M70 120 C64 66 94 44 120 44 C146 44 176 66 170 120 L160 120 C158 92 144 80 120 80 C96 80 82 92 80 120 Z" fill="{metal}" stroke="{tr}" stroke-width="3"/>'
        s += f'<path d="M90 56 Q120 48 150 56" stroke="#fff" stroke-opacity=".25" stroke-width="4" fill="none"/>'
    if c['plates']:
        lines = ''.join(f'<path d="M120 {top + 2} Q{num((120 + x) / 2 + (x - 120) * .4)} {top + 8} {x} {80 if not lady else 82}"/>' for x in (90, 104, 136, 150))
        s += f'<g stroke="{shade(metal, -.4)}" stroke-width="1.3" fill="none">{lines}<path d="M120 {top + 2} V80"/></g>'
    s += f'<path d="M84 {86 if lady else 84} Q120 {72 if lady else 68} 156 {86 if lady else 84}" stroke="{tr}" stroke-width="5" fill="none"/>'
    if not lady:
        s += f'<path d="M112 82 L120 94 L128 82 Z" fill="{tr}"/>'
        s += sym(f'<path d="M72 120 C70 150 74 170 84 182 L88 128 Z" fill="{metal}" stroke="{tr}" stroke-width="2"/>'
                 f'<path d="M76 140 L86 142 M77 156 L85 158" stroke="{shade(metal, -.4)}" stroke-width="1.2"/>')
    if c['helmFur']:
        fur = c['fur']
        pts = [bez((80, 112), (82, 88), (98, 78), (120, 78), t / 5) for t in range(6)]
        fs = ''.join(f'<circle cx="{num(x)}" cy="{num(y)}" r="7.5" fill="{fur}"/>' for x, y in pts)
        fs += ''.join(f'<circle cx="{num(x + 1)}" cy="{num(y + 2)}" r="3.5" fill="{shade(fur, -.15)}"/>' for x, y in pts[::2])
        s += sym(fs)
    # 頂飾
    if crest == 'lion':
        s += (f'<circle cx="120" cy="62" r="17" fill="{tr}" stroke="{shade(tr, -.3)}" stroke-width="6" stroke-dasharray="3 2.4"/>'
              f'<circle cx="120" cy="62" r="11" fill="{shade(metal, -.05)}" stroke="{shade(tr, -.4)}" stroke-width="1.5"/>'
              f'<path d="M113 59 l4 1.5 M127 59 l-4 1.5" stroke="#1a1a1a" stroke-width="2.4" stroke-linecap="round"/>'
              f'<path d="M117 64 h6 l-3 3 Z" fill="#1a1a1a"/><path d="M114 69 Q120 73 126 69" stroke="#1a1a1a" stroke-width="1.5" fill="none"/>'
              f'<path d="M115 69 l1 3 M125 69 l-1 3" stroke="#fff" stroke-width="1.5"/>')
        s += f'<path d="M120 {top} V30" stroke="{tr}" stroke-width="4"/><path d="M120 34 C108 22 112 10 124 6 C120 14 128 22 122 34 Z" fill="{cc}"/>'
        return s
    stem_top = top - 18
    s += f'<path d="M120 {top} V{stem_top}" stroke="{tr}" stroke-width="5"/><circle cx="120" cy="{stem_top - 1}" r="6" fill="{tr}"/>'
    if crest == 'tassel':
        y = stem_top - 4
        s += (f'<path d="M120 {y} C104 {y - 4} 100 {y - 18} 106 {y - 24} C110 {y - 14} 116 {y - 10} 120 {y - 8} '
              f'C124 {y - 10} 130 {y - 14} 134 {y - 24} C140 {y - 18} 136 {y - 4} 120 {y} Z" fill="{cc}"/>'
              f'<path d="M120 {y - 2} V{y - 22}" stroke="{shade(cc, -.3)}" stroke-width="1.2"/>')
    elif crest == 'plume':
        y = stem_top - 4
        s += (f'<path d="M118 {y} C104 {y - 18} 112 {y - 30} 132 {y - 32} C150 {y - 32} 162 {y - 22} 168 {y - 8} '
              f'C152 {y - 20} 138 {y - 18} 130 {y - 10} C126 {y - 6} 124 {y - 2} 122 {y + 2} Z" fill="{cc}"/>'
              f'<path d="M120 {y - 2} C116 {y - 16} 124 {y - 26} 140 {y - 27} M124 {y - 4} C126 {y - 14} 140 {y - 20} 158 {y - 15}" '
              f'stroke="{shade(cc, -.3)}" stroke-width="1.2" fill="none"/>')
    return s


def hood(c, col, fur=False):
    s = f'<path d="M64 140 C58 66 92 40 120 40 C148 40 182 66 176 140 C172 110 160 84 120 84 C80 84 68 110 64 140 Z" fill="{col}"/>'
    if fur:
        pts = [bez((68, 132), (64, 82), (96, 64), (120, 64), t / 6) for t in range(7)]
        fs = ''.join(f'<circle cx="{num(x)}" cy="{num(y)}" r="8" fill="{c["fur"]}"/>' for x, y in pts)
        s += sym(fs)
    else:
        s += f'<path d="M70 126 C68 82 96 64 120 64 C144 64 172 82 170 126" stroke="#f8f4ee" stroke-width="12" fill="none" stroke-linecap="round"/>'
    return s


def straw_hat(c):
    rays = ''.join(f'<path d="M120 42 L{x} {96 + abs(x - 120) * -.06:.0f}"/>' for x in (44, 70, 96, 144, 170, 196))
    return ('<path d="M78 98 Q120 90 162 98 L162 108 Q120 100 78 108 Z" fill="#000" opacity=".22"/>'
            '<path d="M26 94 Q78 70 120 40 Q162 70 214 94 Q120 108 26 94 Z" fill="#c8a86a" stroke="#7a6030" stroke-width="2"/>'
            f'<g stroke="#9a7a40" stroke-width="1.2">{rays}</g><path d="M60 88 Q120 76 180 88" stroke="#9a7a40" stroke-width="1.2" fill="none"/>'
            f'<path d="M84 104 L98 180 M156 104 L142 180" stroke="{shade("#c8a86a", -.4)}" stroke-width="1.2" opacity=".7"/>')


def hair_back(pen, c, female):
    h = c['head']
    hc = c['hairColor'] or HAIR
    if female:
        if h in ('hood', 'furHood'):
            return ''
        if h == 'longHair':
            return (f'<path d="M70 106 C58 170 62 236 70 270 L170 270 C178 236 182 170 170 106 Z" fill="{hc}"/>'
                    f'<path d="M70 270 q8 10 18 2 q10 10 20 0 M132 270 q10 10 20 0 q10 8 18 -2" fill="{hc}"/>')
        if h == 'ponytail':
            return (f'<path d="M74 110 C68 150 72 190 84 210 L156 210 C168 190 172 150 166 110 Z" fill="{hc}"/>'
                    f'<path d="M140 48 C200 52 214 130 196 212 C190 160 176 110 140 70 Z" fill="{hc}"/>')
        if h == 'veilHat':
            return (f'<path d="M72 110 C64 170 70 220 84 238 L156 238 C170 220 176 170 168 110 Z" fill="{hc}"/>'
                    '<path d="M50 84 L36 262 L204 262 L190 84 Z" fill="#fff" opacity=".2"/>'
                    '<path d="M50 84 L36 262 M190 84 L204 262" stroke="#fff" stroke-opacity=".4" stroke-width="1.5"/>')
        return f'<path d="M72 110 C64 170 70 220 84 238 L156 238 C170 220 176 170 168 110 Z" fill="{hc}"/>'
    s = ''
    if h == 'guanjin':
        col = c['headColor']
        s += sym(f'<path d="M84 96 Q66 150 60 224 L72 224 Q78 150 92 98 Z" fill="{shade(col, -.1)}"/>')
    if h == 'wild':
        s += f'<path d="M70 104 C58 150 62 196 76 220 L164 220 C178 196 182 150 170 104 Z" fill="{c["hairColor"] or HAIR}"/>'
    if h == 'veilHat':
        s += '<path d="M50 84 L36 262 L204 262 L190 84 Z" fill="#fff" opacity=".2"/>'
    if 'quiver' in c['acc']:
        arrows = ''.join(f'<path d="M{x} 172 V150" stroke="#8a6a3a" stroke-width="2"/><path d="M{x} 140 l-3.5 12 h7 Z" fill="#f4f0e6"/>' for x in (60, 66, 72))
        s += f'<g transform="rotate(-20 66 230)">{arrows}<rect x="54" y="166" width="24" height="80" rx="4" fill="#6a3a1a" stroke="#3a1a0a" stroke-width="1.5"/><path d="M54 178 h24" stroke="{c["trim"]}" stroke-width="3"/></g>'
    return s


def hair_front(pen, c, female):
    h = c['head']
    tr = c['trim']
    hc = c['hairColor'] or ('#cfcfcf' if c['age'] == 'old' else HAIR)
    hcol = c['headColor']
    if not female:
        if h == 'helmet':
            return helmet(pen, c)
        s = ''
        if h == 'wild':
            pts = []
            for i in range(15):
                a = math.radians(180 + i * 180 / 14)
                r = 56 if i % 2 == 0 else 47
                pts.append(f'{num(120 + math.cos(a) * r)} {num(104 + math.sin(a) * r)}')
            s += f'<path d="M72 120 L{" L".join(pts)} L168 120 C160 96 146 86 120 86 C94 86 80 96 72 120 Z" fill="{hc}"/>'
            if hcol and 'band' in c['acc']:
                s += f'<path d="M74 92 Q120 74 166 92 L166 102 Q120 84 74 102 Z" fill="{hcol}"/>'
            return s
        if h == 'strawHat':
            return hair_cap(c, hc) + straw_hat(c)
        s += hair_cap(c, hc)
        if h == 'bun':
            s += topknot(hc) + f'<path d="M98 50 L142 46" stroke="{tr}" stroke-width="3" stroke-linecap="round"/><circle cx="142" cy="46" r="3.5" fill="{tr}"/>'
        elif h == 'crown':     # 小冠
            s += topknot(hc) + (f'<path d="M106 60 L108 38 Q120 32 132 38 L134 60 Z" fill="{hcol}" stroke="{shade(hcol, -.4)}" stroke-width="1.5"/>'
                                f'<path d="M110 44 Q120 40 130 44" stroke="{tr}" stroke-width="1.5" fill="none"/>'
                                f'<path d="M94 50 L146 50" stroke="{tr}" stroke-width="3" stroke-linecap="round"/><circle cx="94" cy="50" r="3.5" fill="{tr}"/><circle cx="146" cy="50" r="3.5" fill="{tr}"/>')
        elif h == 'goldCrown':
            s += topknot(hc, 56) + (f'<path d="M104 58 L106 40 L114 50 L120 36 L126 50 L134 40 L136 58 Z" fill="{tr}" stroke="{shade(tr, -.4)}" stroke-width="1.5"/>'
                                    f'<path d="M96 56 L144 56" stroke="{tr}" stroke-width="3"/><circle cx="120" cy="50" r="3" fill="#c0392b"/>')
        elif h == 'lvbu':      # 三叉束髮紫金冠 + 雉雞翎
            cc = c['crestColor']
            fe = (f'<path d="M114 46 C98 6 52 -4 10 22 C50 4 92 10 110 50 Z" fill="{cc}"/>'
                  f'<path d="M112 44 C96 10 56 2 20 20" stroke="#3a1a08" stroke-width="3" fill="none" stroke-dasharray="5 6"/>')
            s += sym(fe)
            s += (f'<path d="M94 66 Q120 54 146 66 L144 74 Q120 64 96 74 Z" fill="{tr}" stroke="{shade(tr, -.4)}" stroke-width="1.5"/>'
                  f'<path d="M102 64 L98 36 L112 56 Z M113 58 L120 26 L127 58 Z M138 64 L142 36 L128 56 Z" fill="{tr}" stroke="{shade(tr, -.4)}" stroke-width="1.5"/>'
                  f'<circle cx="120" cy="62" r="4" fill="#6a2a8a"/><circle cx="104" cy="66" r="2.5" fill="#6a2a8a"/><circle cx="136" cy="66" r="2.5" fill="#6a2a8a"/>'
                  f'<path d="M94 72 q-10 14 -12 34 M146 72 q10 14 12 34" stroke="#c0392b" stroke-width="3" fill="none"/>'
                  f'<circle cx="82" cy="108" r="4" fill="#c0392b"/><circle cx="158" cy="108" r="4" fill="#c0392b"/>')
        elif h == 'band':
            s += topknot(hc, 54) + (f'<path d="M75 92 Q120 74 165 92 L166 102 Q120 84 74 102 Z" fill="{hcol}"/>'
                                    f'<path d="M164 94 q14 6 18 22 M164 98 q8 12 8 26" stroke="{hcol}" stroke-width="5" fill="none"/>')
        elif h == 'scarf':     # 頭巾／幘
            s += (f'<path d="M72 112 C68 60 94 36 120 36 C146 36 172 60 168 112 C160 90 146 80 120 80 C94 80 80 90 72 112 Z" fill="{hcol}"/>'
                  f'<path d="M120 38 L120 80" stroke="{shade(hcol, -.35)}" stroke-width="3"/>'
                  f'<path d="M96 52 Q120 44 144 52" stroke="{shade(hcol, .3)}" stroke-width="2" fill="none"/>'
                  f'<path d="M160 92 C184 102 188 140 180 168 C176 140 172 118 158 104 Z" fill="{hcol}"/>'
                  f'<path d="M80 92 C56 102 52 140 60 168 C64 140 68 118 82 104 Z" fill="{hcol}"/>')
        elif h == 'guanjin':   # 綸巾
            s += (f'<path d="M78 104 C76 62 98 48 120 48 C142 48 164 62 162 104 C152 90 138 84 120 84 C102 84 88 90 78 104 Z" fill="{hcol}"/>'
                  f'<path d="M100 60 L96 16 Q120 8 144 16 L140 60 Q120 54 100 60 Z" fill="{shade(hcol, .1)}" stroke="{shade(hcol, -.35)}" stroke-width="1.5"/>'
                  f'<path d="M96 16 Q120 24 144 16" stroke="{shade(hcol, -.35)}" stroke-width="1.5" fill="none"/>'
                  f'<g stroke="{shade(hcol, .35)}" stroke-width=".9" opacity=".8">'
                  + ''.join(f'<path d="M{x} 21 L{120 + (x - 120) * .8:.1f} 56"/>' for x in (106, 113, 120, 127, 134)) +
                  ''.join(f'<path d="M{x} {66} Q{x + (x - 120) * .1:.1f} 80 {x + (x - 120) * .2:.1f} 90"/>' for x in (96, 108, 132, 144)) +
                  f'</g><path d="M80 98 Q120 80 160 98" stroke="{shade(hcol, -.35)}" stroke-width="3" fill="none"/>')
        elif h in ('jinxian', 'tongtian'):   # 進賢冠／通天冠
            tall = h == 'tongtian'
            s += (f'<path d="M78 100 C80 70 100 60 120 60 C140 60 160 70 162 100 C150 92 136 88 120 88 C104 88 90 92 78 100 Z" fill="#141414"/>'
                  f'<path d="M{94 if tall else 96} 68 L{100 if tall else 102} {20 if tall else 32} Q120 {14 if tall else 26} {140 if tall else 138} {20 if tall else 32} L{146 if tall else 144} 68 Z" fill="{hcol}" stroke="#000" stroke-width="1.5"/>'
                  f'<path d="M112 {26 if tall else 34} V66 M120 {22 if tall else 30} V66 M128 {26 if tall else 34} V66" stroke="{shade(hcol, .3)}" stroke-width="1.5"/>'
                  f'<path d="M88 52 L152 52" stroke="{tr}" stroke-width="3" stroke-linecap="round"/><circle cx="88" cy="52" r="3.5" fill="{tr}"/><circle cx="152" cy="52" r="3.5" fill="{tr}"/>')
            if tall:
                s += f'<path d="M111 70 L120 54 L129 70 Z" fill="{tr}" stroke="{shade(tr, -.4)}"/><circle cx="120" cy="64" r="2.5" fill="#c0392b"/>'
        elif h == 'longguan':  # 籠冠
            s += topknot(hc, 56) + (f'<path d="M108 62 L110 44 L130 44 L132 62 Z" fill="#1a1a1a"/>'
                                    f'<path d="M82 98 L86 40 Q120 30 154 40 L158 98 Q120 88 82 98 Z" fill="{hcol}" fill-opacity=".55" stroke="#000" stroke-width="1.5"/>'
                                    f'<path d="M86 40 Q120 50 154 40" stroke="#000" stroke-width="1" fill="none" stroke-opacity=".6"/>')
        elif h == 'heguan':    # 鶡冠
            fe = (f'<path d="M106 60 Q92 34 88 -2 Q100 24 112 58 Z" fill="#3a2a1a" stroke="#120a04" stroke-width="1"/>'
                  f'<path d="M106 54 Q96 32 91 6" stroke="#e8dcc0" stroke-width="2.2" fill="none" stroke-dasharray="4 4"/>'
                  f'<path d="M88 -2 Q92 6 93 10 L89 8 Z" fill="#f4eee0"/>')
            s += sym(fe) + (f'<path d="M78 102 C78 70 100 58 120 58 C140 58 162 70 162 102 C150 92 136 88 120 88 C104 88 90 92 78 102 Z" fill="#141414"/>'
                            f'<path d="M100 64 L102 40 L138 40 L140 64 Z" fill="{hcol}" stroke="#000" stroke-width="1.5"/><path d="M100 52 H140" stroke="{tr}" stroke-width="2"/>')
        elif h == 'mian':      # 冕
            beads = ''.join(f'<path d="M{x} 52 V74"/>' for x in range(78, 166, 9))
            dots = ''.join(f'<circle cx="{x}" cy="{y}" r="1.9" fill="{("#e8c86a", "#4aa080", "#c0392b")[(x + y) % 3]}"/>'
                           for x in range(78, 166, 9) for y in (60, 68, 76))
            s += (f'<path d="M86 92 C86 62 154 62 154 92 Z" fill="#141414"/><path d="M104 52 L106 72 L134 72 L136 52 Z" fill="#141414"/>'
                  f'<path d="M66 44 L174 44 L170 52 L70 52 Z" fill="#1a1a1a" stroke="{tr}" stroke-width="1.5"/><path d="M70 52 H170" stroke="#a02020" stroke-width="2"/>'
                  f'<g stroke="#333" stroke-width=".8">{beads}</g>{dots}'
                  f'<path d="M70 52 V112 M170 52 V112" stroke="{tr}" stroke-width="1.2"/><circle cx="70" cy="114" r="3.5" fill="#e8c86a"/><circle cx="170" cy="114" r="3.5" fill="#e8c86a"/>')
        elif h == 'daoHat':
            s += f'<path d="M82 90 L92 44 L148 44 L158 90 Z" fill="{hcol}"/><path d="M84 86 L156 86" stroke="{tr}" stroke-width="3"/><circle cx="120" cy="64" r="7" fill="{tr}"/><path d="M115 64 h10 M120 59 v10" stroke="{hcol}" stroke-width="1.5"/>'
        elif h == 'furHat':
            fur = c['fur']
            pts = [(x, 86 + abs(x - 120) * .12) for x in range(78, 166, 11)]
            s += (f'<path d="M84 84 C82 46 158 46 156 84 Z" fill="{hcol}"/><path d="M120 50 V82" stroke="{shade(hcol, -.3)}" stroke-width="2"/>'
                  + ''.join(f'<circle cx="{x}" cy="{num(y)}" r="9" fill="{fur}"/>' for x, y in pts)
                  + f'<ellipse cx="72" cy="126" rx="9" ry="22" fill="{fur}"/><ellipse cx="168" cy="126" rx="9" ry="22" fill="{fur}"/>')
        return s
    # ---------- 女性
    front = f'<path d="M76 120 C70 70 96 56 120 56 C144 56 170 70 164 120 C156 94 136 86 122 92 L120 82 L118 92 C104 86 84 94 76 120 Z" fill="{hc}"/>'
    if c['fringe'] == 'bangs':
        front = f'<path d="M76 120 C70 70 96 56 120 56 C144 56 170 70 164 120 C162 106 158 98 152 96 Q120 92 88 96 C82 98 78 106 76 120 Z" fill="{hc}"/>'
    elif c['fringe'] == 'side':
        front = f'<path d="M76 120 C70 70 96 56 120 56 C144 56 170 70 164 120 C160 100 150 90 140 88 C120 86 96 92 86 104 Q80 110 76 120 Z" fill="{hc}"/>'
    gold = '#e8c86a'
    pin = tr if tr not in ('#ffffff', '#fff0f0') else gold
    if h in ('hood', 'furHood'):
        return hood(c, hcol, h == 'furHood') + f'<path d="M86 118 C84 92 100 82 120 82 C140 82 156 92 154 118 C146 100 134 96 120 98 C106 96 94 100 86 118 Z" fill="{hc}"/>'
    if h == 'helmetLady':
        return front + helmet(pen, c, lady=True)
    if h == 'strawHat':
        return front + straw_hat(c)
    if h == 'veilHat':
        return (front + f'<path d="M92 80 Q92 50 120 48 Q148 50 148 80 Z" fill="{hcol}"/>'
                f'<path d="M48 84 Q120 66 192 84 Q120 94 48 84 Z" fill="{shade(hcol, .1)}" stroke="{shade(hcol, -.35)}" stroke-width="1.5"/>'
                f'<path d="M94 72 Q120 66 146 72" stroke="{tr}" stroke-width="3" fill="none"/>')
    s = front
    if h == 'bunHigh' or h == 'bunCrown':
        s += (f'<ellipse cx="120" cy="46" rx="26" ry="20" fill="{hc}"/><ellipse cx="120" cy="30" rx="16" ry="12" fill="{hc}"/>'
              f'<path d="M96 46 L146 40" stroke="{pin}" stroke-width="3"/><circle cx="146" cy="40" r="4" fill="{gold}"/>'
              f'<path d="M146 44 v18 M150 44 v14" stroke="{gold}" stroke-width="1.2"/><circle cx="146" cy="63" r="2.5" fill="#d84a5a"/><circle cx="150" cy="59" r="2.5" fill="#7ac0a0"/>')
        if h == 'bunCrown':
            s += f'<path d="M108 34 L110 16 L116 24 L120 12 L124 24 L130 16 L132 34 Z" fill="{gold}" stroke="#8a6a20" stroke-width="1.2"/><circle cx="120" cy="28" r="2.5" fill="#c0392b"/>'
    elif h == 'bunDouble':
        rb = c['ribbon'] or '#f7b7d0'
        s += (f'<circle cx="90" cy="56" r="17" fill="{hc}"/><circle cx="150" cy="56" r="17" fill="{hc}"/>'
              f'<path d="M78 50 q12 -8 24 0 M138 50 q12 -8 24 0" stroke="{rb}" stroke-width="4" fill="none"/>'
              f'<path d="M76 58 q-6 14 -2 26 M164 58 q6 14 2 26" stroke="{rb}" stroke-width="3" fill="none"/>'
              f'<circle cx="90" cy="44" r="4" fill="{rb}"/><circle cx="150" cy="44" r="4" fill="{rb}"/>')
    elif h == 'bunSide':
        s += (f'<ellipse cx="146" cy="56" rx="24" ry="18" fill="{hc}" transform="rotate(-20 146 56)"/>'
              f'<path d="M128 50 L170 40" stroke="{gold}" stroke-width="2.5"/><circle cx="170" cy="40" r="4" fill="{gold}"/>'
              f'<path d="M170 44 q4 10 0 20 M174 42 q6 10 4 18" stroke="{gold}" stroke-width="1.2" fill="none"/><circle cx="170" cy="65" r="2.5" fill="#d84a5a"/>'
              f'<circle cx="96" cy="68" r="7" fill="{c["flower"]}"/><circle cx="96" cy="68" r="3" fill="#e88aa0"/>')
    elif h == 'phoenixCrown':
        s += (f'<ellipse cx="120" cy="50" rx="30" ry="18" fill="{hc}"/>'
              f'<path d="M84 66 L90 40 L102 54 L110 30 L120 48 L130 30 L138 54 L150 40 L156 66 Z" fill="{tr}" stroke="{shade(tr, -.4)}" stroke-width="1.5"/>'
              f'<path d="M100 40 Q120 18 140 40 Q130 30 120 34 Q110 30 100 40 Z" fill="{tr}" stroke="{shade(tr, -.4)}"/>'
              f'<circle cx="120" cy="44" r="5" fill="#d84a5a"/><circle cx="102" cy="54" r="3" fill="#4aa0c0"/><circle cx="138" cy="54" r="3" fill="#4aa0c0"/>'
              f'<path d="M84 66 q-8 16 -4 34 M156 66 q8 16 4 34" stroke="{tr}" stroke-width="1.5" fill="none"/>'
              f'<circle cx="80" cy="100" r="3" fill="{tr}"/><circle cx="160" cy="100" r="3" fill="{tr}"/>')
    elif h == 'flyingBun':   # 飛仙髻
        s += sym(f'<path d="M114 60 C94 46 92 14 108 10 C124 8 122 40 118 58" stroke="{hc}" stroke-width="10" fill="none" stroke-linecap="round"/>')
        s += (f'<ellipse cx="120" cy="54" rx="20" ry="11" fill="{hc}"/><path d="M100 56 L140 56" stroke="{gold}" stroke-width="2.5"/>'
              f'<circle cx="120" cy="52" r="4" fill="{c["flower"]}"/><circle cx="104" cy="22" r="2.5" fill="{gold}"/><circle cx="136" cy="22" r="2.5" fill="{gold}"/>')
    elif h == 'floralBun':
        s += f'<ellipse cx="120" cy="46" rx="28" ry="18" fill="{hc}"/>'
        for x, y, r in ((98, 54, 8), (142, 50, 8), (120, 34, 9), (132, 64, 5.5), (108, 64, 5.5)):
            s += ''.join(f'<circle cx="{num(x + math.cos(math.radians(a)) * r * .6)}" cy="{num(y + math.sin(math.radians(a)) * r * .6)}" r="{num(r * .55)}" fill="{c["flower"]}"/>'
                         for a in range(0, 360, 72)) + f'<circle cx="{x}" cy="{y}" r="{num(r * .35)}" fill="#f4c430"/>'
    elif h == 'longHair':
        rb = c['ribbon'] or tr
        s += (f'<ellipse cx="120" cy="54" rx="22" ry="10" fill="{hc}"/><path d="M98 56 Q120 64 142 56" stroke="{rb}" stroke-width="3" fill="none"/>'
              f'<path d="M142 56 q14 10 10 30 M142 58 q8 14 0 32" stroke="{rb}" stroke-width="3" fill="none"/>')
        s += sym(f'<path d="M78 106 C70 150 74 196 82 222 L90 222 C86 186 84 146 88 112 Z" fill="{hc}"/>')
    elif h == 'ponytail':
        rb = c['ribbon'] or '#c0392b'
        s += (f'<ellipse cx="128" cy="50" rx="18" ry="12" fill="{hc}"/><path d="M116 46 Q130 34 146 42" stroke="{rb}" stroke-width="5" fill="none"/>'
              f'<path d="M146 42 q14 4 20 18 M144 46 q8 10 6 24" stroke="{rb}" stroke-width="3" fill="none"/>')
    return s


def accessories_front(c, female):
    s = ''
    if 'tigerPelt' in c['acc']:
        s += ('<path d="M12 300 C16 250 50 222 98 216 L112 238 C80 246 62 270 58 300 Z" fill="#d8862a"/>'
              '<path d="M30 270 l14 6 M44 246 l12 10 M66 230 l8 12 M86 222 l6 12 M24 292 l14 0" stroke="#2a1a10" stroke-width="5" stroke-linecap="round"/>')
    if 'bells' in c['acc']:
        bells = ''.join(f'<circle cx="{x}" cy="{y}" r="4.5" fill="#e8c86a" stroke="#8a6a20"/><path d="M{x - 2} {y + 1} h4" stroke="#5a4010" stroke-width="1"/>'
                        for x, y in ((80, 270), (96, 278), (144, 278), (160, 270)))
        s += f'<path d="M70 262 Q120 292 170 262" stroke="#8a6a20" stroke-width="1.5" fill="none"/>{bells}'
    return s


# ---------------------------------------------------------------- 組合
def portrait(pid, look, female):
    c = dict(DEFAULTS)
    c.update(look)
    if isinstance(c['acc'], str):
        c['acc'] = (c['acc'],)
    pen = Pen(pid)
    rng = seeded(pid)
    clip = pen.id('cl')
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
         f'<clipPath id="{clip}"><rect width="{W}" height="{H}" rx="18"/></clipPath><g clip-path="url(#{clip})">'
         f'<g transform="scale(1.06667)">')
    s += background(pen, c, rng)
    s += '<g transform="translate(0 8)">'
    s += back_prop(pen, c)
    s += cloak_back(c, female)
    rot = f'rotate({c["tilt"]} 120 200)' if c['tilt'] else ''
    hb = hair_back(pen, c, female)
    if hb:
        s += f'<g transform="{rot}">{hb}</g>' if rot else hb
    s += neck(c, female)
    s += body(pen, c, female)
    s += accessories_front(c, female)
    hd = head(pen, c, female) + hair_front(pen, c, female)
    s += f'<g transform="{rot}">{hd}</g>' if rot else hd
    s += front_prop(pen, c)
    s += (f'</g></g></g><rect x="1.5" y="1.5" width="{W - 3}" height="{H - 3}" rx="17" fill="none" stroke="{c["trim"] if c["trim"] not in ("#ffffff",) else "#e8b84a"}" '
          f'stroke-opacity=".85" stroke-width="3"/></svg>')
    return s


# ================================================================ 人物設定
# 常用背景配色
BG = {
    'green': ('#3b5d3a', '#16261a'), 'brown': ('#4a3a2a', '#1d140c'), 'blue': ('#2c4a6e', '#101c2c'),
    'red': ('#6a2a1e', '#250e0a'), 'crimson': ('#5a1414', '#1f0606'), 'navy': ('#2a3a6a', '#0c1228'),
    'teal': ('#2a5a5a', '#0c1e1e'), 'purple': ('#3a2a4a', '#120c18'), 'gold': ('#6a5a2a', '#221c0c'),
    'slate': ('#3a4a5a', '#121a22'), 'ink': ('#2a2a32', '#0a0a10'), 'rose': ('#7a4a5a', '#2a161e'),
    'jade': ('#3a6a5a', '#12241e'), 'sky': ('#5a7a9a', '#1c2838'), 'sand': ('#7a5a32', '#2a1c0c'),
    'plum': ('#5a2a4a', '#1e0a18'), 'olive': ('#4a5a32', '#161c0c'), 'night': ('#1e2a4a', '#060a18'),
    'dawn': ('#8a5a4a', '#2a1610'), 'snowy': ('#6a7a8a', '#1e2630'),
}

# --- 玩家頭像（男）
PLAYER_M = {
    '青鋒少將': dict(skin='fair', brow='sword', eye='calm', head='helmet', helm='#7a8a98', crest='plume', crestColor='#2a8a8a', plates=True,
                 outfit='armor', main='#2a5a6a', trim='#cfd6dc', lace='#2a8a8a', prop='sword', bg=BG['teal'], emblem='mirror', scene='mountain', turn=1),
    '赤膽將軍': dict(skin='warm', face='square', brow='thick', eye='fierce', age='mid', beard='mustache', head='helmet', helm='#a88a4a',
                 crest='tassel', outfit='armor', armor='scale', main='#8a2a22', trim='#e0b84a', cloak='#a82a22', prop='glaive', tassel='#e0b84a',
                 bg=BG['red'], emblem='sun', scene='wall', mouth='stern'),
    '白袍銀槍': dict(skin='fair', face='long', brow='sword', eye='phoenix', head='helmet', helm='#eef1f4', crest='plume', crestColor='#f4f4f0',
                 outfit='armorWhite', main='#dfe4ea', trim='#9fb6d6', cloak='#f2f4f6', prop='spear', tassel='#c0392b', bg=BG['blue'], scene='clouds', turn=-1),
    '鐵甲虎賁': dict(skin='tan', face='square', brow='thick', eye='round', age='mid', beard='full', build='burly', head='helmet', helm='#4a4e58',
                 crest='horn', plates=True, outfit='armor', main='#2a2a30', trim='#b8892f', lace='#8a2a22', prop='mace', bg=BG['ink'], emblem='lattice', mouth='frown'),
    '玄甲騎都': dict(skin='light', face='long', brow='sword', eye='fierce', beard='goatee', age='mid', head='helmet', helm='#2a2a30',
                 crest='plume', crestColor='#b8262a', plates=True, outfit='armor', main='#1e1e24', trim='#a88a5a', lace='#b8262a',
                 cloak='#5a1a1a', prop='halberd', bg=BG['purple'], scene='wall'),
    '儒雅書生': dict(skin='fair', brow='straight', eye='gentle', head='crown', headColor='#1a1a1a', outfit='robeSage', main='#dfe6e2',
                 trim='#3a6a5a', prop='book', bg=BG['jade'], emblem='cloud', scene='bamboo', mouth='smile', turn=1),
    '飛羽神射': dict(skin='warm', brow='sword', eye='phoenix', head='helmet', helm='#9aa0a8', crest='wing', crestColor='#f2efe6',
                 outfit='armor', armor='scale', main='#5a4022', trim='#d8b45a', prop='bow', acc=('quiver',), bg=BG['sky'], scene='clouds', gaze=1),
    '西涼猛士': dict(skin='tan', face='square', brow='thick', eye='fierce', age='mid', beard='full', beardColor='#4a3020', head='helmet',
                 helm='#6a5a4a', crest='tassel', helmFur=True, fur='#d8c8a8', outfit='armor', main='#6a4a2a', trim='#c69a3a', lace='#c0392b',
                 scarf='#c0392b', prop='axe', bg=BG['sand'], scene='desert'),
    '江東水師': dict(skin='tan', brow='straight', eye='calm', beard='stubble', head='band', headColor='#2a5aa0', outfit='robeArmor',
                 main='#2a4a6a', trim='#d8c890', plate='#4a5a6a', prop='saber', bg=BG['navy'], scene='waves', turn=-1),
    '北地遊俠': dict(skin='light', face='long', brow='sword', eye='narrow', beard='stubble', head='strawHat', outfit='cloak',
                 main='#3a3a40', trim='#9a9aa0', fur='#e8e4dc', prop='sword', bg=BG['snowy'], scene='snow', emblem='none', turn=1),
    '紫金太守': dict(skin='light', face='round', brow='straight', eye='calm', age='mid', beard='goatee', head='jinxian', headColor='#1a1a1a',
                 outfit='robeRich', main='#5a2a6a', trim='#e0c060', prop='scroll', bg=BG['plum'], emblem='lattice', mouth='smile'),
    '雲中郎將': dict(skin='fair', brow='sword', eye='calm', beard='mustache', head='heguan', headColor='#1a1a1a', outfit='armor',
                 main='#3a5a7a', trim='#e0c060', lace='#e8e0c8', cloak='#e8ecf0', prop='spear', tassel='#2a5aa0', bg=BG['sky'], scene='clouds'),
    '刀筆文吏': dict(skin='light', face='long', brow='thin', eye='narrow', age='mid', beard='thin', head='longguan', headColor='#1a1a1a',
                 outfit='robe', main='#3a3a2a', trim='#d8c890', prop='brush', bg=BG['olive'], emblem='lattice', scene='none', turn=-1),
    '長髯老將': dict(skin='warm', face='long', brow='white', eye='old', age='old', beard='long', head='helmet', helm='#a88a4a', crest='tassel',
                 outfit='armor', armor='scale', main='#6a4a1a', trim='#e8c86a', cloak='#7a2a1a', prop='glaive', bg=BG['gold'], scene='mountain'),
    '虎頭力士': dict(skin='bronze', face='round', brow='thick', eye='wide', age='mid', beard='tiger', build='burly', head='wild',
                 headColor='#c0392b', acc=('band', 'tigerPelt'), outfit='brawler', main='#5a3a1e', trim='#c69a3a', prop='mace', bg=BG['brown'], scene='flame', mouth='shout'),
    '布衣軍師': dict(skin='light', brow='straight', eye='calm', beard='goatee', age='mid', head='scarf', headColor='#6a5a3a', outfit='robe',
                 main='#8a7a5a', trim='#e8dcc0', prop='scroll', bg=BG['olive'], emblem='cloud', scene='mountain', mouth='smile', turn=1),
    '黑面莽夫': dict(skin='dark', face='round', brow='thick', eye='round', age='mid', beard='tiger', build='burly', head='wild', outfit='armor',
                 armor='scale', main='#2a2a2a', trim='#9a7a3a', prop='snakeSpear', bg=BG['ink'], emblem='sun', mouth='shout', turn=-1),
    '翩翩公子': dict(skin='pale', brow='straight', eye='gentle', head='crown', headColor='#e8c86a', outfit='robeRich', main='#e8e0ea',
                 trim='#8a5a9a', lace='#f4e8f0', prop='flute', bg=BG['rose'], emblem='cloud', scene='flowers', mouth='smile', turn=1),
    '巴蜀勇士': dict(skin='tan', face='square', brow='sword', eye='fierce', beard='chinstrap', head='band', headColor='#2f7d4a',
                 outfit='armor', main='#3a5a2a', trim='#c8a24a', lace='#2f7d4a', scarf='#2f7d4a', prop='saber', bg=BG['green'], scene='mountain'),
    '關外刀客': dict(skin='bronze', face='long', brow='thick', eye='narrow', beard='stubble', head='furHat', headColor='#5a3a1e',
                 fur='#c8b08a', outfit='furCoat', main='#5a4030', trim='#c8a24a', acc=('scar',), cloak='#3a2a1e', prop='saber', bg=BG['sand'], scene='desert', turn=-1),
}

# --- 玩家頭像（女）
PLAYER_F = {
    '紅纓女將': dict(skin='light', brow='arched', eye='fierce', head='helmetLady', helm='#c8ccd2', crest='tassel', outfit='armorLady',
                 main='#a8323a', trim='#e8c86a', prop='spear', bg=BG['red'], scene='wall', turn=1),
    '月下琴師': dict(skin='fair', face='femSlim', brow='willow', eye='gentle', head='bunHigh', outfit='hanfu', main='#c8d4e8', trim='#ffffff',
                 ribbon='#e8eef8', prop='qin', bg=BG['night'], scene='moon', emblem='none'),
    '江南才女': dict(skin='fair', brow='willow', eye='calm', head='bunSide', flower='#f7d4e0', outfit='hanfu', main='#8ac0a0', trim='#f4f8f0',
                 prop='brush', bg=BG['jade'], scene='reeds', emblem='cloud', mouth='smile', turn=-1),
    '巾幗統帥': dict(skin='light', brow='arched', eye='phoenix', head='helmetLady', helm='#c8a04a', crest='pheasant', crestColor='#d8a040',
                 outfit='armorLady', main='#6a3a1a', trim='#f0d060', cloak='#a82a22', prop='flag', flagColor='#a82a22', bg=BG['gold'], emblem='sun', scene='wall'),
    '飛燕弓手': dict(skin='warm', brow='arched', eye='phoenix', head='ponytail', fringe='bangs', outfit='armorLady', armor='scale',
                 main='#4a6a3a', trim='#e8c86a', prop='bow', acc=('quiver',), bg=BG['sky'], scene='clouds', gaze=1),
    '洛水仙子': dict(skin='pale', face='femSlim', brow='willow', eye='gentle', head='flyingBun', flower='#bfe0f0', outfit='hanfu',
                 main='#a8d0e8', trim='#ffffff', ribbon='#e0f0ff', mark='#4a90c0', prop='ribbon', bg=BG['sky'], scene='waves', emblem='cloud'),
    '錦衣郡主': dict(skin='fair', face='femRound', brow='arched', eye='phoenix', head='phoenixCrown', outfit='robeRich', main='#c8402a',
                 trim='#f5d36a', mark='#e0303a', prop='fanRound', bg=BG['crimson'], emblem='lattice', mouth='smile'),
    '劍舞佳人': dict(skin='fair', brow='arched', eye='phoenix', head='bunDouble', ribbon='#e84a6a', outfit='hanfu', main='#e8a0b0',
                 trim='#fff0f0', prop='sword', bg=BG['rose'], scene='flowers', turn=1),
    '山中隱士': dict(skin='light', brow='willow', eye='calm', head='veilHat', headColor='#e8e0d0', outfit='robe', main='#9aa89a',
                 trim='#eef0e8', prop='whisk', bg=BG['slate'], scene='mountain', emblem='cloud', acc=('noEarrings',)),
    '百花夫人': dict(skin='fair', face='femRound', brow='willow', eye='gentle', head='floralBun', flower='#f08aa8', outfit='robeRich',
                 main='#d86a8a', trim='#f8e0a0', mark='#e0405a', prop='peony', bg=BG['rose'], scene='flowers', mouth='smile'),
    '紫衣謀士': dict(skin='fair', brow='arched', eye='narrow', head='bunCrown', outfit='robeSage', main='#6a3a8a', trim='#e8d8f0',
                 prop='featherFan', bg=BG['purple'], emblem='lattice', scene='stars', turn=-1),
    '銀甲先鋒': dict(skin='fair', brow='arched', eye='fierce', head='helmetLady', helm='#eef1f4', crest='plume', crestColor='#e8eef4',
                 outfit='armorLady', main='#c8d0d8', trim='#7a96c0', plate='#eef1f4', lace='#7a96c0', prop='spear', tassel='#2a5aa0', bg=BG['blue'], scene='clouds'),
    '雪原騎手': dict(skin='fair', face='femRound', brow='arched', eye='calm', head='furHood', headColor='#7a2a2a', fur='#f4f0ea',
                 outfit='furCoat', main='#7a2a2a', trim='#e8c86a', prop='bow', bg=BG['snowy'], scene='snow', emblem='none', acc=('noEarrings',)),
    '翠竹書香': dict(skin='fair', brow='willow', eye='calm', head='longHair', ribbon='#3a8a5a', outfit='hanfu', main='#7ab08a', trim='#f0f4e8',
                 prop='book', bg=BG['green'], scene='bamboo', emblem='none', turn=1),
    '鳳冠皇后': dict(skin='fair', face='femRound', brow='arched', eye='phoenix', head='phoenixCrown', outfit='robeRich', main='#8a1e2a',
                 trim='#f0c850', mark='#e0303a', prop='none', bg=BG['gold'], emblem='sun'),
    '蜀錦繡娘': dict(skin='light', brow='willow', eye='gentle', head='bunSide', flower='#f4c430', fringe='bangs', outfit='robeRich',
                 main='#2a7a7a', trim='#f0c060', prop='hoop', bg=BG['teal'], emblem='lattice', mouth='smile'),
    '雙刀俠女': dict(skin='light', face='femSlim', brow='arched', eye='fierce', head='ponytail', ribbon='#2a2a2a', outfit='armorLady',
                 main='#3a3a44', trim='#c8a24a', lace='#a82a22', prop='twinBlades', bg=BG['ink'], scene='moon', emblem='none', turn=-1),
    '鼓樂將軍': dict(skin='warm', brow='arched', eye='calm', head='helmetLady', helm='#a88a4a', crest='tassel', outfit='armorLady',
                 armor='scale', main='#3a5a8a', trim='#e8c86a', prop='drum', bg=BG['navy'], emblem='sun', mouth='smile'),
    '素衣醫者': dict(skin='fair', brow='willow', eye='gentle', head='bunHigh', outfit='robe', main='#eceae4', trim='#7a9a8a', lace='#ffffff',
                 prop='gourd', bg=BG['jade'], emblem='cloud', scene='mountain', mouth='smile'),
    '海濱漁女': dict(skin='tan', brow='willow', eye='round', head='strawHat', fringe='bangs', outfit='robe', main='#3a6a8a', trim='#e8dcc0',
                 prop='fishBasket', bg=BG['sky'], scene='waves', emblem='none', mouth='smile', acc=('noEarrings',)),
}

# --- 名人造型（軍師與遊戲武將共用）
LOOKS = {
    # ---- 軍師／文官
    '諸葛亮': dict(skin='light', face='long', brow='straight', eye='phoenix', age='mid', beard='thin', head='guanjin', headColor='#2c3a5a',
                outfit='robeSage', main='#ecebe4', trim='#2c3a5a', cloak='#f4f2ea', prop='featherFan', bg=BG['night'], scene='stars', emblem='mirror'),
    '司馬懿': dict(skin='light', face='long', brow='knit', eye='narrow', age='mid', beard='thin', head='longguan', headColor='#1a1a1a',
                outfit='robe', main='#2a1e2e', trim='#8a6a9a', cloak='#1e141e', prop='none', bg=BG['plum'], emblem='lattice', scene='none',
                turn=-1, gaze=-1, mouth='smirk'),
    '郭嘉': dict(skin='pale', brow='thin', eye='gentle', beard='none', head='scarf', headColor='#5a6a8a', outfit='robeSage', main='#9aaac0',
               trim='#e8e0c8', prop='cup', bg=BG['slate'], emblem='cloud', scene='moon', mouth='smirk', turn=1),
    '周瑜': dict(skin='fair', brow='sword', eye='phoenix', head='crown', headColor='#e0b84a', outfit='robeArmor', main='#9a2a2a',
               trim='#e8c86a', plate='#6a2a2a', cloak='#b8262a', prop='sword', bg=BG['red'], emblem='sun', scene='flame', turn=1),
    '龐統': dict(skin='tan', face='round', brow='thick', eye='round', nose='broad', age='mid', beard='full', beardColor='#3a2a1a',
               head='daoHat', headColor='#3a3020', outfit='robeSage', main='#6a5a3a', trim='#e0d0a0', prop='gourd', bg=BG['brown'],
               emblem='cloud', scene='mountain', mouth='smile'),
    '荀彧': dict(skin='fair', face='long', brow='straight', eye='calm', age='mid', beard='goatee', head='jinxian', headColor='#1a1a1a',
               outfit='robeRich', main='#2a5a4a', trim='#e8d8a0', prop='book', bg=BG['jade'], emblem='lattice', scene='none'),
    '賈詡': dict(skin='light', face='long', brow='knit', eye='narrow', age='old', beard='thin', beardColor='#9a9a9a', hairColor='#8a8a8a',
               head='longguan', headColor='#2a2a2a', outfit='robe', main='#3a3a2a', trim='#a89a6a', prop='scroll', bg=BG['ink'],
               emblem='lattice', scene='none', turn=-1, gaze=1, mouth='smirk'),
    '魯肅': dict(skin='warm', face='round', brow='straight', eye='gentle', age='mid', beard='mustache', head='jinxian', headColor='#1a1a1a',
               outfit='robe', main='#3a5a7a', trim='#e8d8b0', prop='scroll', bg=BG['navy'], scene='waves', mouth='smile'),
    '陸遜': dict(skin='fair', brow='sword', eye='calm', head='crown', headColor='#1a1a1a', outfit='robeArmor', main='#8a2a2a',
               trim='#e0c060', plate='#5a3a2a', prop='sword', bg=BG['crimson'], scene='flame', emblem='sun', turn=-1),
    '徐庶': dict(skin='light', brow='sword', eye='calm', age='mid', beard='goatee', head='scarf', headColor='#3a3a3a', outfit='robeSage',
               main='#5a6a5a', trim='#e0e0d0', prop='sword', bg=BG['olive'], emblem='cloud', scene='mountain', turn=1),
    '荀攸': dict(skin='light', face='square', brow='straight', eye='calm', age='mid', beard='mustache', head='jinxian', headColor='#1a1a1a',
               outfit='robe', main='#4a3a5a', trim='#d8c890', prop='book', bg=BG['purple'], emblem='lattice', scene='none'),
    '法正': dict(skin='light', face='long', brow='sword', eye='narrow', age='mid', beard='goatee', head='heguan', headColor='#1a1a1a',
               outfit='robeArmor', main='#4a5a3a', trim='#c8a24a', plate='#5a5a4a', prop='sword', bg=BG['green'], scene='mountain', mouth='smirk', turn=1),
    '陳宮': dict(skin='light', brow='knit', eye='calm', age='mid', beard='goatee', head='crown', headColor='#1a1a1a', outfit='robe',
               main='#2a4a3a', trim='#d8c890', prop='scroll', bg=BG['teal'], scene='wall', mouth='frown'),
    '田豐': dict(skin='warm', face='long', brow='white', eye='old', age='old', beard='long', head='jinxian', headColor='#1a1a1a',
               outfit='robe', main='#4a3a2a', trim='#d8c890', prop='scroll', bg=BG['brown'], emblem='lattice', scene='none', mouth='frown'),
    '沮授': dict(skin='light', face='square', brow='straight', eye='calm', age='mid', beard='full', head='jinxian', headColor='#1a1a1a',
               outfit='robeArmor', main='#6a5a2a', trim='#e0c060', plate='#5a4a2a', prop='sword', bg=BG['gold'], scene='wall'),
    '程昱': dict(skin='warm', face='long', brow='thick', eye='fierce', age='old', beard='long', beardColor='#8a8a8a', hairColor='#7a7a7a',
               head='heguan', headColor='#1a1a1a', outfit='robeArmor', main='#2a3a5a', trim='#c8a24a', plate='#3a4a5a', prop='sword', bg=BG['navy'], scene='wall'),
    '張昭': dict(skin='light', face='long', brow='white', eye='old', age='old', beard='long', head='jinxian', headColor='#1a1a1a',
               outfit='robeRich', main='#5a2a2a', trim='#e8d8a0', prop='book', bg=BG['crimson'], emblem='lattice', scene='none', mouth='frown'),
    '呂蒙': dict(skin='tan', face='square', brow='thick', eye='fierce', age='mid', beard='chinstrap', head='band', headColor='#f0f0ea',
               outfit='robeArmor', main='#e8e8e0', trim='#4a6a8a', plate='#8a9aa8', prop='saber', bg=BG['navy'], scene='waves', turn=1),
    '姜維': dict(skin='fair', face='long', brow='sword', eye='phoenix', beard='mustache', head='helmet', helm='#cfd6dc', crest='plume',
               crestColor='#2a8a5a', plates=True, outfit='armor', main='#2a5a3a', trim='#e0c060', lace='#2a8a5a', prop='spear', bg=BG['green'], scene='mountain', turn=-1),
    '鄧艾': dict(skin='tan', face='square', brow='straight', eye='calm', age='mid', beard='full', head='helmet', helm='#6a6a70', crest='tassel',
               plates=True, outfit='armor', main='#3a3a4a', trim='#b8a060', lace='#5a5a8a', prop='scroll', bg=BG['slate'], scene='mountain'),
    '黃月英': dict(skin='light', brow='arched', eye='calm', head='bunHigh', hairColor='#5a3a22', outfit='robeSage', main='#c8a850',
                trim='#4a3a1a', prop='gear', bg=BG['gold'], emblem='lattice', scene='none', mouth='smile', turn=1),
    '蔡琰': dict(skin='fair', face='femSlim', brow='willow', eye='gentle', head='bunSide', flower='#e8e8f8', outfit='hanfu', main='#7a8ab0',
               trim='#f0f0f8', prop='qin', bg=BG['sky'], scene='snow', emblem='none'),
    '辛憲英': dict(skin='fair', brow='arched', eye='calm', head='bunCrown', outfit='robeRich', main='#3a4a6a', trim='#e8d8a0', prop='scroll',
                bg=BG['navy'], emblem='mirror', scene='none'),
    '王異': dict(skin='light', brow='arched', eye='fierce', head='helmetLady', helm='#a8acb4', crest='tassel', outfit='armorLady', main='#5a2a3a',
               trim='#e0c060', prop='sword', bg=BG['crimson'], scene='wall', turn=-1),
    '貂蟬': dict(skin='fair', face='femSlim', brow='arched', eye='phoenix', head='bunSide', flower='#f0d0ff', outfit='hanfu', main='#7a3a8a',
               trim='#f0d0ff', mark='#d8324a', ribbon='#c8a0e0', prop='ribbon', bg=BG['purple'], scene='moon', emblem='none', turn=1),
    '大喬': dict(skin='fair', face='femRound', brow='willow', eye='gentle', head='bunHigh', outfit='robeRich', main='#3a6a9a', trim='#f0e8c8',
               prop='flower', flower='#ffffff', bg=BG['sky'], scene='waves', emblem='cloud', mouth='smile', turn=-1),
    '小喬': dict(skin='fair', brow='willow', eye='gentle', head='bunDouble', ribbon='#f7b7d0', outfit='hanfu', main='#f0a8c0', trim='#ffffff',
               prop='fanRound', bg=BG['rose'], scene='flowers', emblem='cloud', mouth='smile', turn=1),
    '孫尚香': dict(skin='light', brow='arched', eye='fierce', head='ponytail', ribbon='#c0392b', fringe='side', outfit='armorLady', main='#a8323a',
                trim='#e8c86a', prop='bow', acc=('quiver',), bg=BG['red'], scene='waves', emblem='sun', mouth='smile'),
    '甄姬': dict(skin='pale', face='femSlim', brow='willow', eye='calm', head='flyingBun', flower='#d0e8ff', outfit='hanfu', main='#5a8ab0',
               trim='#eef6ff', ribbon='#e0f0ff', mark='#4a90c0', prop='ribbon', bg=BG['night'], scene='waves', emblem='cloud'),
    '鮑三娘': dict(skin='warm', brow='arched', eye='fierce', head='helmetLady', helm='#c8ccd2', crest='pheasant', crestColor='#c8402a',
                outfit='armorLady', armor='scale', main='#2a4a6a', trim='#e8c86a', prop='spear', bg=BG['blue'], scene='mountain', turn=1),
    # ---- 武將／君主
    '關羽': dict(skin='red', face='long', brow='thick', eye='phoenix', age='mid', beard='long', head='scarf', headColor='#2f7d4a',
               outfit='robeArmor', main='#2f7d4a', trim='#d8b45a', plate='#3a5a3a', prop='glaive', tassel='#b8262a', bg=BG['green'], scene='mountain'),
    '張飛': dict(skin='dark', face='round', brow='thick', eye='wide', age='mid', beard='tiger', build='burly', head='helmet', helm='#3a3a40',
               crest='tassel', outfit='armor', armor='scale', main='#2a2a30', trim='#b8892f', prop='snakeSpear', bg=BG['brown'], emblem='sun', mouth='shout'),
    '趙雲': dict(skin='fair', face='long', brow='sword', eye='phoenix', head='helmet', helm='#eef1f4', crest='plume', crestColor='#f4f4f0',
               plates=True, outfit='armorWhite', main='#e8e8ee', trim='#9fb6d6', cloak='#f2f4f6', prop='spear', bg=BG['blue'], scene='clouds', turn=1),
    '呂布': dict(skin='light', face='long', brow='sword', eye='fierce', head='lvbu', crestColor='#d8a040', trim='#e8c45a', outfit='armor',
               armor='scale', main='#8a1e1e', cloak='#a01e1e', prop='halberd', bg=BG['crimson'], emblem='sun', scene='flame', mouth='smirk'),
    '曹操': dict(skin='light', face='square', brow='sword', eye='narrow', age='mid', beard='thin', head='tongtian', headColor='#1a1a1a',
               outfit='robeRich', main='#2a2a3a', trim='#d8b45a', cloak='#1a1a24', prop='sword', bg=BG['navy'], emblem='lattice', scene='wall', turn=1, mouth='smirk'),
    '劉備': dict(skin='fair', face='round', brow='straight', eye='gentle', age='mid', beard='goatee', head='crown', headColor='#e0b84a',
               outfit='robeRich', main='#2f6a4a', trim='#e8d8a0', acc=('bigEars',), prop='sword', bg=BG['green'], emblem='mirror', scene='mountain', mouth='smile'),
    '孫權': dict(skin='warm', face='square', brow='thick', eye='phoenix', eyeColor='#2a6a5a', age='mid', beard='full', beardColor='#5a2a5a',
               head='mian', outfit='robeRich', main='#8a2a2a', trim='#e8c86a', prop='sword', bg=BG['red'], scene='waves', emblem='sun'),
    '黃忠': dict(skin='warm', face='long', brow='white', eye='fierce', age='old', beard='long', head='helmet', helm='#a88a4a', crest='tassel',
               outfit='armor', armor='scale', main='#7a5a1a', trim='#e8c86a', prop='bow', acc=('quiver',), bg=BG['gold'], scene='mountain', mouth='stern'),
    '馬超': dict(skin='fair', face='long', brow='sword', eye='fierce', head='helmet', helm='#eef1f4', crest='lion', crestColor='#c0392b',
               trim='#c8a24a', outfit='armorWhite', main='#dfe4ea', cloak='#e8ecf0', prop='spear', bg=BG['sky'], scene='desert', turn=-1),
    '典韋': dict(skin='bronze', face='round', brow='thick', eye='wide', nose='broad', age='mid', beard='full', build='burly', head='wild',
               headColor='#c8a24a', acc=('band',), outfit='armor', main='#4a3a2a', trim='#a88a4a', lace='#6a2a1a', prop='twinHalberds', bg=BG['brown'], emblem='sun', mouth='shout'),
    '許褚': dict(skin='bronze', face='round', brow='thick', eye='round', nose='broad', age='mid', beard='stubble', build='burly', head='wild',
               acc=('tigerPelt',), outfit='brawler', main='#3a2a1a', trim='#b8892f', prop='mace', bg=BG['sand'], emblem='sun', mouth='stern'),
    '孫策': dict(skin='warm', brow='sword', eye='fierce', head='helmet', helm='#c8a04a', crest='plume', crestColor='#c0392b', outfit='armor',
               main='#8a2a1e', trim='#e8c86a', lace='#c0392b', cloak='#a82a1e', prop='spear', bg=BG['red'], scene='waves', emblem='sun', mouth='smile', turn=1),
    '夏侯惇': dict(skin='light', face='square', brow='thick', eye='fierce', age='mid', beard='full', head='helmet', helm='#4a4e58', crest='horn',
                plates=True, acc=('eyepatch',), outfit='armor', main='#2a3a5a', trim='#b8a060', lace='#2a5aa0', prop='spear', bg=BG['navy'], scene='wall', mouth='frown'),
    '甘寧': dict(skin='tan', face='square', brow='thick', eye='fierce', beard='chinstrap', head='band', headColor='#c0392b', acc=('bells',),
               outfit='brawler', main='#2a4a6a', trim='#e8c86a', prop='saber', bg=BG['navy'], scene='waves', mouth='smirk'),
    '太史慈': dict(skin='light', face='long', brow='sword', eye='fierce', age='mid', beard='mustache', head='helmet', helm='#7a8a98', crest='plume',
                crestColor='#2a5aa0', outfit='armor', main='#2a3a5a', trim='#d8b45a', lace='#2a5aa0', prop='spear', acc=('quiver',), bg=BG['blue'], scene='waves'),
    '張遼': dict(skin='light', face='long', brow='sword', eye='fierce', age='mid', beard='goatee', head='helmet', helm='#5a5e68', crest='plume',
               crestColor='#6a2a8a', plates=True, outfit='armor', main='#3a2a4a', trim='#c8a24a', lace='#6a2a8a', cloak='#4a2a5a', prop='glaive', tassel='#6a2a8a',
               bg=BG['purple'], scene='waves'),
    '徐晃': dict(skin='warm', face='square', brow='thick', eye='fierce', age='mid', beard='full', head='helmet', helm='#6a6a70', crest='tassel',
               outfit='armor', main='#3a4a3a', trim='#b8a060', prop='axe', bg=BG['olive'], scene='mountain', turn=-1),
    '黃蓋': dict(skin='tan', face='square', brow='white', eye='fierce', age='old', beard='full', beardColor='#bdbdbd', head='helmet', helm='#7a6a4a',
               crest='tassel', outfit='armor', armor='scale', main='#6a2a1a', trim='#d8b45a', prop='whip', bg=BG['crimson'], scene='flame', mouth='stern'),
    '魏延': dict(skin='bronze', face='long', brow='thick', eye='fierce', age='mid', beard='chinstrap', head='helmet', helm='#3a3a40', crest='horn',
               outfit='armor', main='#5a2a1a', trim='#c8a24a', lace='#a82a1a', prop='glaive', tassel='#a82a1a', bg=BG['red'], scene='mountain', mouth='frown', turn=-1),
    '周倉': dict(skin='dark', face='round', brow='thick', eye='wide', nose='broad', beard='tiger', build='burly', head='wild', headColor='#2f7d4a',
               acc=('band',), outfit='armor', armor='scale', main='#2a3a2a', trim='#a88a4a', prop='glaive', propSide='left', bg=BG['green'], mouth='shout'),
    '關平': dict(skin='light', face='long', brow='thick', eye='phoenix', head='helmet', helm='#7a8a7a', crest='plume', crestColor='#2f7d4a',
               outfit='armor', main='#2f6a4a', trim='#d8b45a', lace='#2f7d4a', prop='sword', bg=BG['green'], scene='mountain', turn=1),
    '袁紹': dict(skin='fair', face='long', brow='sword', eye='calm', age='mid', beard='goatee', head='goldCrown', hairColor=HAIR, outfit='robeArmor',
               main='#8a6a1a', trim='#f0d060', plate='#a88a3a', cloak='#c8a030', prop='sword', bg=BG['gold'], emblem='sun', scene='wall'),
    '袁術': dict(skin='pale', face='round', brow='thin', eye='narrow', age='mid', beard='mustache', head='mian', outfit='robeRich', main='#c8a030',
               trim='#f5e080', prop='cup', bg=BG['gold'], emblem='lattice', mouth='smirk'),
    '劉表': dict(skin='light', face='long', brow='white', eye='old', age='old', beard='long', head='jinxian', headColor='#1a1a1a', outfit='robeRich',
               main='#2a5a5a', trim='#e8d8a0', prop='book', bg=BG['teal'], scene='reeds', mouth='smile'),
    '劉璋': dict(skin='fair', face='round', brow='knit', eye='gentle', age='mid', beard='goatee', head='crown', headColor='#e0b84a', outfit='robeRich',
               main='#6a4a2a', trim='#e8d8a0', prop='none', bg=BG['brown'], scene='mountain', mouth='frown'),
    '馬騰': dict(skin='tan', face='square', brow='thick', eye='fierce', age='old', beard='full', head='helmet', helm='#6a5a4a', crest='tassel',
               helmFur=True, outfit='armor', main='#5a3a22', trim='#c69a3a', lace='#c0392b', prop='spear', bg=BG['sand'], scene='desert'),
    '張魯': dict(skin='light', face='long', brow='straight', eye='calm', age='mid', beard='long', head='daoHat', headColor='#2a2a3a', outfit='robeSage',
               main='#e0d8c0', trim='#3a3a5a', prop='whisk', bg=BG['slate'], emblem='cloud', scene='mountain'),
    '孔融': dict(skin='light', face='long', brow='straight', eye='calm', age='old', beard='long', head='jinxian', headColor='#1a1a1a', outfit='robe',
               main='#5a4a3a', trim='#e8dcc0', prop='book', bg=BG['olive'], emblem='lattice', scene='none', mouth='smile'),
    '曹丕': dict(skin='light', face='long', brow='sword', eye='narrow', beard='thin', head='mian', outfit='robeRich', main='#1e1e2a', trim='#d8b45a',
               prop='none', bg=BG['night'], emblem='lattice', scene='none', turn=-1),
    '曹仁': dict(skin='warm', face='square', brow='thick', eye='fierce', age='mid', beard='full', head='helmet', helm='#5a5e68', crest='tassel', plates=True,
               outfit='armor', main='#2a3a5a', trim='#b8a060', lace='#2a5aa0', cloak='#2a2a3a', prop='spear', bg=BG['navy'], scene='wall'),
    '夏侯淵': dict(skin='warm', face='long', brow='sword', eye='fierce', age='mid', beard='mustache', head='helmet', helm='#6a6a70', crest='wing',
                crestColor='#e8e4dc', outfit='armor', main='#2a3a4a', trim='#c8a24a', prop='bow', acc=('quiver',), bg=BG['slate'], scene='mountain', turn=1),
    '張郃': dict(skin='fair', face='long', brow='sword', eye='calm', beard='mustache', head='helmet', helm='#8a8f98', crest='plume', crestColor='#2a5aa0',
               outfit='armor', main='#3a4a6a', trim='#d8c890', prop='spear', bg=BG['blue'], scene='mountain'),
    '顏良': dict(skin='bronze', face='square', brow='thick', eye='fierce', age='mid', beard='full', head='helmet', helm='#a88a4a', crest='horn',
               outfit='armor', armor='scale', main='#6a5a1a', trim='#e0c060', prop='glaive', bg=BG['gold'], scene='wall', mouth='frown'),
    '文醜': dict(skin='tan', face='round', brow='thick', eye='round', age='mid', beard='tiger', head='helmet', helm='#5a5040', crest='tassel',
               outfit='armor', main='#4a4020', trim='#c8a24a', prop='spear', bg=BG['olive'], scene='wall', mouth='shout'),
    '公孫瓚': dict(skin='fair', face='long', brow='sword', eye='fierce', age='mid', beard='mustache', head='helmet', helm='#eef1f4', crest='plume',
                crestColor='#f4f4f0', outfit='armorWhite', main='#e0e4ea', trim='#c8a24a', prop='spear', bg=BG['snowy'], scene='snow'),
    '龐德': dict(skin='tan', face='square', brow='thick', eye='fierce', age='mid', beard='full', head='helmet', helm='#5a5e68', crest='tassel',
               helmFur=True, outfit='armor', main='#4a3a2a', trim='#b8892f', prop='axe', bg=BG['sand'], scene='desert', mouth='stern'),
    '馬岱': dict(skin='warm', brow='sword', eye='calm', beard='mustache', head='helmet', helm='#cfd6dc', crest='plume', crestColor='#c0392b',
               outfit='armor', main='#5a4a3a', trim='#c8a24a', prop='saber', bg=BG['sand'], scene='desert', turn=1),
}
ADV_ALIAS = {'蔡文姬': '蔡琰', '甄宓': '甄姬'}


# ---------------------------------------------------------------- 武將自動外觀
MAINS = ['#2f4a6e', '#6a2a22', '#2c5a3a', '#4a3a5a', '#5a4a22', '#3a3a44', '#7a2a3a', '#245a5a', '#5a3a1e', '#3a4a2a',
         '#8a5a1a', '#2a2a3a', '#4a2a2a', '#2a4a5a']
TRIMS = ['#d8b45a', '#e0c060', '#c8a24a', '#b8892f', '#e8d5a0', '#cfd6dc', '#9fb6d6']
LACES = ['#b8262a', '#2a5aa0', '#2f7d4a', '#7a3a8a', '#c8a24a', '#d06a2a', '#e8e0c8', '#1a1a1a']
HELMS = ['#8a8f98', '#5a5e68', '#a88a4a', '#6a5a4a', '#3a3a40', '#9a7a3a', '#7a8a98', '#cfd6dc']
CRESTS = ['#c0392b', '#b8262a', '#2a5aa0', '#2f7d4a', '#e8e4dc', '#6a2a8a', '#d8a040', '#1a1a1a']
HEADCOLS = ['#2c3a5a', '#3a3a3a', '#5a4a3a', '#2f5a4a', '#4a2a2a', '#5a6a8a', '#6a5a3a']
OLD_NAMES = {'程普', '韓當', '嚴顏', '孔融', '劉表', '王朗', '華歆', '鍾繇', '馬騰', '韓遂', '張昭', '劉繇', '閻象', '田豐'}


def officer_look(o):
    name = o['name']
    if name in LOOKS:
        return LOOKS[name]
    r = seeded('officer:' + name)
    war, it, pol, lead, cha = o['war'], o['int'], o['pol'], o['lead'], o['cha']
    sch = max(it, pol)
    if o['female']:
        return dict(skin=r.choice(['fair', 'pale', 'light']), face=r.choice(['fem', 'femSlim', 'femRound']), brow=r.choice(['willow', 'arched']),
                    eye=r.choice(['gentle', 'calm', 'phoenix']), head=r.choice(['bunHigh', 'bunSide', 'bunDouble', 'flyingBun']),
                    outfit='armorLady' if war >= 60 else r.choice(['hanfu', 'robeRich']), main=r.choice(MAINS), trim=r.choice(TRIMS[:5]),
                    prop='sword' if war >= 60 else r.choice(['scroll', 'flower', 'fanRound']), bg=r.choice(list(BG.values())),
                    emblem=r.choice(['mirror', 'cloud', 'none']), scene=r.choice(['flowers', 'moon', 'waves']), turn=r.choice([-1, 0, 1]))
    if war >= 80 and war >= sch - 5:
        role = 'general'
    elif war >= 70 and sch >= 78:
        role = 'hybrid'
    elif sch >= 68 and war < 66:
        role = 'scholar'
    else:
        role = 'officer'
    if name in OLD_NAMES:
        age = 'old'
    elif o['from'] <= 185:
        age = r.choice(['mid', 'mid', 'mid', 'old', 'young'])
    elif o['from'] >= 205:
        age = r.choice(['young', 'young', 'mid'])
    else:
        age = r.choice(['young', 'mid', 'mid'])
    burly = war >= 88 and it < 50
    c = dict(age=age, turn=r.choice([-1, 0, 0, 1]), gaze=r.choice([0, 0, 0, 1, -1]), main=r.choice(MAINS), trim=r.choice(TRIMS),
             bg=r.choice(list(BG.values())))
    if role in ('general', 'officer'):
        c['skin'] = r.choice(['light', 'warm', 'warm', 'tan', 'bronze', 'fair'])
        c['face'] = r.choice(['square', 'oval', 'long', 'round'] + (['square', 'round'] if burly else []))
        c['brow'] = r.choice(['sword', 'thick', 'thick', 'straight'])
        c['eye'] = r.choice(['fierce', 'phoenix', 'round', 'calm', 'fierce'])
    else:
        c['skin'] = r.choice(['fair', 'light', 'light', 'warm', 'pale'])
        c['face'] = r.choice(['oval', 'long', 'long', 'round'])
        c['brow'] = r.choice(['straight', 'thin', 'knit', 'sword'])
        c['eye'] = r.choice(['calm', 'narrow', 'gentle', 'phoenix', 'calm'])
    if age == 'young':
        c['beard'] = r.choice(['none', 'none', 'mustache', 'goatee', 'stubble'])
    elif age == 'mid':
        c['beard'] = r.choice(['goatee', 'mustache', 'full', 'long', 'chinstrap', 'thin'] if role != 'scholar'
                              else ['goatee', 'thin', 'long', 'mustache'])
    else:
        c['beard'] = r.choice(['long', 'full', 'thin'])
        c['brow'] = r.choice(['white', c['brow']])
        c['eye'] = r.choice(['old', c['eye']])
        c['beardColor'] = r.choice(['#e4e4e4', '#bdbdbd', '#9a9a9a'])
        c['hairColor'] = r.choice(['#cfcfcf', '#9a9a9a'])
    if burly:
        c['build'] = 'burly'
        c['beard'] = r.choice(['full', 'tiger', 'stubble'])
    if cha >= 85:
        c['mouth'] = r.choice(['smile', 'neutral'])
    elif cha < 50:
        c['mouth'] = r.choice(['frown', 'stern', 'smirk'])
    else:
        c['mouth'] = r.choice(['neutral', 'stern', 'neutral', 'smile'])
    c['emblem'] = r.choice(['mirror', 'sun', 'lattice', 'cloud', 'mirror'])
    if role == 'general':
        c['scene'] = r.choice(['mountain', 'wall', 'clouds', 'desert', 'waves', 'flame'])
        if r.random() < .8:
            c.update(head='helmet', helm=r.choice(HELMS), crest=r.choice(['tassel', 'tassel', 'plume', 'plume', 'horn', 'wing', 'none']),
                     crestColor=r.choice(CRESTS), plates=r.random() < .5, helmFur=r.random() < .15)
        else:
            c.update(head=r.choice(['band', 'scarf', 'bun']), headColor=r.choice(['#b8262a', '#2a5aa0', '#2f7d4a', '#1a1a1a', '#6a2a8a']))
        c['outfit'] = r.choice(['armor', 'armor', 'armor', 'robeArmor'])
        c['armor'] = r.choice(['lamellar', 'lamellar', 'scale'])
        c['lace'] = r.choice(LACES)
        if c['outfit'] == 'robeArmor':
            c['plate'] = shade(c['main'], -.1)
        if lead >= 82 and r.random() < .5:
            c['cloak'] = r.choice(['#7a1e1e', '#1e2a4a', '#2a2a2a', '#5a1e3a', '#1e3a2a'])
        c['prop'] = r.choice(['spear', 'spear', 'glaive', 'halberd', 'saber', 'sword', 'axe', 'mace', 'bow', 'flag'])
        if c['prop'] == 'bow':
            c['acc'] = ('quiver',)
        c['tassel'] = r.choice(CRESTS[:4])
        c['scarf'] = r.choice([None, None, '#b8262a', '#2a5aa0', '#e8e0c8'])
    elif role == 'hybrid':
        c['scene'] = r.choice(['mountain', 'waves', 'wall', 'none'])
        c['head'] = r.choice(['crown', 'heguan', 'guanjin', 'helmet'])
        c['headColor'] = r.choice(['#1a1a1a', '#1a1a1a'] + HEADCOLS[:3])
        if c['head'] == 'helmet':
            c.update(helm=r.choice(HELMS), crest=r.choice(['plume', 'tassel']), crestColor=r.choice(CRESTS))
        c['outfit'] = r.choice(['robeArmor', 'armor'])
        c['plate'] = shade(c['main'], -.15)
        c['lace'] = r.choice(LACES)
        c['prop'] = r.choice(['sword', 'saber', 'scroll', 'flag', 'sword'])
        if r.random() < .3:
            c['cloak'] = shade(c['main'], -.25)
    elif role == 'scholar':
        c['scene'] = r.choice(['none', 'mountain', 'bamboo', 'reeds', 'stars', 'moon'])
        c['emblem'] = r.choice(['lattice', 'cloud', 'mirror'])
        c['head'] = r.choice(['jinxian', 'jinxian', 'longguan', 'guanjin', 'scarf', 'crown'] if pol >= 75 else ['guanjin', 'scarf', 'crown', 'longguan'])
        c['headColor'] = '#1a1a1a' if c['head'] in ('jinxian', 'crown', 'longguan') else r.choice(HEADCOLS)
        c['outfit'] = 'robeRich' if pol >= 85 and r.random() < .6 else r.choice(['robe', 'robeSage', 'robe'])
        c['main'] = r.choice(MAINS + ['#d8d4c4', '#8a9aa8', '#6a7a5a'])
        c['trim'] = r.choice(['#e8d8a0', '#e8dcc0', '#d8c890', '#c8a24a'])
        c['prop'] = r.choice(['scroll', 'book', 'brush', 'none', 'scroll', 'cup', 'whisk'])
    else:
        c['scene'] = r.choice(['mountain', 'wall', 'waves', 'none'])
        c['head'] = r.choice(['band', 'scarf', 'crown', 'bun', 'helmet', 'helmet'])
        c['headColor'] = r.choice(['#b8262a', '#2a5aa0', '#2f7d4a', '#1a1a1a', '#5a4a3a'])
        if c['head'] == 'helmet':
            c.update(helm=r.choice(HELMS), crest=r.choice(['tassel', 'none', 'plume']), crestColor=r.choice(CRESTS))
        c['outfit'] = r.choice(['robeArmor', 'armor', 'robe'])
        c['plate'] = shade(c['main'], -.12)
        c['lace'] = r.choice(LACES)
        c['prop'] = r.choice(['saber', 'sword', 'spear', 'none'])
    if c['head'] == 'scarf' and c['headColor'] in ('#1a1a1a', '#3a3a3a', '#5a4a3a', '#4a2a2a'):
        c['headColor'] = r.choice(['#2c3a5a', '#2f5a4a', '#5a6a8a', '#6a5a3a', '#b8262a'])   # 深色頭巾易被看成長髮
    if c['outfit'] in ('robe', 'robeSage', 'robeRich') and c['head'] == 'crown':
        c['headColor'] = '#1a1a1a'
    if c.get('head') == 'helmet' and c.get('crest') == 'none':
        c['crest'] = 'ball'
    if r.random() < .5 and c.get('prop') in ('spear', 'glaive', 'halberd', 'axe', 'flag'):
        c['propSide'] = 'left' if c['prop'] != 'flag' else 'right'
    return c


# ---------------------------------------------------------------- 主程式
def advisor_look(a):
    _id, name, gender, style = a[0], a[1], a[2], a[3]
    key = ADV_ALIAS.get(name, name)
    return LOOKS[key]


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(errors='replace')
    os.makedirs(OUT_P, exist_ok=True)
    os.makedirs(OUT_O, exist_ok=True)
    written = []
    players, advisors = [], []
    for pid, title, gender in data.PLAYER_PORTRAITS:
        female = gender == '女'
        look = (PLAYER_F if female else PLAYER_M)[title]
        svg = portrait(pid, look, female)
        with open(os.path.join(OUT_P, pid + '.svg'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg)
        written.append(('portraits', pid, title, len(svg)))
        players.append({'id': pid, 'title': title, 'gender': gender})
    for a in data.ADVISORS:
        aid, name, gender, style, epithet = a[0], a[1], a[2], a[3], a[4]
        svg = portrait(aid, advisor_look(a), gender == '女')
        with open(os.path.join(OUT_P, aid + '.svg'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg)
        written.append(('portraits', aid, f'{name}（{epithet}）', len(svg)))
        advisors.append({'id': aid, 'name': name, 'gender': gender, 'style': style, 'epithet': epithet})
    officers = []
    for o in data.OFFICERS:
        svg = portrait(o['id'], officer_look(o), o['female'])
        with open(os.path.join(OUT_O, o['id'] + '.svg'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg)
        written.append(('officers', o['id'], o['name'], len(svg)))
        officers.append(o)
    with open(os.path.join(OUT_P, 'index.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'players': players, 'advisors': advisors}, f, ensure_ascii=False, indent=1)
    # 總覽頁（檢查用，不隨遊戲發佈）
    def grid(title, items):
        cells = ''.join(f'<figure><img src="../web/assets/{d}/{i}.svg" alt="{lbl}" loading="lazy"><figcaption>{i}<br>{lbl}</figcaption></figure>'
                        for d, i, lbl, _ in items)
        return f'<h2>{title}（{len(items)}）</h2><div class="g">{cells}</div>'
    sheet = ('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>頭像總覽</title>'
             '<style>body{background:#1a120b;color:#eee;font-family:"Microsoft JhengHei",sans-serif;margin:12px}'
             '.g{display:grid;grid-template-columns:repeat(auto-fill,128px);gap:10px}figure{margin:0;text-align:center;font-size:12px}'
             'img{width:128px;height:160px;display:block}h2{color:#e8c86a;font-size:18px}</style>'
             '<h1>小柯機器人三國志遊戲：頭像總覽</h1>'
             + grid('玩家頭像・男', [w for w in written if w[1].startswith('m')])
             + grid('玩家頭像・女', [w for w in written if w[1].startswith('f')])
             + grid('AI 軍師', [w for w in written if w[1].startswith('adv')])
             + grid('武將', [w for w in written if w[0] == 'officers']) + '</html>')
    with open(SHEET, 'w', encoding='utf-8', newline='\n') as f:
        f.write(sheet)
    big = max(written, key=lambda w: w[3])
    print(f'玩家頭像 {len(players)} 張、軍師 {len(advisors)} 張 → {OUT_P}')
    print(f'武將頭像 {len(officers)} 張 → {OUT_O}')
    print(f'最大檔案：{big[1]} {big[2]} {big[3] / 1024:.1f} KB')


if __name__ == '__main__':
    main()
