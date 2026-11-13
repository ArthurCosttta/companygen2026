# COMPANYGEN · DOCUMENTAÇÃO DE ARQUITETURA, STACK, APP FLOW E INTERAÇÕES
**Arquivo de Referência:** `ca1.md`  
**Versão do Sistema:** 2.0.0 (Post Studio + Store Compiler V2 + WhatsApp Bot Sofia)  
**Data:** 09/11/2026  

---

## 1. VISÃO GERAL EXECUTIVA

O **CompanyGen** é uma plataforma integrada de comércio eletrônico com inteligência artificial, automação de vendas e estúdio de social media. O ecossistema é composto por 4 módulos principais interconectados:

1. **CompanyGen Post Studio (`http://localhost:5173`):**  
   Painel executivo em SPA (Single Page Application) que contém o Dashboard inicial com 6 cards de indicadores, calendário editorial de conteúdo, motor gráfico de composição visual de slides, galeria de templates, banco de imagens sincronizadas e gerador de campanhas com IA.
2. **CompanyGen Store Compiler V2 (`/store-compiler/index.html`):**  
   Compilador estático client-side (In-Browser SSG) capaz de transformar planilhas OpenXML (`.xlsx` normalizado em 15 abas) ou prompts livres em linguagem natural em lojas virtuais completas com carrinho, catálogo responsivo, widget de chat e exportação para hospedagem.
3. **Robô WhatsApp com IA (`teste-whatsapp-ia` na porta `:3333`):**  
   Atendente autônoma de vendas (Sofia) conectada ao catálogo de produtos e ao WhatsApp via WebSocket nativo (`Baileys`), conduzindo atendimento, tirando dúvidas, consultando estoque e fechando vendas.
4. **Módulo de Áudio & Voz (`VoiceStudio` na porta `:3900`):**  
   Servidor de suporte de áudio em background para transcrição e síntese de voz para as mensagens de WhatsApp.

---

## 2. STACK TECNOLÓGICA COMPLETA POR MÓDULO

### 2.1. Frontend Principal (CompanyGen Post Studio)
* **Framework Core:** React 19 (`react` 19.3.1, `react-dom` 19.3.1).
* **Linguagem:** TypeScript 7.0.2 com verificação estrita de tipos (`tsc -b`).
* **Build Tooling & Dev Server:** Vite 8.3.6 com `@vitejs/plugin-react` (HMR ultrarrápido).
* **Estilização & Design System:**
  * Tailwind CSS v4 (`@tailwindcss/vite` 4.3.5 e `tailwindcss` 4.3.5).
  * Animações: `tw-animate-css` (1.4.0).
  * Utilitários de classes: `clsx` (2.1.1) e `tailwind-merge` (3.7.0).
  * Variantes de componentes: `class-variance-authority` (0.7.1).
* **Componentes Base & Acessibilidade:**
  * Primitivas do Radix UI (`radix-ui` 1.8.1).
  * Componentes do ecossistema Shadcn UI (`shadcn` 4.23.0).
  * Drawer / Gaveta Mobile via Radix Dialog / Sheet.
* **Ícones:** Lucide React (`lucide-react` 1.70.0).
* **Tipografia Offline-First:**
  * `@fontsource/inter` (5.3.0).
  * `@fontsource/playfair-display` (5.3.0).

### 2.2. Visualização de Dados & Motor Gráfico de Composição
* **Dashboard SVG Catmull-Rom:** Renderização matemática vetorial nativa em SVG usando interpolação por splines cúbicos (algoritmo Catmull-Rom) calculada em tempo real no cliente para curva de visitas suave, eixos dinâmicos e tooltips posicionados por bounding box.
* **Motor de Composição Visual (`PostCompositionEngine`):**
  * Layout Engine personalizado (`layout-engine.ts`) com cálculo determinístico de quebra de linha e escalonamento tipográfico via API nativa Canvas 2D (`OffscreenCanvas` / measurer).
  * Compilação para Representação Intermediária (`PostSceneIR`).
* **Editor Gráfico / Canvas:** `konva` (10.9.1) e `react-konva` (19.3.2) para manipulação acelerada por hardware de camadas gráficas no Canva Editor Modal.
* **Assets de Imagem:** Miniaturas de produtos em formato WebP comprimido em Base64 (zero latência de CDN).

