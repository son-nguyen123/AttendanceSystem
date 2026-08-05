@echo off
setlocal
cd /d "%~dp0"
wscript.exe "%~dp0scripts\start-hidden.vbs"
endlocal
