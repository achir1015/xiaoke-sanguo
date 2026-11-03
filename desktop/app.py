# -*- coding: utf-8 -*-
"""
小柯機器人三國志遊戲 — 桌面版（Windows 11／macOS 共用）

架構：
  AppInfo      名稱、版本、資料夾位置
  Settings     使用者設定（settings.json）與 Claude 金鑰（Windows 用 DPAPI 加密）
  HostApi      網頁可以呼叫的電腦功能：設定、音樂、存檔、更新、AI 軍師
  Server       本機網頁伺服器：提供 web/ 畫面、/api/engine（遊戲引擎）、/api/host（電腦功能）
  Updater      版本更新：查 GitHub Releases → 下載安裝檔 → 安裝後自動重開
  main()       開啟視窗（Windows 用 Edge WebView2，Mac 用 WebKit）

遊戲規則全部在 sanguo/（純 Python），畫面在 web/（Three.js 3D）。
"""
import base64
import http.server
import json
import os
import platform
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(ROOT))

from sanguo.api import Engine  # noqa: E402

APP_NAME = '小柯機器人三國志遊戲'
GITHUB_REPO = 'achir1015/xiaoke-sanguo'
IS_MAC = sys.platform == 'darwin'
IS_WIN = sys.platform == 'win32'
MAC_ARCH = 'AppleSilicon' if IS_MAC and platform.machine() == 'arm64' else 'Intel'


class AppInfo:
    @staticmethod
    def web_dir() -> Path:
        return ROOT / 'web'

    @staticmethod
    def version() -> str:
        try:
            return json.loads((AppInfo.web_dir() / 'version.json').read_text(encoding='utf-8'))['version']
        except Exception:
            return '0.0.0'

    @staticmethod
    def data_dir() -> Path:
        env = os.environ.get('XIAOKE_DATA_DIR')
        if env:
            p = Path(env)
        elif IS_WIN:
            p = Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'XiaokeSanguo'
        elif IS_MAC:
            p = Path.home() / 'Library' / 'Application Support' / 'XiaokeSanguo'
        else:
            p = Path.home() / '.xiaoke-sanguo'
        p.mkdir(parents=True, exist_ok=True)
        return p


APP_VERSION = AppInfo.version()


# ---------------- 金鑰加密（Windows DPAPI）----------------
def _protect(text: str) -> str:
    raw = text.encode('utf-8')
    if IS_WIN:
        try:
            import ctypes
            from ctypes import wintypes

            class BLOB(ctypes.Structure):
                _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
            buf = ctypes.create_string_buffer(raw, len(raw))
            inp, out = BLOB(len(raw), buf), BLOB()
            if ctypes.windll.crypt32.CryptProtectData(ctypes.byref(inp), None, None, None, None, 0, ctypes.byref(out)):
                data = ctypes.string_at(out.pbData, out.cbData)
                ctypes.windll.kernel32.LocalFree(out.pbData)
                return 'dpapi:' + base64.b64encode(data).decode()
        except Exception:
            pass
    return 'b64:' + base64.b64encode(raw).decode()


def _unprotect(s: str) -> str:
    if not s:
        return ''
    try:
        if s.startswith('dpapi:') and IS_WIN:
            import ctypes
            from ctypes import wintypes

            class BLOB(ctypes.Structure):
                _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
            raw = base64.b64decode(s[6:])
            buf = ctypes.create_string_buffer(raw, len(raw))
            inp, out = BLOB(len(raw), buf), BLOB()
            if ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(inp), None, None, None, None, 0, ctypes.byref(out)):
                data = ctypes.string_at(out.pbData, out.cbData)
                ctypes.windll.kernel32.LocalFree(out.pbData)
                return data.decode('utf-8')
            return ''
        if s.startswith('b64:'):
            return base64.b64decode(s[4:]).decode('utf-8')
    except Exception:
        return ''
    return ''


