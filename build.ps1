# 在 Windows 上建置安裝檔：powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python -m pip install -r requirements.txt
python -m unittest discover -s tests
if ($LASTEXITCODE -ne 0) { throw "測試沒有通過" }
# 打包：遊戲畫面（web）與遊戲引擎（sanguo）放進執行檔資料夾
python -m PyInstaller --noconfirm --clean --windowed --name XiaokeSanguo --icon desktop\app.ico `
  --paths . --add-data "web;web" --hidden-import sanguo.api --collect-submodules sanguo `
  --exclude-module numpy --exclude-module scipy --exclude-module matplotlib --exclude-module tkinter `
  --distpath dist --workpath build desktop\app.py
$iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { choco install innosetup -y --no-progress; $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" }
$ver = (Get-Content web\version.json -Raw -Encoding utf8 | ConvertFrom-Json).version
& $iscc "/DAppVer=$ver" installer\installer.iss
if ($LASTEXITCODE -ne 0) { throw "ISCC 失敗" }
Write-Host "完成：dist-installer\XiaokeSanguo-Setup-$ver.exe"
