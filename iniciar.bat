@echo off
setlocal
chcp 65001 >nul
title CompanyGen Studio - Launcher Oficial
color 0F

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

echo ===============================================================================
echo                   COMPANYGEN STUDIO - LAUNCHER OFICIAL WINDOWS
echo ===============================================================================
echo.

where node >nul 2>&1
if errorlevel 1 goto ERR_NO_NODE

set "NODE_MAJOR="
for /f "tokens=1 delims=v." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto ERR_NO_NODE
if %NODE_MAJOR% LSS 20 goto ERR_OLD_NODE

where npm >nul 2>&1
if errorlevel 1 goto ERR_NO_NPM

for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo [OK] Node.js %NODE_VER% detectado.

if "%NODE_OPTIONS%"=="" (
  if /I "%PROCESSOR_ARCHITECTURE%"=="x86" (
    set "NODE_OPTIONS=--max-old-space-size=384"
  ) else (
    set "NODE_OPTIONS=--max-old-space-size=512"
  )
)

set "HAS_PYTHON=0"
where python >nul 2>&1
if not errorlevel 1 set "HAS_PYTHON=1"
if "%HAS_PYTHON%"=="0" (
  where py >nul 2>&1
  if not errorlevel 1 set "HAS_PYTHON=1"
)
if "%HAS_PYTHON%"=="1" (
  echo [OK] Python detectado ^(STT de audio local e busca de fotos disponiveis^).
) else (
  echo [INFO] Python nao detectado ^(opcional: necessario apenas para STT local e busca Python^).
)

if exist "%PROJECT_DIR%\node_modules" goto DEPS_READY
echo.
echo [INFO] Instalando dependencias do projeto pela primeira vez...
call npm install
if errorlevel 1 goto ERR_NPM_INSTALL

:DEPS_READY
echo.
echo ===============================================================================
echo  Escolha como deseja iniciar:
echo.
echo   [1] Abrir Modo Web Universal / Chrome [mais leve, Windows 7/8/10/11 e 32-bit]
echo   [2] Abrir App Desktop (Electron otimizado 64-bit / PC Leve)
echo   [3] Gerar Instaladores .EXE (x64 + 32-bit ia32 em release\)
echo   [4] Build e Testes Completos (build + ondas 1-6 + unit + daily-audit)
echo ===============================================================================
echo.
set /p "OPTION=Selecione uma opcao (1-4) [Padrao: 1]: "
if "%OPTION%"=="" set "OPTION=1"

if "%OPTION%"=="1" goto START_WEB
if "%OPTION%"=="2" goto START_DESKTOP
if "%OPTION%"=="3" goto BUILD_EXE
if "%OPTION%"=="4" goto RUN_BUILD_AND_TESTS
goto START_WEB

:START_WEB
echo.
echo [INFO] Iniciando CompanyGen no Modo Web Universal ^(leve e rapido^)...
if exist "%PROJECT_DIR%\iniciar_direto.bat" (
  call "%PROJECT_DIR%\iniciar_direto.bat"
) else (
  call npm run build
  set "PORT=5174"
  set "HOST=127.0.0.1"
  set "CG_PERSISTENCE=local"
  start "" /B cmd /c "ping -n 3 127.0.0.1 >nul & start "" "http://127.0.0.1:5174/?theme=light""
  call node server/index.mjs
)
goto END

:START_DESKTOP
echo.
echo [INFO] Iniciando CompanyGen Desktop...
if exist "%PROJECT_DIR%\Abrir CompanyGen Desktop.bat" (
  call "%PROJECT_DIR%\Abrir CompanyGen Desktop.bat"
) else (
  call npm run desktop
)
goto END

:BUILD_EXE
echo.
echo [INFO] Gerando instaladores Windows x64 + 32-bit ia32 (.EXE) em release\...
call npm run dist:win-all
if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao gerar o instalador .EXE.
) else (
  echo.
  echo [OK] Instaladores x64 e ia32 gerados na pasta release\.
)
echo.
pause
goto END

:RUN_BUILD_AND_TESTS
echo.
echo [1/4] Executando build de producao (npm run build)...
call npm run build
if errorlevel 1 (
  echo [ERRO] Falha no build.
  pause
  exit /b 1
)
echo.
echo [2/4] Executando testes das Ondas 1-6...
call node --test tests/unit/onda1-foundation.test.mjs tests/unit/onda2-media.test.mjs tests/unit/onda3-onboarding-pack.test.mjs tests/unit/onda4-storefront-editor.test.mjs tests/unit/onda5-orders-global-ai.test.mjs tests/unit/onda6-whatsapp-pix.test.mjs
if errorlevel 1 (
  echo [ERRO] Falha nos testes das Ondas 1-6.
  pause
  exit /b 1
)
echo.
echo [3/4] Executando testes unitarios (npm run test:unit)...
call npm run test:unit
if errorlevel 1 (
  echo [ERRO] Falha nos testes unitarios.
  pause
  exit /b 1
)
echo.
echo [4/4] Executando auditoria backend (tests\daily-audit-backend.test.mjs)...
call node --test tests/daily-audit-backend.test.mjs
if errorlevel 1 (
  echo [ERRO] Falha na auditoria backend.
  pause
  exit /b 1
)
echo.
echo [OK] Build e todos os testes passaram com sucesso!
pause
goto END

:ERR_NO_NODE
echo.
echo [ERRO] Node.js nao foi encontrado no PATH do Windows.
echo Em Windows 10/11 ^(64-bit^): execute "instalar_e_abrir_windows.bat" ^(1-clique via winget^) ou baixe Node.js 20 LTS em https://nodejs.org/
echo Em Windows 7, 8, 8.1 ou 32 bits: abra direto no Chrome/Edge via Modo Web na Nuvem!
echo.
set /p "OPEN_WEB_FALLBACK=Deseja abrir a CompanyGen agora no navegador ^(S/N^)? [S]: "
if /I not "%OPEN_WEB_FALLBACK%"=="N" start "" "https://companygen-app.web.app/?theme=light"
pause
exit /b 1

:ERR_OLD_NODE
echo.
echo [ERRO] Node.js v%NODE_MAJOR% detectado, mas o servidor local requer Node.js 20 ou superior.
echo Em Windows 10/11: atualize para Node.js LTS em https://nodejs.org/ ou rode "instalar_e_abrir_windows.bat".
echo Em Windows 7/8/32-bit: use a versao Web direto no Chrome/Edge sem precisar instalar Node 20!
echo.
set /p "OPEN_WEB_OLD=Deseja abrir a CompanyGen agora no navegador ^(S/N^)? [S]: "
if /I not "%OPEN_WEB_OLD%"=="N" start "" "https://companygen-app.web.app/?theme=light"
pause
exit /b 1

:ERR_NO_NPM
echo.
echo [ERRO] Gerenciador npm nao foi encontrado no sistema.
echo.
pause
exit /b 1

:ERR_NPM_INSTALL
echo.
echo [ERRO] Falha ao instalar dependencias do npm.
echo.
pause
exit /b 1

:END
exit /b 0