### 2.3. Validação de Dados, Estado & Persistência
* **Validação de Contratos e Schemas:** `zod` (4.6.7) para validação estrita de marcas (`BrandSpec`), campanhas (`CampaignSpec`), produtos e slides.
* **Banco de Dados Local (Offline-First):** `dexie` (4.4.7) como wrapper reativo e assíncrono do IndexedDB do navegador para guardar campanhas, histórico e agendamentos.
* **Persistência de Sessão e Tema:** `localStorage` nativo com listener de media query (`prefers-color-scheme`) para alternância instantânea entre Modo Claro e Escuro.
* **Drag-and-Drop:** `@dnd-kit/core` (6.3.1) para manipulação de posts no grid mensal do calendário.

### 2.4. Compilador de Loja Virtual (Store Compiler V2)
* **Parser de Planilhas Client-Side:** Parser OpenXML SpreadsheetML proprietário construído com `JSZip` (3.10.2) e DOMParser XML nativo para ler arquivos `.xlsx` de 15 abas sem dependência de servidores.
* **Validador Relacional de Catálogo:** Validação de integridade referencial v2.0.0 (verifica unicidade de SKUs, categorização, seções e faixas de preço).
* **Gerador Estático (SSG In-Browser):** Emite HTML5 semântico, folha de estilos CSS puro modular (`storeCSS`) e JavaScript Vanilla reativo (`storeRuntime`).
* **Empacotamento de Deploy:** `JSZip` client-side para compactação de arquivos finais prontos para hospedagem com `README_DEPLOY.md` específico.
* **Chat Composer IA:** Motor heurístico local com cards interativos de perguntas para geração automática de catálogos baseados em prompts de texto.
* **Harness de Imagens:** SDK oficial da Pexels (`pexels` 1.4.0) e scripts de sincronização de banco de imagens (`fetch-images.mjs`).
* **Comunicação entre Janelas:** Protocolo de mensagens `window.postMessage` bidirecional com tipagem entre o React e o iframe da loja.

### 2.5. Robô WhatsApp com IA (Sofia • `teste-whatsapp-ia`)
* **Runtime:** Node.js (v20+ com suporte a ECMAScript Modules).
* **Protocolo de Mensageria:** `@whiskeysockets/baileys` (versão 7.0.0-rc14) conectando diretamente aos WebSockets do WhatsApp com autenticação persistente em arquivos JSON (`multi-file-auth-state`).
* **Servidor HTTP:** Módulo nativo `node:http` rodando na porta `:3333`.
* **Autenticação QR Code:** `qrcode` (para renderização em canvas/web) e `qrcode-terminal` (para escaneamento direto no terminal).
* **Telemetria & Logging:** `pino` (10.4.0).
* **Backend de Voz:** VoiceStudio rodando em background na porta `:3900`.

### 2.6. Testes & Automação de Qualidade
* **Framework de Testes E2E:** `@playwright/test` (1.65.0).
* **Navegadores Homologados:** Chromium e WebKit (Safari).
* **Suítes de Teste Criadas:**
  * `tests/home-preview-cards.spec.ts` (testes de renderização dos 6 cards, filtros de período e modais).
  * `tests/whatsapp-bot-integration.spec.ts` (integração entre Post Studio, Store e Robô Sofia).
  * `tests/darkmode-and-store.spec.ts` (persistência de tema e compilação de loja virtual).
  * `tests/ai-prompt-store-creation.spec.ts` (geração de loja via IA por prompt).
  * `tests/canva-and-contextmenu.spec.ts` (menus de contexto e estúdio Canva).

---

## 3. ARQUITETURA & APP FLOW COMPLETO

### 3.1. Diagrama de Fluxo em ASCII

