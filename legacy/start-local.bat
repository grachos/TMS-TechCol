@echo off
REM ============================================================
REM  Light TMS - arranque local (servidor PHP embebido)
REM  Requiere XAMPP instalado en C:\xampp y MySQL corriendo.
REM ============================================================

set PHP=C:\xampp\php\php.exe

if not exist "%PHP%" (
    echo ERROR: no se encontro PHP en %PHP%
    echo Ajusta la variable PHP en este archivo si instalaste XAMPP en otra ruta.
    pause
    exit /b 1
)

echo Iniciando Light TMS en http://127.0.0.1:8001
echo (Recuerda tener MySQL iniciado en el panel de XAMPP)
echo Pulsa Ctrl+C para detener.
echo.

start "" http://127.0.0.1:8001
cd /d "%~dp0"
"%PHP%" -S 127.0.0.1:8001 -t public
