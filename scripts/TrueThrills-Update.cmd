@echo off
chcp 65001 >nul
title True Thrills - obnovlenie servera
echo.
echo  Обновляю True Thrills. Это занимает пару минут.
echo.
rem Зовём обычный скрипт обслуживания рядом с собой. Раньше здесь стояла
rem команда прямо к .update-staging на сервере — но эту папку обновление
rem создаёт перед работой и удаляет после, и в промежутке её нет. Файл был
rem неработоспособен.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0TrueThrills-Server.ps1" -Action Update -KeyPath "D:\True Thrills\Private SSH - Key\ssh-key-2026-09-06.key"
echo.
echo  Готово, если выше есть строка «Сборка совпадает с кодом».
echo.
pause