```text
====================================================================================================
                                      COMPANYGEN · APP FLOW
====================================================================================================

                                 [ Usuário acessa http://localhost:5173/ ]
                                                    │
                                                    ▼
                       ┌────────────────────────────────────────────────────────┐
                       │          DASHBOARD INICIAL (6 CARDS PREVIEW)           │
                       │  Visitas · Pedidos · Vendas · Chat · Posts · Estoque   │
                       └───────────────────┬───────────────┬────────────────────┘
                                           │               │
                 ┌─────────────────────────┘               └──────────────────────────┐
                 ▼                                                                    ▼
┌─────────────────────────────────┐                                 ┌──────────────────────────────────┐
│       MÓDULO LOJA VIRTUAL       │                                 │     ESTÚDIO DE REDES SOCIAIS     │
│      (Store Compiler V2)        │                                 │      (Calendário de Posts)       │
└────────────────┬────────────────┘                                 └─────────────────┬────────────────┘
                 │                                                                    │
        Origem dos Dados?                                                             ▼
        ├── [1] Upload de Planilha (.xlsx 15 abas)                  ┌──────────────────────────────────┐
        └── [2] Chat Composer com IA                                │   Grid Mensal do Calendário      │
                     │                                              └─────────────────┬────────────────┘
                     ▼                                                                │
        ┌─────────────────────────┐                                                   ├─► [1] Gerar 30 Dias com IA
        │ Cards Interativos de    │                                                   ├─► [2] Biblioteca de Templates
        │ Perguntas da IA (Cores, │                                                   └─► [3] Criação Manual de Card
        │ Categorias, Preços)     │                                                                   │
        └────────────┬────────────┘                                                                   ▼
                     │                                                              ┌──────────────────────────────────┐
                     ▼                                                              │ PostCompositionEngine & Layout   │
        ┌─────────────────────────┐                                                 │ (Cálculo tipográfico Canvas 2D)  │
        │ Harness de Fotos Pexels │                                                 └─────────────────┬────────────────┘
        │ + Geração de Tabelas    │                                                                   │
        └────────────┬────────────┘                                                                   ▼
                     │                                                              ┌──────────────────────────────────┐
                     ▼                                                              │ Editor Inspector & Canva Modal   │
        ┌─────────────────────────┐                                                 │ (Edição de slides e legendas)    │
        │   Store Compiler V2     │                                                 └─────────────────┬────────────────┘
        │  (Client-Side SSG)      │                                                                   │
        └────────────┬────────────┘                                                                   ▼
                     │                                                              ┌──────────────────────────────────┐
                     ▼                                                              │ Agendamento Drag and Drop        │
        ┌─────────────────────────┐                                                 │ + Persistência IndexedDB (Dexie) │
        │ Preview Navegável       │                                                 └─────────────────┬────────────────┘
        │ (Desktop / Mobile)      │                                                                   │
        └──────┬────────────┬─────┘                                                                   ▼
               │            │                                                       ┌──────────────────────────────────┐
               │            │ (Widget Flutuante)                                    │ Exportação de ZIP da Campanha    │
               │            ▼                                                       └──────────────────────────────────┘
               │   ┌──────────────────────────────────┐
               │   │    MÓDULO ROBÔ WHATSAPP (Sofia)  │
               │   │ (Node.js :3333 + Baileys Socket) │
               │   └────────────────┬─────────────────┘
               │                    │
               │                    ├──► VoiceStudio (:3900) [Voz e Áudio]
               │                    │
               │                    ▼
               │   ┌──────────────────────────────────┐
               │   │ Atendimento / Fechamento Vendas  │
               │   └────────────────┬─────────────────┘
               │                    │
               │                    └─────────► [ Atualiza Indicadores no Dashboard ]
               ▼
┌───────────────────────────────┐
│ Exportação do Pacote ZIP      │
│ (README_DEPLOY.md incluso)    │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ DEPLOY FINAL                  │
│ • Cloudflare Pages            │
│ • Hostinger / Netlify         │
└───────────────────────────────┘
```

---

## 4. INVENTÁRIO DETALHADO DE TODAS AS TELAS, BOTÕES E INTERAÇÕES

### 4.1. Header Superior Global (Barra Unificada)
O cabeçalho superior tem altura fixa de 64px (`h-16`) e adapta dinamicamente seus botões de ação e títulos de acordo com o módulo ativo (`activeMenu`):

1. **Botão Mobile Hamburger:**
   * **Elemento:** `<button>` com `<Menu />`.
   * **Interação:** Exibido apenas em telas menores que 1024px. Abre a gaveta lateral direita (`Sheet`) contendo o Editor Inspector no mobile.
2. **Ícone do Módulo Ativo:**
   * **Elemento:** Quadrado arredondado com fundo `#0867E8` exibindo o ícone correspondente à tela (`Box` no Início, `Store` na Loja, `Calendar` no Calendário).
3. **Título & Subtítulo:**
   * **Início:** Título *"Preview dos cards"*, badge *"Dashboard 6 Cards"* e subtítulo *"Exemplos de cards com informações e indicadores da sua empresa."*.
   * **Loja:** Título *"Criar Loja Virtual"*, badge *"Conectado"* verde e subtítulo com contagem de fotos sincronizadas.
   * **Calendário:** Título *"Calendário de Conteúdo"* e subtítulo *"Planeje, gere e organize seus posts nas redes sociais."*.
