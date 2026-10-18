@echo off
cd /d "%~dp0"
if exist fichador.log (
  start notepad fichador.log
) else (
  echo Todavia no se ha fichado nada. Aqui apareceran los fichajes y los errores.
  pause
)