class Settings:
    lock = threading.Lock()

    @staticmethod
    def path() -> Path:
        return AppInfo.data_dir() / 'settings.json'

    @staticmethod
    def load() -> dict:
        try:
            return json.loads(Settings.path().read_text(encoding='utf-8-sig'))
        except Exception:
            return {}

    @staticmethod
    def save(d: dict):
        with Settings.lock:
            tmp = Settings.path().with_suffix('.tmp')
            tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf-8')
            os.replace(tmp, Settings.path())


# ---------------- AI 軍師（Claude）----------------
class Advisor:
    MODEL = 'claude-opus-5-5'

    @staticmethod
    def ask(question: str, context: str, persona: dict) -> dict:
        key = _unprotect(Settings.load().get('api_key', ''))
        if not key:
            return {'ok': False, 'error': 'no_key'}
        try:
            import anthropic
        except Exception:
            return {'ok': False, 'error': '缺少 anthropic 套件'}
        name = persona.get('name', '軍師')
        system = (
            f"你是三國時代的軍師「{name}」（{persona.get('epithet', '')}），風格偏向「{persona.get('style_name', '均衡')}」。"
            f"你正在小柯機器人三國志遊戲中輔佐玩家。請用繁體中文、以{name}的口吻回答，自稱用「{persona.get('say', '臣以為')}」開頭。"
            "回答要具體可行：指出該在哪座城、派哪位武將、做哪個指令（開墾、商業、修城、撫民、徵兵、訓練、搜索、登用、褒賞、移動、運輸、出征），"
            "或在戰鬥中建議哪個戰術（突擊、齊射、固守、計策、單挑、撤退）。三到六句即可，不要用 Markdown 標題或表格。"
        )
        client = anthropic.Anthropic(api_key=key, timeout=60.0, max_retries=1)
        try:
            resp = client.beta.messages.create(
                model=Advisor.MODEL, max_tokens=2000,
                betas=['server-side-fallback-2026-07-01'], fallbacks='default',
                output_config={'effort': 'low'},
                system=system,
                messages=[{'role': 'user', 'content': f"目前局勢：\n{context}\n\n主公的問題：{question}"}],
            )
        except anthropic.AuthenticationError:
            return {'ok': False, 'error': '金鑰無效，請到「設定」重新輸入'}
        except anthropic.RateLimitError:
            return {'ok': False, 'error': '請求太頻繁，請稍後再問'}
        except anthropic.APIStatusError as e:
            return {'ok': False, 'error': f'軍師暫時無法回答（{e.status_code}）'}
        except anthropic.APIConnectionError:
            return {'ok': False, 'error': '連不上網路'}
        if resp.stop_reason == 'refusal':
            return {'ok': False, 'error': '軍師不便回答這個問題'}
        text = ''.join(getattr(b, 'text', '') for b in resp.content if getattr(b, 'type', '') == 'text').strip()
        return {'ok': True, 'text': text or '……'}


