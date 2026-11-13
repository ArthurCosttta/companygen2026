# 05 — State Consistency & Sync Engineering Analysis

> Cross-referenced against [STATE_TRANSITION_MATRIX.json](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/STATE_TRANSITION_MATRIX.json) and [catalog_desync_and_conflict.json](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/STATE_TRANSITIONS/catalog_desync_and_conflict.json).

## 1. Confirmed State Split-Brains

### 1.1 Four-Boolean WhatsApp Contradiction
Currently, four loosely synced state variables compute WhatsApp readiness independently:
1. `whatsapp.conectado` (Baileys worker boolean from `/api/whatsapp/api/dados`)
2. `browserWhatsapp.connected` (Desktop IPC bridge `readWhatsAppIdentity`)
3. `storePhoneReady` (`whatsapp.conectado || browserWhatsapp.connected || valid(profile.business.whatsapp)`)
4. `configLoja.onboardingConcluido` (gates 3-step `WhatsAppOnboarding` vs 6-tab `WhatsAppView`)

**Empirical Visual Proof:** In [TC08_dual_view_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC08_dual_view_1440x900.png), the right header displays amber `"• Abra para detectar"` directly above `"• Conectado"` green status text inside the same component panel. Meanwhile, in [TC04_store_v5_desktop_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC04_store_v5_desktop_1440x900.png), Sidebar displays `off` while `Publicar loja` uses `storePhoneReady`.

**Target Solution:** Derive a single discriminated state enum on the backend/shared context:
`ConnectionPhase = 'UNCONFIGURED' | 'QR_PENDING' | 'AUTHENTICATING' | 'CONNECTED_WEB' | 'CONNECTED_BOT' | 'PAUSED' | 'ERROR'`

### 1.2 Catalog Two-Headed Persistence (`profile.json` vs `skus.json`)
**Empirical Verification (`TC-07`):** Adding `"SKU Dessincronizado Teste"` in `WhatsAppView → Catálogo` yielded:
```json
{
  "skusJsonCount": 1,
  "skusContainsNewItem": true,
  "profileCatalogCount": 0,
  "profileContainsNewItem": false
}
```
Consequence visible in [TC09_dashboard_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC09_dashboard_1440x900.png): Dashboard reports `Catálogo: 0 produtos ("Sincronizados entre Loja V5 e WhatsApp")` even immediately after adding a SKU in WhatsApp.

**Target Invariant:** `profile.json` owns catalog items via `PUT /api/profile`. Server-side projection writes `skus.json` automatically; WhatsApp Catalog endpoints become thin adapters updating `profile.json` inside the same queued lock (`queue(user.id)` in `server/workspace.mjs`).

### 1.3 Optimistic Concurrency Gap (`409` on Initial Ficha Save)
- `src/services/profile-service.ts` provides `updateBusinessProfile()` with a 4-attempt `409` conflict retry loop.
- `src/app/App.tsx:241` (`handleSaveFichaAndGenerate`) bypasses `updateBusinessProfile()` and calls raw `saveBusinessProfile()`, failing immediately on concurrent revision changes. (Note: TC-13 verified HTTP `405` on malformed `POST /api/profile`; `server/workspace.mjs` enforces `409` on stale-revision `PUT /api/profile`.)
- **Target Invariant:** All client profile mutations must invoke `updateBusinessProfile()`.
