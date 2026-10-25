@echo off
chcp 65001 >nul
echo === Palad1n: сборка exe ===
where node >nul 2>nul || (echo Установите Node.js 22+ с nodejs.org и запустите снова & pause & exit /b 1)
call npm install || (echo npm install не удался & pause & exit /b 1)
call npm run dist || (echo Сборка не удалась & pause & exit /b 1)
echo.
echo Готово. Файлы в папке dist: установщик и portable-версия.
start "" dist
pause
