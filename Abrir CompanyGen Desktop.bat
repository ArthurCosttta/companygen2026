@echo off
setlocal
chcp 65001 >nul
title CompanyGen Desktop - Build atualizado
color 0B
set "COMPANYGEN_PROJECT=%~dp0"

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

echo [2/3] Gerando a versao atualizada com as novas funcionalidades...
call npm run build
if errorlevel 1 (
  echo [ERRO] O build falhou. O aplicativo nao sera aberto com arquivos incompletos.
  popd
  pause
  exit /b 1
)

echo [3/3] Abrindo o CompanyGen Desktop atualizado...
start "" /D "%COMPANYGEN_PROJECT%" "%COMPANYGEN_PROJECT%\node_modules\electron\dist\electron.exe" "%COMPANYGEN_PROJECT%\desktop\main.mjs"

popd
exit /b 0
