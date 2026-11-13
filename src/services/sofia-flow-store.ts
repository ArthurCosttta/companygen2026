import { useState, useEffect } from 'react';

export type FlowType = 'configuracao' | 'vendas' | 'moonshot';

export interface SofiaConhecimento {
  empresa: string;
  endereco: string;
  horarios: string;
  entregas: string;
  pagamentos: string;
  perguntas: Array<{ id: string; pergunta: string; resposta: string }>;
}

export interface SofiaCarrinhoItem {
  sku: string;
  nome: string;
  variacao: string;
  preco: number;
  qtd: number;
}

export interface SofiaFlowState {
  activeFlow: FlowType;
  currentStep: number; // 1-7 (config), 1-8 (vendas), 1-8 (moonshot)

  // 1. Configuração
  config: {
    progressoEtapas: number; // 0 a 4
    statusConexao: 'aguardando' | 'conectado';
    telefone: string;
    conhecimento: SofiaConhecimento;
    catalogoSincronizado: boolean;
    estiloAtendimento: 'formal' | 'amigavel' | 'comercial';
    vozSelecionada: string;
    homologado: boolean;
  };

  // 2. Central de Vendas
  vendas: {
    filtroAtivo: 'todas' | 'nao_lidas' | 'sofia' | 'humano';
    clienteAtivoId: string;
    atendenteModo: 'sofia' | 'humano';
    chatMensagens: Array<{
      id: string;
      sender: 'user' | 'sofia' | 'humano';
      texto: string;
      hora: string;
      tipo?: 'normal' | 'busca_catalogo' | 'cards_produtos' | 'link_pagamento';
      produtos?: Array<{ nome: string; preco: string; estoque: string }>;
    }>;
    carrinho: SofiaCarrinhoItem[];
    linkCheckoutGerado: string;
    modalHumanoAberto: boolean;
    pedidoAtivo: {
      codigo: string;
      status: 'recebido' | 'em_preparo' | 'expedicao';
      cliente: string;
      total: number;
      historico: Array<{ etapa: string; hora: string; concluido: boolean }>;
    };
  };

  // 3. Sofia Moonshot
  moonshot: {
    objetivoTexto: string;
    planoTarefas: Array<{ id: string; titulo: string; desc: string; status: 'planejado' | 'pronta' | 'pendente' }>;
    campanhaSugerida: {
      nome: string;
      periodo: string;
      metaQtd: number;
      ofertas: string;
      produtos: string[];
    };
    preparacaoItens: Array<{ titulo: string; desc: string; atualizado: boolean }>;
    aprovacoes: Record<string, boolean>;
    metricas: {
      conversas: number;
      produtosProcurados: number;
      pedidosConfirmados: number;
      duvidasNaoRespondidas: number;
      metaTotal: number;
    };
    recomendacoes: Array<{
      id: string;
      texto: string;
      prioridade: 'alta' | 'media' | 'baixa';
      acao: string;
    }>;
  };
}

