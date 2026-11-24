@echo off
setlocal
chcp 65001 >nul
title CompanyGen Desktop - Windows (64-bit / 32-bit PC Leve)
color 0B
set "ELECTRON_RUN_AS_NODE="
set "COMPANYGEN_PROJECT=%~dp0"
if "%COMPANYGEN_PROJECT:~-1%"=="\" set "COMPANYGEN_PROJECT=%COMPANYGEN_PROJECT:~0,-1%"

if not exist "%COMPANYGEN_PROJECT%\package.json" (
  echo [ERRO] Nao foi possivel localizar o projeto CompanyGen em:
  echo %COMPANYGEN_PROJECT%
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado. Instale o Node.js 20 LTS e tente novamente.
  pause
  exit /b 1
)

set "NODE_MAJOR="
for /f "tokens=1 delims=v." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 20 (
  echo [ERRO] Node.js 20 ou superior e necessario ^(detectado v%NODE_MAJOR%^).
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

REM Detecta PC com pouca RAM / 32-bit / Windows antigo e ajusta limites leves
set "CG_PC_LEVE=0"
node -e "const os=require('node:os'); const major=parseInt(String(os.release()).split('.')[0]||'0',10); const ramGb=os.totalmem()/(1024**3); const x86=process.arch==='ia32'; process.exit((ramGb<=6.5||x86||major<10)?0:1);" >nul 2>&1
if not errorlevel 1 set "CG_PC_LEVE=1"

if "%NODE_OPTIONS%"=="" (
  if "%CG_PC_LEVE%"=="1" (
    set "NODE_OPTIONS=--max-old-space-size=384"
  ) else (
    set "NODE_OPTIONS=--max-old-space-size=512"
  )
)

REM Fallback automatico para Modo Web Universal apenas se o executavel Electron local nao puder rodar no SO
if not exist "%COMPANYGEN_PROJECT%\node_modules\electron\dist\electron.exe" (
  echo [1/3] Instalando dependencias do CompanyGen...
  call npm install
  if errorlevel 1 (
    echo [AVISO] Falha ao preparar Electron. Abrindo via Modo Web Universal...
    if exist "%COMPANYGEN_PROJECT%\iniciar_direto.bat" (
      popd
      call "%COMPANYGEN_PROJECT%\iniciar_direto.bat"
      exit /b %errorlevel%
    )
    popd
    pause
    exit /b 1
  )
) else (
  echo [1/3] Dependencias Desktop prontas ^(Modo PC Leve: %CG_PC_LEVE%^).
)

set "NEED_BUILD=0"
if /I "%~1"=="--rebuild" set "NEED_BUILD=1"
if /I "%~1"=="/rebuild" set "NEED_BUILD=1"
if not exist "%COMPANYGEN_PROJECT%\dist\index.html" (
  set "NEED_BUILD=1"
) else (
  powershell -NoProfile -Command "$dist = (Get-Item '%COMPANYGEN_PROJECT%\dist\index.html').LastWriteTimeUtc; $newer = Get-ChildItem -Path '%COMPANYGEN_PROJECT%\src','%COMPANYGEN_PROJECT%\shared','%COMPANYGEN_PROJECT%\server','%COMPANYGEN_PROJECT%\index.html','%COMPANYGEN_PROJECT%\package.json' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -gt $dist } | Select-Object -First 1; if ($newer) { exit 1 } else { exit 0 }" >nul 2>&1
  if errorlevel 1 set "NEED_BUILD=1"
)

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
  echo [2/3] Build atualizado em dist\. Inicializacao rapida ativada ^(use --rebuild para forcar^).
)

set "COMPANYGEN_URL=http://127.0.0.1:1245/?theme=light"
set "COMPANYGEN_LOCAL_ONLY=1"
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 1245 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter 'Name=''electron.exe''' -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*companygen*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo [3/3] Abrindo o CompanyGen Desktop ^(Tema Claro otimizado^)...
start "" /D "%COMPANYGEN_PROJECT%" "%COMPANYGEN_PROJECT%\node_modules\electron\dist\electron.exe" "%COMPANYGEN_PROJECT%\desktop\main.mjs"
ping -n 3 127.0.0.1 >nul
powershell -NoProfile -Command "if (Get-Process -Name electron -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo [AVISO] O CompanyGen Desktop nao permaneceu aberto. Executando diagnostico...
  "%COMPANYGEN_PROJECT%\node_modules\electron\dist\electron.exe" "%COMPANYGEN_PROJECT%\desktop\main.mjs"
  echo.
  echo [DICA] Abrindo alternativa Web Universal no navegador padrao...
  if exist "%COMPANYGEN_PROJECT%\iniciar_direto.bat" (
    popd
    call "%COMPANYGEN_PROJECT%\iniciar_direto.bat"
    exit /b %errorlevel%
  )
  popd
  pause
  exit /b 1
)

popd
exit /b 0
