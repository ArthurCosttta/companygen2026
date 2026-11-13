# 04 — Cognitive Simplification & AI Capability Preservation

## 1. Sources of Unnecessary Cognitive Load

Codebase tracing + live DOM telemetry (`08_BROWSER_QA_REPORT.json`) isolate four structural causes of decision overload:

1. **Five Competing Navigation Layers:** Users encounter (a) Left Sidebar (`Loja`, `WhatsApp`, `Mensagens`, `Dashboard`, `Configurações`), (b) Topbar shortcut pills (`Loja`, `WhatsApp`, `Loja e WhatsApp`, `Dashboard` — hidden below `1100px`), (c) Dual-Pane split chrome, (d) 6 horizontal `WhatsAppView` tabs, and (e) an orphan `activeMenu === 'connect'` state in `src/app/App.tsx`.
2. **Four Separate Business Identity Forms:** Store name, hours, address, Pix key, and attendant persona are fragmented across `FichaWizard Step 1`, `WhatsAppOnboarding Step 3`, `WhatsAppView → Conexão` ([TC07_wa_tab_conexao_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC07_wa_tab_conexao_1440x900.png)), and `SettingsView` ([TC10_settings_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC10_settings_1440x900.png)). Even Instagram profile lookup appears twice (`Ficha Step 1` and `Ficha Step 6`).
3. **Two Disconnected Catalog Editors:** `Ficha Step 7` writes to `/api/profile` (`profile.json`), whereas `WhatsAppView → Catálogo` ([TC07_wa_tab_catalogo_1440x900.png](file:///C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/COMPANYGEN_EXPERIENCE_DIAGNOSTIC/EVIDENCE/BEFORE/TC07_wa_tab_catalogo_1440x900.png)) writes exclusively to `skus.json`.
4. **Hidden AI Capabilities (`45/121` Unreachable Files):** High-value AI generators (`StoreCompilerView.tsx`, `AssetHunterView.tsx`, `GeneratePostsView.tsx`, `CalendarGrid.tsx`, `dynamic-synthesizer.ts`, `store-prompt-generator.ts`, `sofia-flow-store.ts`, `Generate30DaysDialog.tsx`, `ExportDialog.tsx`) are detached from the runtime navigation tree.

## 2. 4-Pillar Simplification Architecture (Zero AI Feature Deletion)

| Target Pillar | Consolidated Capabilities | Re-Homed AI Modules (Preserved 100%) |
| :--- | :--- | :--- |
| **1. Loja & Catálogo IA** | Single Ficha editor, Store V5 live preview, 7 Sector Signatures, Single Catalog table (`profile.json`), Publish gate | `StoreCompilerView.tsx`, `dynamic-synthesizer.ts`, `store-prompt-generator.ts`, `protein-registry.ts`, `gene-resolver.ts`, `AssetHunterView.tsx`, `AssetHunterEngine.ts`, `ExportDialog.tsx` |
| **2. Atendimento & Bot** | Unified WhatsApp connection QR/Desktop state, Sofia inbox, Knowledge RAG documents, Flow Simulator | `sofia-flow-store.ts`, 51 hydrated templates (`WhatsAppView`), `/api/fluxo/simular`, Documents & Triggers |
| **3. Pedidos & Painel** | Real period-filtered metrics (`7/30/90d`), interactive Order Fulfillment table (`PATCH /api/orders`), Estúdio IA Posts drawer | `GeneratePostsView.tsx`, `CalendarGrid.tsx`, `Generate30DaysDialog.tsx`, `render-post.ts` |
| **4. Configurações & Conta** | Store identity defaults, theme preference (moving Moon toggle alongside topbar), password, sign-out | Instagram Brand Extractor (`/api/instagram/analyze`) |

## 3. Measurable Complexity Reduction

- **Top-level navigation decisions:** `15+` mixed entry points -> `4` deterministic pillars.
- **Business identity forms:** `4` duplicated forms -> `1` canonical form (`Ficha Única`) with inline drawer editing.
- **Catalog sources of truth:** `2` divergent stores (`profile.json` vs `skus.json`) -> `1` canonical store with projection.
- **Preserved AI modules:** `100%` of existing and dormant AI files cataloged and re-homed; `0` AI capabilities removed.
