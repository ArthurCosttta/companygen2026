@echo off
setlocal
chcp 65001 >nul
title CompanyGen Studio - Modo Web Universal (Rapido e Leve)
color 0A

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

echo ===============================================================================
echo            COMPANYGEN STUDIO - MODO WEB UNIVERSAL (OTIMIZADO)
echo ===============================================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale o Node.js 20 LTS em https://nodejs.org/
  pause
  exit /b 1
)

set "NODE_MAJOR="
for /f "tokens=1 delims=v." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 20 (
  echo [ERRO] Node.js 20 ou superior e necessario. Versao atual: v%NODE_MAJOR%.
  pause
  exit /b 1
)

if not exist "%PROJECT_DIR%\node_modules" (
  echo [INFO] Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha ao executar npm install.
    pause
    exit /b 1
  )
)

set "NEED_BUILD=0"
if /I "%~1"=="--rebuild" set "NEED_BUILD=1"
if /I "%~1"=="/rebuild" set "NEED_BUILD=1"
if not exist "%PROJECT_DIR%\dist\index.html" (
  set "NEED_BUILD=1"
) else (
  powershell -NoProfile -Command "$dist = (Get-Item '%PROJECT_DIR%\dist\index.html').LastWriteTimeUtc; $newer = Get-ChildItem -Path '%PROJECT_DIR%\src','%PROJECT_DIR%\shared','%PROJECT_DIR%\server','%PROJECT_DIR%\index.html','%PROJECT_DIR%\package.json' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -gt $dist } | Select-Object -First 1; if ($newer) { exit 1 } else { exit 0 }" >nul 2>&1
  if errorlevel 1 set "NEED_BUILD=1"
)

if "%NEED_BUILD%"=="1" (
  echo [1/2] Compilando versao atualizada antes de iniciar...
  call npm run build
  if errorlevel 1 (
    echo [ERRO] Falha ao compilar o projeto.
    pause
    exit /b 1
  )
) else (
  echo [1/2] Build em dist\ atualizado. Inicializacao instantanea ativada.
)

set "PORT=5174"
set "HOST=127.0.0.1"
if "%CG_PERSISTENCE%"=="" set "CG_PERSISTENCE=local"
if "%NODE_OPTIONS%"=="" (
  if /I "%PROCESSOR_ARCHITECTURE%"=="x86" (
    set "NODE_OPTIONS=--max-old-space-size=384"
  ) else (
    set "NODE_OPTIONS=--max-old-space-size=512"
  )
)

REM Encerra instancia anterior na porta 5174 antes de subir servidor limpo
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [2/2] Abrindo navegador em http://127.0.0.1:%PORT%/?theme=light ...
start "" /B cmd /c "ping -n 3 127.0.0.1 >nul & start "" "http://127.0.0.1:%PORT%/?theme=light""

echo [INFO] Servidor com compressao Gzip local ativo. Funciona em Windows 7/8/10/11 (32/64 bits).
echo [INFO] Para encerrar, feche esta janela ou pressione CTRL+C.
echo.

call node --env-file-if-exists=.env "%PROJECT_DIR%\server\index.mjs"

if errorlevel 1 (
  echo.
  echo [ERRO] O servidor local foi encerrado com erro.
  pause
  exit /b 1
)
exit /b 0
