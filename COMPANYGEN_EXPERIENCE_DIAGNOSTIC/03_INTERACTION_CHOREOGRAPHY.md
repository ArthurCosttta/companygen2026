# 03 — Interaction Choreography & Sequence Analysis

## 1. End-to-End Task Flow Tracing

Using the interaction chain `USER INTENT → ACTION → FEEDBACK → TRANSITION → RESULT → NEXT ACTION`, five structural breakpoints were verified in the live harness.

### Flow 1 — Onboarding to Storefront Publish (`BEFORE` vs `VARIANT B`)
- **Current Path (Before):**
  1. First login routes automatically to `FichaWizardView` Step 1 ([TC02_ficha_step1_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC02_ficha_step1_1440x900.png)).
  2. Completing 7 steps requires stepping across pills `1..7` (`34px` controls) -> clicking `Salvar ficha` (`App.tsx:241` uses unprotected `saveBusinessProfile`) -> watching 5-stage `GenerationLoader` ([TC03b_generation_loader_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC03b_generation_loader_1440x900.png)) -> landing on `StoreV5Pane` with `Publicar loja` disabled and green banner `Conectar WhatsApp agora` ([TC04_store_v5_desktop_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC04_store_v5_desktop_1440x900.png)).
  3. Clicking back to edit business details fails from the sidebar because `Sidebar.tsx:41-45` hides `Ficha & Produtos` once `onboardingCompleted === true` (verified in `TC-10`: `sidebarHasFichaAfterComplete === 0`). Merchants must discover the secondary button buried inside `SettingsView` or `DashboardView` header.
- **Target Choreography (Variant B):** Single progressive 3-step launch drawer + permanently pinned `1. Loja & Catálogo IA` pillar containing direct `Editar Ficha Única` CTA.

### Flow 2 — Catalog Update to Storefront & Bot Parity
- **Breakpoint (`TC-07`):** Adding `"SKU Dessincronizado Teste"` in `WhatsAppView → Catálogo` (`POST /api/whatsapp/api/skus/adicionar`) succeeds and updates `skus.json` (`skusJsonCount: 1`), while `profile.json` retains `profileCatalogCount: 0`.
- **Consequence:** Merchant navigates to `Dashboard` or `Store V5` expecting to see the new item, sees `0 produtos` ([TC09_dashboard_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC09_dashboard_1440x900.png)), and receives no feedback explaining that WhatsApp Catalog and Store Catalog are separate databases.

### Flow 3 — Dual Browser Mode Dead-End & Truncated Viewport
- **Evidence:** [TC08_dual_view_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC08_dual_view_1440x900.png) shows `Loja e WhatsApp` missing from the left `Sidebar`, store search bar crushed to ~60px showing `"Bus..."`, and `X` close buttons on each browser header capable of stranding users on `"Os dois navegadores foram recolhidos"` (`App.tsx:544-560`).

### Flow 4 — Dashboard Filtering & Order Fulfillment
- **Breakpoint (`TC-09`):** Selecting `Últimos 7 dias` / `Últimos 30 dias` / `Últimos 90 dias` in `DashboardView` triggers `0` requests to `/api/dashboard` (`networkTriggered: false`), only mutating card caption strings while displaying identical totals.
- **Missing Action:** `server/workspace.mjs` exposes `PATCH /api/orders`, yet `DashboardView` renders no order status table or transition controls. Variant B surfaces interactive order status rows (`Confirmar Pedido`, `Enviar Rastreio`) in Pilar 3.

### Flow 5 — Mobile Drawer Choreography (`390x844`)
- **Breakpoint:** Topbar shortcuts vanish below `1100px`. Selecting another module via mobile hamburger opens a Radix left-side `<Sheet>` drawer ([TC12_whatsapp_390x844.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC12_whatsapp_390x844.png)), requiring 3 taps per view switch vs 1 tap in the sticky 4-item mobile bottom navigation proposed in Variant B ([proposal_variant_b_390x844.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposal_variant_b_390x844.png)).

## 2. Decision & Click Efficiency Summary

| Core Task | Current Clicks (Desktop / Mobile) | Variant B Clicks | Defect Eliminated |
| :--- | :--- | :--- | :--- |
| Re-open Ficha after onboarding | 2–3 (Settings -> Edit / hidden in Sidebar) | 1 (`Editar Ficha Única`) | Vanishing Sidebar entry |
| Add product synced to Store & Bot | 5+ (must add separately or re-save Ficha) | 2 (Unified Catalog Drawer) | Dual-database desync |
| Switch between Store / Bot / Orders | Topbar + Sidebar + 6 WA tabs mixed | 1 (4-Pillar rail / sticky mobile nav) | 5 competing nav surfaces |
| Progress customer order status | Impossible in UI (backend-only `PATCH`) | 1 (`Confirmar Pedido`) | Missing fulfillment UI |
