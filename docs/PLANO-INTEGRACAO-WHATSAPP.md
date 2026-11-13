# Entrega do WhatsApp integrado ao CompanyGen

## Resultado atual

O WhatsApp deixou de ser um painel externo. Ele é uma área do CompanyGen, usa a mesma sessão Supabase e continua sincronizando enquanto o operador navega por Calendário, Loja, Conteúdo ou outras telas. Cada usuário autenticado recebe um diretório de trabalho e um processo privado do conector WhatsApp; a API valida o token antes de encaminhar qualquer ação.

A persistência em nuvem foi implementada, validada em restauração controlada e aplicada no Supabase real `CompanyGEn2026`. A verificação remota confirmou RLS forçada, bucket privado, políticas por usuário, funções sem `SECURITY DEFINER` e ausência de permissão anônima nas funções de gravação.

## Fluxo de dados

```text
Login Supabase
    ↓ token validado
CompanyGen (um app e uma navegação)
    ↓ /api/whatsapp
Gateway autenticado por usuário
    ↓ token interno não exposto ao navegador
Worker Baileys privado
    ├─ agenda, conversas, catálogo e configurações
    ├─ contexto e documentos da atendente
    └─ imagens, áudios e anexos
            ↓ sincronização por revisão
Supabase: cg_whatsapp_state + bucket privado cg-whatsapp-media
```

## Refatoração dos JSONs legados

| Arquivo legado | Estado novo | Regra de isolamento |
| --- | --- | --- |
| `config_loja.json` | Dentro do snapshot `cg_whatsapp_state.data` | Somente `auth.uid() = user_id` |
| `configuracoes.json` | Mesmo snapshot, com pausa persistida | Escrita serializada e revisão comparada |
| `skus.json` | Catálogo da conta, também publicável pelo compilador | Não existe catálogo global compartilhado |
| `templates.json` | Respostas da conta | Fila de gravação impede perda por concorrência |
| `conversas.json` | Resumos no polling; mensagens completas só por paginação | JID sempre resolvido dentro do worker do dono |
| `contatos.json` | Agenda e aliases de telefone/LID | Atualização em lote e nomes vindos do WhatsApp |
| `contexto/conversas/*.json` | Memória curta por conversa | Invalidada quando muda `contextoLojaId` e sanitizada antes do modelo |
| `media/*` | Bucket privado por pasta `{user_id}/...` | Policies do Storage conferem o primeiro segmento |

Os arquivos continuam existindo dentro do diretório privado do usuário para permitir operação local e recuperação. Eles não são mais lidos a partir da raiz compartilhada do projeto.

## RLS entregue

### Workspace do Studio

Migração: `supabase/migrations/20261110000200_cg_workspace_state.sql`.

