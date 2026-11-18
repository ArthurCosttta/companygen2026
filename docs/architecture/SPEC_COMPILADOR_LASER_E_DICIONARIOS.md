# Especificação do Compilador Laser, 10 Dicionários Expandidos e Paradigma Anti-Hardcode

> **Objetivo:** Eliminar improviso visual (HTML solto da IA, blocos cinzas no cliente, vazamento `#09090B`/`#0F172A`, seções quebradas) transformando cada peça em um **Plano Executável Determinístico** alimentado por **10 Dicionários Fechados**.

---

## 1. Paradigma Estrito: Proibido Hardcode + Protocolo de Teste Real

1. **PROIBIDO hardcodar loja ou exemplo pronto:** É terminantemente proibido criar código, cor, layout ou texto específico para uma marca fictícia (ex.: hardcodar layout de confeitaria só para passar um print). Toda qualidade estética **tem que nascer da lógica genérica do compilador** lendo os 10 Dicionários e o Briefing.
2. **Entrada Pura de Pedido (Zero Menção a Componentes):** Os testes enviam apenas o que um lojista real preenche:
   - Nome da loja, endereço, horário, cidade/UF, WhatsApp, descrição do negócio;
   - Catálogo/planilha real (produtos, categorias, preços, variações, prazo/tipo).
   - **NUNCA** se pede "use `BoxBuilder`", "use card arredondado" ou "use `W07`". A máquina tem que **deduzir** a arquitetura sozinha a partir do nicho e do catálogo.
3. **Critério do Olho Humano na UI:** Toda mudança no compilador só conta se estiver conectada no caminho visível da interface (`App.tsx` → `CustomerStorefrontView` / Estúdio), onde você clica, envia o pedido e **enxerga a loja sendo montada na tela** — zero código morto desconectado (como painéis órfãos fora do fluxo principal).
4. **Loop de Diagnóstico Real na IA Local (`127.0.0.1:11434`):**
   - Enviar pedido estruturado (lojista) → esperar resposta real da IA local → renderizar loja completa → inspecionar UI (desktop e `390x844`) → **identificar qual Spec ou Dicionário falhou** → ajustar a regra genérica do Dicionário/Compilador → repetir com outro ramo totalmente diferente (ex.: Confeitaria, Farmácia, Oficina/Autopeças, Moda, Pet Shop).

---

## 2. Mecanismo: Spec da Peça → Plano Executável (`PieceExecutionPlan`)

Antes do React renderizar qualquer pixel, a spec de cada peça passa por um **Compilador de Plano em 5 Estágios**:

```
[Raw AI Decision + Catálogo]
        │
        ▼ (1. Normalize & Validate)
[LaserSpecParser (zod/ajv)] ──▶ rejeita fora do schema / dispara repair automático
        │
        ▼ (2. Lookup em 10 Dicionários)
[DictionaryResolver] ──▶ expande taxonomia + forma + opcodes + DNA + sinais + fallbacks
        │
        ▼ (3. Constraint & Geometry Solver)
[Coordinate & Cardinality Solver] ──▶ calcula colunas, min/ideal/max, zero-collapse, cr mobile 390px
        │
        ▼ (4. Plan Compiler)
[PieceExecutionPlan JSON] ──▶ plano congelado (sem código solto): DOMShape + TokenMap + OpQueue + BusHooks + GateAssertions
        │
        ▼ (5. MutationVM + Harness Runtime)
[Render Determinístico + VisualRegressionAuditor (@playwright/test)]
```

### Estrutura do Objeto `PieceExecutionPlan` (O que a Spec vira)
Para cada seção/peça da loja, o compilador gera um **Plano Fechado** (nunca JSX escrito pela IA):

