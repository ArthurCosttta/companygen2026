# 05 — Consistência de estados

As tabelas distinguem **sintoma**, **causa provável** e **causa confirmada**. Não houve mutação de dados.

## WhatsApp

| state_id | sintoma observado | causa provável | causa confirmada | severidade |
|---|---|---|---|---|
| ST-WA-001 | navegador/webview pode estar conectado enquanto o bot Baileys está aguardando QR | duas sessões independentes apresentadas sob o mesmo conceito “WhatsApp” | código mantém `browserWhatsapp` e `whatsapp` separados; worker e webview têm armazenamentos distintos | P1 |
| ST-WA-002 | “Aguardando QR” com botão “Pausar conexão” | UI considera presença do QR como sessão iniciada | condição em `WhatsAppView.tsx:482-483` não representa claramente conectado/desconectado | P1 |
| ST-WA-003 | Sofia/foto automática marcadas enquanto worker está desconectado | configuração persistida é exibida como capacidade ativa | estado configurado e disponibilidade operacional não têm rótulos separados | P2 |
| ST-WA-004 | identidade do webview pode continuar “conectada” depois de logout/desconexão | polling cessa após primeiro sucesso | `detectIdentity` retorna sem agendar nova leitura quando encontra número (`WhatsAppView.tsx:145-158`) | P1 |
| ST-WA-005 | navegador da auditoria abriu empresa diferente da empresa dos screenshots do usuário | sessões isoladas por contexto mantêm contas diferentes | empresas distintas confirmadas em contextos distintos; nenhum acesso cruzado foi demonstrado | P1 de UX; não P0 |

## Cadastro da empresa

| state_id | sintoma/risco | causa provável | causa confirmada | severidade |
|---|---|---|---|---|
| ST-FI-001 | ficha pode ser marcada concluída com etapas incompletas | validação mínima | submissão verifica apenas `business.name`, depois grava `fichaCompleted: true` (`FichaWizardView.tsx:259-271`) | P2 |
| ST-FI-002 | alterações locais podem ser abandonadas ao voltar/trocar conta/recarregar | ausência de estado dirty/guard | não há `beforeunload` nem confirmação na ficha | P1 |
| ST-FI-003 | duas abas podem sobrescrever revisão | concorrência otimista existe no backend, mas UX de conflito não foi exercida | testes de segurança cobrem conflito; tratamento visual não confirmado | não testado |

## Loja

| state_id | sintoma observado | causa provável | causa confirmada | severidade |
|---|---|---|---|---|
| ST-LO-001 | pedido direto de produto R$ 79,90 mostra total R$ 0,00 | review reutiliza total do carrinho | caminho direto passa só mensagem; `cart` permanece vazio e `cartTotal` é calculado do carrinho | P1 |
| ST-LO-002 | “0 imagens pendentes” com logo/produtos pendentes visíveis | contador usa fonte diferente dos slots renderizados | contradição confirmada visualmente; origem exata do contador requer trace adicional | P1 |
| ST-LO-003 | hero usa a imagem do primeiro produto | fallback de asset inadequado | comentário e implementação em `profile-adapter.ts:131-149` reutilizam imagem aprovada de produto | P2 |
| ST-LO-004 | carrinho normal manteve item, subtotal e total iguais | — | fluxo testado com 1 × R$ 79,90 | aprovado na amostra |
| ST-LO-005 | publicação antiga versus nova versão | cache/revisão | não exercido | não testado |

## Dashboard

| state_id | sintoma observado | causa provável | causa confirmada | severidade |
|---|---|---|---|---|
| ST-DA-001 | indicador 0 mensagens acompanha balões de conversa com produto real | card é mock visual não rotulado | `DashboardView.tsx:283-294` sempre renderiza a conversa | P1 |
| ST-DA-002 | série semanal pode mostrar tendência crescente sem eventos diários | fallback transforma total acumulado em série | fórmula `visitsTotal * idx/7` em `DashboardView.tsx:80-88` | P1 |
| ST-DA-003 | falha ao atualizar não aparece | erro suprimido | `App.tsx:130-137` usa `catch {}` | P2 |

## Chatbot

| state_id | caso obrigatório | resultado |
|---|---|---|
| ST-CH-001 | template alterado não aplicado | não testado; salvar alteraria dados |
| ST-CH-002 | variáveis ausentes | compilador valida variáveis obrigatórias; integração ao worker não executada |
| ST-CH-003 | contato/conversa na conta incorreta | nenhuma evidência de acesso cruzado; testes automatizados de tenant passaram |
| ST-CH-004 | mensagem ativa aparece desativada | não confirmado; tela mostra muitos moldes “Aguardando dados” |

## Conclusão

Foram confirmadas 11 contradições/riscos de estado: 7 com causa confirmada no código e 4 com causa parcial/provável. Casos de reconexão real, duas abas, publicação, edição simultânea e aplicação de template continuam bloqueados pela execução somente leitura.
