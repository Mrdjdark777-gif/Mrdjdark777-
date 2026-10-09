@echo off
chcp 65001 >nul
title True Thrills - otkryt kopiyu
echo.
echo  Перетащи сюда файл копии (.tar.gz.enc) и нажми Enter.
echo.
set /p ARCHIVE="Файл: "
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0TrueThrills-Restore.ps1" -Archive %ARCHIVE%
echo.
pause
