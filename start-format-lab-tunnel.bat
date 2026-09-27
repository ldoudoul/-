@echo off
setlocal
cd /d "%~dp0"
echo Format Lab 本地 LibreOffice 服务： http://127.0.0.1:4173/
start "Format Lab Server" /min cmd /c "python server.py --port 4173"
echo 正在启动 Cloudflare Tunnel，请复制输出的 https://*.trycloudflare.com 地址，填入 Cloudflare Pages 环境变量 CONVERTER_API_BASE
set "CLOUDFLARED_EXE=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not exist "%CLOUDFLARED_EXE%" set "CLOUDFLARED_EXE=cloudflared"
"%CLOUDFLARED_EXE%" tunnel --url http://127.0.0.1:4173
