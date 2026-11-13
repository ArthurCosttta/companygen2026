# 02 — Auditoria visual

Evidência visual foi capturada ao vivo na sessão CUA em 2026-11-12. A ferramenta exibiu as capturas no chat, mas não forneceu um caminho persistente para anexá-las ao repositório; por isso cada captura está descrita e anotada abaixo como `CUA-Vxx`. Esse bloqueio impede chamar o pacote de screenshots de completo.

## Ocorrências

| issue_id | evidência | elemento e propriedade observável | tarefa prejudicada | responsável provável | hipótese de correção | gravidade |
|---|---|---|---|---|---|---|
| VIS-001 | CUA-V01 | cabeçalho “NAVEGADOR 1” com texto quase branco sobre fundo muito claro no tema escuro | identificar contexto/revisão do preview | `StoreV5Pane.tsx`, estilos `.cg-*` | definir tokens de superfície/texto por tema e testar contraste WCAG | P2 |
| VIS-002 | CUA-V02 | cartão branco do Instagram mantém rótulos/helper quase brancos no tema escuro | entender campos da ficha | `FichaWizardView.tsx`, overrides dark | não misturar hardcodes claros com herança dark | P2 |
| VIS-003 | CUA-V03 | no mobile, sete etapas da ficha ocupam múltiplas linhas antes do primeiro campo | concluir cadastro em tela pequena | `FichaWizardView.tsx` | usar stepper resumido/progressivo e título da etapa atual | P2 |
| VIS-004 | CUA-V04 | preview mobile tem barra do app e página interna com rolagens aninhadas | navegar e visualizar a loja | `StoreV5Pane.tsx`, `.store` | altura única do viewport, evitar dois scroll containers | P2 |
| VIS-005 | CUA-V05 | modal de pedido direto excede 390 px; terceira ação é cortada e surge scrollbar horizontal | revisar e abrir WhatsApp | `CartDialog.tsx`, `main.css` | empilhar ações em `max-width: 470px`; `min-width:0` | P1 |
| VIS-006 | CUA-V06 | hero usa recorte do primeiro produto em grande bloco branco quando não há banner | compreender proposta/identidade da loja | `profile-adapter.ts:131-149` | reservar hero específico ou composição segura, nunca promover cutout automaticamente | P2 |
| VIS-007 | CUA-V01 | logo ausente e placeholders coexistem com “0 imagens pendentes” | avaliar prontidão para publicar | adaptador/assets e contador do preview | derivar contador dos slots renderizados e bloquear “pronto” se houver pendência | P1 |
| VIS-008 | CUA-V07 | tela Configurações contém dois cartões no topo e grande região vazia | localizar ações e entender escopo | `SettingsView.tsx` | agrupar Conta, Segurança, Aparência e Integrações em seções densas | P3 |
| VIS-009 | CUA-V08 | Dashboard mostra uma conversa simulada mesmo quando o indicador diz 0 mensagens | interpretar dado operacional | `DashboardView.tsx:283-294` | exibir estado vazio ou rotular explicitamente “Exemplo” | P1 |
| VIS-010 | CUA-V09 | aba Mensagens apresenta 51 cartões, muitos “Aguardando dados”, sem hierarquia forte | localizar um template utilizável | `WhatsAppView.tsx` | filtrar incompletos, agrupar por objetivo e destacar próximo passo | P2 |
| VIS-011 | CUA-V10 | sidebar e topbar repetem Loja, WhatsApp e Dashboard; quatro CTAs competem | escolher a ação principal | `App.tsx`, `Sidebar.tsx` | manter navegação principal em um lugar; topbar apenas ações contextuais | P2 |
| VIS-012 | CUA-V11 | status “Aguardando QR” convive com botão “Pausar conexão” | decidir se deve conectar ou pausar | `WhatsAppView.tsx:482-483` | derivar rótulo/ação de estado conectado, não da mera presença do QR | P1 |

## Anotações das capturas

- `CUA-V01`: desktop/Loja; marcações: contraste do cabeçalho, logo pendente, hero inadequado e contador contraditório.
- `CUA-V02`: desktop/Ficha etapa 1; marcações: cartão Instagram e logo quebrado.
- `CUA-V03`: 390×844/Ficha; marcações: altura do cabeçalho, stepper quebrado e scroll.
- `CUA-V04`: 390×844/Loja; marcações: scroll externo + interno e cabeçalho cortado.
- `CUA-V05`: 390×844/Revisar mensagem; marcações: overflow horizontal, ação cortada, total R$ 0,00.
- `CUA-V06`: Loja/hero; marcação: produto recortado promovido a banner.
- `CUA-V07`: Configurações; marcação: vazio estrutural.
- `CUA-V08`: Dashboard; marcações: 0 mensagens versus balões simulados.
- `CUA-V09`: Mensagens; marcações: volume, estados incompletos e CTA de teste ativo.
- `CUA-V10`: shell; marcação: duplicidade de navegação.
- `CUA-V11`: conexão WhatsApp; marcações: status, QR, “Pausar” e automação ativa.

## Design system

Há tokens e regra global para `prefers-reduced-motion`, mas a aplicação mistura Tailwind com valores hexadecimais fixos e CSS legado. O resultado observado é tema escuro parcial: shell escuro, cartões claros e textos herdados com contraste insuficiente. A loja possui pelo menos dois arquivos extensos de estilo (`store-preview.css` e `main.css`) com regras sobrepostas, elevando risco de regressão responsiva.

## Limite do diagnóstico visual

Não foram capturados os sete passos completos da ficha, os formulários de catálogo/conhecimento, o webview Electron, autenticação, geração e três identidades de loja distintas. Portanto esta auditoria visual é fundamentada, mas não completa.
