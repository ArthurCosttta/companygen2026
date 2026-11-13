# 12 — Implementation Roadmap (Phased Execution & Rollback Strategy)

> **Precondition:** Transition from `PHASE_1 = DIAGNOSIS_ONLY` to Phase 2 requires Experience Manager sign-off ([14_MANAGER_REVIEW.md](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/14_MANAGER_REVIEW.md)) and preserving 100% of existing business & AI features.

## Phase 2A — Data Integrity, State Unification & Polling Fix (Zero UI Layout Churn)
- **Scope:** `src/app/App.tsx`, `src/services/profile-service.ts`, `server/workspace.mjs`, `server/sync-engine.mjs`
- **Deliverables:**
  1. Route `App.tsx:241` `handleSaveFichaAndGenerate` through `updateBusinessProfile()` (4x `409` optimistic retry).
  2. Redirect WhatsApp Catalog writes (`/api/whatsapp/api/skus/adicionar`, `/api/skus/remover`) through `profile.json` + automatic `skus.json` projection so Storefront, Bot, and Dashboard never diverge.
  3. Consolidate `App.tsx` (5s) + `WhatsAppView.tsx` (2s) polling loops into a single shared React query/context provider.
  4. Replace 4 WhatsApp booleans with single `ConnectionPhase` discriminated enum; remove orphan `activeMenu === 'connect'` state.
- **Verification:** Re-run Playwright `TC-07` (catalog sync parity `profileCatalogCount === skusJsonCount`) and `TC-11` (`<= 12 req/min` idle polling).
- **Rollback:** Feature flag `CG_UNIFIED_SYNC=false` restores direct `skus.json` handler paths; `profile.json` format remains backwards-compatible.

## Phase 2B — Unified Token System, 4-Pillar Shell & AI Studio Hub Re-Homing
- **Scope:** `src/styles/index.css`, `src/styles/tokens.css`, `src/components/Sidebar.tsx`, `src/components/views/SettingsView.tsx`, `src/components/views/StoreV5Pane.tsx`
- **Deliverables:**
  1. Replace conflicting `#17634f` / `#0867E8` tokens with unified `#F8FAFC` / `#FFFFFF` / `#0F172A` / `#2563EB` variables across Light & Dark themes, fixing white-on-white header contrast in `StoreV5Pane`.
  2. Enforce `min-height: 44px`, `>= 14px` body typography, and remove leaked internal copy (`"no JSON"`, ``"via `skus.json`"``).
  3. Consolidate navigation to **Variant B 4-Pillar Shell** (`Loja & Catálogo IA`, `Atendimento & Bot`, `Pedidos & Painel`, `Configurações & Conta`) with sticky mobile bar at `< 900px` and permanently accessible Ficha Única drawer.
  4. Mount all unreachable AI modules (`StoreCompilerView`, `AssetHunterView`, `GeneratePostsView`, `CalendarGrid`, `Generate30DaysDialog`, `ExportDialog`, `sofia-flow-store`) inside the integrated AI Studio Hub (`0` AI features removed).
- **Verification:** Playwright accessibility/geometry gate (`sub44 === 0`, `sub14 === 0`, `overflow === 0px`, dark-mode WCAG contrast `>= 4.5:1`).
- **Rollback:** Revert shell feature flag `CG_SHELL_V2=false` to fall back cleanly while preserving synced backend state from Phase 2A.

## Phase 2C — Order Fulfillment UI & 7 Experience Signatures
- **Scope:** `src/store-v5/profile-adapter.ts`, `src/store-v5/dynamic-synthesizer.ts`, `src/engine/protein-registry.ts`, `src/components/views/DashboardView.tsx`, `server/workspace.mjs`
- **Deliverables:**
  1. Wire `?days=7|30|90` filter in `GET /api/dashboard` and surface interactive Order Management rows (`PATCH /api/orders`) with responsive mobile cards inside Pilar 3 (`Pedidos & Painel`).
  2. Replace static 6-section array in `profile-adapter.ts` with sector-specific composition rules using `dynamic-synthesizer.ts` and `protein-registry.ts` for all 7 sectors (`Pet Shop`, `Padaria`, `Distribuidora`, `Farmácia`, `Clínica`, `Material de Construção`, `Escola`).
- **Verification:** Sector-by-sector Playwright screenshot regression across `1440x900` and `390x844` confirming distinct section blocks per sector and `PATCH /api/orders` state persistence.
- **Rollback:** Sector signature fallback defaults individual unknown segments to Retail Catalog layout without breaking orders API.
