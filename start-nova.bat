@echo off
title NOVA Live Voice AI Assistant
echo ============================================================
echo   Starting NOVA Live Voice AI Assistant on your laptop...
echo ============================================================
timeout /t 1 >nul
start "" "http://localhost:3000"
node server.js
pause