```json
{
  "pieceId": "sec_02_builder",
  "taxonomy": "SEC_INTERACTIVE_BUILDER",
  "shape": "SHAPE_MATRIX_BUILDER",
  "maturityState": "ESTADO_4",
  "zLayer": "content",
  "geometry": {
    "desktop": { "x": 0, "y": 620, "w": 1200, "h": "auto", "cols": 3, "gap": 20 },
    "mobile390": { "x": 0, "y": 540, "w": 390, "h": "auto", "cols": 2, "stickyBar": true }
  },
  "cardinality": { "min": 3, "ideal": 9, "max": 12, "zeroPolicy": "COLLAPSE_ZERO_GAP", "overflowPolicy": "TABBED_FAMILIES" },
  "tokenScope": { "surface": "--cg-surface", "surfaceAlt": "--cg-surface-alt", "ink": "--cg-ink", "accent": "--cg-accent", "forbidDarkLeak": true },
  "mutationQueue": ["OP_ROUND_16", "OP_BORDER_SUBTLE", "OP_ASPECT_4_3", "OP_MONOGRAM_IF_NO_PHOTO", "OP_STICKY_SUMMARY_BAR"],
  "signals": { "listen": ["category.selected"], "emit": "builder.progress.changed", "debounceMs": 50 },
  "locksAndPersistence": { "lockKey": "builder_commit", "storage": "sessionStorage", "undoWindowMs": 5000 },
  "a11yAndTelemetry": { "role": "region", "ariaLive": "polite", "minTapPx": 44, "events": ["builder.slot_toggled", "builder.completed"] },
  "gateAssertions": ["NO_GRAY_UPLOAD_IN_CLIENT", "NO_PACKAGE_ICON_FALLBACK", "CONTRAST_GE_4_5", "CLS_LE_0_02"]
}
```

Quando o `MutationVM` recebe esse Plano, ele **não pensa e não adivinha**: ele pega `SHAPE_MATRIX_BUILDER`, aplica os 5 opcodes da fila, injeta os tokens escopados e acopla os hooks do Harness.

---

## 3. Os 10 Dicionários Fechados (Expandidos com Itens Concretos)

### `DICT_01` — Taxonomias de Seção (`SEC_*`) — **14 Entradas**
| Código Taxonomia | Papel Semântico | Forma Base Default | Obrigatória se... |
| :--- | :--- | :--- | :--- |
| `SEC_TOP_NOTICE` | Aviso fino de frete/horário/promoção | `SHAPE_STRIP_BANNER` | Opcional (nunca `#0F172A` sobre tema claro) |
| `SEC_HEADER_NAV` | Cabeçalho sticky + busca + sacola | `SHAPE_STICKY_HEADER` | Sempre (1 por loja) |
| `SEC_HERO_SPLIT` | Capa 50/50 texto editorial + foto | `SHAPE_SPLIT_PANEL` | Padrão para catálogo com foto ou destaque |
| `SEC_HERO_EDITORIAL` | Capa tipográfica centrada com acento | `SHAPE_EDITORIAL_FRAME` | Quando não há foto de capa (evita buraco vazio) |
| `SEC_TRUST_RIBBON` | 3–4 selos objetivos (entrega, preparo, retirada) | `SHAPE_PILL_STRIP` | Quando loja tem diferenciais reais preenchidos |
| `SEC_CATEGORY_NAV` | Filtros vivos por categoria do catálogo | `SHAPE_CHIP_RAIL` | `categories.length >= 2` |
| `SEC_FEATURED_ROW` | Fileira de 3–4 destaques curados | `SHAPE_CARD_GRID` | `products.length >= 4` |
| `SEC_INTERACTIVE_BUILDER` | Montador de caixa/kit/combo guiado | `SHAPE_MATRIX_BUILDER` | `kit_combo` ou itens unitários combináveis |
| `SEC_CATALOG_GRID` | Vitrine principal com busca e filtro | `SHAPE_CARD_GRID` | Sempre (`products.length >= 1`) |
| `SEC_SERVICE_BOOKING` | Seletor de serviço + duração + horário | `SHAPE_SCHEDULE_PANEL` | `itemType === 'servico_agendado'` presente |
| `SEC_CUSTOM_ORDER` | Briefing rápido de item sob medida | `SHAPE_QUOTE_FORM` | `itemType === 'sob_medida'` presente |
| `SEC_BRAND_STORY` | História curta e processo artesanal/técnico | `SHAPE_SPLIT_EDITORIAL` | Descrição/história real informada na ficha |
| `SEC_SOCIAL_PROOF` | Depoimentos ou métricas verificadas | `SHAPE_QUOTE_CARDS` | Apenas se houver prova real (senão colapsa `0px`) |
| `SEC_FOOTER_CONTACT` | Endereço, horários, canais, WhatsApp | `SHAPE_STRUCTURED_FOOTER` | Sempre (1 por loja, herdando superfície do `dna`) |

