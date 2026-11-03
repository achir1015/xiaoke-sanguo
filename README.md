# 小柯機器人三國志遊戲
<img width="1106" height="460" alt="image" src="https://github.com/user-attachments/assets/789837cc-14b4-4277-8f17-a4baaf684259" />
示範



3D 沙盤三國策略遊戲。選一位君主，內政、徵兵、登用人才、出征攻城，在 3D 戰場上用戰術與單挑擊敗對手，一統天下！

**系統開發：吳玉柱 先生 與 Claude AI Opus 5.5**

## 特色

- **兩個劇本**：群雄割據（西元 194 年，12 個勢力）、三分天下（西元 220 年，魏蜀吳）
- **對戰模式**：真人對 AI、AI 對 AI 觀戰、真人對真人（遠端連線，可語音通話）、同機多人輪流
- **3D 立體**：沙盤地圖（山脈、黃河、長江、城池、旗幟、行軍）與 3D 戰場（方陣、突擊、放箭、火計、固守、單挑）
- **AI 軍師**：30 位男女軍師（諸葛亮、司馬懿、郭嘉、周瑜、黃月英、蔡文姬…）陪同，提供建議並可一鍵照辦；「軍師代打」可把主位交給軍師，隨時取回；中途可換軍師；設定 Claude 金鑰後可用文字直接問軍師
- **半身照**：20 位男性、20 位女性玩家頭像，122 位武將頭像（全部原創向量插畫）
- **背景音樂**：20 首原創曲（每首 3 分多鐘），右上角直立滑桿調整音量，可加入自己的音樂
- **教學**：遊戲教學與系統說明都有動畫＋語音講解，附練習題
- **自動更新**：遊戲內檢查新版，一鍵下載安裝並重新開啟

## 架構（以 Python 為主）

| 資料夾 | 內容 |
|---|---|
| `sanguo/` | 遊戲引擎（純 Python）：規則、戰鬥、電腦 AI、軍師建議 |
| `desktop/app.py` | 桌面版：pywebview 視窗＋本機伺服器、設定、存檔、更新、Claude 軍師 |
| `web/` | 畫面：Three.js 3D 地圖與戰場、介面、教學、遠端連線（PeerJS） |
| `tools/` | 產生音樂（`gen_music.py`）、頭像（`gen_portraits.py`）、圖示（`make_icon.py`） |
| `tests/` | 引擎測試 `python -m unittest discover -s tests` |

開發時執行：`python desktop/app.py`。建置安裝檔：`powershell -ExecutionPolicy Bypass -File build.ps1`。

發佈新版：修改 `web/version.json` 的版本號與說明，推送到 main，GitHub Actions 會測試、打包並建立 Release。

## 授權與素材

遊戲規則參考了開源三國志 [FliSan](https://github.com/YPZhou/FliSan) 的指令設計（內政、徵兵、出征、運輸、評價人才），程式全部重新以 Python 撰寫。人物以史實為題材，能力數值、頭像、音樂與圖示皆為本遊戲原創。
