# AGENTS.md — Guia Rápido e Protocolo Obrigatório

Qualquer modelo operando neste workspace deve seguir o protocolo padronizado em [cg-protocol.md](.agent/rules/cg-protocol.md).

## Regras Inegociáveis
1. **Entenda e parcele TODOS os objetivos antes da 1ª edição:** liste todas as cláusulas (`G1..GN`), sua Macro-Intenção (`VISUAL`, `BEHAVIOR`, `STATE_FLOW`, `STRUCTURE`, `PERFORMANCE`, `OBSERVABILITY`, `DELIVERY`) e dependências.
2. **Não leia monolitos às cegas:** consulte o Mapa de Domínios em `.agent/rules/cg-protocol.md` e `shared/formula-ir/route-registry.json` primeiro; leia apenas as faixas de linhas exatas após busca direcionada.
3. **Respeite o fluxo:** `Mapear + Impacto (leitores/escritores de estado) -> Editar -> Typecheck/Build/Testes -> Navegador (quando UI) -> Reportar fatos observados`.
4. **Ambiente Windows PowerShell:** use `;` em vez de `&&`.
5. **Verificação pós-edição mínima:**
   - `npm run typecheck; if ($LASTEXITCODE -eq 0) { npm run build }`
   - `node --test tests/unit/*.test.mjs`
   - Se alterar `desktop/`: `node --check desktop/main.mjs`
