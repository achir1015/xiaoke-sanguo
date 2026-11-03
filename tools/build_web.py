# -*- coding: utf-8 -*-
"""產生網頁版（線上版、Android、iPhone/iPad 共用）：site/

site/index.html      首頁（下載各平台、線上玩）
site/online/         線上版遊戲：web/ ＋ sanguo/ Python 引擎（Pyodide 在瀏覽器執行）＋ Pyodide ＋ Claude SDK

用法：python tools/build_web.py [輸出資料夾]
Pyodide 第一次會下載到 tools/.cache/pyodide（約 14 MB）。
"""
import json
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYODIDE_VER = '0.27.7'
PYODIDE_FILES = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']
REPO = 'achir1015/xiaoke-sanguo'

# 手機螢幕寬度不到 1100 時，把整個畫面縮放成 1100 寬（和電腦最小視窗同一套版面）
HEAD_INJECT = """<script>
window.XK_WEB = { pyodide: 'vendor/pyodide/', py: 'py/' };
(function () {
  // 用網頁實際可用的寬度（扣掉 iPhone 瀏海的安全區域），不是整個螢幕寬
  var w = window.innerWidth || document.documentElement.clientWidth || screen.width;
  if (w < 1100) {
    var k = (w / 1100).toFixed(4);
    document.querySelector('meta[name=viewport]').setAttribute('content', 'width=1100, initial-scale=' + k + ', minimum-scale=' + k + ', maximum-scale=' + k + ', user-scalable=no, viewport-fit=cover');
  }
})();
</script>
"""


def pyodide_cache():
    d = ROOT / 'tools' / '.cache' / 'pyodide'
    d.mkdir(parents=True, exist_ok=True)
    for f in PYODIDE_FILES:
        p = d / f
        if not p.exists() or p.stat().st_size == 0:
            url = f'https://cdn.jsdelivr.net/pyodide/v{PYODIDE_VER}/full/{f}'
            print('下載', url)
            with urllib.request.urlopen(url, timeout=120) as r:
                p.write_bytes(r.read())
    return d


def build_game(out: Path):
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(ROOT / 'web', out, ignore=shutil.ignore_patterns('guide-test.html'))
    # Python 引擎
    py = out / 'py' / 'sanguo'
    py.mkdir(parents=True)
    files = []
    for f in sorted((ROOT / 'sanguo').glob('*.py')):
        shutil.copy2(f, py / f.name)
        files.append(f.name)
    (out / 'py' / 'files.json').write_text(json.dumps(files), encoding='utf-8')
    # Pyodide 與 Claude SDK
    pd = out / 'vendor' / 'pyodide'
    pd.mkdir(parents=True)
    for f in PYODIDE_FILES:
        shutil.copy2(pyodide_cache() / f, pd / f)
    shutil.copy2(ROOT / 'tools' / 'vendor' / 'anthropic.js', out / 'vendor' / 'anthropic.js')
    html = (out / 'index.html').read_text(encoding='utf-8')
    html = html.replace('<script type="importmap">', HEAD_INJECT + '<script type="importmap">', 1)
    (out / 'index.html').write_text(html, encoding='utf-8')


LANDING = """<!doctype html>
<html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>小柯機器人三國志遊戲</title><link rel="icon" href="online/assets/icon.png">
<style>
body{margin:0;font-family:"Microsoft JhengHei UI","PingFang TC","Noto Sans TC",sans-serif;background:radial-gradient(#3a1e12,#120a06);color:#f3e6c8;min-height:100vh}
main{max-width:860px;margin:auto;padding:28px 16px;text-align:center}
img.logo{width:128px;height:128px;border-radius:26px;box-shadow:0 8px 24px #000a}
h1{font-family:"DFKai-SB","BiauKai","Kaiti TC",serif;color:#f1d58a;font-size:42px;letter-spacing:6px;margin:12px 0 4px}
.sub{color:#c9b98a;letter-spacing:3px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:26px 0}
a.card{display:block;padding:16px;border-radius:14px;background:#2a1d12;border:1px solid #d8b45a55;color:#f3e6c8;text-decoration:none;text-align:left}
a.card:hover{border-color:#d8b45a;box-shadow:0 0 14px #d8b45a55}
a.card b{display:block;font-size:19px;color:#f1d58a;margin-bottom:4px}
a.card span{font-size:13.5px;color:#c9b98a}
a.play{background:linear-gradient(#b8892f,#8a6220);border-color:#e8c86a}
a.play b,a.play span{color:#fff8e6}
ul{text-align:left;line-height:1.8;color:#e2d6bc}
footer{margin-top:24px;color:#b3a585;font-size:13px}
</style></head><body><main>
<img class="logo" src="online/assets/icon.png" alt="">
<h1>小柯機器人三國志</h1><div class="sub">群雄逐鹿・3D 沙盤策略遊戲　v__VER__</div>
<div class="grid">
<a class="card play" href="online/"><b>▶ 線上玩（網頁版）</b><span>不用安裝，電腦、平板、手機瀏覽器直接玩</span></a>
<a class="card" href="https://github.com/__REPO__/releases/latest/download/XiaokeSanguo-Setup-__VER__.exe"><b>Windows 10／11</b><span>下載安裝程式（含自動更新）</span></a>
<a class="card" href="https://github.com/__REPO__/releases/latest/download/XiaokeSanguo-mac-AppleSilicon-__VER__.dmg"><b>Mac（Apple 晶片）</b><span>M1／M2／M3／M4</span></a>
<a class="card" href="https://github.com/__REPO__/releases/latest/download/XiaokeSanguo-mac-Intel-__VER__.dmg"><b>Mac（Intel）</b><span>Intel 處理器的 Mac</span></a>
<a class="card" href="https://github.com/__REPO__/releases/latest/download/XiaokeSanguo-__VER__-android.apk"><b>Android 手機／平板</b><span>下載 APK 安裝（橫放遊玩）</span></a>
<a class="card" href="ios/"><b>iPhone／iPad</b><span>用 Safari 開啟後點選安裝（限已登記的裝置）</span></a>
<a class="card" href="https://github.com/__REPO__/releases/latest"><b>所有版本</b><span>GitHub Releases 下載頁</span></a>
</div>
<ul>
<li>兩個劇本：群雄割據（西元 194 年，12 個勢力）、三分天下（西元 220 年）</li>
<li>真人對 AI、AI 對 AI 觀戰、遠端真人對戰（房號邀約、語音通話）、同機多人</li>
<li>30 位 AI 軍師陪同：建議一鍵照辦，還能「軍師代打」，隨時取回主位</li>
<li>3D 沙盤地圖與 3D 戰場：突擊、齊射、固守、計策、單挑</li>
<li>20 首原創背景音樂、動畫＋語音的遊戲教學</li>
</ul>
<footer>系統開發：吳玉柱 先生 與 Claude AI Opus 5.5</footer>
</main></body></html>
"""


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'site'
    out.mkdir(parents=True, exist_ok=True)
    build_game(out / 'online')
    ver = json.loads((ROOT / 'web' / 'version.json').read_text(encoding='utf-8'))['version']
    (out / 'index.html').write_text(LANDING.replace('__VER__', ver).replace('__REPO__', REPO), encoding='utf-8')
    (out / '.nojekyll').write_text('')
    n = sum(1 for _ in out.rglob('*') if _.is_file())
    size = sum(p.stat().st_size for p in out.rglob('*') if p.is_file()) / 1048576
    print(f'網頁版 v{ver}：{n} 個檔案、{size:.1f} MB → {out}')


if __name__ == '__main__':
    main()
