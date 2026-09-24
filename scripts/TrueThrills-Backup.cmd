@echo off
chcp 65001 >nul
title True Thrills - kopiya vne servera
echo.
echo  Снимаю проверенную копию и скачиваю её на этот компьютер.
echo  Спросит пароль для шифрования — придумай длинный и запиши отдельно.
echo  БЕЗ ЭТОГО ПАРОЛЯ КОПИЮ НЕ ОТКРЫТЬ. Восстановить его нечем.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0TrueThrills-Server.ps1" -Action Backup -KeyPath "D:\True Thrills\Private SSH - Key\ssh-key-2026-09-06.key"
echo.
echo  Готово. Копия в папке Документы\TrueThrills-Backups.
echo.
pause
