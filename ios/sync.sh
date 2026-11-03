#!/bin/bash
# 產生 App 內建的網頁（和 Android 版、線上版同一份：tools/build_web.py → site/online），
# 複製到 ios/web，版本號跟著 web/version.json，再產生 Xcode 專案。在 Mac 上執行：bash ios/sync.sh
set -e
cd "$(dirname "$0")"
python3 ../tools/build_web.py ../site >/dev/null
rm -rf web && cp -R ../site/online web
V=$(python3 -c 'import json;print(json.load(open("../web/version.json"))["version"])')
# 版本號：1.2.0 → build 10200（每次都要比上一次大）
B=$(python3 -c "a,b,c=(int(x) for x in '$V'.split('.'));print(a*10000+b*100+c)")
sed -i '' "s/MARKETING_VERSION: \".*\"/MARKETING_VERSION: \"$V\"/; s/CURRENT_PROJECT_VERSION: \".*\"/CURRENT_PROJECT_VERSION: \"$B\"/" project.yml
XG=$(command -v xcodegen || echo /usr/local/bin/xcodegen)
"$XG" generate --quiet
echo "web ok, version $V ($B)"
