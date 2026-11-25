# Protocolo Padrão de Execução para Qualquer Modelo (CompanyGen)

> Todo modelo de IA que operar neste repositório **DEVE** seguir este protocolo procedural antes de analisar código bruto ou aplicar edições. O objetivo é **máxima velocidade com zero deriva de especificação**: consultar mapas curtos primeiro, parcelar **todos** os objetivos antes da primeira linha de código, editar cirurgicamente e fechar com prova real.

---

## 1. Mapa Instantâneo da Codebase (Leia Isto Primeiro — Sem Varrer Pastas)

Antes de abrir arquivos inteiros (>200 linhas), localize o domínio exato:

| Domínio / Célula | Arquivos Principais | Contratos / Registros Críticos | Testes Rápidos do Domínio |
|---|---|---|---|
| **WhatsApp IA & Gatilhos** | [ai-sofia-local.mjs](server/ai-sofia-local.mjs), [whatsapp-webview-script.mjs](shared/whatsapp-webview-script.mjs), [useWebviewWhatsappResponder.ts](src/hooks/useWebviewWhatsappResponder.ts), [WhatsAppConnectionView.tsx](src/components/views/whatsapp/WhatsAppConnectionView.tsx), [WhatsappMessageFlowsPanel.tsx](src/components/views/whatsapp/WhatsappMessageFlowsPanel.tsx) | `whatsapp_flows.json` + `templates.json` + `pausedThreads` | `node --test tests/unit/onda6-whatsapp-pix.test.mjs` |
| **Onboarding, Nicho & Persistência** | [OnboardingIgnitionView.tsx](src/components/views/onboarding/OnboardingIgnitionView.tsx), [OnboardingSynthesisStage.tsx](src/components/views/onboarding/OnboardingSynthesisStage.tsx), [PreBuildPagesCartStep.tsx](src/components/views/onboarding/PreBuildPagesCartStep.tsx), [useClientMaturity.ts](src/hooks/useClientMaturity.ts), [App.tsx](src/app/App.tsx) | `storeGenerated` / `fichaCompleted` nunca regridem em loja pronta | `node --test tests/unit/onda3-onboarding-pack.test.mjs` |
| **Planilha IA & Arquétipos** | [ai-spreadsheet-engine.mjs](server/ai-spreadsheet-engine.mjs), [spreadsheet-intelligence.mjs](shared/formula-ir/spreadsheet-intelligence.mjs), [xlsx-io.ts](src/utils/xlsx-io.ts) | `classifyBusinessArchetype` por catálogo real prevalece sobre rótulo genérico | `node --test tests/xlsx-benchmark-v2.test.mjs` |
| **Backend Core, Rotas & Sync** | [workspace.mjs](server/workspace.mjs), [access-and-checkout.mjs](server/access-and-checkout.mjs), [route-registry.json](shared/formula-ir/route-registry.json), [capability-registry.json](shared/formula-ir/capability-registry.json) | `loadProfileState` compara revisão/readiness local vs remoto | `node scripts/verify-handlers.mjs` |
| **Telemetria Contextual & Logs** | [crash-telemetry.mjs](server/crash-telemetry.mjs), [crash-telemetry.ts](src/utils/crash-telemetry.ts), [ErrorBoundary.tsx](src/components/ui/ErrorBoundary.tsx), [AdminCrashLogsPanel.tsx](src/components/views/admin/AdminCrashLogsPanel.tsx) | Mascarar PII antes de persistir; erro >=500 em `/api/` | `node --test tests/unit/crash-telemetry.test.mjs` |
| **Vitrine, Editor & ZIP** | [EditorialStoreControlView.tsx](src/components/views/storefront/EditorialStoreControlView.tsx), [CustomerStorefrontView.tsx](src/components/views/storefront/CustomerStorefrontView.tsx), [AtomicSectionRenderers.tsx](src/components/views/storefront/AtomicSectionRenderers.tsx), [storefront-zip-builder.ts](src/components/views/storefront/storefront-zip-builder.ts), [chunk-recovery.ts](src/utils/chunk-recovery.ts) | `lazyNamed` sempre valida componente exportado; tema claro padrão | `node --test tests/unit/onda4-storefront-editor.test.mjs` |
| **Pedidos, Alertas Móveis & Desktop** | [OrdersKanbanView.tsx](src/components/views/orders/OrdersKanbanView.tsx), [useHighSaturationNotifications.ts](src/hooks/useHighSaturationNotifications.ts), [desktop/main.mjs](desktop/main.mjs), [AuthFlowView.tsx](src/components/auth/AuthFlowView.tsx) | Alertas funcionam mesmo offline no WhatsApp; `node --check desktop/main.mjs` | `node --test tests/unit/mobile-alerts-and-downloads.test.mjs` |

