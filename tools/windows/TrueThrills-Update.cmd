@echo off
chcp 65001 >nul
title True Thrills - obnovlenie servera
rem Вся работа и разбор ответа — в TrueThrills-Obnovit.ps1 рядом. Здесь только
rem запуск: в .cmd нельзя надёжно писать русские строки и разбирать вывод.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0TrueThrills-Obnovit.ps1"
