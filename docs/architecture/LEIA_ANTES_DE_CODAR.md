# Leia Antes de Codar (Regra Obrigatória)

Antes de propor ou aplicar qualquer alteração neste repositório:
1. Leia `docs/architecture/MAPA_SISTEMA_INVARIANTES_E_ROADMAP.md` para conhecer as 8 features reais (`FEAT_01..FEAT_08`), seus arquivos exatos, seus invariantes (**"não mude X porque quebra Y"**) e onde o olho humano enxerga na UI.
2. Leia `docs/architecture/SPEC_COMPILADOR_LASER_E_DICIONARIOS.md` para seguir os **10 Dicionários Fechados**, o pipeline `Spec -> PieceExecutionPlan -> MutationVM` e o paradigma **Anti-Hardcode** (proibido hardcodar loja exemplo; testar enviando apenas briefing/catálogo real para a IA local).
3. Após editar qualquer arquivo em `server/*.mjs`, reinicie o processo servidor na porta `1245` (ou `5174`), pois o backend permanece carregado em RAM entre requisições.