### `DICT_02` — Formas Geométricas Base (`SHAPE_*`) — **12 Primitivas**
1. `SHAPE_STRIP_BANNER` (faixa horizontal `h-9..11`, texto central + 0 ou 1 link)
2. `SHAPE_STICKY_HEADER` (barra fixa `h-16`, logo esquerda, âncoras centro, busca + sacola direita)
3. `SHAPE_SPLIT_PANEL` (grid 12 cols desktop `7/5` ou `6/6`, stack vertical em `390px`)
4. `SHAPE_EDITORIAL_FRAME` (moldura tipográfica respirada com badge superior, H1, subcopy e 1 CTA)
5. `SHAPE_PILL_STRIP` (faixa 2..4 colunas simétricas com ícone Lucide `18px` + título curto)
6. `SHAPE_CHIP_RAIL` (fileira horizontal com `scroll-snap-x` no mobile e indicador ativo)
7. `SHAPE_CARD_GRID` (grade responsiva com `aspect-ratio` travado, título máx 2 linhas, preço tabular e botão)
8. `SHAPE_MATRIX_BUILDER` (grade de seleção + indicador `N / M` + barra sticky inferior de progresso)
9. `SHAPE_SCHEDULE_PANEL` (cards de serviço com duração + seletor de janela de horário + CTA)
10. `SHAPE_QUOTE_FORM` (bloco de medida/observação com campos mínimos + resumo WhatsApp)
11. `SHAPE_SPLIT_EDITORIAL` (bloco narrativo com respiro `surfaceAlt` e moldura sutil)
12. `SHAPE_BOTTOM_SHEET` (gaveta deslizante para Carrinho/Checkout em mobile e drawer lateral desktop)
13. `SHAPE_STRUCTURED_FOOTER` (1 a 3 colunas adaptativas conforme dados reais preenchidos)

### `DICT_03` — Operações de Mutação (`OP_*`) — **16 Verbos de Máquina**
1. `OP_ROUND_8` (`rounded-lg`)
2. `OP_ROUND_16` (`rounded-2xl`)
3. `OP_ROUND_PILL` (`rounded-full`)
4. `OP_COLS_2` / `OP_COLS_3` / `OP_COLS_4` (grade desktop)
5. `OP_MOBILE_STACK_1` / `OP_MOBILE_GRID_2` / `OP_MOBILE_SNAP_X` (comportamento `390x844`)
6. `OP_SURFACE_PRIMARY` / `OP_SURFACE_ALT` / `OP_SURFACE_CARD` (fundo resolvido do `dna`, jamais hardcoded preto/branco fora do tema)
7. `OP_BORDER_SUBTLE` (`1px` derivado de `dna.ink` com `10%` de opacidade)
8. `OP_ELEVATE_SOFT` (sombra quente/fria derivada do `dna.ink` a `8%` alpha)
9. `OP_ASPECT_1_1` / `OP_ASPECT_4_3` / `OP_ASPECT_16_9` (trava CLS `<= 0.02`)
10. `OP_STICKER_BADGE` (adesivo no canto superior esquerdo da mídia: ex. `"Mais pedido"`, `"Sob encomenda"`)
11. `OP_MONOGRAM_IF_NO_PHOTO` (monograma tipográfico + gradiente suave na ausência de URL; **bloqueia `<Package>` e dropzone cinza no cliente**)
12. `OP_TRUNCATE_2_LINES` (`line-clamp-2` para evitar cards tortos)
13. `OP_STICKY_SUMMARY_BAR` (ativa barra fixa inferior ao selecionar itens)
14. `OP_COLLAPSE_IF_EMPTY` (remove seção e margens quando cardinalidade = `0`)
15. `OP_ANIMATE_STAGGER_IN` (`animejs` stagger `40ms`, `opacity + translateY 8px`, respeitando `prefers-reduced-motion`)
16. `OP_HIDE_IN_STOREFRONT` (oculta controles exclusivos de edição quando `viewMode === 'storefront'`)

