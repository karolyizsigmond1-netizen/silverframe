@echo off
echo ==========================================
echo   Silverframe Studio - Admin Panel
echo ==========================================
echo.
cd /d "%~dp0"
echo   Inditas: http://localhost:3000/admin/
echo.
start "" http://localhost:3000/admin/
node server.js
pause
