@echo off
chcp 65001 >nul
title True Thrills - obnovlenie servera
echo.
echo  Обновляю True Thrills. Это занимает пару минут.
echo.
ssh -i "D:\True Thrills\Private SSH - Key\ssh-key-2026-09-06.key" ubuntu@129.152.8.230 "cd /opt/truethrills && sudo bash .update-staging/update-safe.sh design/six-screens"
echo.
echo  Готово. Ищи выше строку Updated successfully.
echo.
pause
