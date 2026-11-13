# 01 — Inventário do sistema

Auditoria de 2026-11-12. Escopo: leitura do código, execução local autenticada e observação no navegador. Nenhuma correção foi implementada nesta etapa.

## Arquitetura confirmada

- Cliente: React 19 + TypeScript 7, Vite 8, Tailwind 4 e componentes Radix.
- Desktop: Electron 39; o WhatsApp Web real é embutido em `webview` somente no desktop.
- Navegação: não há roteador de telas. `src/app/App.tsx` mantém `activeMenu` em memória. A loja interna usa `history.pushState` apenas para home/detalhe, sem um roteador compartilhado.
- Estado: `useState`/`useEffect` locais, perfil e workspace carregados por serviços; não há store global formal.
- Autenticação: Supabase Auth. As chamadas de API usam bearer obtido da sessão e validam o usuário esperado em `src/services/supabase-client.ts`.
- Persistência remota: tabelas Supabase para workspace, perfil, pedidos, métricas e estado WhatsApp; migrações ativam e forçam RLS por `auth.uid() = user_id`.
- Persistência local: tema em `localStorage`; workspace espelhado no servidor local; credenciais Baileys por usuário em `%USERPROFILE%/.companygen/workspaces/<uid>/sessao_whatsapp`.
- Backend: servidor Node em `server/workspace.mjs`; autentica o bearer no Supabase e deriva o diretório pelo `user.id` verificado. O worker WhatsApp é encaminhado sob `/api/whatsapp/*`.
- Cache: identidade autenticada com TTL máximo de 15 s no servidor; writes de workspace serializados por usuário.
- Compilador da loja: `src/store-v5`; adapta o perfil para IR, valida schemas AJV/Zod e renderiza componentes de catálogo, produto, carrinho e WhatsApp.

## Rotas de API

Rotas principais: `GET/PUT /api/workspace`, `GET/PUT /api/profile`, `GET /api/store/public`, `POST /api/store/visit`, `GET/POST/PATCH /api/orders`, `GET /api/dashboard`, `POST /api/hunt`, `POST /api/instagram/analyze`, `GET /api/images/status` e `GET /api/brand-logo/:uid/:file`.

O proxy WhatsApp expõe 23 contratos: estado/perfil, paginação de conversas, conectar/pausar/resetar sessão, onboarding, configuração, chat, modo de atendimento, simulação de fluxo, CRUD/sync de SKUs, foto de catálogo, templates, documentos e importação/upload de imagem. Métodos são validados contra uma allowlist em `server/workspace.mjs`.

## Matriz de telas

`route` abaixo é uma rota lógica, pois a aplicação não possui URL router para as telas principais.

