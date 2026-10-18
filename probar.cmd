@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js no esta instalado. Abre instalar.cmd primero. & pause & exit /b 1)
node src\index.js --prueba
pause