const DEFAULT_STATE: SofiaFlowState = {
  activeFlow: 'configuracao',
  currentStep: 1,

  config: {
    progressoEtapas: 0,
    statusConexao: 'aguardando',
    telefone: '+55 11 9****-8624',
    conhecimento: {
      empresa: 'Minha Loja',
      endereco: 'Rua Comercial, 123 · Centro',
      horarios: 'Seg a Sex: 9h às 18h · Sáb: 9h às 13h',
      entregas: 'Todo o Brasil · Prazo: 2 a 7 dias úteis',
      pagamentos: 'Pix com 5% de desconto, Cartão em até 12x e Boleto',
      perguntas: [
        { id: '1', pergunta: 'Qual é o prazo de entrega?', resposta: 'De 2 a 7 dias úteis dependendo da sua região.' },
        { id: '2', pergunta: 'Como funciona a troca?', resposta: 'Primeira troca 100% gratuita em até 7 dias corridos.' },
        { id: '3', pergunta: 'Têm loja física para retirada?', resposta: 'Sim, nossa retirada é de seg a sex das 10h às 17h.' },
        { id: '4', pergunta: 'Quais tamanhos vocês trabalham?', resposta: 'Trabalhamos do tamanho P ao GG em todas as polos.' },
        { id: '5', pergunta: 'Aceitam pagamento via Pix?', resposta: 'Sim, e você ainda ganha 5% de desconto imediato.' },
        { id: '6', pergunta: 'Qual a composição do tecido?', resposta: '100% Algodão Piquet Premium penteado fio 30.1.' },
      ],
    },
    catalogoSincronizado: true,
    estiloAtendimento: 'amigavel',
    vozSelecionada: 'Voz 2 · Clara e natural',
    homologado: false,
  },

  vendas: {
    filtroAtivo: 'todas',
    clienteAtivoId: 'marcos',
    atendenteModo: 'sofia',
    chatMensagens: [
      {
        id: 'm1',
        sender: 'user',
        texto: 'Tem camisa polo azul M?',
        hora: '10:24',
      },
      {
        id: 'm2',
        sender: 'sofia',
        texto: 'Vou consultar agora no nosso catálogo, um momento.',
        hora: '10:24',
        tipo: 'busca_catalogo',
      },
      {
        id: 'm3',
        sender: 'sofia',
        texto: 'Aqui estão algumas opções de camisa polo azul no tamanho M:',
        hora: '10:25',
        tipo: 'cards_produtos',
        produtos: [
          { nome: 'Camisa Polo Clássica', preco: 'R$ 79,90', estoque: '26 un em estoque' },
          { nome: 'Camisa Polo Piquet', preco: 'R$ 89,90', estoque: '18 un em estoque' },
          { nome: 'Camisa Polo Premium', preco: 'R$ 129,90', estoque: '12 un em estoque' },
        ],
      },
    ],
    carrinho: [
      { sku: 'P001', nome: 'Camisa Polo Clássica', variacao: 'Azul · Tam. M', preco: 79.9, qtd: 1 },
      { sku: 'P002', nome: 'Camisa Polo Piquet', variacao: 'Azul Claro · Tam. M', preco: 89.9, qtd: 1 },
    ],
    linkCheckoutGerado: 'https://pag.companygen.store/ck/8F3K9-LOJA',
    modalHumanoAberto: false,
    pedidoAtivo: {
      codigo: '#PC-001459',
      status: 'em_preparo',
      cliente: 'Marcos A.',
      total: 169.8,
      historico: [
        { etapa: 'Pedido recebido', hora: 'Hoje, 10:27', concluido: true },
        { etapa: 'Em preparo (Separando os itens)', hora: 'Hoje, 10:32', concluido: true },
        { etapa: 'Expedição e envio', hora: 'Próxima etapa', concluido: false },
      ],
    },
  },

  moonshot: {
    objetivoTexto: 'Vender 100 camisas polo em 30 dias',
    planoTarefas: [
      { id: 't1', titulo: 'Atualizar catálogo', desc: 'Revisar camisas polo, fotos e códigos.', status: 'planejado' },
      { id: 't2', titulo: 'Planejar campanha', desc: 'Campanha de Natal: foco em camisas polo.', status: 'planejado' },
      { id: 't3', titulo: 'Criar página promocional', desc: 'Página temática da campanha.', status: 'planejado' },
      { id: 't4', titulo: 'Preparar criativos', desc: 'Imagens e textos da campanha.', status: 'planejado' },
      { id: 't5', titulo: 'Configurar atendimento da Sofia', desc: 'Conhecimento, produtos e respostas.', status: 'planejado' },
    ],
    campanhaSugerida: {
      nome: 'Campanha de Natal',
      periodo: '01/12/2025 a 30/12/2025',
      metaQtd: 100,
      ofertas: 'Destaque de linha, frete grátis conforme política da loja',
      produtos: ['Camisa Polo Clássica', 'Polo Piquet', 'Polo Premium'],
    },
    preparacaoItens: [
      { titulo: 'Produtos da campanha', desc: '3 camisas polo selecionadas', atualizado: true },
      { titulo: 'Preços promocionais', desc: 'A partir de R$ 79,90', atualizado: true },
      { titulo: 'Estoque disponível', desc: '142 unidades garantidas', atualizado: true },
      { titulo: 'Links comerciais', desc: 'Página da campanha e catálogo', atualizado: true },
    ],
    aprovacoes: {
      't1': true,
      't2': true,
      't3': true,
      't4': false,
      't5': false,
    },
    metricas: {
      conversas: 482,
      produtosProcurados: 964,
      pedidosConfirmados: 68,
      duvidasNaoRespondidas: 12,
      metaTotal: 100,
    },
    recomendacoes: [
      { id: 'r1', texto: 'Clientes procuram mais a polo azul M.', prioridade: 'alta', acao: 'Aumentar visibilidade' },
      { id: 'r2', texto: 'Amplie a visibilidade da polo azul M na campanha.', prioridade: 'media', acao: 'Criar anúncio' },
      { id: 'r3', texto: 'Reforce o estoque da polo azul M (estoque atual: 14 unidades).', prioridade: 'media', acao: 'Repor estoque' },
      { id: 'r4', texto: 'Atualize o conhecimento com dúvidas frequentes da campanha.', prioridade: 'baixa', acao: 'Editar FAQ' },
    ],
  },
};

