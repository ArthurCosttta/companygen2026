# 08 — Qualidade das lojas geradas

## Cobertura real

Uma loja autenticada foi observada ao vivo em desktop e 390×844, com 30 produtos e três categorias. O requisito de pelo menos três projetos com identidades diferentes não foi atendido: trocar conta/sessão e gerar novos projetos violaria o modo somente leitura. Logo, esta avaliação não pode ser declarada completa.

## Loja observada — projeto A (identidade redigida)

| dimensão | resultado | origem do defeito |
|---|---|---|
| estrutura | hero, benefícios, catálogo, contato, footer e checkout presentes | composição funcional |
| hierarquia | CTA e catálogo identificáveis; shell do editor compete com a loja | componente/layout |
| hero | imagem do primeiro produto usada como banner, com grande área branca | regra em `profile-adapter.ts:131-149` |
| imagens | logo e produtos pendentes coexistem com contador “0 pendentes” | estado/contagem de assets |
| coerência texto-imagem | texto institucional não combina com recorte isolado de telefone | regra de fallback, não necessariamente IA |
| tipografia | legível dentro da loja; shell tem contraste ruim no tema escuro | CSS/tokens |
| espaçamento | desktop aceitável; mobile tem scroll aninhado e modal com overflow | CSS responsivo |
| catálogo | 30 itens, filtros, estoque, variante, quantidade e preços | funcional na amostra |
| responsividade | cards refluem, mas editor + preview comprimem; ação do modal é cortada | componente/CSS |
| compra | carrinho normal correto; pedido direto exibe total R$ 0,00 | estado no componente |
| identidade | cores consistentes, logo ausente e hero genérico | dados/asset fallback |
| fidelidade JSON | nomes, preços, estoque e categorias apareceram coerentes na amostra | adaptador/IR aprovados na amostra |

## Separação de causas

1. **Dados de entrada:** nome/descrição e catálogo foram reproduzidos; logo faltante é dado/asset incompleto.
2. **Interpretação do modelo local:** não houve trace do modelo nesta execução; nenhum defeito foi atribuído à IA.
3. **Schema:** testes de schema passaram; não explica o total direto incorreto.
4. **Regras de composição:** reutilizar primeiro produto como hero é regra explícita e causa confirmada.
5. **Componente:** `CartDialog` calcula total de `cart` mesmo no fluxo direto por mensagem.
6. **CSS:** ações do review não quebram em linha no mobile; há scroll aninhado.
7. **Renderização:** slots pendentes e contador divergem; origem exata da contagem ainda precisa de trace.

## Fidelidade e publicação

- O compilador valida templates e variáveis obrigatórias para produto/carrinho.
- O compilador público remove/condiciona telefone de demonstração.
- Publicação real, cache de versão e loja anônima não foram exercidos.
- O caminho `wa.me` não foi aberto para evitar efeito externo.

## Critérios para completar esta etapa

Criar, em ambiente isolado, três fixtures: tecnologia, moda e serviço; congelar JSON de entrada; capturar desktop/tablet/mobile; comparar IR, DOM e screenshot; validar todos os preços/estoques/links; publicar em staging e verificar versão/cache. Até isso ocorrer, projetos B e C permanecem **não testados**, não reprovados.
