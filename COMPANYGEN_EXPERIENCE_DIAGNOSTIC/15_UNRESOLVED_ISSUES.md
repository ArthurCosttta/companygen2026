# 15 — Unresolved Issues & Environment Boundaries

> **Phase:** `PHASE_1 = DIAGNOSIS_ONLY` (Isolated inspection completed against `COMPANYGEN_DIAG_HARNESS`; production code untouched)

## 1. Environment Constraints Explicitly Documented

| ID | Boundary / Condition | Observed Impact on Diagnosis | Status |
| :--- | :--- | :--- | :--- |
| **UI-ENV-01** | **Desktop Electron Bridge (`window.companygenDesktop`)** | `WhatsAppView.tsx` (`RealWhatsAppWeb`, lines 74–182) renders embedded WhatsApp Web only inside the packaged Electron desktop wrapper. In standard Chromium (`Playwright`), it deterministically renders the fallback card (`"Abra no CompanyGen Desktop"`, verified in `EVIDENCE/BEFORE/TC06c_wa_onboarding_step3_config_1440x900.png` and `TC08_dual_view_1440x900.png`). Live Chromium WebView embedding inside Electron must still be regression-checked during Phase 2 desktop builds. | Documented Boundary |
| **UI-ENV-02** | **Live Baileys Socket (`bot.js`) & Production Supabase Sync** | Per user mandate (`No live WhatsApp actions` and `No Supabase mutations`), `COMPANYGEN_DIAG_HARNESS` replaced `startWorker()` with an in-process deterministic mock (`harnessWhatsapp`) and `CG_PERSISTENCE=local`. Baileys real QR pairing latency and remote Supabase PostgREST network errors were analyzed statically in `server/workspace.mjs` rather than triggered against production accounts. | Intentional Isolation |
| **UI-ENV-03** | **External Instagram & Python Image Hunt Availability** | `/api/instagram/analyze` and `/api/hunt` delegate to local Python scripts (`scripts/analyze-instagram.py`, `scripts/hunt-product-assets.py`) which depend on network access and external page structures. Code paths and error handlers (`400`/`429`/`502` in `server/workspace.mjs:875-927`) were verified; third-party Instagram rate-limiting remains an external runtime dependency. | External Dependency |

## 2. Unresolved Production UX Defects Deferred to Phase 2 Implementation

All confirmed UX, state, responsive, and visual defects remain unpatched in production (`C:\Users\arthur\.gemini\antigravity\scratch\companygen-post-studio`) because `PHASE_1 = DIAGNOSIS_ONLY` explicitly prohibits source modifications until manager sign-off and Phase 2 approval:

1. **White-on-white header text and split dark theme** in `StoreV5Pane` + `.cg-shell` (`EVIDENCE/BEFORE/TC05_store_v5_darkmode_1440x900.png`).
2. **Dual catalog write split-brain** between `FichaWizardView` (`/api/profile`) and `WhatsAppView Catálogo` (`/api/skus/adicionar`).
3. **Orphan `activeMenu === 'connect'` union state** and vanishing `Ficha & Produtos` sidebar entry once onboarding completes.
4. **Hardcoded 6-section storefront structure** (`src/store-v5/profile-adapter.ts:240-292`) ignoring sector workflows across the 7 core segments.
5. **Unexposed `PATCH /api/orders` capability** (`server/workspace.mjs:796-811`) and non-filtering `DashboardView` period `<select>`.
6. **45 unreachable `src/` modules including AI tools** awaiting re-homing into the AI Studio Hub (`StoreCompilerView`, `AssetHunterView`, `GeneratePostsView`, `CalendarGrid`, `dynamic-synthesizer.ts`, `store-prompt-generator.ts`, `sofia-flow-store.ts`).

## 3. Recommended Phase 2 Validation Gate Before Shipping

1. Verify Electron desktop `companygenDesktop.readWhatsAppIdentity()` emits one unified connection enum instead of dual badges (`Abra para detectar` + `Conectado`).
2. Run multi-tab optimistic locking E2E test confirming zero unhandled HTTP `409` failures during initial `FichaWizard` save.
3. Run responsive + WCAG contrast regression suite against both light and dark modes across `1440x900`, `1366x768`, `768x1024`, and `390x844`.
