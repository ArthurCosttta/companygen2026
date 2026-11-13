# 07 — Isolamento entre tenants

## Resultado executivo

Nenhum acesso cruzado não autorizado foi confirmado. Portanto, **não há P0 confirmado** nesta execução. A avaliação combina leitura de autenticação/RLS e os 7 testes automatizados de segurança. Troca real entre duas contas fictícias no navegador não foi realizada.

## Controles confirmados no código

- O cliente obtém a sessão Supabase e `authenticatedFetch` valida que o usuário atual corresponde ao `expectedUserId` antes de adicionar bearer.
- O servidor valida o bearer em `/auth/v1/user` e deriva o diretório local do `user.id` verificado, não de um ID arbitrário enviado pelo cliente.
- Workspace, perfil, pedidos, métricas e estado WhatsApp têm RLS e `FORCE ROW LEVEL SECURITY`.
- Políticas observadas usam `auth.uid() = user_id` para leitura/escrita.
- Storage restringe o primeiro segmento da pasta ao UID autenticado.
- Sessões locais do worker são separadas em diretórios por usuário.
- O backend serializa gravações por usuário e usa controle de revisão otimista.

## Testes automatizados executados

`npm run test:security` passou 7/7. A suite cobre autenticação, separação de tenant, concorrência otimista, sincronização WhatsApp, onboarding mockado, retry transitório, gating de perfil/loja pública e recálculo de preço do pedido no servidor.

Isso é evidência relevante, mas não substitui teste adversarial com duas identidades reais e acesso direto a cada recurso.

## Superfícies de risco

| risk_id | superfície | resultado | classificação |
|---|---|---|---|
| ISO-001 | troca de usuário/empresa | contextos diferentes mantiveram empresas diferentes; nenhuma linha cruzada observada | não confirmado; UX ambígua |
| ISO-002 | cache de autenticação do servidor | digest do bearer cacheado por até 15 s | aceitável se expiração/revogação for tratada; teste de logout imediato pendente |
| ISO-003 | `GET /api/brand-logo/:uid/:file` | rota é pública/sem bearer e usa UID + arquivo saneado | risco de enumeração de logo; possivelmente intencional para loja pública; P2 até decisão de privacidade |
| ISO-004 | mídia do worker | proxy valida usuário antes de encaminhar | protegido no caminho inspecionado |
| ISO-005 | acesso direto por order/profile/workspace ID | handlers derivam usuário autenticado e políticas RLS reforçam | protegido estaticamente/teste automatizado |
| ISO-006 | sessão Baileys versus webview | armazenamentos independentes podem aparentar identidade errada | risco de associação percebida, não vazamento confirmado |

## Casos obrigatórios pendentes

- Login alternado com duas contas fictícias autorizadas.
- URL/ID de pedido, contato, conversa, catálogo e mídia do tenant A usando token B.
- Logout em uma aba enquanto outra mantém requests em voo.
- Duas janelas Electron com contas diferentes.
- Leitura de cache/offline após troca de usuário.
- Verificação de credenciais do worker e templates após troca.

Esses testes exigem duas contas fictícias e mutação controlada de sessão. A instrução de somente leitura impediu executá-los. O diagnóstico de isolamento é, portanto, **parcial**, apesar dos controles estáticos positivos.
