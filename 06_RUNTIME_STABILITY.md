# 06 — Estabilidade e travamentos

## Resultados executados

### Testes de segurança/API

- `npm run test:security`: 7/7 testes passaram.
- Durante o teste, duas operações de visita registraram `EPERM` ao renomear arquivo temporário para `store_metrics.json` no Windows.
- O teste permaneceu verde apesar dessas falhas. Logo, a persistência de métricas pode falhar silenciosamente e o teste não a considera impeditiva.

### Suite Playwright Chromium

- Resultado: 17 passaram, 17 falharam e 1 foi ignorado em aproximadamente 56 s.
- A maior parte das falhas é drift da suíte: locators e expectativas para calendário, Canva, exportação e composer antigo, hoje inacessíveis; outras falham por ausência de setup autenticado e seletores ambíguos.
- Isso não prova que as features atuais falharam, mas prova que o gate de regressão não distingue produto atual de legado.

### Unidade/compilação observadas na sessão anterior ao modo somente leitura

- 14/14 testes de schema, composição e imagens passaram.
- Typecheck/build haviam concluído. Não foram repetidos depois da instrução de diagnóstico para evitar escrita em `dist`.

## Achados de estabilidade

| issue_id | evidência | causa | impacto | severidade |
|---|---|---|---|---|
| RUN-001 | `EPERM rename *.tmp -> store_metrics.json` duas vezes | atomic rename colide com lock/antivírus/processo no Windows; retry/replace insuficiente | perda silenciosa de visita/métrica | P1 |
| RUN-002 | 50% da suíte principal falha | testes não acompanham arquitetura atual | regressões reais ficam escondidas pelo ruído | P1 |
| RUN-003 | polling de `/api/dados` a cada 5 s no App e a cada 2 s no `WhatsAppView` | dois proprietários do mesmo refresh | carga duplicada quando tela WhatsApp está montada | P2 |
| RUN-004 | polling de identidade para após primeiro sucesso | `return` sem reagendar timer | desconexão posterior não atualiza UI | P1 |
| RUN-005 | catches vazios em dashboard/visita | supressão intencional de erro | usuário não sabe que dado ficou antigo/não persistiu | P2 |
| RUN-006 | listas de 30 produtos e 51 moldes renderizadas de uma vez | ausência de virtualização/paginação visual | custo cresce com catálogo; degradação provável | P2, não medido |

## Listeners e desmontagem

- `RealWhatsAppWeb` remove listeners `did-*`, remove o webview e limpa a referência ao desmontar: não foi encontrado vazamento direto nesse trecho.
- Timers principais têm cleanup, mas a lógica de identidade tem defeito de atualização, não de vazamento.
- Não foi encontrado loop síncrono de renderização na inspeção estática.

## Cenários obrigatórios não concluídos

Não foram executados abrir/fechar modal 30 vezes, alternar seção 30 vezes, falha de rede injetada, reload durante operação, dois browsers com a mesma conta, catálogos de três tamanhos ou profiling de memória/main thread. Motivos:

1. parte dessas ações alteraria sessão/dados ou exigiria infraestrutura de fault injection;
2. o driver disponível não expôs trace de performance/memória persistente;
3. a suite atual já é ruidosa por testes legados.

Consequentemente, não há base para afirmar que a investigação de travamentos está completa. `RUN-001` é falha confirmada de persistência; os demais são causas confirmadas de estado/carga ou riscos que precisam de profiling dedicado.

## Critérios recomendados para a próxima execução autorizada

- Teste de soak de 30 ciclos com contagem de listeners e heap antes/depois.
- Servidor de teste com falha de rede determinística e arquivos temporários em diretório isolado.
- Suite separada por “current UI”, “legacy” e “authenticated”.
- Assert explícito de que falha de métrica torna o teste vermelho.