4. **Dropdown Seletor de Período (Presente no Dashboard):**
   * **Elemento:** Botão arredondado com ícone `<CalendarDays />`, texto *"Últimos {7/30/90} dias"* e `<ChevronDown />`.
   * **Interação:** Abre menu flutuante com as 3 opções. Ao escolher `30` ou `90` dias, os cards mudam para o estado limpo de fallback (*"Sem dados demonstrativos para este período."*). Ao escolher `7` dias, restaura os dados completos com gráfico e fotos. Fecha automaticamente ao clicar fora.
5. **Atalho "Loja":**
   * **Elemento:** `<button>` com `<Store />` e texto *"Loja"*.
   * **Interação:** Altera `activeMenu` para `'shop'` e carrega a tela do compilador de lojas.
6. **Atalho "Calendário":**
   * **Elemento:** `<button>` com `<Sparkles />` e texto *"Calendário"*.
   * **Interação:** Altera `activeMenu` para `'calendar'` e abre a grade mensal de postagens.
7. **Botões de Ação Específicos da Loja (Quando `activeMenu === 'shop'`):**
   * **Pills de Demos Rápidas:**
     * `Moda (KU)`: envia mensagem `TRIGGER_LOAD_DEMO` com `KU_MODA` para o iframe da loja.
     * `Eletrônicos`: envia `TRIGGER_LOAD_DEMO` com `EV_ELETRONICOS`.
     * `Casa`: envia `TRIGGER_LOAD_DEMO` com `CV_CASA`.
   * **Botão "Ver Loja":** `<button>` com `<Eye />`. Envia `TRIGGER_VIEW_STORE` para o iframe alternar para o preview navegável da loja.
   * **Botão "Baixar ZIP":** `<button>` com `<Download />`. Envia `TRIGGER_DOWNLOAD_ZIP` para acionar a geração e download do pacote ZIP.
   * **Botão "Abrir em Nova Aba":** Link externo com `<ExternalLink />` que abre `/store-compiler/index.html` em uma aba separada do navegador.
8. **Botões de Ação Específicos do Calendário (Quando `activeMenu === 'calendar'`):**
   * **Badge de Status de Salvamento:** Exibe *"Salvando..."*, *"Salvo"* (com check verde) ou *"Erro ao salvar"* (com alerta vermelho), sincronizado com o Dexie.js.
   * **Botão "Gerar 30 dias com IA":** Botão azul primário com `<Sparkles />`. Abre o modal `Generate30DaysDialog`.
   * **Botão "Gerar Card":** Botão secundário com `<Plus />`. Cria um novo card imediatamente na data selecionada.
   * **Botão "Importar JSON":** Abre o modal `ImportDialog` para subir arquivos de campanha existentes.
   * **Botão "Exportar":** Abre o modal `ExportDialog` para gerar ZIP com todos os posts, legendas e criativos.
9. **Botão "Robô WhatsApp":**
   * **Elemento:** Botão verde esmeralda com indicador pulsante animado, ícone `<MessageSquare />` e texto *"Robô WhatsApp"*.
   * **Interação:** Abre o painel do robô em `http://localhost:3333` em uma nova aba do navegador.
10. **Alternador de Tema Claro / Escuro:**
    * **Elemento:** Botão com `<Sun />` amarelo (no modo escuro) ou `<Moon />` azul (no modo claro).
    * **Interação:** Alterna a classe `.dark` no elemento raiz `<html>` e persiste a preferência no `localStorage` sob a chave `cg_theme`.
11. **Botão de Notificações:**
    * **Elemento:** Botão com `<Bell />` e dot azul de notificação pendente.
12. **Avatar do Usuário:**
    * **Elemento:** Círculo com imagem de perfil e borda sutil.

---

### 4.2. Sidebar de Navegação (Menu Lateral Esquerdo)
Barra lateral fixa com largura de 248px (`w-[248px]`), com scroll suave e seções organizadas:

1. **Header da Sidebar:** Logo da marca CompanyGen com ícone `<Box />` azul.
2. **Dropdown de Seleção de Empresa:**
   * **Elemento:** Pílula clicável exibindo o ícone de loja, o nome da marca ativa (ex: *KU Confecções*) e seta para baixo.
