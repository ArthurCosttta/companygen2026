---
trigger: always_on
---
# Regra Obrigatória de Arquitetura & Invariantes — CompanyGen

Antes de editar código neste projeto:
1. Leia obrigatoriamente `docs/architecture/MAPA_SISTEMA_INVARIANTES_E_ROADMAP.md` e `docs/architecture/SPEC_COMPILADOR_LASER_E_DICIONARIOS.md`.
2. **Proibido hardcode:** Nunca adicione layouts, textos ou temas exclusivos para uma loja exemplo. Toda vitrine gerada precisa nascer das regras genéricas dos 10 Dicionários e da spec compilada (`PieceExecutionPlan`).
3. **Critério do olho humano na UI:** Toda melhoria na vitrine precisa estar conectada ao fluxo ativo (`src/app/App.tsx` -> `ProductCatalogTable.tsx` / `ArchetypeComposerView.tsx` -> `CustomerStorefrontView.tsx`), não em painéis órfãos.
4. **Proteção de invariantes:** Nunca desmonte a aba `'whatsapp'` offscreen (`-left-[12000px]`) no `App.tsx` em modo desktop Electron; ao alterar `server/*.mjs`, reinicie o servidor na porta `1245` antes de testar.
