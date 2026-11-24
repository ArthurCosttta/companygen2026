import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildXlsxUint8Array } from '../server/ai-spreadsheet-engine.mjs';

const FIXTURES_DIR = path.resolve('tests/fixtures/benchmark_v2');

const BENCHMARK_SHEETS = [
  {
    filename: '01_clinica_estetica_facial.xlsx',
    sheets: [
      {
        name: 'Procedimentos',
        headers: ['Nome', 'Categoria', 'Preco_BRL', 'Duracao_Min', 'Area_Rosto', 'Sessoes_Recomendadas', 'Contraindicacao', 'Descricao'],
        rows: [
          ['Limpeza Profunda com Peeling Ultrassônico', 'Facial', '190,00', '60', 'Rosto completo', '1 sessao/mes', 'Pele com rosácea ativa', 'Extração delicada sem dor com hidratação calmante.'],
          ['Bioestimulador de Colágeno Facial', 'Firmeza', '1.450,00', '45', 'Terço médio e mandíbula', '2 sessoes', 'Gestantes', 'Estímulo progressivo de firmeza e contorno natural.'],
          ['Microagulhamento + Vitamina C', 'Textura', '420,00', '50', 'Poros e cicatrizes', '3 sessoes', 'Acne inflamada grau 3', 'Uniformiza textura e luminosidade com recuperação rápida.'],
        ],
      },
      {
        name: 'Especialistas',
        headers: ['Nome', 'Especialidade', 'Experiencia', 'Registro'],
        rows: [
          ['Dra. Camila Prado', 'Harmonização e Colágeno', '9 anos', 'CRBM-41920'],
          ['Dr. Lucas Teixeira', 'Lasers e Pele Sensível', '7 anos', 'CRM-188420'],
        ],
      },
    ],
  },
  {
    filename: '02_oficina_assistencia_apple.xlsx',
    sheets: [
      {
        name: 'Bancada_Servicos',
        headers: ['Nome', 'Modelo_Aparelho', 'Sintoma', 'Preco_BRL', 'Tempo_Bancada', 'Garantia_Meses', 'Peca_Original_SimNao'],
        rows: [
          ['Troca de Tela OLED Original', 'iPhone 14 Pro / 15', 'Tela', '1.190,00', '2 horas', '12 meses', 'Sim'],
          ['Substituição de Bateria Alta Densidade', 'iPhone 12 / 13 / 14', 'Bateria', '390,00', '1 hora', '12 meses', 'Sim'],
          ['Reparo em Placa Lógica & CI de Carga', 'MacBook / iPhone', 'Placa Lógica', '780,00', '24 horas', '6 meses', 'Sim'],
        ],
      },
    ],
  },
  {
    filename: '03_atacado_camisetas_drops.xlsx',
    sheets: [
      {
        name: 'Catalogo_Atacado',
        headers: ['SKU', 'Nome', 'Categoria', 'Tecido_Gramatura', 'Grade_Tamanhos', 'Preco_Varejo', 'Preco_10un', 'Preco_50un', 'Qtd_Minima'],
        rows: [
          ['DROP-01', 'Camiseta Boxy Heavy 280g', 'Oversized', '100% Algodão Peruano 280gsm', 'P, M, G, GG', '139,00', '98,00', '79,00', '10'],
          ['DROP-02', 'Moletom Canguru Felpado 420g', 'Inverno', 'Algodão 420gsm Pré-Encolhido', 'P, M, G, GG', '289,00', '215,00', '179,00', '5'],
          ['DROP-03', 'Boné Five-Panel Nylon Ripstop', 'Acessórios', 'Nylon Ripstop Repelente à Água', 'Único', '119,00', '84,00', '68,00', '12'],
        ],
      },
    ],
  },
  {
    filename: '04_confeitaria_sob_encomenda.xlsx',
    sheets: [
      {
        name: 'Cardapio_Encomendas',
        headers: ['Nome', 'Categoria', 'Preco_BRL', 'Serve_Pessoas', 'Antecedencia_Horas', 'Janela_Retirada', 'Notas_Sensoriais'],
        rows: [
          ['Bolo Chocolate Belga 70% & Avelã', 'Bolos Festivos', '198,00', '15 fatias', '24 horas', '10h-13h / 15h-18h', 'Massa úmida fermentação lenta e ganache intenso'],
          ['Caixa Presenteável 16 Doces Finos', 'Presentes', '89,00', '4 pessoas', '12 horas', '10h-19h', 'Pistache torrado, caramelo salgado e framboesa'],
          ['Torta Basca de Baunilha Natural', 'Sobremesas', '168,00', '12 fatias', '24 horas', '11h-18h', 'Centro cremoso com fava fresca e topo caramelizado'],
        ],
      },
    ],
  },
  {
    filename: '05_petshop_banho_creche.xlsx',
    sheets: [
      {
        name: 'Planos_Pet',
        headers: ['Nome', 'Categoria', 'Porte_Pet', 'Preco_BRL', 'Frequencia_Plano', 'Inclui_Busca_Entrega', 'Descricao'],
        rows: [
          ['Banho Relaxante Ozônio + Tosa Higiênica', 'Banho & Tosa', 'Pequeno (até 10kg)', '95,00', 'Avulso', 'Sim no raio 5km', 'Shampoo hipoalergênico e secagem silenciosa sem gaiola.'],
          ['Clube 4 Banhos no Mês (Porte Médio)', 'Planos Mensais', 'Médio (10-25kg)', '340,00', 'Mensal', 'Sim incluso', '1 banho por semana com hidratação de pelos quinzenal.'],
          ['Day Care Supervisão Integral (Diária)', 'Creche', 'Todos os portes', '110,00', 'Avulso', 'Opcional', 'Atividades guiadas por adestrador e relatórios por WhatsApp.'],
        ],
      },
    ],
  },
  {
    filename: '06_marcenaria_moveis_planejados.xlsx',
    sheets: [
      {
        name: 'Projetos_Referencia',
        headers: ['Nome', 'Ambiente', 'Madeira_Acabamento', 'Preco_BRL', 'Prazo_Producao_Dias', 'Garantia_Meses', 'Pontos_Destaque'],
        rows: [
          ['Cozinha Linear Minimalista Freijó & Laca', 'Cozinha', 'MDF Naval 18mm + Freijó Natural', '14.800,00', '35 dias úteis', '60 meses', 'Corrediças invisíveis amortecidas + tampo contínuo'],
          ['Estante Home Office Ripada Sob Medida', 'Escritório', 'Carvalho Americano + Ferro Fosco', '6.400,00', '25 dias úteis', '60 meses', 'Passa-cabos oculto e iluminação LED embutida 2700K'],
          ['Guarda-Roupa Portas de Correr Piso-Teto', 'Dormitório', 'Lino Cinza + Puxador Cava Usinado', '9.200,00', '30 dias úteis', '60 meses', 'Estrutura 25mm com divisor interno sob demanda'],
        ],
      },
    ],
  },
  {
    filename: '07_marmitas_fitness_semanal.xlsx',
    sheets: [
      {
        name: 'Kits_Semanais',
        headers: ['Nome', 'Categoria', 'Preco_BRL', 'Kcal', 'Proteina_G', 'Desconto_Lote', 'Dia_Entrega_Rota'],
        rows: [
          ['Kit 10 Refeições Equilíbrio (400g)', 'Kit Semanal', '229,00', '410 kcal', '36g proteína', '10% no combo 20un', 'Segunda e Quinta 18h-21h'],
          ['Kit 20 Refeições Hipertrofia (450g)', 'Alta Proteína', '419,00', '540 kcal', '46g proteína', '15% Pix Recorrente', 'Segunda e Quinta 18h-21h'],
          ['Box 5 Caldos Funcionais Noturnos', 'Leves', '98,00', '240 kcal', '22g proteína', 'Frete grátis no kit', 'Entrega em 24h'],
        ],
      },
    ],
  },
  {
    filename: '08_locacao_equipamentos_eventos.xlsx',
    sheets: [
      {
        name: 'Equipamentos',
        headers: ['Nome', 'Categoria', 'Preco_BRL', 'Diaria_24h', 'Caucao', 'Capacidade_Pessoas', 'Montagem_Inclusa'],
        rows: [
          ['Sistema de Som JBL + 2 Microfones Sem Fio', 'Áudio', '480,00', '24 horas', '300,00', 'Até 150 pessoas', 'Sim inclusa'],
          ['Projetor Laser 5000 Lumens + Tela 120"', 'Imagem', '590,00', '24 horas', '400,00', 'Auditórios até 200', 'Sim inclusa'],
          ['Combo Iluminação Cênica LED (8 refletores)', 'Luz', '360,00', 'Fim de semana', '200,00', 'Salões médios', 'Sim inclusa'],
        ],
      },
    ],
  },
  {
    filename: '09_academia_studio_pilates.xlsx',
    sheets: [
      {
        name: 'Planos_Turmas',
        headers: ['Nome', 'Modalidade', 'Duracao_Min', 'Preco_BRL', 'Frequencia', 'Turma_Limite', 'Indicacao'],
        rows: [
          ['Pilates Aparelhos 2x Semana (Mensal)', 'Turma até 3 alunos', '55', '390,00', '2x/semana', '3 alunos', 'Postura, lombar e fortalecimento profundo'],
          ['Pilates Clínico Pós-Lesão Individual', 'Individual 1:1', '55', '185,00', 'Avulsa ou semanal', '1 aluno', 'Reabilitação guiada com fisioterapeuta'],
          ['Trimestral 3x Semana + Avaliação Física', 'Turma reduzida', '55', '1.290,00', '3x/semana', '3 alunos', 'Condicionamento completo com reavaliação'],
        ],
      },
    ],
  },
  {
    filename: '10_joalheria_prata_artesanal.xlsx',
    sheets: [
      {
        name: 'Pecas_Autorais',
        headers: ['Nome', 'Categoria', 'Preco_BRL', 'Metal', 'Pedra', 'Aro_Tamanho', 'Detalhe_Ponto_1', 'Detalhe_Ponto_2'],
        rows: [
          ['Anel Solitário Linha Curva Prata 950', 'Anéis', '420,00', 'Prata 950 maciça', 'Quartzo Verde Lapidado', 'Aros 12 ao 26', 'Cravação artesanal 4 garras', 'Acabamento acetinado à mão'],
          ['Colar Pingente Orgânico Banho Ouro 18k', 'Colares', '580,00', 'Prata 925 + Ouro 18k', 'Pérola Barroca Natural', '45cm + extensor', 'Fecho lagosta reforçado', 'Garantia de 24 meses no banho'],
          ['Par de Alianças Anatômicas 4mm (Gravação)', 'Alianças', '890,00', 'Prata 950 escovada', 'Sem pedra (ou 1 ponto luz)', 'Sob medida', 'Interior anatômico conforto', 'Gravação interna grátis'],
        ],
      },
    ],
  },
];

async function generate() {
  await mkdir(FIXTURES_DIR, { recursive: true });
  for (const item of BENCHMARK_SHEETS) {
    const bytes = await buildXlsxUint8Array(item.sheets);
    await writeFile(path.join(FIXTURES_DIR, item.filename), bytes);
  }
  console.log(JSON.stringify({ ok: true, count: BENCHMARK_SHEETS.length, dir: FIXTURES_DIR }));
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