const STORAGE_KEY = 'cg_sofia_flow_state_v1';

export function loadStoredState(): SofiaFlowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Erro ao carregar estado do localStorage, usando padrão:', err);
  }
  return DEFAULT_STATE;
}

export function saveStateToStorage(state: SofiaFlowState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Erro ao salvar estado no localStorage:', err);
  }
}

// Hook principal de estado reativo
export function useSofiaFlow() {
  const [state, setState] = useState<SofiaFlowState>(loadStoredState);

  useEffect(() => {
    saveStateToStorage(state);
  }, [state]);

  const setFlow = (flow: FlowType, step: number = 1) => {
    setState((prev) => ({
      ...prev,
      activeFlow: flow,
      currentStep: step,
    }));
  };

  const setStep = (step: number) => {
    setState((prev) => ({
      ...prev,
      currentStep: step,
    }));
  };

  const nextStep = () => {
    setState((prev) => {
      const maxSteps = prev.activeFlow === 'configuracao' ? 7 : 8;
      if (prev.currentStep < maxSteps) {
        return { ...prev, currentStep: prev.currentStep + 1 };
      }
      // Se terminou Configuração, vai pra Vendas
      if (prev.activeFlow === 'configuracao' && prev.currentStep === 7) {
        return { ...prev, activeFlow: 'vendas', currentStep: 1 };
      }
      // Se terminou Vendas, vai pro Moonshot
      if (prev.activeFlow === 'vendas' && prev.currentStep === 8) {
        return { ...prev, activeFlow: 'moonshot', currentStep: 1 };
      }
      return prev;
    });
  };

  const prevStep = () => {
    setState((prev) => {
      if (prev.currentStep > 1) {
        return { ...prev, currentStep: prev.currentStep - 1 };
      }
      if (prev.activeFlow === 'vendas' && prev.currentStep === 1) {
        return { ...prev, activeFlow: 'configuracao', currentStep: 7 };
      }
      if (prev.activeFlow === 'moonshot' && prev.currentStep === 1) {
        return { ...prev, activeFlow: 'vendas', currentStep: 8 };
      }
      return prev;
    });
  };

  const resetFlow = () => {
    setState(DEFAULT_STATE);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Ações de Configuração
  const updateConfigProgress = (progresso: number) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, progressoEtapas: progresso },
    }));
  };

  const setConnectionSuccess = () => {
    setState((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        statusConexao: 'conectado',
        progressoEtapas: Math.max(prev.config.progressoEtapas, 1),
      },
      currentStep: 3,
    }));
  };

  const addConhecimentoFaq = (pergunta: string, resposta: string) => {
    setState((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        conhecimento: {
          ...prev.config.conhecimento,
          perguntas: [
            ...prev.config.conhecimento.perguntas,
            { id: String(Date.now()), pergunta, resposta },
          ],
        },
      },
    }));
  };

  const setEstiloAtendimento = (estilo: 'formal' | 'amigavel' | 'comercial') => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, estiloAtendimento: estilo },
    }));
  };

  const setVozSelecionada = (voz: string) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, vozSelecionada: voz },
    }));
  };

  const homologarSofia = () => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, homologado: true, progressoEtapas: 4 },
      activeFlow: 'vendas',
      currentStep: 1,
    }));
  };

  // Ações de Vendas
  const setVendasFiltro = (filtro: 'todas' | 'nao_lidas' | 'sofia' | 'humano') => {
    setState((prev) => ({
      ...prev,
      vendas: { ...prev.vendas, filtroAtivo: filtro },
    }));
  };

  const sendVendasMensagem = (texto: string) => {
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsgId = 'u_' + Date.now();
    setState((prev) => ({
      ...prev,
      vendas: {
        ...prev.vendas,
        chatMensagens: [
          ...prev.vendas.chatMensagens,
          { id: userMsgId, sender: 'user', texto, hora: timeNow },
        ],
      },
    }));

    // Resposta automática da Sofia simulada
    setTimeout(() => {
      const respTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setState((prev) => ({
        ...prev,
        vendas: {
          ...prev.vendas,
          chatMensagens: [
            ...prev.vendas.chatMensagens,
            {
              id: 's_' + Date.now(),
              sender: 'sofia',
              texto: `Excelente pergunta! Estou checando a disponibilidade no estoque da ${prev.config.conhecimento.empresa || 'loja'} agora mesmo.`,
              hora: respTime,
            },
          ],
        },
      }));
    }, 600);
  };

  const updateCarrinhoItemQtd = (sku: string, delta: number) => {
    setState((prev) => {
      const updated = prev.vendas.carrinho
        .map((item) => {
          if (item.sku === sku) {
            const newQtd = Math.max(0, item.qtd + delta);
            return { ...item, qtd: newQtd };
          }
          return item;
        })
        .filter((i) => i.qtd > 0);

      const novoTotal = updated.reduce((acc, cur) => acc + cur.preco * cur.qtd, 0);

      return {
        ...prev,
        vendas: {
          ...prev.vendas,
          carrinho: updated,
          pedidoAtivo: {
            ...prev.vendas.pedidoAtivo,
            total: novoTotal,
          },
        },
      };
    });
  };

  const setModalHumanoAberto = (aberto: boolean) => {
    setState((prev) => ({
      ...prev,
      vendas: { ...prev.vendas, modalHumanoAberto: aberto },
    }));
  };

  const assumirAtendimentoHumano = () => {
    setState((prev) => ({
      ...prev,
      vendas: {
        ...prev.vendas,
        atendenteModo: 'humano',
        modalHumanoAberto: false,
      },
      currentStep: 7, // Avança para o Perfil do Cliente
    }));
  };

  // Ações de Moonshot
  const setMoonshotObjetivo = (texto: string) => {
    setState((prev) => ({
      ...prev,
      moonshot: { ...prev.moonshot, objetivoTexto: texto },
    }));
  };

  const toggleAprovacaoItem = (id: string) => {
    setState((prev) => ({
      ...prev,
      moonshot: {
        ...prev.moonshot,
        aprovacoes: {
          ...prev.moonshot.aprovacoes,
          [id]: !prev.moonshot.aprovacoes[id],
        },
      },
    }));
  };

  const aprovarTodasAcoesMoonshot = () => {
    setState((prev) => {
      const allApproved: Record<string, boolean> = {};
      prev.moonshot.planoTarefas.forEach((t) => {
        allApproved[t.id] = true;
      });
      return {
        ...prev,
        moonshot: {
          ...prev.moonshot,
          aprovacoes: allApproved,
        },
      };
    });
  };

  return {
    state,
    setFlow,
    setStep,
    nextStep,
    prevStep,
    resetFlow,
    // Config
    updateConfigProgress,
    setConnectionSuccess,
    addConhecimentoFaq,
    setEstiloAtendimento,
    setVozSelecionada,
    homologarSofia,
    // Vendas
    setVendasFiltro,
    sendVendasMensagem,
    updateCarrinhoItemQtd,
    setModalHumanoAberto,
    assumirAtendimentoHumano,
    // Moonshot
    setMoonshotObjetivo,
    toggleAprovacaoItem,
    aprovarTodasAcoesMoonshot,
  };
}
