# 10 — Relatório final e plano de intervenção

## Resumo executivo

O diagnóstico encontrou falhas reais nos fluxos essenciais de Loja, WhatsApp, Dashboard e Ficha. A mais direta é reproduzível: pedir um produto de R$ 79,90 pelo atalho do WhatsApp abre uma mensagem correta, mas apresenta total de R$ 0,00. O carrinho normal calcula R$ 79,90; portanto o defeito está isolado no caminho direto, com causa confirmada no estado do componente.

Também foram confirmados: estado de identidade do webview que pode ficar obsoleto, ação “Pausar” durante QR pendente, contagem de imagens contraditória, dados visuais fabricados no Dashboard, falha silenciosa de persistência `EPERM` no Windows e uma suite E2E com 17 falhas por drift.

Nenhuma correção foi implementada.

## Painel de cobertura

| métrica | resultado comprovado |
|---|---:|
| telas/superfícies lógicas descobertas | 18 |
| telas primárias observadas ao vivo | 7 |
| modais observados ao vivo | 2 |
| módulos atuais revisados em profundidade | 17 |
| declarações estáticas de controles TSX | 362 |
| famílias de controle registradas | 20 |
| famílias classificadas como corretas na amostra | 6 |
| famílias parciais/diferentes/condicionais/inconsistentes | 9 |
| famílias não executadas | 5 |
| testes de segurança | 7/7 passaram, com 2 erros EPERM não fatais |
| Playwright Chromium | 17 passaram, 17 falharam, 1 ignorado |
| unitários de schema/composição/imagens | 14/14 passaram |
| P0 confirmado | 0 |
| P1 | 10 |
| P2 | 9 |
| P3 | 1 |
| fluxos essenciais bloqueados/degradados | 4: pedido direto, estado WhatsApp, confiança do Dashboard, persistência de métricas |
| contradições de estado registradas | 11 |
| problemas visuais catalogados | 12 |

Os números acima não tratam código legado ou controles não clicados como aprovados. A cobertura real é parcial: autenticação, primeiro acesso, webview Electron, três lojas distintas, publicação, troca de tenant, falha de rede controlada e mutações permaneceram bloqueados.

## Principais decisões sugeridas

1. Corrigir primeiro integridade de preço/estado, não aparência.
2. Modelar WhatsApp como estados explícitos e separar “webview conectado”, “worker conectado” e “número público da loja”.
3. Remover dados simulados não rotulados do Dashboard.
4. Tornar persistência/testes confiáveis antes de ampliar o editor.
5. Depois consolidar navegação, tokens de tema e responsividade.

## Comparação visual recomendada

| Interface atual | Problema mensurável | Organização proposta |
|---|---|---|
| Sidebar + quatro atalhos duplicados no topo | mesma decisão aparece em dois lugares; Dual some no mobile | sidebar/menu mobile como navegação única; topbar só com status e ação contextual |
| Ficha com sete pills completas | ocupa vários rows em 390 px e empurra o formulário | progresso compacto “Etapa 1 de 7”, título atual e resumo lateral no desktop |
| Loja dentro de painel com scroll interno | duas rolagens e contexto comprimido | preview com uma única rolagem e toolbar sticky externa |
| Review com três botões horizontais | overflow em 390 px | ação primária em largura total; secundárias empilhadas |
| Dashboard com conversa e curva sintéticas | parece dado real | estado vazio explícito, skeleton durante carga e série apenas com eventos reais |
| Conexão com QR + “Pausar” | intenção contraditória | header de status, instrução de QR e ação “Cancelar tentativa”; “Pausar” só quando conectado |
| Tema escuro parcial | contraste insuficiente em cartões claros | tokens semânticos `surface/text/border/action` para ambos os temas |
| Hero usando primeiro produto | imagem não cumpre proporção/função editorial | placeholder neutro ou slot de hero obrigatório, sem promover cutout |

Essa comparação é recomendação, não autorização de alteração.

## Plano de intervenção por fases

### Fase 0 — Ambiente e observabilidade

- Criar fixtures autenticadas fictícias e base staging.
- Separar suites current/legacy/authenticated.
- Fazer erros de persistência falharem testes.
- Registrar request ID, tenant redigido, revisão e estado do worker sem credenciais.

Critério de saída: suite atual confiável e falhas não silenciosas.

### Fase 1 — Integridade P1

- Unificar modelo do checkout direto/carrinho e corrigir total.
- Implementar máquina de estados do WhatsApp e polling/evento contínuo.
- Corrigir contador de assets.
- Remover série/conversa simuladas não rotuladas.
- Tratar `EPERM` com retry/atomicidade comprovada.
- Proteger alterações não salvas da ficha.

Critério de saída: todos os P1 com testes de regressão desktop/mobile.

### Fase 2 — Navegação, tema e responsividade

- Navegação única com paridade mobile.
- Tokens semânticos e contraste AA.
- Um único scroll no preview.
- Modais fluidos em 320–430 px.
- Stepper compacto e validação por etapa.

Critério de saída: fluxos críticos completos por teclado, mouse e mobile.

### Fase 3 — Editor e qualidade gerada

- Três fixtures de segmentos distintos.
- Regras seguras de hero/assets.
- Comparação JSON → IR → DOM → screenshot.
- Validação de publicação/cache e fidelidade de preço/estoque.

Critério de saída: três lojas aprovadas em desktop/tablet/mobile sem divergência de dados.

### Fase 4 — Segurança e soak

- Matriz A/B de tenant com acesso direto por IDs/URLs.
- Logout e troca de empresa em duas abas/janelas.
- 30 ciclos de modal/seção e profiling de heap/listeners.
- Falha de rede, reload no meio da operação e concorrência de gravação.

Critério de saída: nenhum acesso cruzado, perda de dados ou crescimento anormal.

## Riscos de regressão

- Checkout: alto, porque carrinho, mensagem e simulação compartilham componentes.
- WhatsApp: alto, por duas sessões (webview e worker) e sincronização de perfil.
- Persistência: alto, por concorrência e semântica de arquivos no Windows.
- Onboarding: médio/alto, porque validação mais forte pode bloquear perfis antigos.
- CSS da loja: médio, por arquivos grandes e regras sobrepostas.
- Navegação: médio, porque estado é local e não está representado em URL.

## Ferramentas/ensaios indisponíveis ou bloqueados

- Exportação persistente das screenshots CUA para arquivos do projeto.
- Trace de heap/main thread e emulação visual ativa de reduced motion.
- Contas fictícias A/B preparadas para teste manual de tenant.
- Worker conectado e webview Electron controlável na mesma sessão.
- Fault injection de rede/arquivo em ambiente isolado.
- Publicação staging e três projetos de teste.

## Status final

Este pacote é um diagnóstico fundamentado, mas **não é declarado completo**. O código e o navegador permitiram confirmar problemas de alta prioridade; as lacunas acima impedem aprovação global de autenticação, isolamento manual, estabilidade prolongada e qualidade multi-loja. O backlog em `09_PRIORITY_BACKLOG.json` é a base recomendada para decidir a ordem de correção.