3. **Menu Principal:**
   * **Botão "Início":** Ícone `<Home />` + *"Início"*. Seleciona `activeMenu = 'home'` (Dashboard 6 Cards).
   * **Botão "Loja":** Ícone `<ShoppingBag />` + *"Loja"*. Seleciona `activeMenu = 'shop'`.
   * **Botão "WhatsApp":** Ícone `<MessageSquare />` + *"WhatsApp"*. Seleciona `activeMenu = 'whatsapp'`.
4. **Seção CONTEÚDO:**
   * **Botão Principal "Conteúdo":** Ícone `<CalendarIcon />` e abertura da grade de posts.
   * **Sub-item "Calendário":** Link com indicador de contagem de posts agendados (ex: *11 posts*).
   * **Sub-item "Gerar Posts":** Abre o assistente de criação guiada de posts por objetivo.
   * **Sub-item "Biblioteca de Templates":** Mostruário de layouts pré-formatados.
   * **Sub-item "Banco de Imagens":** Galeria de fotos de produtos sincronizadas com contagem de assets (ex: *20 fotos*).
   * **Sub-item "Ideias de Conteúdo":** Pautas estratégicas com ganchos virais.
   * **Sub-item "Roteiros de Vídeo":** Scripts formatados para gravação de Reels e TikTok.
   * **Sub-item "Análises":** Dashboard de métricas e alcance estimado.
5. **Seção Secundária:**
   * **Botão "Clientes":** Acesso à listagem de leads e compradores.
   * **Botão "Configurações":** Parâmetros da empresa e integrações.

---

### 4.3. Tela 1: Dashboard Inicial (`HomePreviewCardsView`)
A tela inicial padrão apresenta os 6 cards de indicadores da empresa:

1. **Card 1: Visitas à loja**
   * **Cabeçalho:** Ícone `<Eye />` em caixa suave azul, título *"Visitas à loja"*, valor *"1.248"*, badge verde *"+12%"* com ícone `<ArrowUpRight />` e subtítulo *"Visitas nos últimos 7 dias"*.
   * **Gráfico SVG Catmull-Rom:** Curva contínua suave ligando os pontos de segunda a domingo (`[900, 970, 1060, 1000, 1100, 1150, 1248]`), área sombreada translúcida, linhas de grade em 800, 1000, 1200 e 1400 e ponto de destaque no domingo.
   * **Interações do Gráfico:**
     * *Passar o mouse (Hover):* Exibe tooltip flutuante fixado sobre o cursor com o dia e o número exato de visitas (ex: *"Sábado: 1.150 visitas"*).
     * *Clicar no ponto:* Abre o modal de detalhes ampliado com o valor do dia selecionado.
   * **Botão Gatilho Superior Direito:** Ícone `<ArrowUpRight />`. Abre o modal de detalhes ampliado de visitas à loja.
2. **Card 2: Pedidos**
   * **Cabeçalho:** Ícone `<Box />` em caixa suave, título *"Pedidos"*, métrica *"34 pedidos"*.
   * **Lista de Pedidos Recentes:**
     * Linha 1: Foto real WebP da Camisa Polo Azul, nome *"Camisa Polo Azul"*, ID `"#1043"` e badge verde *"Pago"*.
     * Linha 2: Foto da Polo Branca, nome *"Polo Branca"*, ID `"#1042"` e badge azul *"Em preparo"*.
     * Linha 3: Foto da Polo Preta, nome *"Polo Preta"*, ID `"#1041"` e badge neutro *"Enviado"*.
   * **Interações:**
     * *Hover na linha:* Fundo realçado.
     * *Clique na linha:* Abre o modal de detalhes específico daquele pedido com foto ampliada, código e status.
     * *Botão Gatilho Superior:* Abre o modal com a lista de todos os 34 pedidos e botão de atalho *"Abrir Loja Virtual"*.
3. **Card 3: Vendas**
   * **Cabeçalho:** Ícone `<CreditCard />`, título *"Vendas"*, valor *"R$ 4.890"* e subtítulo *"Pagamentos confirmados"*.
   * **Lista de Pagamentos:**
     * Pedido `#1043` com ícone verde `<CheckCircle2 />` e valor `R$ 79,90`.
     * Pedido `#1042` com ícone verde `<CheckCircle2 />` e valor `R$ 69,90`.
     * Pedido `#1041` com ícone verde `<CheckCircle2 />` e valor `R$ 59,90`.
   * **Interações:**
     * *Botão Gatilho Superior:* Abre modal com resumo de faturamento e botão de atalho *"Acessar Catálogo"*.
