# Preflight Checklist de Release — CompanyGen SaaS + Desktop `.exe`

Execute todos os passos abaixo antes de publicar qualquer tag ou push para `main`:

1. **Segurança & Sanitização**
   - Executar `node --test tests/security-api.test.mjs` (sempre isolado para evitar falso rate limit).
   - Confirmar zero tokens JWT/Service Role/CPF em `POST /api/support/tickets`, `_admin_registry.json`, e `POST /api/workspace/backup-export`.
   - Confirmar trava `NEGATIVE_BALANCE_REVIEW` após chargeback e bloqueio `403 SUPPORT_READONLY_BLOCKED` com `X-Support-Readonly: 1`.

2. **Qualidade & Avaliação IA Offline**
   - `npm run typecheck` (exit 0)
   - `npm run build` (exit 0)
   - `npm run eval:ai` (`precision >= 0.90`)

3. **Suites Node + Playwright + Electron Empacotado**
   - Suites Node em `tests/*.test.mjs` (`0` falhas)
   - Suites Playwright `--project=chromium` (exceto `e2e-v9-compositional-real.spec.ts` pago)
   - `npm run dist:win-dir` gerando `release/win-unpacked/CompanyGen.exe` e validando inicialização com `ELECTRON_RUN_AS_NODE=1` sem Node externo no `PATH`.

4. **Backup 3-2-1 & Migrations SQL**
   - Testar `npm run backup:321` confirmando `roundtripVerified: true` e sidecar `.sha256`.
   - Aplicar migrations em `supabase/migrations/` (incluindo `20261119000200_cg_kiwify_events_dlq_and_locks.sql`) no projeto Postgres oficial.

5. **Deploy Firebase Hosting + Google Cloud Run (`companygenai` / `companygen-app`)**
   - Configurar as variáveis de `.env.example` diretamente no painel do Cloud Run (nunca commitar `.env`).
   - Deploy do backend Node no Cloud Run (`southamerica-east1`): `gcloud run deploy companygen-app --source . --region southamerica-east1 --allow-unauthenticated`
   - Build + Deploy do frontend (`dist/`): `npm run build && firebase deploy --only hosting`
   - Suporte oficial configurado: `suporte@companygen.store` e WhatsApp `+55 61 99374-2091`.