### `DICT_04` — Coordenadas & Regras de Cardinalidade (`GRID_*`) — **10 Políticas**
| Regra | Condição | Ação Determinística |
| :--- | :--- | :--- |
| `CARD_ZERO_COLLAPSE` | `items === 0` | Remove seção (`null`, `0px` gap) |
| `CARD_ZERO_EMPTY_CTA` | `items === 0` após filtro | Exibe `EmptyStateCard` com botão único `"Limpar filtro"` |
| `CARD_UNDER_CENTER` | `1 <= items < min` | Reduz colunas para `items.length` e centraliza (`max-w` proporcional) |
| `CARD_UNDER_COMPACT` | `items === 1` em seção destaque | Converte em card horizontal largo (`media 40% / texto 60%`) |
| `CARD_IDEAL_GRID` | `min <= items <= ideal` | Mantém matriz exata sem paginação |
| `CARD_OVER_TABS` | `items > max` e `categories >= 2` | Agrupa em abas mantendo máx `ideal` por aba |
| `CARD_OVER_SHOW_MORE` | `items > max` categoria única | Exibe `max` iniciais + botão `"Ver mais X itens"` (lote de 8) |
| `VIEWPORT_DESKTOP_1440` | `>= 1024px` | Container `max-w-6xl` (`1200px`), padding `32px`, gap `24px` |
| `VIEWPORT_TABLET_768` | `640px..1023px` | Máximo `2` colunas, padding `24px` |
| `VIEWPORT_MOBILE_390` | `<= 639px` | Zero scroll horizontal (`scrollWidth <= clientWidth`), botões `>= 44px`, Sheet para Checkout |

### `DICT_05` — Tokens `dna` Homologados & `zLayer` — **10 Paletas + 6 Camadas**
**Paletas Homologadas (contraste verificado `>= 4.5:1`):**
1. `DNA_CREAM_ROSE` (`surface: #FFFDF9`, `surfaceAlt: #FAF5EE`, `ink: #3D2B24`, `accent: #B56576` — Confeitaria / Doces / Flores)
2. `DNA_CLINICAL_MINT` (`surface: #F8FAFC`, `surfaceAlt: #ECFDF5`, `ink: #0F172A`, `accent: #059669` — Farmácia / Saúde / Estética)
3. `DNA_WARM_EARTH` (`surface: #FAF7F2`, `surfaceAlt: #F1E9DD`, `ink: #2C221E`, `accent: #C2410C` — Padaria / Café / Gastronomia Artesanal)
4. `DNA_FRESH_MARKET` (`surface: #FFFFFF`, `surfaceAlt: #F0FDF4`, `ink: #14532D`, `accent: #16A34A` — Hortifruti / Empório / Mercado)
5. `DNA_STONE_EDITORIAL` (`surface: #FAFAF9`, `surfaceAlt: #F5F5F4`, `ink: #1C1917`, `accent: #78350F` — Moda / Cerâmica / Casa)
6. `DNA_BLUE_TRUST` (`surface: #F8FAFC`, `surfaceAlt: #EFF6FF`, `ink: #0F172A`, `accent: #2563EB` — Assistência / Serviços / Pet)
7. `DNA_PET_PLAYFUL` (`surface: #FFFBEB`, `surfaceAlt: #FEF3C7`, `ink: #451A03`, `accent: #EA580C` — Pet Shop / Banho & Tosa)
8. `DNA_DEEP_TECH_AUTH` (`surface: #0B1120`, `surfaceAlt: #111827`, `ink: #F8FAFC`, `accent: #38BDF8` — **Bloqueado** salvo nicho explicitamente dark/tech + opt-in)