4. **Card 4: Mensagens**
   * **Cabeçalho:** Ícone `<MessageCircle />`, título *"Mensagens"*, métrica *"186 mensagens"*.
   * **Caixa de Conversa Recente (Mini-Chat):**
     * Cabeçalho interno com ícone verde e texto *"Cliente · Conversa recente"*.
     * Balão do Cliente: Avatar de usuário, fundo branco, mensagem *"Tem camisa polo azul M?"* e horário `10:24`.
     * Balão da IA Sofia: Alinhado à direita, fundo verde claro, mensagem *"Temos sim! Vou mostrar as opções."*, horário `10:26` e ícone duplo check `<CheckCheck />` azul.
   * **Interações:**
     * *Botão Gatilho Superior:* Abre modal com detalhes da conversa e botão de ação direta *"Abrir Robô WhatsApp (Sofia :3333)"*, que abre o painel web em nova aba.
5. **Card 5: Posts planejados**
   * **Cabeçalho:** Ícone `<CalendarDays />`, título *"Posts planejados"*, métrica *"24 posts"*.
   * **Lista de Posts Futuros:**
     * Linha 1: Ícone de imagem, título *"Nova coleção"* e badge de data *"09 NOV"*.
     * Linha 2: Ícone de imagem, título *"Dica de look"* e badge de data *"10 NOV"*.
     * Linha 3: Ícone de imagem, título *"Oferta"* e badge de data *"11 NOV"*.
   * **Interações:**
     * *Clique na linha ou no gatilho:* Abre modal de detalhes dos posts e botão de ação *"Abrir Calendário"*, que altera a tela para o calendário de conteúdo.
6. **Card 6: Estoque**
   * **Cabeçalho:** Ícone `<Layers />`, título *"Estoque"*, métrica *"78 unidades"*.
   * **Lista de Inventário com Barras:**
     * Polo azul: miniatura WebP, texto *"Polo azul"*, contagem *"26 un"* e barra de progresso preenchida em 43.3% (`26/60`).
     * Polo branca: miniatura WebP, texto *"Polo branca"*, contagem *"12 un"* e barra preenchida em 20% (`12/60`).
     * Polo preta: miniatura WebP, texto *"Polo preta"*, contagem *"40 un"* e barra preenchida em 66.6% (`40/60`).
   * **Interações:**
     * *Clique na linha ou no gatilho:* Abre modal com visão total do inventário e botão de ação *"Gerenciar Loja"*.
7. **Modal de Detalhes Universal (`modalData`):**
   * **Estrutura:** Diálogo com backdrop com leve desfoque e alta opacidade (sem transparência de fundo indesejada), título com ícone `<Info />`, botão de fechar `<X />`, corpo contextual, botão de ação de atalho e botão *"Fechar"*.
   * **Acessibilidade:** Fecha ao pressionar tecla `Escape` ou ao clicar na área externa fora do card central.

---

### 4.4. Tela 2: Criador de Loja Virtual (`StoreCompilerView`)
Tela que encapsula o compilador de e-commerce e o assistente de IA:

1. **Barra de Composer com IA (Criar com IA):**
   * **Input de Prompt:** Campo de texto aberto para comandos em linguagem natural (ex: *"Loja de moda praia com biquínis e saídas de banho"*).
   * **Botão "Limpar" (X):** Apaga o texto digitado.
   * **Botão "Gerar Loja":** Ícone de avião de papel `<Send />` + texto *"Gerar Loja"*. Aciona a IA local para processar o catálogo.
2. **Cards Interativos de Perguntas da IA:**
   * Gerados dinamicamente quando a IA precisa refinar aspectos da loja.
   * Apresentam botões/chips com sugestões pré-definidas (paleta de cores, categorias, ticket médio) que o usuário clica para refinar antes ou depois da compilação.
3. **Área de Upload de Arquivos:**
   * **Dropzone de Planilha XLSX:** Suporta arrastar e soltar arquivo `.xlsx` (schema v2.0.0 de 15 abas) ou clique para abrir o seletor de arquivos.
   * **Dropzone de ZIP de Imagens:** Suporta envio opcional de arquivo compactado contendo imagens dos produtos.
4. **Resumo de Validação do Catálogo:**
   * Exibe cards de contagem: Categorias, Produtos (SKUs) e Seções identificadas.
   * Alerta verde de validação com sucesso ou lista de erros apontando a aba e a linha com inconsistências na planilha.
