@echo off
title Fireboy and Watergirl P2P Multiplayer
echo =======================================================
echo  Fireboy and Watergirl: Kuil Hutan (The Forest Temple)
echo  P2P Multiplayer Edition
echo =======================================================
echo.
echo Pilih Mode Permainan:
echo  [1] Main Lokal / 1 Komputer / LAN Wi-Fi (Offline)
echo  [2] Main Bareng Teman Jarak Jauh (Online Internet)
echo.
set /p mode="Pilih [1 atau 2] (Tekan Enter untuk 1): "

if "%mode%"=="2" (
    echo.
    echo [INFO] Menjalankan mode Online Internet untuk Teman Jauh...
    node tunnel.js
    goto end
)

echo.
echo [INFO] Menjalankan mode Lokal...
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    start http://localhost:3000
    node server.js
    goto end
)

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    start http://localhost:3000
    python server.py
    goto end
)

echo [ERROR] Tidak ditemukan Node.js atau Python di sistem Anda.
echo Silakan install Node.js (https://nodejs.org/).
pause

:end
