# 14 — Experience Manager Approval Gate Review

> **Authority:** `experience_manager` (Rubric Gate >= 8.5 weighted, zero critical dimension < 8.0)  
> **Scorecard Reference:** [13_VISUAL_SCORECARD.json](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/13_VISUAL_SCORECARD.json)

## 1. Approval Gate Decision

| Candidate | Weighted Score | Min Critical Dimension | Gate Result |
| :--- | :-: | :-: | :--- |
| **ORIGINAL (Production Baseline)** | **4.51 / 10** | `3.0` (`state_consistency`) | **REJECTED** |
| **VARIANT A (Structural Preservation)** | **8.26 / 10** | `7.6` (`navigation_redundancy`) | **CONDITIONAL (Below 8.5 target)** |
| **VARIANT B + 7 Sector Signatures** | **9.16 / 10** | `8.9` (`content_density`) | **APPROVED FOR PHASE 2** |

### Why Variant A Scored 8.26 and Requires Variant B for Full Gate Pass
Variant A resolves green/blue collision, dark-mode contrast failures, `<44px` controls, and permanent `Ficha` access, lifting score from `4.51` to `8.26`. However, preserving the separate multi-menu layout keeps user decision density high and still fails to expose `PATCH /api/orders` or re-home unreachable AI views. Variant B consolidates the shell into 4 clear pillars + Integrated AI Hub + Orders Fulfillment + 7 Sector Signatures, reaching **9.16 / 10**.

## 2. Prototype Iteration Defect Caught & Fixed
During visual inspection of [proposal_variant_b_390x844.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/PROPOSALS/proposal_variant_b_390x844.png), Review Cycle 1 identified horizontal column clipping on the Pilar 3 Orders table at `390px`. Revision Cycle 2 transformed table rows into stacked mobile order cards with `@media (max-width: 900px)`, re-captured via `capture-proposals.mjs`, and passed inspection with `0px` horizontal overflow and full-width `>= 44px` CTA buttons.

## 3. Manager-Generated Tasks for Phase 2 Execution

<generated_task>
- Parent task ID: TASK-004
- Problem category: State Split-Brain / Data Integrity
- Screenshot or trace reference: EVIDENCE/STATE_TRANSITIONS/catalog_desync_and_conflict.json & EVIDENCE/BEFORE/TC09_dashboard_1440x900.png
- Reproduction steps: Open WhatsApp -> Catálogo -> Save new product -> Navigate to DashboardView.
- Expected behavior: New product appears immediately in both StoreV5Pane and Dashboard Catálogo KPI count.
- Actual behavior: skus.json count increments to 1 while profile.json catalog stays at 0 (Dashboard displays '0 produtos').
- Impacted user journey: Catalog management and omnichannel sync.
- Assigned queue: Q1_ARCHITECTURE_AND_STATE
- Required skill: playwright-state-verification
- Verification method: Automated Playwright assertion confirming `profileCatalogCount === skusJsonCount` after SKU creation.
</generated_task>

<generated_task>
- Parent task ID: TASK-002
- Problem category: Dark Mode Contrast Failure
- Screenshot or trace reference: EVIDENCE/BEFORE/TC05_store_v5_darkmode_1440x900.png
- Reproduction steps: Toggle dark mode icon in topbar while viewing StoreV5Pane.
- Expected behavior: All pane headers, cards, and form controls maintain >= 4.5:1 luminance contrast on a unified dark surface.
- Actual behavior: Header text 'NAVEGADOR 1 - Site Gerado' renders near-white on #FFFFFF background while sidebar renders dark green #0c1b17 inside #0b132b shell.
- Impacted user journey: Store preview editing in dark mode.
- Assigned queue: Q2_VISUAL_FORENSICS_AND_TOKENS
- Required skill: frontend-design
- Verification method: Measured computed WCAG contrast >= 4.5:1 across all visible text nodes in dark theme.
</generated_task>

<generated_task>
- Parent task ID: TASK-004
- Problem category: Contradictory Connection Badges
- Screenshot or trace reference: EVIDENCE/BEFORE/TC08b_dual_dead_end_1440x900.png & EVIDENCE/BEFORE/TC08_dual_view_1440x900.png
- Reproduction steps: Connect WhatsApp session and open 'Loja e WhatsApp' Dual View in browser mode.
- Expected behavior: Single consistent connection state rendered across header badge, tab status, and sidebar.
- Actual behavior: NAVEGADOR 2 header simultaneously shows amber '• Abra para detectar' badge and green '• Conectado' indicator.
- Impacted user journey: Verifying bot connectivity.
- Assigned queue: Q1_ARCHITECTURE_AND_STATE
- Required skill: state-machine-verification
- Verification method: Single derived `ConnectionPhase` enum assertion in unit and browser tests.
</generated_task>

<generated_task>
- Parent task ID: TASK-007
- Problem category: Orphaned Order API & Non-Functional Filter
- Screenshot or trace reference: EVIDENCE/BEFORE/TC09_dashboard_1440x900.png & server/workspace.mjs:796-811
- Reproduction steps: Open Dashboard -> Change period dropdown from 'Últimos 7 dias' to 'Últimos 90 dias' -> Inspect order management controls.
- Expected behavior: Period dropdown filters metrics via /api/dashboard?days=90 and interactive order status transitions call PATCH /api/orders.
- Actual behavior: Zero API requests fire on filter change and zero PATCH /api/orders controls exist in the UI.
- Impacted user journey: Daily order management and revenue analysis.
- Assigned queue: Q5_BROWSER_QA_AND_RUNTIME
- Required skill: playwright-browser-qa
- Verification method: Network trace confirms GET /api/dashboard?days=90 and PATCH /api/orders status update reflected in UI.
</generated_task>

<generated_task>
- Parent task ID: TASK-001
- Problem category: AI Feature Re-Homing (Zero Deletion Policy)
- Screenshot or trace reference: 01_SYSTEM_INVENTORY.json (preserved_ai_modules_requiring_rehoming)
- Reproduction steps: Navigate entire active app menu from Sidebar and Topbar.
- Expected behavior: Users can access Store Compiler, AI Photo Acquisition, and 30-Day Post Calendar AI generators without orphaned views.
- Actual behavior: 13 AI-related modules in src/ (including StoreCompilerView, AssetHunterView, GeneratePostsView, CalendarGrid, Generate30DaysDialog) are unreachable from src/main.tsx.
- Impacted user journey: AI content creation and multi-channel marketing.
- Assigned queue: Q3_INTERACTION_AND_NAVIGATION
- Required skill: frontend-design
- Verification method: Navigation audit verifies every AI module is reachable in <= 2 clicks inside Variant B AI Studio Hub.
</generated_task>
