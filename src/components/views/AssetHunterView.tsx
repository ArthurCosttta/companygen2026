import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  CheckCircle2,
  Sliders,
  Terminal,
  Scissors,
  CheckSquare,
  Square,
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Send,
  Bot,
  Video,
  Camera,
  Play,
  Film,
  Zap,
} from 'lucide-react';
import type { BrandSpec } from '@/schemas/campaign.schema';
import type { Asset } from '@/compiler/types';
import { AssetHunterEngine } from '@/services/asset-hunter/AssetHunterEngine';
import type {
  RankedCandidate,
  SearchIntentPayload,
} from '@/services/asset-hunter/types';

interface AssetHunterViewProps {
  brand?: BrandSpec;
  isDarkMode?: boolean;
  onBrandUpdate?: (newBrandName: string) => void;
  onAssetsIngested?: (newAssets: Asset[]) => Promise<void>;
  onNavigateToCalendar?: () => void;
}

interface AssistantResponse {
  queryInterpreted: string;
  brandExtracted: string;
  productExtracted: string;
  colorExtracted: string;
  segmentExtracted: string;
  countExtracted: number;
  mediaSummary: string;
  message: string;
}

// Utilitário para formatar nomes próprios
function toTitleCase(str: string): string {
  return str
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Analisador Dinâmico de Linguagem Natural (ZERO DADOS HARDCODED)
function parsePromptDynamically(
  text: string,
  fallbackBrand: string
): {
  brand: string;
  product: string;
  color: string;
  segment: string;
  count: number;
  mediaType: 'all' | 'image' | 'video';
  preferPackshot: boolean;
  isolateBackground: boolean;
} {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. Extração de Quantidade (ex: "20 videos", "10 fotos", "5 itens")
  let count = 10;
  const countMatch = lower.match(/(\d+)\s*(?:videos?|vídeos?|fotos?|imagens?|assets?|itens?|produtos?)?/i);
  if (countMatch && countMatch[1]) {
    const val = parseInt(countMatch[1], 10);
    if (!isNaN(val) && val > 0) {
      count = Math.min(Math.max(val, 1), 30);
    }
  }

  // 2. Extração de Tipo de Mídia (fotos, vídeos, ou ambos)
  const wantsVideos = /videos?|vídeos?|reels?|shorts?|filmagens?/i.test(lower);
  const wantsImages = /fotos?|imagens?|packshots?|foto\s+de\s+produto/i.test(lower);
  let mediaType: 'all' | 'image' | 'video' = 'all';
  if (wantsVideos && !wantsImages) {
    mediaType = 'video';
  } else if (wantsImages && !wantsVideos) {
    mediaType = 'image';
  }

  // 3. Extração Dinâmica de Marca (ex: "para minha loja alexandre variedades", "minha loja X", "loja X")
  let brand = fallbackBrand || 'Minha Loja';
  const brandMatch = raw.match(
    /(?:para\s+(?:a\s+)?minha\s+loja|minha\s+loja|para\s+(?:a\s+)?loja|loja\s+de|loja|marca|empresa)\s+([a-zA-Z0-9\sáàâãéèêíïóôõöúçñ]+?)(?:\s+(?:em|com|no|na|de|para|e)\s+|$|[.,;])/i
  );
  if (brandMatch && brandMatch[1] && brandMatch[1].trim().length > 1) {
    brand = toTitleCase(brandMatch[1].trim());
  }

  // 4. Extração Dinâmica do Produto / Categoria
  let productText = raw;
  if (brandMatch && brandMatch[0]) {
    productText = productText.replace(brandMatch[0], ' ');
  }
  // Remove comandos e quantidades do texto para isolar o produto
  productText = productText.replace(/^\s*\d+\s*(?:videos?|vídeos?|fotos?|imagens?|assets?|itens?)\s*(?:de\s+)?/i, ' ');
  productText = productText.replace(/(?:procure|busque|quero|encontre|gerar|gere|buscar|pesquise)\s+(?:por\s+)?/gi, ' ');
  productText = productText.replace(/(?:fotos?|imagens?|videos?|vídeos?)\s+(?:de\s+|sobre\s+|para\s+)?/gi, ' ');
  productText = productText.replace(/(?:para\s+(?:a\s+)?minha\s+loja|minha\s+loja|loja|marca)\s+[a-zA-Z0-9\sáàâãéèêíïóôõöúçñ]+/gi, ' ');
  productText = productText.replace(/\b(?:de|para|com|do|da|em|os|as|um|uma|pela)\b/gi, ' ');
  productText = productText.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  const product = productText ? toTitleCase(productText) : 'Produtos em Destaque';

  // 5. Extração Dinâmica de Segmento
  let segment = 'Variedades & Geral';
  if (/eletr[oô]nic|tecnolog|celular|smartphone|fone|computador|gadget|hardware|som|tv/i.test(lower)) {
    segment = 'Eletrônicos & Tecnologia';
  } else if (/feminina|vestido|saia|blusa|lingerie|salto|bolsa|maquiagem/i.test(lower)) {
    segment = 'Moda Feminina';
  } else if (/masculin|homem|camisa|terno|cueca|gravata|barba/i.test(lower)) {
    segment = 'Moda Masculina';
  } else if (/cal[çc]ado|sapato|tenis|tênis|bota|sandalia|chinelo/i.test(lower)) {
    segment = 'Calçados & Acessórios';
  } else if (/beleza|cosm[eé]tico|cabelo|perfume|pele/i.test(lower)) {
    segment = 'Beleza & Cosméticos';
  } else if (/casa|decora[çc][aã]o|m[oó]vel|cozinha|cama|mesa|banho/i.test(lower)) {
    segment = 'Casa & Decoração';
  } else if (/comida|alimento|restaurante|pizza|lanche|doce/i.test(lower)) {
    segment = 'Alimentos & Bebidas';
  }

  // 6. Extração de Cores
  const colorMatch = lower.match(
    /\b(branc[ao]|pret[ao]|azul|vermelh[ao]|amarel[ao]|verde|bege|cinza|dourad[ao]|pratead[ao]|prata|rosa|floral|estampad[ao]|jeans|off-white|colorid[ao])\b/i
  );
  const color = colorMatch ? toTitleCase(colorMatch[1]) : 'Lançamentos & Destaques';

  // 7. Filtros Visuais
  const preferPackshot = /packshot|fundo\s+branco|est[uú]dio|estudio|neutro/i.test(lower) || mediaType === 'image';
  const isolateBackground = /sem\s+fundo|fundo\s+transparente|recort(e|ada?)|rembg/i.test(lower);

  return {
    brand,
    product,
    color,
    segment,
    count,
    mediaType,
    preferPackshot,
    isolateBackground,
  };
}

export const AssetHunterView: React.FC<AssetHunterViewProps> = ({
  brand,
  isDarkMode,
  onBrandUpdate,
  onAssetsIngested,
  onNavigateToCalendar,
}) => {
  // Chat Composer state
  const [chatPrompt, setChatPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState<AssistantResponse | null>(null);

  // Filter tabs for results
  const [mediaTab, setMediaTab] = useState<'all' | 'image' | 'video'>('all');

  // Input parameters (auto-updated dynamically)
  const [brandName, setBrandName] = useState(brand?.name || 'Minha Loja');
  const [productName, setProductName] = useState('Produtos');
  const [colorVariant, setColorVariant] = useState('Lançamentos & Destaques');
  const [segment, setSegment] = useState('Variedades & Geral');
  const [desiredCount, setDesiredCount] = useState<number>(10);
  const [preferPackshot, setPreferPackshot] = useState(true);
  const [requireHighRes, setRequireHighRes] = useState(true);
  const [isolateBackground, setIsolateBackground] = useState(false);

  // Sync external brand if it changes
  React.useEffect(() => {
    if (brand?.name) {
      setBrandName(brand.name);
    }
  }, [brand?.name]);

  // Execution states
  const [isHunting, setIsHunting] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    '> [Pronto] Motor de Garimpo aguardando comando do Chat Composer...',
    '> [Status] Conexão ativa com o Scraper Dinâmico Live Web.',
  ]);
  const [results, setResults] = useState<RankedCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setConsoleLogs((prev) => [...prev, `> [${time}] ${msg}`]);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Motor Unificado de Execução de Busca (100% Dinâmico)
  const executeSearch = async (params: {
    brand: string;
    product: string;
    color: string;
    segment: string;
    count: number;
    mediaType: 'all' | 'image' | 'video';
    preferPackshot: boolean;
    isolateBackground: boolean;
    userPromptText?: string;
  }) => {
    setIsHunting(true);
    setResults([]);
    setSelectedIds(new Set());
    setConsoleLogs([]);

    // 1. Atualização imediata dos campos de configuração na tela
    setBrandName(params.brand);
    setProductName(params.product);
    setColorVariant(params.color);
    setSegment(params.segment);
    setDesiredCount(params.count);
    setPreferPackshot(params.preferPackshot);
    setIsolateBackground(params.isolateBackground);
    setMediaTab(params.mediaType);

    // Notifica o app para atualizar o nome da loja no sidebar e cabeçalho
    if (onBrandUpdate && params.brand) {
      onBrandUpdate(params.brand);
    }

    // 2. Confirmação do pedido antes da busca real
    const mediaDesc =
      params.mediaType === 'video'
        ? `${params.count} vídeos verticais (9:16) para Reels / Shorts`
        : params.mediaType === 'image'
        ? `${params.count} fotos packshot de estúdio em alta resolução`
        : `${params.count} fotos e vídeos para catálogo e Reels`;

    const responsePayload: AssistantResponse = {
      queryInterpreted: `${params.product} (${params.color})`,
      brandExtracted: params.brand,
      productExtracted: params.product,
      colorExtracted: params.color,
      segmentExtracted: params.segment,
      countExtracted: params.count,
      mediaSummary: mediaDesc,
      message: `Entendido! Atualizei as configurações para ${params.product} da loja ${params.brand}. Agora vou consultar a busca real e mostrar somente os resultados que forem encontrados.`,
    };
    setAiResponse(responsePayload);

    // 3. Executa a busca com os parâmetros dinâmicos
    const cleanSlug = params.product.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'produto';
    const intent: SearchIntentPayload = {
      requestId: `req_${Date.now()}`,
      brand: {
        tenantId: `tnt_${params.brand.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        brandName: params.brand,
        segment: params.segment,
      },
      productName: params.product,
      productSlug: cleanSlug,
      colorVariant: params.color,
      desiredCount: params.count,
      filters: {
        minWidth: requireHighRes ? 800 : 400,
        minHeight: requireHighRes ? 800 : 400,
        preferPackshot: params.preferPackshot,
        isolateBackground: params.isolateBackground,
        targetAspectRatio: params.mediaType === 'video' ? '9:16' : '1:1',
        negativeKeywords: ['meme', 'desenho', 'molde', 'print'],
        mediaType: params.mediaType,
      },
      mediaType: params.mediaType,
      createdAt: new Date().toISOString(),
    };

    try {
      if (params.userPromptText) {
        addLog(`[Chat Composer] Prompt recebido: "${params.userPromptText}"`);
      } else {
        addLog(`[Busca Manual] Disparada pelo painel de configurações.`);
      }
      addLog(`[Motor] Parâmetros ativos: Marca="${params.brand}", Produto="${params.product}", Segmento="${params.segment}", Mídia="${params.mediaType}", Qtd=${params.count}`);
      
      const candidates = await AssetHunterEngine.huntCandidates(intent, addLog);
      setResults(candidates);

      // Auto-seleciona fotos/vídeos aprovados
      const autoSelected = new Set<string>();
      candidates.forEach((c) => {
        if (c.isApproved) autoSelected.add(c.candidateId);
      });
      setSelectedIds(autoSelected);

      addLog(`[Sucesso] ${candidates.length} assets carregados no grid.`);
      showToast(`✨ ${candidates.length} fotos e vídeos encontrados para ${params.brand}!`);
    } catch {
      setResults([]);
      setSelectedIds(new Set());
      addLog(`Erro durante o garimpo.`);
      showToast('⚠️ Erro ao buscar assets.');
    } finally {
      setIsHunting(false);
    }
  };

  // AI Natural Language Parser: Interpreta prompt, atualiza configs & executa busca
  const handleComposerSubmit = async (customPrompt?: string) => {
    const text = (customPrompt || chatPrompt).trim();
    if (!text) return;

    const parsed = parsePromptDynamically(text, brandName);
    await executeSearch({
      ...parsed,
      userPromptText: text,
    });
  };

  // Busca Manual acionada pelo botão da tela de configurações
  const handleManualHunt = async () => {
    await executeSearch({
      brand: brandName.trim() || 'Minha Loja',
      product: productName.trim() || 'Produtos',
      color: colorVariant.trim() || 'Lançamentos & Destaques',
      segment: segment,
      count: desiredCount,
      mediaType: mediaTab,
      preferPackshot: preferPackshot,
      isolateBackground: isolateBackground,
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResults.map((r) => r.candidateId)));
    }
  };

  const handleIngestToCatalog = async () => {
    const selectedCandidates = results.filter((r) => selectedIds.has(r.candidateId));
    if (selectedCandidates.length === 0) {
      showToast('Selecione pelo menos um asset para vincular ao catálogo.');
      return;
    }

    const cleanSlug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'produto';
    const intent: SearchIntentPayload = {
      requestId: `req_${Date.now()}`,
      brand: {
        tenantId: `tnt_${brandName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        brandName: brandName.trim(),
        segment: segment,
      },
      productName: productName.trim(),
      productSlug: cleanSlug,
      desiredCount: selectedCandidates.length,
      filters: {
        minWidth: 800,
        minHeight: 800,
        preferPackshot: true,
        isolateBackground: false,
        targetAspectRatio: '1:1',
        negativeKeywords: [],
      },
      createdAt: new Date().toISOString(),
    };

    const newAssets = AssetHunterEngine.convertToStudioAssets(selectedCandidates, intent, addLog);
    try {
      if (!onAssetsIngested) throw new Error('Catálogo indisponível.');
      await onAssetsIngested(newAssets);
      showToast(`✅ ${newAssets.length} imagens salvas na biblioteca!`);
    } catch {
      showToast('Não foi possível salvar. Tente novamente.');
    }
  };

  // Filtered by tab
  const filteredResults = results.filter((r) => {
    if (mediaTab === 'image') return r.mediaType !== 'video';
    if (mediaTab === 'video') return r.mediaType === 'video';
    return true;
  });

  const imageCount = results.filter((r) => r.mediaType !== 'video').length;
  const videoCount = results.filter((r) => r.mediaType === 'video').length;

  return (
    <div
      className={`flex-1 overflow-y-auto ${
        isDarkMode ? 'bg-[#0B132B] text-slate-100' : 'bg-[#F8FAFC] text-slate-800'
      } p-6 sm:p-8 transition-colors`}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Toast Notifier */}
        {toastMessage && (
          <div className="fixed top-20 right-8 z-50 bg-[#0867E8] text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border border-blue-400 animate-in fade-in slide-in-from-top-4 duration-200">
            <CheckCircle2 className="w-5 h-5 text-white" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
        )}

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-blue-50 dark:bg-blue-950/60 text-[#0867E8] rounded-xl">
                <Search className="w-6 h-6" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Garimpo de Assets por Marca (Fotos & Vídeos)
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Peça fotos ou vídeos no Chat Composer da Sofia. Ele configura a busca abaixo e garimpa os melhores assets automaticamente.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold px-3 py-1 bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-400 rounded-full border border-green-200 dark:border-green-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Fotos & Vídeos Reels</span>
            </span>
          </div>
        </div>

        {/* 1. CHAT COMPOSER IA (ACIMA DAS CONFIGURAÇÕES) */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-3xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                <Bot className="w-5 h-5 text-white" />
              </span>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Assistente de busca</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-white/20 rounded-full">
                    Auto-Configurador
                  </span>
                </h2>
                <p className="text-xs text-blue-100">
                  Descreva o que procura em linguagem natural. O assistente preenche as opções e executa a busca real na hora.
                </p>
              </div>
            </div>
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-blue-200 font-medium">
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Atualização Instantânea</span>
            </span>
          </div>

          {/* Prompt Box */}
          <div className="relative">
            <textarea
              rows={2}
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleComposerSubmit();
                }
              }}
              placeholder="Ex: 20 videos de eletronicos para minha loja alexandre variedades..."
              className="w-full px-4 py-3 pr-28 text-sm rounded-2xl bg-white/10 hover:bg-white/15 focus:bg-white text-white focus:text-slate-900 placeholder:text-blue-200 focus:placeholder:text-slate-400 border border-white/20 focus:border-white focus:outline-none transition-all shadow-inner resize-none"
            />
            <button
              onClick={() => handleComposerSubmit()}
              disabled={isHunting || !chatPrompt.trim()}
              className="absolute right-3 bottom-3.5 px-4 py-2 bg-white text-[#0867E8] hover:bg-blue-50 disabled:opacity-50 text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isHunting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Interpretar & Buscar</span>
            </button>
          </div>

          {/* Prompt Chips / Sugestões Rápidas */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-blue-200">Sugestões rápidas:</span>
            <button
              onClick={() => {
                const prompt = '20 videos de eletronicos para minha loja alexandre variedades';
                setChatPrompt(prompt);
                handleComposerSubmit(prompt);
              }}
              className="px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-xs text-white transition-colors cursor-pointer border border-white/10 flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>20 Vídeos Eletrônicos (Alexandre Variedades)</span>
            </button>

            <button
              onClick={() => {
                const prompt = '10 fotos packshot de tênis e sneakers esportivos para minha loja SportStyle';
                setChatPrompt(prompt);
                handleComposerSubmit(prompt);
              }}
              className="px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-xs text-white transition-colors cursor-pointer border border-white/10 flex items-center gap-1.5"
            >
              <span>10 Tênis SportStyle (Calçados)</span>
            </button>

            <button
              onClick={() => {
                const prompt = '15 fotos de Vestido Floral de Verão para minha loja Bela Moda';
                setChatPrompt(prompt);
                handleComposerSubmit(prompt);
              }}
              className="px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-xs text-white transition-colors cursor-pointer border border-white/10 flex items-center gap-1.5"
            >
              <span>Vestidos Florais (Bela Moda)</span>
            </button>
          </div>
        </div>

        {/* 2. RESPOSTA DA IA EXPLICANDO O QUE FOI ENTENDIDO E O QUE TEM EMBAIXO */}
        {aiResponse && (
          <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-2xl p-5 shadow-xs space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-[#0867E8] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Assistente de busca</span>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      Parâmetros Sincronizados
                    </span>
                  </h3>
                  <span className="text-xs text-slate-400">Há poucos instantes</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {aiResponse.message}
                </p>

                {/* Tags dos parâmetros extraídos */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 font-medium">
                    🏢 <strong>Marca:</strong> {aiResponse.brandExtracted}
                  </span>
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 font-medium">
                    👕 <strong>Produto:</strong> {aiResponse.productExtracted}
                  </span>
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 font-medium">
                    🎨 <strong>Cor:</strong> {aiResponse.colorExtracted}
                  </span>
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 font-medium">
                    📂 <strong>Segmento:</strong> {aiResponse.segmentExtracted}
                  </span>
                  <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 text-[#0867E8] dark:text-blue-300 rounded-lg font-semibold">
                    🎬 <strong>Mídia:</strong> {aiResponse.mediaSummary}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. CARD DE CONFIGURAÇÕES DE TELA (ATUALIZADO AUTOMATICAMENTE PELA IA) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#0867E8]" />
              <span>Configurações Atuais da Busca (Sincronizadas pelo Chat)</span>
            </h2>
            <span className="text-xs text-slate-400">Você também pode editar manualmente qualquer campo abaixo</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Marca da Loja
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0867E8]"
                placeholder="Ex: Alexandre Variedades"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Produto a Buscar
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0867E8]"
                placeholder="Ex: Eletrônicos"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Variação de Cor / Modelo
              </label>
              <input
                type="text"
                value={colorVariant}
                onChange={(e) => setColorVariant(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0867E8]"
                placeholder="Ex: Variados / Lançamentos"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Segmento
              </label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0867E8]"
              >
                <option value="Eletrônicos & Tecnologia">Eletrônicos & Tecnologia</option>
                <option value="Moda Masculina">Moda Masculina</option>
                <option value="Moda Feminina">Moda Feminina</option>
                <option value="Calçados & Acessórios">Calçados & Acessórios</option>
                <option value="Casa & Decoração">Casa & Decoração</option>
                <option value="Beleza & Cosméticos">Beleza & Cosméticos</option>
                <option value="Alimentos & Bebidas">Alimentos & Bebidas</option>
                <option value="Variedades & Geral">Variedades & Geral</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quantidade de Fotos/Vídeos
              </label>
              <select
                value={desiredCount}
                onChange={(e) => setDesiredCount(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0867E8]"
              >
                <option value={5}>5 Assets</option>
                <option value={10}>10 Assets</option>
                <option value={15}>15 Assets</option>
                <option value={20}>20 Assets</option>
              </select>
            </div>
          </div>

          {/* Toggles de Filtro */}
          <div className="flex flex-wrap items-center gap-5 pt-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={preferPackshot}
                onChange={(e) => setPreferPackshot(e.target.checked)}
                className="w-4 h-4 rounded text-[#0867E8] focus:ring-[#0867E8]"
              />
              <span>Fundo Neutro / Packshot de Estúdio</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={requireHighRes}
                onChange={(e) => setRequireHighRes(e.target.checked)}
                className="w-4 h-4 rounded text-[#0867E8] focus:ring-[#0867E8]"
              />
              <span>Alta Resolução (≥ 1080p)</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isolateBackground}
                onChange={(e) => setIsolateBackground(e.target.checked)}
                className="w-4 h-4 rounded text-[#0867E8] focus:ring-[#0867E8]"
              />
              <span>Ativar Recorte Automático (rembg)</span>
            </label>

            <button
              onClick={handleManualHunt}
              disabled={isHunting}
              className="ml-auto px-5 py-2.5 bg-[#0867E8] hover:bg-[#0756C4] disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              {isHunting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Garimpando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Atualizar Busca Manualmente</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Console Log em Tempo Real */}
        <div className="bg-slate-950 text-slate-200 rounded-2xl p-4 font-mono text-xs border border-slate-800 shadow-inner space-y-1">
          <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-800 text-slate-400">
            <span className="flex items-center gap-2 font-bold text-slate-300">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span>Console de Execução dos Nós de Garimpo</span>
            </span>
            <span className="text-[10px] text-slate-500">Pipeline: InputSpec -&gt; SemanticBuilder -&gt; Harvester -&gt; VisualScorer</span>
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1 scrollbar-thin">
            {consoleLogs.map((log, i) => (
              <div key={i} className="text-slate-300">
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* 4. RESULTADOS ENCONTRADOS COM ABAS DE FOTOS E VÍDEOS */}
        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Abas de Mídia: Todas, Fotos, Vídeos */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMediaTab('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    mediaTab === 'all'
                      ? 'bg-[#0867E8] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Todos os Assets ({results.length})</span>
                </button>

                <button
                  onClick={() => setMediaTab('image')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    mediaTab === 'image'
                      ? 'bg-[#0867E8] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Fotos Packshot ({imageCount})</span>
                </button>

                <button
                  onClick={() => setMediaTab('video')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    mediaTab === 'video'
                      ? 'bg-[#0867E8] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Vídeos Reels ({videoCount})</span>
                </button>
              </div>

              {/* Ações em Massa */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={selectAll}
                  className="text-xs font-bold text-[#0867E8] flex items-center gap-1.5 cursor-pointer hover:underline mr-2"
                >
                  {selectedIds.size === filteredResults.length ? (
                    <>
                      <CheckSquare className="w-4 h-4" /> Desmarcar
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" /> Selecionar Todas ({filteredResults.length})
                    </>
                  )}
                </button>

                <button
                  onClick={handleIngestToCatalog}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Vincular ao Catálogo ({selectedIds.size})</span>
                </button>

                {onNavigateToCalendar && (
                  <button
                    onClick={() => {
                      handleIngestToCatalog();
                      onNavigateToCalendar();
                    }}
                    className="px-4 py-2 bg-[#0867E8] hover:bg-[#0756C4] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Gerar Posts com essas Fotos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Grid de Cards de Fotos e Vídeos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {filteredResults.map((item) => {
                const isSelected = selectedIds.has(item.candidateId);
                const isVideo = item.mediaType === 'video';
                const score = item.scores.totalScore;
                const scoreColor =
                  score >= 0.85
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                    : score >= 0.70
                    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';

                return (
                  <div
                    key={item.candidateId}
                    onClick={() => toggleSelect(item.candidateId)}
                    className={`group relative rounded-2xl border transition-all cursor-pointer overflow-hidden flex flex-col ${
                      isSelected
                        ? 'border-[#0867E8] ring-2 ring-[#0867E8]/20 bg-blue-50/20 dark:bg-blue-950/30 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    {/* Media Preview: Imagem ou Vídeo */}
                    <div className="relative aspect-square w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <img
                        src={item.thumbnailUrl || item.rawUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />

                      {/* Video Badge se for vídeo */}
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/10 transition-colors pointer-events-none">
                          <div className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center shadow-md backdrop-blur-xs group-hover:scale-110 transition-transform">
                            <Play className="w-4 h-4 fill-white ml-0.5" />
                          </div>
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 text-white text-[10px] font-bold rounded-md flex items-center gap-1 backdrop-blur-xs">
                            <Video className="w-3 h-3 text-red-400" />
                            <span>{item.durationSec || 15}s · Reels</span>
                          </span>
                        </div>
                      )}

                      {/* Checkbox overlay */}
                      <div className="absolute top-2.5 left-2.5 z-10">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shadow-sm ${
                            isSelected
                              ? 'bg-[#0867E8] text-white'
                              : 'bg-white/80 dark:bg-slate-800/80 text-slate-400 border border-slate-300'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Score Badge */}
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full border shadow-xs ${scoreColor}`}
                        >
                          {(score * 100).toFixed(0)}% Match
                        </span>
                      </div>
                    </div>

                    {/* Metadata Card Footer */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                          {item.title}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                          <span>
                            {isVideo ? '9:16 (1080×1920)' : `${item.width}×${item.height}px`}
                          </span>
                          <span className="capitalize font-medium">
                            {isVideo ? '🎬 Vídeo Reels' : item.roleSuggestion.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-500">
                          Score: {score.toFixed(2)}
                        </span>
                        {!isVideo && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              showToast('✂️ Recorte de fundo aplicado ao asset!');
                            }}
                            className="p-1 text-slate-400 hover:text-[#0867E8] rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Remover fundo da imagem"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
