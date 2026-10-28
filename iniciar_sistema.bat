@echo off
chcp 65001 >nul
echo ============================================================================
echo   Iniciando Sistema de Verificacao de Licitacoes (Node.js + TypeScript)
echo ============================================================================
cd /d "%~dp0"
call npm run build
start http://localhost:3000
node dist/server.js
pause
