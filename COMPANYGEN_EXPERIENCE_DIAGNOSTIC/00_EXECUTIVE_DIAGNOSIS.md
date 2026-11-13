# 00 — Executive Diagnosis: CompanyGen Experience Intelligence V2

## 1. Verdict & Score Improvement

| Metric | Production Baseline (`BEFORE`) | Variant A (`Structural`) | Variant B (`4-Pillar + AI Hub + 7 Signatures`) |
| :--- | :-: | :-: | :-: |
| **Experience Manager Weighted Score** | **4.51 / 10** | 8.26 / 10 | **9.16 / 10** |
| **Minimum Critical Dimension** | `3.0` (`state_consistency`) | `7.6` (`navigation_redundancy`) | **8.9** (`content_density`) |
| **Interactive Controls `< 44px`** | `90–100%` (e.g., `15/15` Dashboard, `20/22` Mobile Store) | **0** | **0** |
| **Text Nodes `< 14px`** | `75.6–78.4%` (`11–13px` dominant) | **0** | **0** |
| **Idle API Polling Rate** | `45 req/min` (dual `5s` + `2s` timers) | Consolidates | **`<= 12 req/min` / SSE** |
| **AI Features Preserved** | `4` active, `13` modules unreachable | All retained | **100% active & re-homed** |

## 2. Five Root Causes Proven by Evidence

1. **Green vs. Blue Split-Brain & Broken Dark Mode Contrast:** Legacy `#17634f` / `#0c1b17` CSS rules (`Auth`, `Settings`, `WhatsApp Onboarding`) clash inside the cobalt `#0867E8` / `#0b132b` workspace, rendering white-on-white header text in StoreV5 dark mode ([TC05_store_v5_darkmode_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC05_store_v5_darkmode_1440x900.png)).
2. **Disconnected Dual-Database Catalog (`profile.json` vs `skus.json`):** Verified in `TC-07` that saving a SKU inside `WhatsAppView → Catálogo` updates `skus.json` (`1`) while leaving `profile.json` at `0`, causing Dashboard ([TC09_dashboard_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC09_dashboard_1440x900.png)) and StoreV5 to show empty catalogs.
3. **Four Contradictory WhatsApp Booleans & Dual Dead-End:** `DualBrowserView` displays `"• Abra para detectar"` above `"• Conectado"` simultaneously ([TC08_dual_view_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC08_dual_view_1440x900.png)), while Sidebar hides `Ficha & Produtos` once onboarding completes (`TC-10`).
4. **Identical Storefront Layout Across Business Niches + Dormant AI Code:** `profile-adapter.ts` hardcodes 6 static blocks regardless of business sector, while `13` AI modules (`StoreCompilerView`, `AssetHunterView`, `GeneratePostsView`, `CalendarGrid`, `dynamic-synthesizer`, etc.) sit disconnected from `src/main.tsx`.
5. **Orphaned Orders Endpoint & No-Op Analytics Filter:** `PATCH /api/orders` exists in `server/workspace.mjs` with zero frontend UI, and Dashboard's 7/30/90 selector emits `0` backend queries (`TC-09`).

## 3. Recommended Strategy: Variant B + 7 Sector Signatures
Approve Phase 2 execution anchored on **Variant B** ([proposal_variant_b_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposal_variant_b_1440x900.png) & [proposal_variant_b_390x844.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposal_variant_b_390x844.png)): a single unified token system (`#F8FAFC` / `#FFFFFF` / `#0F172A` / `#2563EB`), 4-Pillar workspace navigation, integrated AI Studio Hub preserving 100% of AI features, live `PATCH /api/orders` fulfillment UI, and 7 sector-specific Experience Signatures ([06_EXPERIENCE_SIGNATURES.md](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/06_EXPERIENCE_SIGNATURES.md)).
