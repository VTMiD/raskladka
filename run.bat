@echo off
setlocal

set PORT=8000
set URL=http://localhost:%PORT%

echo Запуск локального сервера на порту %PORT%...
echo Открывается: %URL%
echo Для остановки нажмите Ctrl+C
echo.

REM Через 2 секунды после старта открываем нужный файл в браузере.
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" "%URL%""

REM Запускаем сервер (блокирующая команда)
npx serve -l %PORT%

endlocal
