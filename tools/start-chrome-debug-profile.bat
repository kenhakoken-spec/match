@echo off
REM ============================================================
REM  rendez: 既存プロファイル(=LINEログイン済みcookie)のまま
REM         Chrome をデバッグ接続できる状態で起動する
REM  使い方: 既存のChromeを全部閉じてから、これをダブルクリック
REM ============================================================
echo 既存のChromeを閉じています...
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 2 >nul

echo デバッグモードでChromeを起動します(あなたのログイン状態をそのまま使います)...
REM 既存の user-data-dir(本物のプロファイル)を指定 = cookie/ログイン流用
REM 0.0.0.0 で待受 = WSL からも接続を試せるようにする
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --remote-debugging-address=0.0.0.0 ^
  --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data" ^
  --profile-directory="Default" ^
  "https://developers.line.biz/console/"

timeout /t 1 >nul
echo.
echo  OK: Chromeがデバッグモードで起動しました。
echo  すでにLINEにログイン済みなら、そのまま使えます。
echo  この黒い画面は閉じて大丈夫です。
echo.
pause
