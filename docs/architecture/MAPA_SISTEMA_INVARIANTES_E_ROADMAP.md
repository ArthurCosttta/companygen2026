# Mapa do Sistema, Invariantes e Fila de Gerações (Leitura Obrigatória)

> **REGRA DE OURO:** Leia este documento antes de editar qualquer arquivo. Ele existe para acabar com o ciclo **"conserta X → quebra Y → conserta Y → quebra X"**.

---

## 1. Taxonomia & Mapa Interno das Features Reais do Projeto

### `FEAT_01` — WhatsApp Desktop + WebView + Bot + Sofia Local
- **Arquivos-chave:** `desktop/main.mjs`, `desktop/whatsapp-webview-script.mjs`, `src/hooks/useWebviewWhatsappResponder.ts`, `src/components/views/whatsapp/WhatsAppConnectionView.tsx`, `server/ai-sofia-local.mjs`, `server/workspace.mjs`, `src/app/App.tsx`, `vite.config.ts`.
- **Rotas API:** `/api/whatsapp/events`, `/api/whatsapp/traffic/click`, `/api/whatsapp/ai/brain`, `/api/whatsapp/ai/config`, `/api/whatsapp/ai/simulate-or-reply`, `/api/whatsapp/ai/classify-and-draft`, proxy `/api/whatsapp/api/*` (dados, perfil, skus/sync, chat/send, sessao/*).
- **Como funciona por dentro:**
  1. No Desktop Electron (`desktop/main.mjs`), a porta fixa `1245` (`vite.config.ts`) serve front + backend Node carregado na memória no boot.
  2. O WebView injeta `desktop/whatsapp-webview-script.mjs`, que escaneia DOM do WhatsApp Web e manda eventos para `useWebviewWhatsappResponder.ts`.
  3. O backend `ai-sofia-local.mjs` decide a resposta (Ollama/regras) respeitando flags de pausa/estado (`pausedThreads[threadKey]`, `botAtivo`).
- **INVARIANTE — NÃO MUDE X PORQUE QUEBRA Y:**
  - **NÃO desmontar** a aba `whatsapp` no `App.tsx` quando `getDesktopBridge()?.isDesktop` está ativo (`pointer-events-none fixed -left-[12000px]`): se desmontar condicional ao trocar de aba, o WebView morre e para de responder cliente em segundo plano.
  - **NÃO editar `server/*.mjs` achando que aplicou sem reiniciar o processo da porta `1245`:** `desktop/main.mjs` reaproveita `1245` se já estiver escutando, mantendo backend antigo na RAM.
  - **NÃO tratar mensagens iniciais não lidas no baseline ou chat próprio sem checagem correta de entrada (`tail-in`)** sem revisar `whatsapp-webview-script.mjs` e `pausedThreads` em `ai-sofia-local.mjs`, senão ou responde histórico velho de madrugada ou silencia o chat de teste.
- **Onde o olho humano enxerga na UI:** Aba **WhatsApp** (`WhatsAppConnectionView`) — badge de status no header do `App.tsx`, conexão/QR no WebView e fila/atendimentos humanos (`WhatsAppPurchaseQueueDrawer`).

---

### `FEAT_02` — Planilhas Universais (`.xlsx` / CSV) → Catálogo e Pedidos
- **Arquivos-chave:** `server/ai-spreadsheet-engine.mjs`, `src/utils/xlsx-io.ts`, `src/components/views/storefront/UniversalCatalogXlsxModal.tsx`, `src/components/views/orders/OrderSpreadsheetCatalogModal.tsx`, `src/components/views/storefront/ProductCatalogTable.tsx`, `src/components/views/orders/OrdersKanbanView.tsx`.
- **Rotas API:** `POST /api/ai/spreadsheet/transform-catalog`, `POST /api/ai/spreadsheet/catalog-orders`.
- **Como funciona por dentro:**
  1. Usuário envia `.xlsx`/CSV/texto na modal da aba **Minha Loja** (`UniversalCatalogXlsxModal`).
  2. `ai-spreadsheet-engine.mjs` detecta cabeçalhos (IA Ollama + fallback determinístico), normaliza preços para centavos, classifica cada linha via `inferItemTypeForSpreadsheetRow` (`produto_fisico`, `kit_combo`, `servico_agendado`, `sob_medida`) e gera `mensagemMolde` padrão (`buildDefaultMensagemMoldeServer`).
  3. O front (`UniversalCatalogXlsxModal`) converte para `CatalogProduct[]` e salva em `profile.catalog.products`, que já alimenta vitrine e WhatsApp (`/api/whatsapp/api/skus/sync`).
  4. Em paralelo, na aba **Pedidos**, `OrderSpreadsheetCatalogModal` usa `/api/ai/spreadsheet/catalog-orders` para catalogar pedidos em `.xlsx`.
- **INVARIANTE — NÃO MUDE X PORQUE QUEBRA Y:**
  - **NÃO alterar o formato dos 4 valores de `itemType`** (`produto_fisico`, `kit_combo`, `servico_agendado`, `sob_medida`) nem remover `mensagemMolde`: a classificação da planilha escolhe automaticamente quais blocos/fluxos a loja e o bot de WhatsApp ativam.
  - **NÃO quebrar a assinatura JSON de `columnMapping` e `products[]` de `/transform-catalog`**, senão `UniversalCatalogXlsxModal` falha no parse ao importar.
- **Onde o olho humano enxerga na UI:** Aba **Minha Loja** → botão/modal de **Importar Planilha** (`UniversalCatalogXlsxModal`) populando a tabela de produtos (`ProductCatalogTable`), e aba **Pedidos** → botão de catalogar pedidos via planilha (`OrderSpreadsheetCatalogModal`).

---

### `FEAT_03` — Geração de Vitrine & Estúdio de Composição (Onde está o Fluxo Real vs Código Órfão)
- **Arquivos-chave (ATIVOS na UI):** `src/app/App.tsx`, `src/components/views/storefront/ProductCatalogTable.tsx`, `src/components/views/studio/ArchetypeComposerView.tsx`, `src/components/views/storefront/CustomerStorefrontView.tsx`, `src/components/views/storefront/StorefrontWidgetsRenderer.tsx`, `src/components/views/storefront/ExperienceBlocks.tsx`, `server/ai-store-graph.mjs`, `server/ai-widget-composer.mjs`, `server/ai-art-director.mjs`, `src/schemas/widgets.schema.ts`.
- **Arquivos-chave (ÓRFÃOS / NÃO LIGADOS NO `App.tsx`):** `src/components/views/StoreV5Pane.tsx` + `src/store-v5/*`, `src/components/views/StoreCompilerView.tsx` + `src/compiler/*`.
- **Rotas API:** `POST /api/ai/storefront/generate-graph`, `POST /api/ai/storefront/patch-section`, `POST /api/ai/storefront/inspect-asset`, `POST /api/ai/art-director/{archetypes,plan,synthesize}`.
- **Como funciona por dentro (estado atual):**
  1. Ao gerar loja no `ProductCatalogTable.tsx`, chama `/api/ai/storefront/generate-graph` -> `/api/ai/art-director/synthesize` -> `composeWidgetsFromPreset`.
  2. O preview do cliente e a URL pública (`?preview=vitrine` / `?view=store`) renderizam **exclusivamente `CustomerStorefrontView`**.
  3. Hoje, `ArchetypeComposerView` ainda tem fundo escuro (`bg-[#09090B]`), `ai-widget-composer.mjs` cai em `high_contrast_dark` (`#09090B`) por palavras-chave ou arquétipo, `StorefrontWidgetsRenderer`/`CustomerStorefrontView` têm blocos hardcoded `bg-[#0F172A]` e blocos cinzas de upload (`"+ Subir foto de capa"`), e `ExperienceBlocks` usa `<Package>` quando falta imagem.
- **INVARIANTE — NÃO MUDE X PORQUE QUEBRA Y:**
  - **NÃO construir o novo Compilador Laser só dentro de `StoreV5Pane` ou `StoreCompilerView` sem ligar no fluxo ativo (`CustomerStorefrontView` / `ProductCatalogTable`)**, senão **nada muda aos olhos humanos** quando você clica em **"Ver Vitrine"** ou gera uma loja!
  - **NÃO separar `widgets[]` e `ArtDirectorPlan`:** o mesmo Manifesto/Plano precisa dirigir tanto o preview no Estúdio quanto a Vitrine Pública (`?view=store`).
  - **NÃO colocar bloqueio/upload cinza dentro do render de cliente (`CustomerStorefrontView` em modo cliente):** botões de subir foto só podem existir no modo editor, nunca expostos para comprador final.
- **Onde o olho humano enxerga na UI:**
  - Botão **"Ver Vitrine"** na topbar do `App.tsx` e URL pública (`CustomerStorefrontView`);
  - Estúdio em **Minha Loja** (`ArchetypeComposerView`) e tabela de catálogo (`ProductCatalogTable`).

---

### `FEAT_04` — Onboarding, Ficha Express & Maturidade da Loja
- **Arquivos-chave:** `src/components/views/onboarding/ExpressFichaWizardModal.tsx`, `GuidedChecklistCard.tsx`, `OnboardingModals.tsx`, `src/hooks/useClientMaturity.ts`, `src/utils/fichaModalLayout.ts`.
- **Como funciona por dentro:** Guia o lojista de `ESTADO_0` até `ESTADO_4` (nome, segmento, endereço, Pix/WhatsApp, primeiros produtos) e destrava `isStoreOperationReady` no `App.tsx`.
- **INVARIANTE — NÃO MUDE X PORQUE QUEBRA Y:**
  - **NÃO exigir campo opcional avançado no cálculo de `isStoreOperationReady` / `ESTADO_4`**, senão usuários ficam trancados no checklist sem conseguir abrir a Vitrine nem os Pedidos.
- **Onde o olho humano enxerga na UI:** Modal do Assistente Guiado (`ExpressFichaWizardModal`), card de passos em **Minha Loja** (`GuidedChecklistCard`) e badge de status.

---

### `FEAT_05` — Pedidos, Kanban & Venda Manual
- **Arquivos-chave:** `src/components/views/orders/OrdersKanbanView.tsx`, `ManualSaleModal.tsx`, `OrderDetailsModal.tsx`, `server/workspace.mjs` (`/api/orders`, `/api/dashboard`).
- **Como funciona por dentro:** Recebe pedidos criados pela vitrine (`CustomerStorefrontView`), por venda manual (`ManualSaleModal`) ou fila do WhatsApp, exibindo no Kanban da aba `dashboard`.
- **INVARIANTE — NÃO MUDE X PORQUE QUEBRA Y:**
  - **NÃO mudar o contrato de `POST /api/orders` sem atualizar `CustomerStorefrontView` e `ManualSaleModal` juntos**, senão pedidos fechados na vitrine somem do Kanban.
- **Onde o olho humano enxerga na UI:** Aba **Pedidos** (`OrdersKanbanView`) e badges de faturamento/fila no dashboard.

---

### `FEAT_06` — Workspace, Perfil, Fotos/Asset Hunter & Sincronização
- **Arquivos-chave:** `server/workspace.mjs`, `server/sync-engine.mjs`, `src/services/profile-service.ts`, `src/services/local-storage.ts`, `src/services/asset-hunter/*`, `src/components/views/storefront/BatchImageSearchModal.tsx`, `MissingMaterialsModal.tsx`.
- **Rotas API:** `/api/workspace`, `/api/profile`, `/api/store/public`, `/api/store/visit`, `/api/hunt`, `/api/images/status`, `/api/brand-logo/*`.
- **INVARIANTE — NÃO MUDE X PORQUE QUEBRA Y:**
  - **NÃO remover controle de revisão (`_rev` / `revision`) em `/api/profile` e `/api/workspace`:** ele evita que duas abas ou uma regeneração parcial sobrescrevam alterações feitas pelo usuário.
  - **NÃO salvar estado crítico de loja apenas em `localStorage` sem persistir no `/api/profile` / `/api/store/public`**, pois a URL pública da vitrine lê do backend.
- **Onde o olho humano enxerga na UI:** Mudanças de marca/produtos refletidas após F5, logos carregando em `/api/brand-logo/*` e busca em lote de fotos (`BatchImageSearchModal`).

---

### `FEAT_07` — Acesso, Planos/Kiwify, Créditos de IA & Admin Console
- **Arquivos-chave:** `server/access-and-checkout.mjs`, `server/middleware/ai-budget.mjs`, `server/admin-console.mjs`, `src/components/views/access/AccessCodeView.tsx`, `src/components/views/checkout/CheckoutPlansView.tsx`, `src/components/views/admin/AdminConsoleView.tsx`.
- **Rotas API:** `/api/access/*`, `/api/checkout/*`, `/api/credits/balance`, `/api/admin/*`.
- **INVARIANTE — NÃO MUDE X PORQUE QUEBRA Y:**
  - **NÃO quebrar os query params `?route=access` e `?route=checkout` em `App.tsx`** nem o check de `touchState.banned` em `workspace.mjs`: são as portas de entrada de licença e bloqueio administrativo.
- **Onde o olho humano enxerga na UI:** Telas `/access`, `/checkout`, pílula `"Planos IA · X cr"` na topbar e aba **Admin** (para contas admin).

---

### `FEAT_08` — Infraestrutura de Runtime (`vite.config.ts` / `server/index.mjs` / `desktop/main.mjs`)
- **INVARIANTE:** Mudou qualquer arquivo em `server/*.mjs` → precisa reiniciar o processo rodando na porta `1245` (dev) ou `5174` (prod) antes de testar no Electron ou navegador; senão você testa código velho em RAM achando que sua mudança não funcionou.

---

## 2. Documento Simples — Fila de Próximas Gerações (Uma Coisa por Vez, Sem Misturar)

- **Geração 1 (Destravar Ambiente + WPP):**
  - Reiniciar processo antigo da porta `1245` (`vite.config.ts` / worker) para garantir código atualizado em RAM;
  - Diagnosticar/corrigir resposta do WhatsApp (`whatsapp-webview-script.mjs` baseline/chat ativo e `ai-sofia-local.mjs` `pausedThreads` / `botAtivo`) e validar com mensagem real no WebView sem tocar na aba oculta do `App.tsx`.

- **Geração 2 (Base dos 10 Dicionários + Compilador de Plano `Spec -> Plan`):**
  - Implementar os 10 Dicionários Fechados e o Compilador de Plano (`LaserSpecParser` + `CoordinateSolver` + `TokenAndToneCompiler` com bloqueio de `#09090B`/`#0F172A` fora de tema dark).
  - Tudo ainda sem alterar UX do WhatsApp ou Planilhas.

- **Geração 3 (Ligar o Compilador na Vitrine Visível ao Olho Humano):**
  - Conectar o `MutationVM` + `PieceExecutionPlan` direto dentro do fluxo ativo (`ProductCatalogTable` / `CustomerStorefrontView`), removendo blocos cinzas de upload e `<Package>` na visão do cliente final.
  - Garantir que o Estúdio (`ArchetypeComposerView`) e o Preview Público (`?view=store`) leiam o **mesmo Plano compilado**.

- **Geração 4 (Bateria de Testes Reais Contra a IA Local — Zero Hardcode):**
  - Enviar múltiplos pedidos estruturados diferentes (Confeitaria, Farmácia, Pet Shop, Moda — só ficha + catálogo + endereço, **nunca** pedindo componente específico) para o Ollama local;
  - Abrir desktop e `390x844` via `@playwright/test`, ver visualmente o resultado, anotar qual Spec/Dicionário falhou e ajustar apenas as regras genéricas dos dicionários até atingir consistência.

- **Geração 5 (Polimento de Planilhas ↔ Vitrine + Pedido End-to-End):**
  - Validar fluxo completo: subir planilha `.xlsx` em **Minha Loja** → gerar vitrine pelo Compilador → cliente fecha pedido no mobile `390x844` → cai no Kanban **Pedidos** e dispara confirmação no WhatsApp.
