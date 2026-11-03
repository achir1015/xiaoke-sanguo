# -*- coding: utf-8 -*-
"""產生小柯機器人三國志的圖示：戴著將軍盔的小柯機器人，與手持偃月刀、綠頭巾長鬍子的三國武將並肩。
輸出 web/assets/icon.png（網頁與視窗）、desktop/app.ico（Windows 捷徑）、desktop/icon-1024.png（Mac／手機用）。
執行：python tools/make_icon.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
S = 1024
K = 3   # 超取樣


def P(*v):
    return [round(x * K) for x in v]


def background():
    img = Image.new('RGBA', (S * K, S * K), (0, 0, 0, 0))
    g = Image.new('RGBA', (S * K, S * K))
    gd = ImageDraw.Draw(g)
    cx = cy = S * K / 2
    for r in range(int(S * K * 0.75), 0, -6 * K):
        t = r / (S * K * 0.75)
        col = tuple(round(a + (b - a) * t) for a, b in zip((196, 58, 36), (40, 14, 10))) + (255,)
        gd.ellipse([cx - r, cy - r * 1.05, cx + r, cy + r * 1.05], fill=col)
    mask = Image.new('L', (S * K, S * K), 0)
    ImageDraw.Draw(mask).rounded_rectangle(P(36, 36, S - 36, S - 36), radius=230 * K, fill=255)
    img.paste(g, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(P(52, 52, S - 52, S - 52), radius=214 * K, outline=(232, 196, 106, 255), width=14 * K)
    # 夕陽與遠山
    d.ellipse(P(560, 120, 900, 460), fill=(247, 196, 92, 255))
    d.polygon(P(52, 760, 220, 600, 330, 700, 470, 560, 640, 720, 780, 610, 972, 760, 972, 972, 52, 972), fill=(70, 22, 14, 255))
    img.paste((0, 0, 0, 0), (0, 0), Image.eval(mask, lambda v: 255 - v))
    return img


def general(d):
    """右邊的三國武將：綠頭巾、紅臉、長鬍子、偃月刀。"""
    # 偃月刀
    d.line(P(930, 150, 690, 930), fill=(110, 70, 40, 255), width=22 * K)
    d.polygon(P(905, 120, 990, 70, 975, 250, 900, 260), fill=(230, 236, 240, 255))
    d.polygon(P(905, 120, 935, 112, 925, 250, 900, 260), fill=(255, 255, 255, 255))
    # 身體（綠袍＋金甲）
    d.rounded_rectangle(P(560, 640, 930, 1000), radius=120 * K, fill=(38, 112, 64, 255))
    d.polygon(P(640, 650, 745, 760, 850, 650, 820, 900, 670, 900), fill=(214, 172, 74, 255))
    for y in range(690, 900, 40):
        d.line(P(675, y, 815, y), fill=(160, 116, 40, 255), width=6 * K)
    # 臉
    d.ellipse(P(612, 360, 878, 650), fill=(196, 72, 52, 255))
    # 頭巾
    d.pieslice(P(596, 300, 894, 560), 180, 360, fill=(30, 120, 70, 255))
    d.rectangle(P(596, 420, 894, 450), fill=(30, 120, 70, 255))
    d.polygon(P(880, 430, 960, 480, 940, 520, 870, 470), fill=(30, 120, 70, 255))
    # 眉眼（丹鳳眼、臥蠶眉）
    d.line(P(645, 462, 725, 488), fill=(25, 15, 10, 255), width=18 * K)
    d.line(P(765, 488, 845, 462), fill=(25, 15, 10, 255), width=18 * K)
    d.line(P(662, 512, 718, 522), fill=(25, 15, 10, 255), width=10 * K)
    d.line(P(772, 522, 828, 512), fill=(25, 15, 10, 255), width=10 * K)
    # 長鬍子
    d.polygon(P(660, 570, 830, 570, 800, 760, 745, 860, 690, 760), fill=(24, 18, 14, 255))
    d.ellipse(P(700, 552, 790, 600), fill=(24, 18, 14, 255))
    d.rectangle(P(728, 590, 762, 598), fill=(150, 50, 40, 255))


def robot(d):
    """左邊的小柯機器人：白色電視頭、青色眼睛笑臉、戴金色將軍盔與紅纓。"""
    white = (255, 255, 255, 255)
    cyan = (34, 211, 238, 255)
    # 身體與披風
    d.polygon(P(110, 1000, 170, 700, 470, 700, 540, 1000), fill=(180, 36, 30, 255))
    d.rounded_rectangle(P(170, 680, 470, 980), radius=60 * K, fill=white)
    d.ellipse(P(285, 760, 355, 830), fill=cyan)
    # 耳朵
    d.rounded_rectangle(P(70, 420, 130, 580), radius=26 * K, fill=white)
    d.rounded_rectangle(P(510, 420, 570, 580), radius=26 * K, fill=white)
    # 頭
    d.rounded_rectangle(P(110, 330, 530, 690), radius=90 * K, fill=white)
    d.rounded_rectangle(P(150, 372, 490, 650), radius=56 * K, fill=(16, 24, 40, 255))
    d.ellipse(P(215, 450, 295, 530), fill=cyan)
    d.ellipse(P(345, 450, 425, 530), fill=cyan)
    d.arc(P(250, 500, 390, 600), start=25, end=155, fill=cyan, width=18 * K)
    # 將軍盔
    d.pieslice(P(110, 190, 530, 470), 180, 360, fill=(222, 178, 70, 255))
    d.rectangle(P(100, 316, 540, 352), fill=(190, 140, 40, 255))
    d.polygon(P(320, 210, 290, 120, 350, 120), fill=(190, 140, 40, 255))
    d.ellipse(P(276, 60, 364, 140), fill=(214, 40, 34, 255))   # 紅纓
    d.polygon(P(290, 110, 240, 30, 300, 80, 320, 20, 340, 80, 400, 30, 350, 110), fill=(214, 40, 34, 255))
    d.ellipse(P(296, 232, 344, 280), fill=(214, 40, 34, 255))  # 盔上紅寶石


def make():
    img = background()
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    general(d)
    robot(d)
    # 陰影
    sh = layer.split()[3].filter(ImageFilter.GaussianBlur(14 * K))
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    shadow.putalpha(sh.point(lambda v: v * 0.55))
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(P(36, 36, S - 36, S - 36), radius=230 * K, fill=255)
    out = Image.alpha_composite(img, Image.composite(shadow, Image.new('RGBA', img.size, (0, 0, 0, 0)), mask))
    out = Image.alpha_composite(out, Image.composite(layer, Image.new('RGBA', img.size, (0, 0, 0, 0)), mask))
    return out.resize((S, S), Image.LANCZOS)


def main():
    big = make()
    (ROOT / 'web' / 'assets').mkdir(parents=True, exist_ok=True)
    big.resize((256, 256), Image.LANCZOS).save(ROOT / 'web' / 'assets' / 'icon.png')
    big.save(ROOT / 'desktop' / 'icon-1024.png')
    big.save(ROOT / 'desktop' / 'app.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('icons ok')


if __name__ == '__main__':
    main()
