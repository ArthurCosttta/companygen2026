# ADR 001 — Arquitetura CompanyGen (Local-First Electron + Supabase Cloud + IA Local/Cloud)

## Contexto
O CompanyGen atende lojistas brasileiros com dois pilares: Vitrine Web com geração por IA (`Formula V9` + Pasta Molde) e Atendimento Automático WhatsApp Web (`Sofia IA`) rodando localmente em Electron Desktop Windows para proteção anti-ban.

## Decisões Arquiteturais
1. **Local-First no Desktop `.exe` + Sync Cloud Idempotente (`revision`):** O cliente Desktop inicia seu servidor HTTP local (`server/index.mjs`) usando `ELECTRON_RUN_AS_NODE=1`, eliminando dependência de Node/npm externos na máquina do cliente. Operações secundárias preservam revisão via `{ preserveRevision: true }`.
2. **Créditos Atômicos com Piso Zero (`>= 0`) & Trava Antifraude:** Débitos (`cg_debit_credits`), estornos por falha (`failure_refund`) e chargebacks Kiwify (`cg_process_kiwify_event`) executam sob `pg_advisory_xact_lock` e nunca permitem saldo negativo livre; déficits ativam `NEGATIVE_BALANCE_REVIEW`.
3. **Suporte Somente Leitura (Admin 360°):** Administradores inspecionam contas via `GET /api/admin/users/:id/support-snapshot` com header `X-Support-Readonly: 1`, recebendo `HTTP 403` em qualquer escrita acidental.
4. **Sanitização Transversal (`pii-scrubber.mjs`):** Tickets, incidentes de sistema, resumos diários (`08h BRT`) e pacotes `.zip` passam pelo scrubber antes da persistência ou envio.