**Faixas `zLayer` Estritas (proibido z-index avulso):**
- `base: z-0` | `content: z-10` | `sticky: z-30` | `floating: z-35` | `drawer: z-40` | `modal: z-45` | `toast: z-50`

### `DICT_06` — Sinais do Barramento (`StoreSignalBus`) — **12 Canais Tipados**
1. `category.selected` (`{ categoryId, label }`)
2. `search.queried` (`{ query, matchCount }`)
3. `catalog.sort.changed` (`{ sortBy }`)
4. `product.quick_added` (`{ productId, qty, variation }`)
5. `builder.slot.toggled` (`{ slotIndex, optionId, filled, target }`)
6. `builder.completed` (`{ bundleName, items[], totalCents }`)
7. `service.slot.selected` (`{ productId, date, timeWindow }`)
8. `cart.updated` (`{ count, subtotalCents }`)
9. `cart.drawer.opened` / `cart.drawer.closed` (`{ sourceSection }`)
10. `checkout.submitted` (`{ orderId, channel, totalCents }`)
11. `section.scroll_to` (`{ targetSectionId }`)
12. `storefront.error` (`{ errCode, recoverable }`)

### `DICT_07` — Ações & Microinterações (`ACT_*`) — **10 Presets**
1. `ACT_PRIMARY_SOLID` (`bg: accent`, text contrastante auto, `min-h-[48px]`, `scale-[0.98] 120ms`)
2. `ACT_SECONDARY_OUTLINE` (`border 1px ink/20`, `bg: surface`, `min-h-[44px]`)
3. `ACT_GHOST_SUBTLE` (navegação/limpar filtro, `min-h-[44px]`)
4. `ACT_STEPPER_QTY` (`-` / valor / `+`, botões `44x44px`)
5. `ACT_CHIP_TOGGLE` (`rounded-full`, transição `150ms` para `accent`)
6. `ACT_DRAWER_SLIDE` (entrada direita desktop `220ms`, bottom-sheet mobile `240ms cubic-bezier(0.22,1,0.36,1)`)
7. `ACT_LOADING_LOCK` (`disabled + spinner 360deg + aria-busy="true"`)
8. `ACT_SUCCESS_PULSE` (ícone `Check 16px` por `900ms` antes de retornar ao rótulo)
9. `ACT_UNDO_TOAST` (barra com regressiva `5000ms` + botão `"Desfazer"`)
10. `ACT_FLIP_REORDER` (transição suave quando filtro altera cards visíveis)

### `DICT_08` — Códigos de Erro, Skeleton & Fallbacks (`ERR_*`) — **14 Contratos**
1. `ERR_UNKNOWN_TAXONOMY` → descarta nó inválido, mantém seções válidas.
2. `ERR_SPEC_PARSE` → repair prompt automático (máx 1 retry) ou fallback determinístico da seção.
3. `ERR_INVALID_GEOMETRY` → força stack `100%` seguro em `1` coluna.
4. `ERR_CONTRAST_VIOLATION` → substitui par reprovado por `DNA_CREAM_ROSE` ou `DNA_BLUE_TRUST` conforme nicho.
5. `ERR_DARK_LEAK_DETECTED` → bloqueia `#09090B/#0F172A` em tema claro, remapeando para `dna.surfaceAlt`.
6. `ERR_FORBIDDEN_CLIENT_PLACEHOLDER` → proíbe dropzone cinza / `<Package>` genérico na vitrine pública → injeta monograma tipográfico.
7. `ERR_ACTION_IN_FLIGHT` → trava duplo clique e mantém spinner até resposta.
8. `ERR_HTTP_CONFLICT_409` → recarrega `_rev` atual, aplica merge e retenta até 2x.
9. `ERR_NETWORK_OFFLINE` → preserva 100% dos campos digitados + carrinho em `localStorage/sessionStorage` + banner único de retry.
10. `ERR_EMPTY_SEARCH_FILTER` → exibe `EmptyStateCard` claro + CTA `"Mostrar todos os produtos"`.
11. `ERR_CHECKOUT_FIELDS` → foca primeiro campo inválido, máscara vermelha `#DC2626` + microcopy exato.
12. `ERR_BUILDER_FULL` → impede adicionar além da meta + toast informativo `"Caixa completa — finalize ou troque um item"`.
13. `ERR_A11Y_MISSING_LABEL` → falha no `ContractGateValidator` antes de publicar.
14. `ERR_AUDIT_CLS_OVER_LIMIT` → bloqueia selo visual no Playwright se `CLS > 0.02`.

