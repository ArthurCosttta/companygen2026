# 02 — Visual Forensics (14-Dimension Evidence Analysis)

> All findings below derive directly from source CSS inspection and real Chromium renders in `COMPANYGEN_DIAG_HARNESS` documented in [08_BROWSER_QA_REPORT.json](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/08_BROWSER_QA_REPORT.json).

## 1. Visual Split-Brain: Dual Design Tokens Colliding Live

| Screen | Surface Background | Primary Action Hex | Header / Navigation Shell | Visual Evidence |
| :--- | :--- | :--- | :--- | :--- |
| AuthFlowView | `#f1f3ef` | `#17634f` (green) | `#143d36` hero block | [TC01_auth_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC01_auth_1440x900.png) |
| FichaWizardView | `#F7FAFF` | `#0867E8` (cobalt) | White rounded card | [TC02_ficha_step1_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC02_ficha_step1_1440x900.png) |
| StoreV5Pane (Dark) | Mixed `#FFFFFF` card inside `#0b132b` navy shell | `#0867E8` | `#0c1b17` dark-green sidebar | [TC05_store_v5_darkmode_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC05_store_v5_darkmode_1440x900.png) |
| WhatsApp Onboarding | `#f1f3ef` | `#143d36` step pill | Blue topbar shortcuts | [TC06_wa_onboarding_step1_qr_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC06_wa_onboarding_step1_qr_1440x900.png) |
| SettingsView | `#FFFFFF` card | Full-width `#17634f` green buttons | Blue topbar shortcuts | [TC10_settings_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC10_settings_1440x900.png) |

## 2. Measured Geometric & Typographic Violations (Playwright DOM Audit)

### Sub-44px Interactive Control Counts
- **Dashboard (`1440x900`):** `15/15` visible interactive controls are below `44px` height, including `.cg-topbar-shortcut` (`30px`), sidebar buttons (`36px`), period dropdown (`18px` height), and header buttons `Atualizar`, `Editar Ficha`, `Voltar para Loja` (`28px` height).
- **Storefront Mobile (`390x844`):** `20/22` visible controls are below `44px` height, including Desktop/Mobile preview switchers (`30x22px`), `Publicar loja` (`32px`), Close pane `X` (`32x32px`), header search input (`36px`), and hamburger toggle (`36x36px`).
- **Ficha Step 7 (`1440x900`):** `14/14` measured controls are below `44px` (`34px` wizard step pills, `32px` inputs/buttons).

### Font-Size Distribution (< 14px Dominance)
- **Dashboard (`1440x900`):** Out of `41` text elements measured, `31` (`75.6%`) are below `14px` (`11px`: 2, `12px`: 26, `13px`: 3).
- **Storefront Mobile (`390x844`):** Out of `37` text elements measured, `29` (`78.4%`) are below `14px` (`9px`: 4, `10px`: 4, `11px`: 14, `12px`: 5, `13px`: 2).

### Contrast & Copy Defects
- **Dark Mode Collision (`TC-05`):** Header label `NAVEGADOR 1 - Site Gerado (Bella Pasta Artesanal)` renders near-white text directly over a `#FFFFFF` top strip inside [TC05_store_v5_darkmode_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC05_store_v5_darkmode_1440x900.png), while `<select>` and `<input>` elements turn dark navy (`#0f172a`) inside an unstyled white product detail card.
- **Internal Storage Copy Leakage:** Both `"10 unidades disponíveis no JSON"` (`ProductDetail`) and ``"Valor recalculado via `skus.json`"`` (`DashboardView` in [TC09_dashboard_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC09_dashboard_1440x900.png)) surface file/serialization terms to merchants.
- **Responsive Overflow vs Control Loss:** Horizontal overflow measured `0px` at `1366x768`, `768x1024`, and `390x844`, however `@media (max-width: 1100px)` drops all 4 `.cg-topbar-shortcut` buttons (`topbarShortcutsVisible` falls from `4` to `0` at `768px` and `390px`), forcing multi-step drawer opening (`TC12_whatsapp_390x844.png`).
