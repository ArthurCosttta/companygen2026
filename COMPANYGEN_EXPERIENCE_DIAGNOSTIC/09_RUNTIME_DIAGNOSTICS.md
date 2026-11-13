# 09 — Runtime Diagnostics, Network Polling & Backend Capability Gaps

> Grounded in [08_BROWSER_QA_REPORT.json](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/08_BROWSER_QA_REPORT.json) and trace files under [EVIDENCE/BROWSER_TRACES/](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BROWSER_TRACES/network_events.json).

## 1. Idle Polling Amplification (`TC-11`)
- **Measured Behavior:** Leaving `WhatsAppView` idle for `8` seconds generated `6` `GET /api/whatsapp/api/dados` requests (`~45 requests/minute` sustained idle rate).
- **Confirmed Root Cause:** `src/app/App.tsx` (lines 185–197) polls `/api/whatsapp/api/dados` every `5000ms` globally, while `src/components/views/WhatsAppView.tsx` (lines 412–421) simultaneously runs an independent `2000ms` `setInterval` calling `/api/whatsapp/api/dados`. When WhatsApp onboarding awaits QR scans, additional per-frame refresh triggers compound traffic.
- **Proposed Remediation:** Consolidate status fetching into a single shared React context provider (or Server-Sent Events `/api/events` stream) with visibility-aware backoff when `document.hidden === true`.

## 2. Orphaned Order Fulfillment API & Non-Functional Period Select (`TC-09`)
- **Dashboard Period Dropdown:** Changing the `<select>` from `Últimos 7 dias` to `Últimos 90 dias` in `DashboardView` triggered `0` calls to `/api/dashboard` (`networkTriggered: false`). Backend `buildDashboardProjection` returns cumulative totals without date-window filtering.
- **Orphaned Order API:** `server/workspace.mjs` (`ordersHandler`, lines 796–811) implements `PATCH /api/orders` for transitioning order statuses, plus `recalculateOrderTotals` in `sync-engine.mjs`, yet `DashboardView` has no UI component invoking `PATCH /api/orders`.

## 3. Console & Optimistic Lock Observations (`TC-13`)
- **Runtime Stability:** `pageErrorCount: 0` across all 13 test scenarios.
- **Console Errors (`17` total in [console_and_page_errors.json](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BROWSER_TRACES/console_and_page_errors.json)):** `16` HTTP `403` errors during background shell initialization probes and `1` HTTP `405` generated when `TC-13` probed `/api/profile` with `POST` instead of `PUT` (`workspace.mjs` accepts `GET`/`PUT`). Static review confirms `App.tsx:241` still calls unprotected `saveBusinessProfile()` without `updateBusinessProfile()`'s `409` retry wrapper.
