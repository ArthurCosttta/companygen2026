@echo off
setlocal
chcp 65001 >nul
title CompanyGen Desktop - Novo Login e Acesso SOF
color 0B
set "ELECTRON_RUN_AS_NODE="
set "COMPANYGEN_PROJECT=%~dp0"
if "%COMPANYGEN_PROJECT:~-1%"=="\" set "COMPANYGEN_PROJECT=%COMPANYGEN_PROJECT:~0,-1%"

if not exist "%COMPANYGEN_PROJECT%\package.json" (
  echo Nao foi possivel localizar o projeto CompanyGen em:
  echo %COMPANYGEN_PROJECT%
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado. Instale o Node.js e tente novamente.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao foi encontrado no sistema.
  pause
  exit /b 1
)

pushd "%COMPANYGEN_PROJECT%"

where ollama >nul 2>&1
if not errorlevel 1 (
  powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
  if errorlevel 1 (
    echo [0/3] Iniciando Ollama local em segundo plano...
    start "" /B ollama serve >nul 2>&1
  )
)

if not exist "%COMPANYGEN_PROJECT%\node_modules\electron\dist\electron.exe" (
  echo [1/3] Instalando dependencias do CompanyGen...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Nao foi possivel instalar as dependencias.
    popd
    pause
    exit /b 1
  )
) else (
  echo [1/3] Dependencias prontas.
)

set "NEED_BUILD=0"
if /I "%~1"=="--rebuild" set "NEED_BUILD=1"
if /I "%~1"=="/rebuild" set "NEED_BUILD=1"
if not exist "%COMPANYGEN_PROJECT%\dist\index.html" set "NEED_BUILD=1"

if "%NEED_BUILD%"=="1" (
  echo [2/3] Compilando versao atualizada do CompanyGen...
  call npm run build
  if errorlevel 1 (
    echo [ERRO] O build falhou. O aplicativo nao sera aberto com arquivos incompletos.
    popd
    pause
    exit /b 1
  )
) else (
  echo [2/3] Build pronto em dist\. Inicializacao instantanea ativada ^(use --rebuild para recompilar^).
)

set "COMPANYGEN_URL=http://127.0.0.1:1245/access"
powershell -NoProfile -Command "$cgIds = (Get-CimInstance Win32_Process -Filter 'Name=''electron.exe''' -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*companygen-post-studio*' } | Select-Object -ExpandProperty ProcessId); if ($cgIds) { $procs = Get-Process -Id $cgIds -ErrorAction SilentlyContinue; if ($procs -and -not ($procs | Where-Object { $_.MainWindowHandle -ne 0 })) { $procs | Stop-Process -Force -ErrorAction SilentlyContinue } }" >nul 2>&1
echo [3/3] Abrindo o CompanyGen Desktop atualizado no novo fluxo de login...
start "" /D "%COMPANYGEN_PROJECT%" "%COMPANYGEN_PROJECT%\node_modules\electron\dist\electron.exe" "%COMPANYGEN_PROJECT%\desktop\main.mjs"
ping -n 3 127.0.0.1 >nul
powershell -NoProfile -Command "if (Get-Process -Name electron -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo [ERRO] O CompanyGen Desktop nao permaneceu aberto. Executando em modo diagnostico...
  "%COMPANYGEN_PROJECT%\node_modules\electron\dist\electron.exe" "%COMPANYGEN_PROJECT%\desktop\main.mjs"
  popd
  pause
  exit /b 1
)

popd
exit /b 0
