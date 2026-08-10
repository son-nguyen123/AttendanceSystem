@echo off
setlocal
cd /d "%~dp0"
call "%~dp0setup-output-folders.bat"
if errorlevel 1 exit /b %errorlevel%
call "%~dp0setup-storage.bat"
if errorlevel 1 exit /b %errorlevel%
echo.
echo Da setup xong ca local va Google Drive.
endlocal