# ---------------- 版本更新 ----------------
class Updater:
    API = f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest'
    LATEST = f'https://github.com/{GITHUB_REPO}/releases/latest'
    DOWNLOAD_PREFIX = f'https://github.com/{GITHUB_REPO}/releases/download/'

    def __init__(self):
        self.window = None
        self.status = {'state': 'idle', 'pct': 0}

    @staticmethod
    def wanted(name: str) -> bool:
        n = name.lower()
        return (n.endswith('.dmg') and MAC_ARCH.lower() in n) if IS_MAC else (n.endswith('.exe') and 'setup' in n)

    def check(self):
        try:
            req = urllib.request.Request(self.API, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'XiaokeSanguo/' + APP_VERSION})
            with urllib.request.urlopen(req, timeout=15) as r:
                rel = json.load(r)
            asset = next((a for a in rel.get('assets', []) if self.wanted(a.get('name', ''))), None)
            notes = (rel.get('body') or '').split('## 下載安裝')[0].strip()
            return {'status': 'ok', 'current': APP_VERSION, 'latest': str(rel.get('tag_name', '')).lstrip('vV'), 'notes': notes,
                    'date': (rel.get('published_at') or '')[:10], 'url': asset['browser_download_url'] if asset else '',
                    'page': rel.get('html_url', '')}
        except Exception as e:
            # GitHub API 被限流時：看 releases/latest 轉址到哪個版本
            try:
                req = urllib.request.Request(self.LATEST, method='HEAD', headers={'User-Agent': 'XiaokeSanguo/' + APP_VERSION})
                with urllib.request.urlopen(req, timeout=15) as r:
                    tag = r.geturl().rstrip('/').rsplit('/', 1)[-1].lstrip('vV')
                fn = f'XiaokeSanguo-mac-{MAC_ARCH}-{tag}.dmg' if IS_MAC else f'XiaokeSanguo-Setup-{tag}.exe'
                return {'status': 'ok', 'current': APP_VERSION, 'latest': tag, 'notes': '', 'date': '',
                        'url': f'{self.DOWNLOAD_PREFIX}v{tag}/{fn}', 'page': self.LATEST}
            except Exception:
                return {'status': 'error', 'message': str(e)}

    def install(self, url: str, version: str):
        if not url.startswith(self.DOWNLOAD_PREFIX):
            return {'status': 'error', 'message': '更新網址不正確'}
        if self.status['state'] in ('downloading', 'launching'):
            return {'status': 'ok'}
        self.status = {'state': 'downloading', 'pct': 0}
        threading.Thread(target=self._run, args=(url, version), daemon=True).start()
        return {'status': 'ok'}

    def _run(self, url, version):
        try:
            name = ''.join(ch for ch in (url.rsplit('/', 1)[-1] or f'XiaokeSanguo-Setup-{version}.exe') if ch not in '\\/:*?"<>|')
            dest = Path(tempfile.gettempdir()) / name
            req = urllib.request.Request(url, headers={'User-Agent': 'XiaokeSanguo/' + APP_VERSION})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, 'wb') as fh:
                total, done = int(r.headers.get('Content-Length') or 0), 0
                while chunk := r.read(256 * 1024):
                    fh.write(chunk)
                    done += len(chunk)
                    if total:
                        self.status = {'state': 'downloading', 'pct': int(done * 100 / total)}
            if dest.stat().st_size < 1_000_000:
                raise RuntimeError('下載的安裝檔不完整')
            if IS_MAC:
                subprocess.Popen(['open', str(dest)])
                self.status = {'state': 'manual', 'pct': 100}
                return
            self.status = {'state': 'launching', 'pct': 100}
            for i in range(5):   # 防毒軟體可能短暫鎖住剛下載的檔案
                try:
                    subprocess.Popen([str(dest), '/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/relaunch=1'],
                                     creationflags=0x00000008 | 0x00000200, close_fds=True)
                    break
                except OSError:
                    time.sleep(1.5)
            time.sleep(1.5)
            try:
                if self.window:
                    self.window.destroy()
            finally:
                time.sleep(.5)
                os._exit(0)
        except Exception as e:
            self.status = {'state': 'error', 'pct': 0, 'message': str(e)}


# ---------------- 網頁可以呼叫的電腦功能 ----------------
MUSIC_EXT = ('.mp3', '.m4a', '.ogg', '.wav', '.flac', '.aac')