### `DICT_09` — Acessibilidade & Telemetria (`A11Y_*` / `EVT_*`) — **12 Regras**
- **A11y:** `ONE_H1_ONLY`, `LANDMARK_HEADER_MAIN_FOOTER`, `TRAP_FOCUS_ON_OVERLAY`, `ESCAPE_CLOSES_TOP_LAYER`, `MIN_TAP_44X44`, `CONTRAST_AA_4_5`, `ARIA_LIVE_CART_AND_FILTER`, `DESCRIPTIVE_ALT_TEXT`.
- **Telemetria Auditada:** `store.viewed`, `hero.cta_clicked`, `category.selected`, `search.queried`, `product.added`, `builder.completed`, `checkout.opened`, `order.submitted`, `order.whatsapp_handoff`, `storefront.error_recovered`.

### `DICT_10` — Arquiteturas por Nicho (`ARCH_*`) — **8 Receitas Automáticas (Sem Pedir Componente!)**
Ao ler os dados da ficha + catálogo, a máquina compõe automaticamente a lista de `SEC_*`:
1. `ARCH_CONFEITARIA_ARTESANAL` (`DNA_CREAM_ROSE`): `Header -> HeroEditorial/Split -> TrustRibbon -> InteractiveBuilder (se houver doces/combos) -> CatalogGrid -> BrandStory -> Footer`.
2. `ARCH_FARMACIA_CLINICA` (`DNA_CLINICAL_MINT`): `TopNotice -> Header -> HeroSplit -> CategoryNav -> CatalogGrid -> CustomOrder (manipulados) -> TrustRibbon -> Footer`.
3. `ARCH_ALIMENTACAO_DELIVERY` (`DNA_WARM_EARTH`): `Header -> HeroSplit -> CategoryNav -> FeaturedRow -> CatalogGrid -> BrandStory -> Footer`.
4. `ARCH_HORTIFRUTI_EMPORIO` (`DNA_FRESH_MARKET`): `TopNotice -> Header -> HeroSplit -> CategoryNav -> CatalogGrid -> InteractiveBuilder (cesta da semana) -> Footer`.
5. `ARCH_MODA_AUTORAL` (`DNA_STONE_EDITORIAL`): `Header -> HeroSplit -> CategoryNav -> FeaturedRow -> CatalogGrid -> BrandStory -> Footer`.
6. `ARCH_SERVICOS_AGENDAMENTO` (`DNA_BLUE_TRUST`): `Header -> HeroEditorial -> ServiceBooking -> TrustRibbon -> BrandStory -> Footer`.
7. `ARCH_PET_SHOP` (`DNA_PET_PLAYFUL`): `Header -> HeroSplit -> CategoryNav -> CatalogGrid -> ServiceBooking (banho/tosa se existir) -> Footer`.
8. `ARCH_CATALOGO_ENXUTO_1_4` (qualquer nicho com `<= 4` produtos): colapsa `FeaturedRow` e `CategoryNav` se 1 categoria; foca em `Hero + CatalogGrid Compacto + Footer` (zero seções repetidas ou vazias).