- Chave primária: `user_id`.
- `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
- Policies de leitura, inserção e atualização exigem `auth.uid() = user_id`.
- RPC com comparação de revisão impede que duas abas sobrescrevam silenciosamente o trabalho uma da outra.

### Estado e mídia do WhatsApp

Migração: `supabase/migrations/20261111000100_cg_whatsapp_state.sql`.

- Tabela `cg_whatsapp_state` com `user_id`, `revision`, `data` e `updated_at`.
- Policies próprias para `select`, `insert`, `update` e `delete`.
- RPC `cg_put_whatsapp_state` aplica comparação de revisão.
- Bucket `cg-whatsapp-media` privado, limitado a 15 MB e tipos de imagem/áudio permitidos.
- Policies de `storage.objects` exigem que a pasta inicial do objeto seja o UUID autenticado.

As credenciais criptográficas do aparelho não são enviadas ao Supabase. Em outro servidor, catálogo, histórico e mídia são restaurados, mas o aparelho pode exigir novo pareamento. Essa escolha evita transformar o banco de dados em cópia transportável da identidade do dispositivo.

## Contatos e histórico

- `contacts.upsert` e `contacts.update` preservam nomes recebidos.
- `@lid` e `@s.whatsapp.net` são reconciliados por aliases confirmados.
- `messaging-history.set` importa os lotes disponibilizados pelo Multi-Device.
- Mensagens usam o ID real do WhatsApp para deduplicação.
- O polling retorna somente resumos; a conversa ativa carrega páginas de até 80 mensagens e preserva a posição do scroll.
- Contatos sem histórico só aparecem se o WhatsApp os entregar ao dispositivo vinculado. O sistema não inventa uma agenda ausente.

## Onboarding do WhatsApp

O fluxo guiado original foi restaurado dentro do CompanyGen, sem iframe nem painel externo:

1. QR Code automático com instruções de pareamento.
2. Confirmação do nome, número e foto do perfil conectado.
3. Dados da empresa e configuração do agente: ativação, fotos do catálogo, áudio, arquivadas e tempo de resposta.

A simplificação anterior havia preservado o backend, mas removido a jornada e bloqueado no gateway as rotas de perfil e conclusão. Durante o teste real, o worker também revelou status 428 antes do QR. A causa era a identidade legada `Browsers.macOS('Desktop')`, rejeitada pelo WhatsApp; ela foi trocada por `Browsers.macOS('Chrome')`, e as reconexões agora usam espera progressiva. O QR real passou a ser emitido em aproximadamente 2,5 segundos no teste local.

## Funções assistidas e guardrails

- Texto: Ollama em CPU, com histórico sanitizado e interceptor de identidade.
- Visão: `qwen3-vl:2b`, resposta final curta em português, sem expor raciocínio interno.
- Áudio: Faster Whisper em português.
- Imagens: DDGS retorna URL, miniatura, domínio e dimensões; a importação rejeita rede privada e conteúdo não-imagem.
- Catálogo: somente itens e preços escritos pelo usuário são adicionados. Ideias genéricas não viram produtos fictícios.
- Posts: os rascunhos usam marca, assunto e produto atuais; o texto antigo de camisa polo foi removido.

O modelo foi testado com um histórico contaminado e respondeu “KU Confecções”. O guardrail independente detectou e bloqueou exatamente essa saída. Isso comprova por que o interceptor permanece obrigatório mesmo com um prompt correto.

## Evidências executadas

- Build de produção aprovado.
- Auditoria de dependências: zero vulnerabilidades conhecidas.
- Duas contas isoladas, concorrência, reinício, catálogo, desktop e mobile: aprovado.
- Estado e mídia enviados ao Supabase simulado e restaurados em outro servidor: aprovado.
- Migrações aplicadas no Supabase real e permissões consultadas diretamente no banco: aprovado.
- Guardrail de identidade: 2 testes aprovados.
- Compositor sem catálogo inventado: 2 testes aprovados.
- Visão, áudio e busca DDGS executados com arquivos e consulta reais.
- Sete percursos de navegador registrados no formato imagem antes, ação e imagem depois.
- Onboarding completo em desktop e mobile: QR, confirmação, agente e entrada na Central aprovados visualmente.
- Worker Baileys real: QR emitido e configuração do agente persistida e relida.

## Gate visual obrigatório

Um teste de interface só é aceito quando possui quatro partes: imagem antes, ação executada, imagem depois e julgamento separado da aparência e da lógica. Testes automatizados sem essas evidências continuam úteis como apoio, mas não encerram o aceite visual. O registro atual está em `docs/EVIDENCIAS-VISUAIS.md` e também na Sala de Entrega da porta 1200.

## Pendências para homologação final

1. Entrar com duas contas reais e repetir a prova negativa de leitura/escrita, registrando antes/depois.
2. Abrir o CompanyGen autenticado, parear o WhatsApp e enviar de outro celular: “Quais produtos vocês têm?” e “Me manda as fotos dele”.
3. Confirmar por imagens que contato e mensagem aparecem em até 3 segundos, sem F5.
4. Reiniciar o servidor e confirmar por imagens que histórico, catálogo e mídia foram restaurados.

## Inicialização

Execute `iniciar_companygen.bat`. Não inicie `bot.js` separadamente: o gateway do CompanyGen cria e controla o worker correto para cada usuário autenticado.

Os protótipos removidos foram arquivados, sem exclusão definitiva, em:

`C:\Users\arthur\.companygen\arquivados\2026-11-11\companygen-dead-code`
