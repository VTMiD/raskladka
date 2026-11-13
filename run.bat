@echo off
chcp 65001 >nul
setlocal

set PORT=8000
set URL=http://localhost:%PORT%

echo.
echo  Запуск локального сервера на порту %PORT%...
echo  Открывается: %URL%
echo  Для остановки нажмите Ctrl+C
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start "" "%URL%""

node server.js

endlocal