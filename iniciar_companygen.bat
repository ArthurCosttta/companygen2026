@echo off
setlocal
chcp 65001 >nul
title CompanyGen - WhatsApp integrado
color 0B

cd /d "%~dp0"

echo ================================================================
echo          COMPANYGEN COM WHATSAPP INTEGRADO E SUPABASE
echo ================================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js não foi encontrado. Instale o Node.js e tente novamente.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm não foi encontrado no sistema.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/4] Instalando dependências...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Não foi possível instalar as dependências.
    pause
    exit /b 1
  )
) else (
  echo [1/4] Dependências prontas.
)

echo [2/4] Gerando a versão atualizada com as novas funcionalidades...
call npm run build
if errorlevel 1 (
  echo [ERRO] Não foi possível gerar o build atualizado.
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 1245 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo [3/4] O CompanyGen já está aberto e recebeu o novo build.
  start "" "http://127.0.0.1:1245/"
  exit /b 0
)

echo [3/4] Iniciando o app único. O WhatsApp será aberto dentro da conta conectada.
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:1245/"

echo [4/4] Servidor ativo em http://127.0.0.1:1245/
echo Feche esta janela ou pressione Ctrl+C para encerrar.
echo.
call npm run dev -- --host 127.0.0.1 --port 1245 --strictPort

if errorlevel 1 (
  echo.
  echo [ERRO] O CompanyGen foi encerrado com falha.
  pause
  exit /b 1
)

endlocal
