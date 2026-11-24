@echo off
setlocal
chcp 65001 >nul
title CompanyGen Studio - Instalador 1-Clique Windows
color 0F

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

echo ===============================================================================
echo              COMPANYGEN STUDIO - INSTALACAO E INICIALIZACAO 1-CLIQUE
echo ===============================================================================
echo.

set "HAS_WINGET=0"
where winget >nul 2>&1
if not errorlevel 1 set "HAS_WINGET=1"

REM 1. Verificar Git
where git >nul 2>&1
if errorlevel 1 (
  echo [1/5] Git nao encontrado.
  if "%HAS_WINGET%"=="1" (
    echo       Instalando Git via winget...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  ) else (
    echo [AVISO] winget indisponivel. Instale o Git manualmente se precisar atualizar via Git: https://git-scm.com/
  )
) else (
  echo [1/5] Git verificado.
)

REM 2. Verificar Node.js >= 20 LTS
set "NEED_NODE=0"
where node >nul 2>&1
if errorlevel 1 (
  set "NEED_NODE=1"
) else (
  set "NODE_MAJOR="
  for /f "tokens=1 delims=v." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
  if not defined NODE_MAJOR set "NODE_MAJOR=0"
  if %NODE_MAJOR% LSS 20 set "NEED_NODE=1"
)

if "%NEED_NODE%"=="1" (
  echo [2/5] Node.js 20+ nao encontrado.
  if "%HAS_WINGET%"=="1" (
    echo       Instalando Node.js LTS via winget...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    set "PATH=%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs;%PATH%"
  )
  where node >nul 2>&1
  if errorlevel 1 (
    echo [ERRO] Node.js 20 LTS e obrigatorio. Instale em https://nodejs.org/ e execute este arquivo novamente.
    pause
    exit /b 1
  )
) else (
  for /f "delims=" %%v in ('node -v 2^>nul') do echo [2/5] Node.js %%v verificado.
)

REM 3. Verificar Python 3 (opcional para STT e busca de fotos)
where python >nul 2>&1
if errorlevel 1 (
  echo [3/5] Python 3 nao encontrado ^(opcional^).
  if "%HAS_WINGET%"=="1" (
    echo       Tentando instalar Python 3 via winget...
    winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
    set "PATH=%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;%PATH%"
  )
) else (
  echo [3/5] Python 3 verificado.
)

REM 4. Instalar dependencias Node e Python opcionais
echo [4/5] Instalando dependencias Node (npm install)...
call npm install
if errorlevel 1 (
  echo [ERRO] Falha ao executar npm install.
  pause
  exit /b 1
)

where python >nul 2>&1
if not errorlevel 1 (
  if exist "%PROJECT_DIR%\scripts\requirements-hunt.txt" (
    echo       Instalando pacotes Python opcionais ^(busca de fotos e STT^)...
    python -m pip install --upgrade pip >nul 2>&1
    python -m pip install -r "%PROJECT_DIR%\scripts\requirements-hunt.txt" -r "%PROJECT_DIR%\scripts\requirements-stt.txt"
    if errorlevel 1 (
      echo [AVISO] Nao foi possivel instalar todos os pacotes Python opcionais. O app continuara funcionando normalmente no modo Web/Desktop.
    )
  )
)

REM 5. Build de producao e abertura
echo [5/5] Compilando aplicativo (npm run build)...
call npm run build
if errorlevel 1 (
  echo [ERRO] Falha no build do CompanyGen.
  pause
  exit /b 1
)

echo.
echo ===============================================================================
echo  Instalacao concluida! Iniciando o CompanyGen otimizado...
echo ===============================================================================
echo.

node -e "const os=require('node:os'); const major=parseInt(String(os.release()).split('.')[0]||'0',10); const ramGb=os.totalmem()/(1024**3); process.exit(major>=10 && ramGb>=6 && process.arch==='x64' ? 0 : 1);" >nul 2>&1
if not errorlevel 1 (
  if exist "%PROJECT_DIR%\Abrir CompanyGen Desktop.bat" (
    call "%PROJECT_DIR%\Abrir CompanyGen Desktop.bat"
    exit /b %errorlevel%
  )
)

call "%PROJECT_DIR%\iniciar_direto.bat"
exit /b %errorlevel%