class HostApi:
    def __init__(self, updater: Updater):
        self.updater = updater
        self.window = None

    def call(self, method, params):
        fn = getattr(self, 'h_' + method, None)
        if fn is None:
            return {'ok': False, 'error': '未知的功能'}
        r = fn(**(params or {}))
        if isinstance(r, dict):
            r.setdefault('ok', True)
        return r

    def h_app_info(self):
        return {'name': APP_NAME, 'version': APP_VERSION, 'platform': 'mac' if IS_MAC else ('windows' if IS_WIN else 'linux'),
                'desktop': self.window is not None, 'repo': GITHUB_REPO}

    def h_settings_get(self):
        d = Settings.load()
        has_key = bool(_unprotect(d.pop('api_key', '')))
        return {'settings': d, 'has_key': has_key}

    def h_settings_set(self, patch):
        d = Settings.load()
        for k, v in (patch or {}).items():
            if k == 'api_key':
                continue
            if isinstance(v, dict) and isinstance(d.get(k), dict):
                d[k].update(v)
            else:
                d[k] = v
        Settings.save(d)
        return {}

    def h_set_api_key(self, key):
        d = Settings.load()
        key = (key or '').strip()
        d['api_key'] = _protect(key) if key else ''
        Settings.save(d)
        return {'has_key': bool(key)}

    def h_advisor_ask(self, question, context, persona):
        return Advisor.ask(question, context, persona or {})

    # 音樂：內建 20 首＋使用者自己加入的（放在資料夾 music）
    @staticmethod
    def user_music_dir() -> Path:
        p = AppInfo.data_dir() / 'music'
        p.mkdir(exist_ok=True)
        return p

    def h_music_list(self):
        tracks = []
        try:
            for t in json.loads((AppInfo.web_dir() / 'assets' / 'music' / 'tracks.json').read_text(encoding='utf-8')):
                tracks.append({'file': t['file'], 'title': t['title'], 'seconds': t['seconds'], 'builtin': True,
                               'url': 'assets/music/' + t['file']})
        except Exception:
            pass
        for f in sorted(self.user_music_dir().iterdir()):
            if f.suffix.lower() in MUSIC_EXT:
                tracks.append({'file': f.name, 'title': f.stem, 'builtin': False, 'url': '/usermusic/' + urllib.parse.quote(f.name)})
        return {'tracks': tracks}

    def h_music_add(self):
        if not self.window:
            return {'added': 0}
        import webview
        files = self.window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True,
                                               file_types=('Music files (*.mp3;*.m4a;*.ogg;*.wav;*.flac;*.aac)',))
        n = 0
        for f in files or []:
            p = Path(f)
            if p.suffix.lower() in MUSIC_EXT:
                shutil.copy2(p, self.user_music_dir() / p.name)
                n += 1
        return {'added': n}

    def h_music_remove(self, file):
        p = self.user_music_dir() / Path(file).name
        if p.exists():
            p.unlink()
        return {}

    # 存檔
    @staticmethod
    def save_dir() -> Path:
        p = AppInfo.data_dir() / 'saves'
        p.mkdir(exist_ok=True)
        return p

    @staticmethod
    def _safe(name):
        name = ''.join(ch for ch in str(name) if ch not in '\\/:*?"<>|').strip()[:60]
        return name or 'save'

    def h_save_list(self):
        out = []
        for f in sorted(self.save_dir().glob('*.json'), key=lambda x: -x.stat().st_mtime):
            try:
                meta = json.loads(f.read_text(encoding='utf-8')).get('meta', {})
            except Exception:
                meta = {}
            out.append({'name': f.stem, 'time': f.stat().st_mtime, 'meta': meta})
        return {'saves': out}

    def h_save_write(self, name, data):
        p = self.save_dir() / (self._safe(name) + '.json')
        tmp = p.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        os.replace(tmp, p)
        return {'name': p.stem}

    def h_save_read(self, name):
        p = self.save_dir() / (self._safe(name) + '.json')
        if not p.exists():
            return {'ok': False, 'error': '找不到這個存檔'}
        return {'data': json.loads(p.read_text(encoding='utf-8'))}

    def h_save_delete(self, name):
        p = self.save_dir() / (self._safe(name) + '.json')
        if p.exists():
            p.unlink()
        return {}

    def h_update_check(self):
        return self.updater.check()

    def h_update_install(self, url, version):
        return self.updater.install(url, version)

    def h_update_status(self):
        return self.updater.status

    def h_open_url(self, url):
        if not str(url).startswith('https://'):
            return {'ok': False}
        import webbrowser
        webbrowser.open(url)
        return {}

    def h_quit(self):
        threading.Thread(target=lambda: (time.sleep(.2), os._exit(0)), daemon=True).start()
        return {}


