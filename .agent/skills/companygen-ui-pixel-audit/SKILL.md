---
name: companygen-ui-pixel-audit
description: Skill rigorosa de auditoria visual pixel-a-pixel e ergonomia de interface do CompanyGen (Desktop 1440px e Mobile 390px) usando capturas Playwright reais, sondas DOM e cláusulas anti-regressão UI-C01..UI-C08.
---

# CompanyGen UI Pixel Audit (`companygen-ui-pixel-audit`)

Esta skill governa qualquer criação, adaptação ou simplificação de telas no CompanyGen antes do empacotamento final.

## Regra Zero ("Sem Prova Visual, Sem Aprovação")
Nenhuma alteração de UI é considerada concluída apenas por inspeção de JSX/Tailwind ou `npm run build`. Todo ajuste exige:
1. Build atualizado (`npm run build`);
2. Captura em navegador real Playwright (`1440×900` Desktop e `390×844` Mobile) contra `dist/`;
3. Verificação métrica no DOM (`scrollWidth - innerWidth === 0`, alvos mínimos `44×44px` no mobile, zero textos truncados sem justificativa);
4. Inspeção visual direta das imagens geradas.

## As 7 Técnicas Obrigatórias
- **T1 — Inspeção Ocular Real:** Abrir e observar os PNGs em `1440×900` e `390×844`.
- **T2 — Sonda Geométrica DOM:** Medir `overflowX`, altura acima da dobra, colisões entre search/botões e largura mínima de cards.
- **T3 — Auditoria de Redundância Cruzada:** Eliminar repetições simultâneas no mesmo viewport (status repetido 3x, botões duplicados de Preview, seções duplicadas de arquivos).
- **T4 — Carga Cognitiva & Divulgação Progressiva:** Configurações avançadas ficam colapsáveis em acordeões (`<details>`/toggle) para não poluir fluxos de uso frequente (como drawers do WhatsApp).
- **T5 — Filtro Anti-Jargão Técnico:** Nunca expor nomes crus de schema/componentes (`HeroSection`, `DifferentialsStrip`, `sec_diff`, `Fallback N3 RAG`) ou `/mês` em pacotes sem validade.
- **T6 — Paridade Multi-Estado:** Verificar estados Vazio, Carregando, Cheio, Erro (`402`/rede) e Mobile.
- **T7 — Governança de Brand & Assets:** Usar exclusivamente o kit oficial transparente de logotipos e ícones (`/favicon.ico`, `/brand/simbolo-colorido.webp`, `/brand/logo-horizontal-escura.webp`, `/brand/logo-vertical-escura.webp`, `/brand/assinatura-email.png`, `/brand/app-icon-512.png`, `/brand/og-companygen.png`) e o pacote editorial de ilustrações (`/brand/illustrations/*`).

## Cláusulas Contratuais (`UI-C01` .. `UI-C08`)
- `UI-C01`: **Proibido deletar recurso útil**; reorganizar, colapsar ou mover para sub-aba dedicada.
- `UI-C02`: Fonte única de status global sem duplicações no mesmo quadro visual.
- `UI-C03`: Drawers do WhatsApp (`Biblioteca`, `Rápidas`, `Fila Humana`) não dividem espaço vertical com painel pesado aberto por padrão.
- `UI-C04`: Transparência financeira total (Extrato + Gráfico de Consumo lendo `cg_credit_ledger` + sync automático em foco de janela).
- `UI-C05`: Alvos touch >= `44px` e zero input esmagado em larguras `<= 390px`.
- `UI-C06`: Tradução amigável para linguagem de lojista brasileiro.
- `UI-C07`: Rastreabilidade cloud real para o Admin oficial (`arthurpolarbuy@gmail.com`).
- `UI-C08`: Prova visual antes/depois registrada antes de avançar para a Fase 5 (`.exe`).
