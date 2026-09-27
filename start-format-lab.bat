@echo off
setlocal
cd /d "%~dp0"
echo Format Lab 正在启动： http://127.0.0.1:4173/
python server.py --port 4173