5. **Botão Principal "Criar minha loja ->" / "Compilar Loja":**
   * Aciona o compilador estático que gera a árvore de componentes em memória.
6. **Visualizador de Loja (Iframe Sandbox):**
   * **Alternador de Visualização:** Botão "Desktop" vs Botão "Mobile" (redimensiona o viewport da loja).
   * **Navegação Funcional da Loja:** Carrossel de banners, grid de produtos, filtros por categoria, modal de visualização do produto com variantes de tamanho/cor, carrinho de compras interativo com soma de subtotais e cálculo de frete.
   * **Widget do WhatsApp Sofia:** Ícone flutuante no canto inferior direito da loja compilada que permite ao cliente abrir conversa direta com a IA.
7. **Modal de Hospedagem & Download ZIP:**
   * Abre ao clicar em "Baixar ZIP".
   * Permite escolher o destino: **Hostinger**, **Cloudflare Pages**, **Netlify** ou **Genérica**.
   * Gera o arquivo `.zip` final acompanhado das instruções adequadas no `README_DEPLOY.md`.

---

### 4.5. Tela 3: Calendário Editorial de Conteúdo (`CalendarGrid`)
A área central do estúdio de posts:

1. **Grade Mensal Interativa:**
   * Organizada por semanas e dias (Segunda a Domingo).
   * Cada dia possui cabeçalho com número do dia e botão `+` para criar post diretamente naquela data.
2. **Cards de Postagens no Grid:**
   * **Miniatura do Post:** Renderização visual da capa do post gerada pelo `PostCompositionEngine`.
   * **Informações:** Título do post, horário programado (ex: `09:00`, `18:30`), indicador de carrossel (ex: `1/4 slides`).
   * **Drag and Drop:** O usuário clica e arrasta o card para outro dia ou horário; o evento atualiza as coordenadas de data e salva automaticamente no Dexie.js.
   * **Clique Simples:** Seleciona o post ativo e abre o **Editor Inspector** na lateral direita.
3. **Menu de Contexto (Clique com Botão Direito no Card de Post):**
   * **"Editar no Canva":** Abre o modal `CanvaEditorModal`.
   * **"Duplicar Post":** Cria uma cópia exata do post com novo ID.
   * **"Excluir Post":** Remove o post da campanha após confirmação.
   * **"Mover para Hoje":** Altera a data do post para o dia atual.

---

### 4.6. Tela 4: Inspetor de Edição Lateral (`EditorInspector`) & Canva Studio
Painel lateral fixo no desktop (largura de 430px) ou gaveta no mobile:

1. **Cabeçalho do Inspetor:**
   * Título do post selecionado.
   * Indicador de salvamento automático (*"Salvo"* com check verde).
   * Botão `<Canva />` *"Editar no Canva Studio"*.
   * Botão de fechar `<X />`.
2. **Carrossel de Slides:**
   * Faixa horizontal de miniaturas com cada slide do post carrossel.
   * Botão `+` para adicionar novo slide em branco.
   * Botão de duplicar slide atual.
   * Botão de remover slide atual.
3. **Campos de Edição do Slide:**
   * **Headline (Título do Slide):** Campo de texto para o título principal da arte.
   * **Subtítulo / Texto de Apoio:** Campo de texto complementar.
   * **Body Copy / Legenda do Post:** Área de texto com a legenda completa para Instagram/Facebook/TikTok, incluindo hashtags sugeridas.
   * **Call to Action (CTA):** Texto do botão da arte (ex: *"Compre Agora"*, *"Link na Bio"*).
   * **Seletor de Imagem de Fundo:** Galeria popover para trocar a foto de fundo do slide a partir do banco de imagens sincronizadas.
4. **Parâmetros de Agendamento:**
   * Seletor de Data (`<input type="date">`).
   * Seletor de Horário (`<input type="time">`).
   * Checkboxes de canais de publicação: Instagram Feed, Instagram Stories, Facebook, TikTok.
5. **Modal do Canva (`CanvaEditorModal`):**
   * Ambiente gráfico em tela cheia com Canvas Konva.
   * Ferramentas de alinhamento de texto (esquerda, centro, direita).
   * Seletor de fontes e tamanhos.
   * Seletor de cores da paleta da marca.
   * Botão *"Aplicar Alterações"* e botão *"Cancelar"*.
6. **Ações de Rodapé:**
   * Botão vermelho *"Excluir este Post"*.

