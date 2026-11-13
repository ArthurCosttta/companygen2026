# 03 — Mapa de UX Choreography

Modelo: **estado inicial → ação → resposta → transição → estado final**. Tempos são observados quando medidos; os demais são qualitativos e não foram inventados.

## Interações executadas

### UX-001 — Navegação principal

`Loja visível → clique WhatsApp/Mensagens/Dashboard/Configurações → feedback visual imediato (<100 ms aparente) → conteúdo troca sem URL → nova tela`

- Contexto é preservado no shell, mas back/forward do navegador não representa a troca porque `activeMenu` é só memória.
- Sidebar e topbar duplicam destinos; no mobile o atalho “Loja e WhatsApp” desaparece e não existe alternativa equivalente na sidebar.
- Evidências: CUA-V01, V07–V10.

### UX-002 — Atualizar dashboard

`Dashboard carregado → Atualizar → indicador de carregamento → requisição → cartões atualizados`

- Resultado observado após aproximadamente 2,5 s.
- Há feedback visual, mas falhas são engolidas por `catch {}` em `App.tsx:130-137`; em erro, a interface apenas para de carregar.

### UX-003 — Abrir pedido direto de produto

`Produto R$ 79,90 → “Pedir este produto pelo WhatsApp” → modal abre com foco → revisão → modal mostra mensagem correta e total R$ 0,00`

- Primeiro feedback foi imediato.
- Estado final é contraditório: produto e mensagem têm preço, total deriva do carrinho vazio.
- Causa confirmada: `handleOpenReview` abre o review sem adicionar linha; `CartDialog` calcula `cartTotal` exclusivamente de `cart` (`Store.tsx:154-158`, `CartDialog.tsx:51,200-201`).
- No mobile, três ações ficam em linha e causam overflow/corte.
- Envio externo não foi acionado.

### UX-004 — Carrinho normal

`Carrinho vazio → + Carrinho → contador 1 → abrir carrinho → modal → total R$ 79,90`

- Resposta e atualização do contador foram imediatas.
- Total do item, subtotal e total estimado permaneceram consistentes.
- `Esc` fechou o modal; foco inicial foi observado no diálogo.
- O item temporário foi removido ao final para restaurar o estado inicial.

### UX-005 — Conexão WhatsApp

`Worker desconectado → abrir Conexão → QR aparece → controles exibidos → estado final “Aguardando QR”`

- Há feedback/QR, mas a ação principal apresentada é “Pausar conexão”, semanticamente incompatível.
- Checkboxes “Ativar Sofia” e fotos automáticas aparecem marcados enquanto a conexão está indisponível, sem explicar que estão apenas configurados.
- Não houve scan, conexão, pausa ou reset por restrição de somente leitura.

### UX-006 — Abrir/fechar modal por teclado

`Carrinho aberto → tecla Esc → overlay removido → loja restaurada`

- Fechamento acessível confirmado.
- Retorno exato de foco ao disparador não foi mensurado.

### UX-007 — Ficha no mobile

`Etapa 1 → viewport 390×844 → interface relayout → conteúdo principal abaixo de stepper alto`

- Nenhuma perda de conteúdo observada, mas a sequência de sete decisões domina o primeiro viewport.
- Trocar etapa não solicita confirmação de alterações e não existe guard de `beforeunload` no código.

## Interações inspecionadas no código, não executadas

| interaction_id | sequência esperada | risco observado | motivo do bloqueio |
|---|---|---|---|
| UX-008 | salvar ficha → persistir → gerar → loja | somente nome é obrigatório; demais etapas podem ficar incompletas | grava dados |
| UX-009 | publicar loja → validar telefone → publicar | depende de telefone válido, não de worker; contrato precisa teste real | publicação externa |
| UX-010 | abrir WhatsApp → `wa.me` com mensagem | URL é construída por `waUrl`; não foi aberta | efeito externo |
| UX-011 | simular Fluxo A → worker → pedido/dashboard | botão permanece disponível em estado desconectado | gera dados de teste |
| UX-012 | trocar conta → logout → auth | sessão do contexto muda; risco de confusão entre janelas | muta sessão |
| UX-013 | salvar/excluir SKU/template/documento | feedback via texto de status | muta dados |
| UX-014 | atualizar senha | erro genérico e sem orientação de reautenticação | segurança/credencial |

## Movimento e redução de animação

- Confirmado no código: `src/styles/tokens.css` e `src/styles/index.css` desativam animações/transições em `prefers-reduced-motion: reduce`; `motion-runner.ts` também consulta a media query.
- O ambiente observado reportou preferência normal. Emulação ativa de `reduce` não estava disponível no driver, então a experiência reduzida não foi validada visualmente.

## Estados intermediários invisíveis

- Dashboard: falha de rede não gera estado de erro.
- Registro de visita: `recordStoreVisit` suprime erro.
- Renomear marca e outras operações retornam falso/estado genérico sem causa específica.
- Identidade do webview: depois de detectar um número conectado, o polling retorna sem reagendar; uma desconexão posterior pode permanecer invisível (`WhatsAppView.tsx:145-158`).

## Cobertura

Sete sequências foram exercidas sem efeitos externos. Sete sequências de mutação foram apenas inspecionadas. Testes de clique duplo, falha de rede controlada, progressão completa de cadastro e envio não foram realizados por conflito com a regra de somente leitura.