---

## 2. Regra 0 — Entendimento Integral e Parcelamento Obrigatório

**É PROIBIDO começar a editar entendendo só parte do pedido.**

1. **Quebrar 100% dos objetivos:** Extraia *cada* pedido explícito e implícito em cláusulas numeradas (`G1, G2, ..., GN`) antes da primeira edição.
2. **Classificar a Macro-Intenção de cada cláusula:** `VISUAL` | `BEHAVIOR` | `STATE_FLOW` | `STRUCTURE` | `PERFORMANCE` | `OBSERVABILITY` | `DELIVERY`.
3. **Ordem determinística de execução:**
   - Primeiro: limpar/isolar estrutura conflituosa (`STRUCTURE`) se tocar monolito (`ai-sofia-local.mjs`, `workspace.mjs`, `App.tsx`).
   - Segundo: corrigir contratos de dados e regras silenciosas (`STATE_FLOW` + `BEHAVIOR`).
   - Terceiro: ajustes de UI e árvore de componentes (`VISUAL`).
   - Quarto: verificação automática (`typecheck` + `build` + testes) + navegador real (`OPEN_NAVIGATOR`) + entrega (`DELIVERY`).
4. **Rastreio obrigatório em lotes grandes (`N >= 4`):** Manter checklist vivo com o estado de todos os itens (`pending` → `in_progress` → `done`) para nenhum item cair no esquecimento entre turnos.

---

## 3. Fluxo Processual Fechado por Tarefa

```text
[1. MAPEAR]    Localizar faixa exata (busca rápida / registros / índice JSON). Não ler arquivos inteiros >200L.
[2. IMPACTO]   Identificar quem escreve e quem lê o mesmo estado (ex.: arquivo JSON em disco, profile.*, localStorage).
[3. REPRODUZIR] Quando for bug lógico/silencioso, confirmar exatamente onde a condição falha (ou escrever teste que falha antes).
[4. EDITAR]    Aplicar mudanças em paralelo quando independentes, mantendo funções pequenas e sem duplicar lógica.
[5. VERIFICAR] Rodar: `npm run typecheck`, `npm run build`, testes unitários do domínio e, quando tocar UI/fluxo, `OPEN_NAVIGATOR` (navegador real sem erros de console).
[6. REPORTAR]  Citar apenas arquivos, símbolos, saídas e prints diretamente observados após a última edição.
```

---

## 4. Armadilhas Conhecidas Neste Repositório (Guardrails Fixos)

- **Shell no Windows (PowerShell):** Usar `;` com checagem de `$LASTEXITCODE` — nunca `&&` em comandos PowerShell.
- **White-label estrito:** Zero menções visíveis a provedores de IA (`GLM`, `Whisper`, `BLIP`, `RunPod`) em textos de UI.
- **Baixo consumo (PC fraco):** Não introduzir polling curto ocioso, `clone().json()` em toda resposta HTTP saudável ou timers pesados.
- **Escape hatch com justificativa:** Se o escopo inicial não contiver a causa raiz, **não invente**: declare explicitamente a ampliação de escopo (`SCOPE_EXPANSION`) apontando o novo arquivo/símbolo descoberto antes de editar.
- **Quando existir `.cg/` e `scripts/agent-ops.mjs`:** Preferir sempre consultar o índice em JSON (`.cg/graph/`) e atualizar o estado da missão (`ATUALIZE-JSON`) a cada etapa concluída.