| screen_id | route | component | state_source | actions | dependencies | test_status |
|---|---|---|---|---|---|---|
| SCR-01 | auth | `AuthFlowView` | Supabase Auth | entrar, criar conta, recuperar senha | Supabase | identificada; mutações não executadas |
| SCR-02 | ficha/1 | `FichaWizardView` | perfil local + `/api/profile` | Instagram, nome, logo | Instagram API, upload | observada desktop/mobile; salvar bloqueado |
| SCR-03 | ficha/2 | `FichaWizardView` | perfil | localização e atendimento | perfil | identificada no código |
| SCR-04 | ficha/3 | `FichaWizardView` | perfil | identidade e cores | perfil | identificada no código |
| SCR-05 | ficha/4 | `FichaWizardView` | catálogo | editar preços/estoque | perfil, catálogo | identificada no código |
| SCR-06 | ficha/5 | `FichaWizardView` | entrega/pagamento | configurar regras | perfil | identificada no código |
| SCR-07 | ficha/6 | `FichaWizardView` | agente | configurar IA | perfil | identificada no código |
| SCR-08 | ficha/7 | `FichaWizardView` | resumo do perfil | salvar e gerar | `/api/profile`, compilador | identificada; submissão não executada |
| SCR-09 | store | `StoreV5Pane` + `Store` | perfil compilado | preview, publicar, editar ficha, catálogo/carrinho/WhatsApp | store-v5, assets | auditada desktop/mobile; publicação bloqueada |
| SCR-10 | whatsapp/inbox | `WhatsAppView` + `RealWhatsAppWeb` | worker + webview | ver conversas/WhatsApp Web | Baileys, Electron | auditada no navegador; webview desktop não exercida nesta sessão |
| SCR-11 | whatsapp/connection | `WhatsAppView` | `/api/whatsapp/api/dados` | conectar, pausar, resetar, preferências | worker | auditada sem mutações |
| SCR-12 | whatsapp/catalog | `WhatsAppView` | worker/SKUs | criar/sincronizar/remover produtos | worker | identificada; mutações bloqueadas |
| SCR-13 | whatsapp/knowledge | `WhatsAppView` | documentos/templates | salvar/excluir | worker | identificada; mutações bloqueadas |
| SCR-14 | messages | `WhatsAppView`/aba mensagens | templates derivados | filtrar e simular | worker | observada; simulação bloqueada |
| SCR-15 | dual | `App` + dois painéis | estado em memória | abrir/fechar painéis | store + WhatsApp | identificada; inacessível pelo atalho mobile |
| SCR-16 | dashboard | `DashboardView` | `/api/dashboard` | atualizar, editar ficha | métricas/perfil | auditada; refresh concluído |
| SCR-17 | settings | `SettingsView` | Auth + perfil | tema, senha, conta, ficha | Supabase Auth | auditada visualmente; mutações bloqueadas |
| SCR-18 | generation | `GenerationLoader` | estado local | aguardar/cancelar visual | compilador | identificada; não reproduzida |

## Componentes e superfícies auxiliares

- Navegação global: `Sidebar`, topbar, menu mobile e atalhos Loja/WhatsApp/Dual/Dashboard.
- Overlays atuais: `DialogShell`, `CartDialog`, detalhe de produto, biblioteca de assets, aviso de WhatsApp e geração.
- Formulários: autenticação, ficha de 7 etapas, configurações, conexão/IA, produtos, documentos, templates e mensagem editável do checkout.
- Código legado ainda presente mas não alcançado por `App.tsx`: calendário, Canva, exportação, ideias, scripts de vídeo, galerias e editor antigo. Testes continuam esperando parte dessas telas.

## Inventário estático de controles

No conjunto de `.tsx`, incluindo código legado, foram encontradas 236 declarações `<button>`, 89 `<input>`, 15 `<select>`, 19 `<textarea>` e 3 `<a>`: 362 declarações nativas. Também existem 239 handlers `onClick` e 103 `onChange`. Isso não equivale a 362 controles atuais auditados: componentes repetidos geram muitas instâncias e parte do código não é alcançável.

## Fluxo de autenticação e contas

1. Supabase restaura a sessão no cliente.
2. Sem usuário, `AuthFlowView` é a única superfície.
3. Com usuário, o cliente carrega workspace e perfil em paralelo usando o ID esperado.
4. O servidor valida o bearer no Supabase e usa o ID verificado para selecionar o tenant.
5. “Trocar conta” executa sign-out local; a nova sessão determina outro diretório e outras linhas RLS.

Na sessão auditada, o navegador isolado estava autenticado em uma empresa diferente daquela mostrada nos screenshots fornecidos pelo usuário. Isso demonstra ambiguidade entre contextos/sessões, mas não demonstrou vazamento entre tenants.

## Cobertura e lacunas

Foram observadas 7 superfícies principais e 2 modais em desktop/mobile. Não foram executadas ações que salvam, publicam, conectam, desconectam, excluem, enviam mensagens, alteram senha ou trocam conta. A tela Electron com `webview` e o primeiro acesso real não foram reproduzidos. O inventário está completo no código atual, mas a auditoria funcional de todas as instâncias de controle permanece incompleta.
