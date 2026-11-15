@echo off
title Fireboy and Watergirl - Online P2P (Mabar Teman Jauh)
echo ================================================================
echo  Fireboy and Watergirl: Kuil Hutan (The Forest Temple)
echo  ONLINE P2P MULTIPLAYER (MABAR TEMAN JARAK JAUH)
echo ================================================================
echo.
echo [INFO] Menyiapkan server lokal dan jalur internet publik...
echo [INFO] Link publik otomatis dibuat via Cloudflare Tunnel / Ngrok...
echo.

node tunnel.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Terjadi kendala saat menjalankan tunnel.
    pause
)