---

### 4.7. Telas 5 a 10: Módulos Estratégicos de Conteúdo

1. **Gerador de Posts com IA (`GeneratePostsView`):**
   * **Seletor de Objetivo de Post:** Chips clicáveis (*Lançamento de Produto*, *Promoção Especial*, *Dica de Especialista*, *Depoimento de Cliente*).
   * **Seletor de Tom de Voz:** *Profissional*, *Descontraído*, *Urgente / Vendas*, *Minimalista*.
   * **Seletor de Produto:** Dropdown com os produtos cadastrados na marca.
   * **Botão "Gerar Post":** Aciona a IA e gera a prévia completa da imagem e legenda.
   * **Botão "Agendar no Calendário":** Insere o post criado diretamente no calendário e redireciona o usuário.
2. **Biblioteca de Templates (`TemplateGalleryView`):**
   * Grid com dezenas de artes prontas estilizadas no padrão da marca.
   * Filtros de estilo (Minimalista, Varejo Forte, Editorial de Moda).
   * Botão *"Usar este Template"* em cada card: instancia um novo post no calendário com aquele formato.
3. **Banco de Imagens (`ImageGalleryView`):**
   * Campo de busca em tempo real por palavras-chave e tags.
   * Grid com as fotos do produto sincronizadas em alta resolução.
   * Botão *"Sincronizar Banco"*: recarrega os assets do manifesto.
   * Clique na foto: copia o ID do asset para a área de transferência.
4. **Ideias de Conteúdo (`IdeasView`):**
   * Lista de cards com ganchos estratégicos pré-formatados para o nicho da empresa.
   * Botão *"Criar Post desta Ideia"*: transfere a ideia para um novo card no calendário.
5. **Roteiros de Vídeo (`VideoScriptsView`):**
   * Estruturas de roteiro para Reels e TikTok separadas em blocos cronometrados:
     * *0 a 3s:* Gancho visual e frase de impacto.
     * *3 a 15s:* Demonstração do problema e apresentação do produto.
     * *15 a 30s:* Prova social e oferta.
     * *30 a 45s:* Chamada para ação final.
   * Botão *"Agendar Gravação"*: cria lembrete no calendário de produção.
6. **Análises & Métricas (`AnalyticsView`):**
   * Gráficos com projeções de alcance orgânico, taxa de engajamento estimada e histórico de postagens por categoria.
   * Botão *"Voltar ao Calendário"*.

---

### 4.8. Tela 11: Robô WhatsApp IA (Painel Web `:3333`)

1. **Indicador de Status do Robô:**
   * Pílula com luz indicadora: *Verde (Conectado ao WhatsApp)*, *Amarelo (Aguardando leitura de QR Code)* ou *Vermelho (Desconectado)*.
2. **Área de Autenticação QR Code:**
   * Exibição de QR Code dinâmico quando a sessão precisa ser pareada pelo aplicativo do WhatsApp no celular do lojista.
3. **Console de Logs de Mensagens em Tempo Real:**
   * Feed com as mensagens recebidas de clientes e as respostas automáticas geradas pela Sofia.
   * Exibição de intenções identificadas (Dúvida sobre frete, pedido de foto de produto, confirmação de pedido).
4. **Integração com VoiceStudio (`:3900`):**
   * Transcrição automática de áudios recebidos de clientes.
   * Resposta gerada em áudio sintético quando solicitado pelo cliente.

---

### 4.9. Diálogos Modais Globais

1. **`ImportDialog` (Importar Campanha):**
   * Área de drop para arrastar arquivo `.json` de campanha.
   * Botões de carregamento rápido de campanhas de exemplo pré-definidas.
   * Botão *"Importar Campanha"* e botão *"Cancelar"*.
2. **`ExportDialog` (Exportar Campanha):**
   * Checkboxes para escolher o que exportar: Imagens compiladas em alta resolução (PNG), Arquivos JSON de especificação, Planilhas de legendas e datas.
   * Botão azul *"Baixar Arquivo ZIP Completo"*.
3. **`Generate30DaysDialog` (Gerar 30 Dias de Conteúdo com IA):**
   * Formulário para configurar o mês da campanha: Objetivo principal do mês, Produtos em destaque, Frequência de postagens (diária, 3x por semana).
   * Botão *"Iniciar Geração com IA"*: gera os 30 posts em lote com capas, carrosséis e legendas estruturadas e preenche o calendário.