# ---------------- 本機網頁伺服器 ----------------
class Server:
    def __init__(self, port: int, host_api: HostApi):
        self.engine = Engine()
        self.lock = threading.Lock()
        web = AppInfo.web_dir()
        engine, lock = self.engine, self.lock

        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=str(web), **kw)

            def log_message(self, *a):
                pass

            def end_headers(self):
                self.send_header('Cache-Control', 'no-cache')
                super().end_headers()

            def guess_type(self, path):
                if str(path).endswith('.js') or str(path).endswith('.mjs'):
                    return 'text/javascript'
                return super().guess_type(path)

            def do_GET(self):
                if self.path.startswith('/usermusic/'):
                    name = urllib.parse.unquote(self.path[len('/usermusic/'):].split('?')[0])
                    p = HostApi.user_music_dir() / Path(name).name
                    if not p.exists():
                        self.send_error(404)
                        return
                    data = p.read_bytes()
                    self.send_response(200)
                    self.send_header('Content-Type', 'audio/mpeg')
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                super().do_GET()

            def do_POST(self):
                n = int(self.headers.get('Content-Length') or 0)
                try:
                    body = json.loads(self.rfile.read(n).decode('utf-8') or '{}')
                    if self.path == '/api/engine':
                        with lock:
                            res = engine.call(body.get('method'), body.get('params'))
                    elif self.path == '/api/host':
                        res = host_api.call(body.get('method'), body.get('params'))
                    else:
                        self.send_error(404)
                        return
                except Exception as e:
                    traceback.print_exc()
                    res = {'ok': False, 'error': f'程式錯誤：{e}'}
                data = json.dumps(res, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
            daemon_threads = True
            allow_reuse_address = False

        try:
            self.httpd = TS(('127.0.0.1', port), Handler)
        except OSError:
            self.httpd = TS(('127.0.0.1', 0), Handler)   # 固定埠被占用（例如另一個小柯開著）就換一個
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()


class DisplayScale:
    """Windows 文字大小放大（例如 210%）時，讓網頁寬度至少 1280，避免版面擠成手機樣式。"""
    MIN_CSS_WIDTH = 1280

    @staticmethod
    def fit(window):
        try:
            info = None
            for _ in range(40):
                info = window.evaluate_js('[innerWidth, devicePixelRatio]')
                if info:
                    break
                time.sleep(0.25)
            css_width, dpr = info
            target = max(1.0, min(dpr, css_width * dpr / DisplayScale.MIN_CSS_WIDTH))
            zoom = round(target / dpr, 3)
            if abs(zoom - 1) < 0.01:
                return
            from System import Action
            form = window.native
            control = form.browser.webview
            form.Invoke(Action(lambda: setattr(control, 'ZoomFactor', zoom)))
        except Exception:
            pass


class SelfTest:
    """安裝後自我測試：XiaokeSanguo.exe --selftest 報告.json（CI 用）"""
    JS = r"""
    (async () => {
      const r = { steps: [] };
      const step = async (name, fn) => { try { const v = await fn(); r.steps.push({ name, ok: true, info: String(v ?? '') }); } catch (e) { r.steps.push({ name, ok: false, info: String(e && e.message || e) }); } };
      const S = window.__xk;
      await step('畫面載入', () => { if (!S || !S.stat) throw new Error('沒有載入'); return Object.keys(S.stat.cities).length + ' 座城'; });
      await step('3D 地圖', () => { if (!S.map || !S.map.renderer) throw new Error('沒有 3D'); return 'WebGL ok'; });
      await step('背景音樂', () => { const n = S.music.tracks.length; if (n < 20) throw new Error(n + ' 首'); return n + ' 首'; });
      await step('頭像', async () => { const ok = await new Promise((res) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = 'assets/portraits/adv01.svg'; }); if (!ok) throw new Error('載不到'); return 'ok'; });
      await step('開新遊戲', async () => { document.querySelector('#hNew').click(); await new Promise((x) => setTimeout(x, 400)); document.querySelector('#sStart').click(); await new Promise((x) => setTimeout(x, 2500)); if (S.screen !== 'game') throw new Error(S.screen); return document.querySelector('#turnBanner').textContent; });
      await step('軍師建議', async () => { const v = await (await fetch('/api/engine', { method: 'POST', body: JSON.stringify({ method: 'advise', params: { fid: 'cao' } }) })).json(); if (!v.advice || !v.advice.length) throw new Error('沒有建議'); return v.advice[0].reason; });
      await step('教學模組', async () => { const m = await import('./js/guide.js'); return Object.keys(m).join(','); });
      r.ok = r.steps.every((s) => s.ok);
      return JSON.stringify(r);
    })()
    """

    def __init__(self, window, path: Path):
        self.window, self.path = window, path

    def run(self):
        report = {'ok': False, 'version': APP_VERSION, 'steps': []}
        try:
            for _ in range(240):   # Intel Mac 較慢：最多等 2 分鐘
                if self.window.evaluate_js('!!(window.__xk && window.__xk.stat && window.__xk.music && window.__xk.music.tracks.length)'):
                    break
                time.sleep(0.5)
            # 自我測試不出聲：停掉背景音樂與語音
            self.window.evaluate_js("if (window.__xk && window.__xk.music) { window.__xk.music.audio.muted = true; window.__xk.music.audio.pause(); } speechSynthesis.cancel()")
            self.window.evaluate_js(f"window.__selftest = null; {self.JS}.then((x) => window.__selftest = x)")
            for _ in range(120):
                res = self.window.evaluate_js('window.__selftest')
                if res:
                    report = json.loads(res)
                    report['version'] = APP_VERSION
                    break
                time.sleep(0.5)
        except Exception as e:
            report['error'] = str(e)
        self.path.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
        time.sleep(0.5)
        os._exit(0)


def main():
    args = sys.argv[1:]
    selftest = None
    if '--selftest' in args:
        i = args.index('--selftest')
        selftest = Path(args[i + 1] if i + 1 < len(args) else 'selftest.json').resolve()
        os.environ.setdefault('XIAOKE_DATA_DIR', str(Path(tempfile.gettempdir()) / 'XiaokeSanguoSelfTest'))
        os.environ.setdefault('XKS_PORT', '48299')
    if '--data-dir' in args:   # 測試用：資料放在別的資料夾，不影響使用者的設定與存檔
        os.environ['XIAOKE_DATA_DIR'] = args[args.index('--data-dir') + 1]
    port = int(args[args.index('--port') + 1]) if '--port' in args else int(os.environ.get('XKS_PORT') or 48261)
    updater = Updater()
    host = HostApi(updater)
    server = Server(port, host)
    url = f'http://127.0.0.1:{server.port}/index.html?v={APP_VERSION}'
    if '--serve' in args:   # 只開伺服器（開發與自動測試用，用瀏覽器開網址）
        print(url, flush=True)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return
    import webview
    window = webview.create_window(APP_NAME, url=url, width=1440, height=900, min_size=(1100, 680),
                                   background_color='#0f0d0a', maximized='--selftest' not in args)
    host.window = window
    updater.window = window

    def on_closed():
        os._exit(0)   # 關閉視窗就結束所有工作（伺服器、下載、音樂）
    window.events.closed += on_closed

    def on_start():
        if IS_WIN:
            DisplayScale.fit(window)
        if selftest:
            threading.Thread(target=SelfTest(window, selftest).run, daemon=True).start()

    webview.start(on_start, gui=None if IS_MAC else 'edgechromium', private_mode=False,
                  storage_path=str(AppInfo.data_dir() / 'webview'), debug='--debug' in args)


if __name__ == '__main__':
    main()
