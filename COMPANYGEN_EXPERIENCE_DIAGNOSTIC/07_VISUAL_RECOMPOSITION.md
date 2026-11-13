# 07 — Visual Recomposition & Variant Comparison

> **Notice:** All proposed designs are labeled `PROPOSAL — NOT IMPLEMENTED PRODUCTION CODE` in [proposals-prototype.html](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposals-prototype.html) and reflect visual prototypes validated via Playwright, distinct from existing code screenshots.

## 1. Unified Design Token System Applied

| Token Role | Value | Constraint Satisfied |
| :--- | :--- | :--- |
| Canvas Background | `#F8FAFC` | Eliminates `#f1f3ef` vs `#F7FAFF` dual-canvas conflict |
| Surface / Card | `#FFFFFF` (`1px solid #E2E8F0`) | Consistent elevation border across all panes |
| Primary Ink | `#0F172A` | Contrast ratio > `16:1` against `#FFFFFF` |
| Muted Ink | `#64748B` | Contrast ratio `>= 4.7:1` on `#FFFFFF` (body `14px–16px`) |
| Primary Action | `#2563EB` (`hover #1D4ED8`) | Replaces mixed `#17634f` green and `#0867E8` buttons |
| WhatsApp Status Accent | `#15803D` on `#DCFCE7` | Reserved strictly for live connection state and WA CTAs |
| Touch Target Floor | `min-height: 44px; min-width: 44px` | Resolves `15/15` Dashboard & `20/22` Mobile `<44px` controls |
| Typography Floor | `14px–16px` body, `20px–28px` headers | Eliminates `9px–12px` dominant micro-text |

## 2. Side-by-Side Comparison (`ORIGINAL ↔ VARIANT A ↔ VARIANT B`)

| Dimension | Original (`BEFORE`) | Variant A (`Structural Preservation`) | Variant B (`4-Pillar + AI Hub`) |
| :--- | :--- | :--- | :--- |
| **Evidence Screenshot (Desktop)** | [TC08_dual_view_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC08_dual_view_1440x900.png) | [proposal_variant_a_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposal_variant_a_1440x900.png) | [proposal_variant_b_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposal_variant_b_1440x900.png) |
| **Evidence Screenshot (Mobile)** | [TC12_store_390x844.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC12_store_390x844.png) | [proposal_variant_a_390x844.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposal_variant_a_390x844.png) | [proposal_variant_b_390x844.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposal_variant_b_390x844.png) |
| **Horizontal Overflow** | `0px` (but topbar nav disappears at `<=1100px`) | `0px` | `0px` (verified with stacked mobile Order cards) |
| **Controls `< 44px`** | `14/15` to `20/22` (`90–100%`) | `0` (`sub44Count: 0`) | `0` (`sub44Count: 0`) |
| **Text Nodes `< 14px`** | `75.6%–78.4%` below `14px` | `0` (`sub14Count: 0`) | `0` (`sub14Count: 0`) |
| **AI Tools Discovery** | Hidden (`45` unreachable src files) | Linked statically | Dedicated AI Studio card + sub-tabs (`100%` preserved) |
| **Order Management UI** | Absent despite `PATCH /api/orders` | Deferred | Built into Pillar 3 (`Pedidos & Painel`) |
| **Weighted Rubric Score** | `4.51 / 10` | `8.26 / 10` | `9.16 / 10` (**Recommended Target**) |

## 3. Visual Iteration Resolved During Proposal Review
Initial visual inspection of `proposal_variant_b_390x844.png` caught horizontal table clipping on the Pilar 3 Orders table inside a scrolling container at `390px`. A responsive `@media (max-width: 900px)` stacked-card layout (`td::before` attribute labels + full-width `Confirmar Pedido` button) was applied and re-verified via Playwright, eliminating table truncation completely.
