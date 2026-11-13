import React, { useState } from 'react';
import {
  Clapperboard,
  Copy,
  Check,
  Calendar,
  Play,
  Clock,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Scene {
  id: string;
  number: number;
  timeRange: string;
  visualCue: string;
  scriptSpeech: string;
  onScreenText: string;
  audioEffect: string;
}

interface VideoScript {
  id: string;
  title: string;
  format: 'reels' | 'tiktok' | 'shorts';
  totalDuration: string;
  hookType: string;
  pillar: string;
  scenes: Scene[];
}

const INITIAL_SCRIPTS: VideoScript[] = [
  {
    id: 'script_01',
    title: '3 Formas de Usar a Camisa Polo sem parecer sem graça',
    format: 'reels',
    totalDuration: '18 segundos',
    hookType: 'Quebra de Padrão (Curiosidade)',
    pillar: 'Dicas de Estilo & Moda',
    scenes: [
      {
        id: 's1',
        number: 1,
        timeRange: '0:00 – 0:03',
        visualCue: 'Plano médio em corte rápido. Apresentador segura a polo azul e aponta para a câmera com expressão intrigada.',
        scriptSpeech: 'Você ainda usa camisa polo achando que é só para escritório sem graça? Hoje eu vou te provar o contrário.',
        onScreenText: 'PARE de usar polo do jeito errado ❌',
        audioEffect: 'Batida Lo-fi moderna com transição "whoosh".',
      },
      {
        id: 's2',
        number: 2,
        timeRange: '0:03 – 0:08',
        visualCue: 'Câmera dinâmica mostrando combinação casual: polo azul marinho, bermuda de linho bege e tênis branco.',
        scriptSpeech: 'Look um: combina com bermuda clara e tênis clean. Fica despojado, arrumado e perfeito para o calor.',
        onScreenText: 'Look 1: Casual com bermuda e tênis 👟',
        audioEffect: 'Trilha sobe sutilmente em ritmo constante.',
      },
      {
        id: 's3',
        number: 3,
        timeRange: '0:08 – 0:13',
        visualCue: 'Transição rápida para calça chino alinhada e relógio minimalista. Apresentador ajeita a gola.',
        scriptSpeech: 'Look dois: calça chino e sapato casual. Você tá pronto pra uma reunião ou jantar sem precisar de terno.',
        onScreenText: 'Look 2: Smart Casual para noite 🌙',
        audioEffect: 'Batida com drop sutil.',
      },
      {
        id: 's4',
        number: 4,
        timeRange: '0:13 – 0:18',
        visualCue: 'Close-up no tecido e botões da camisa polo, apresentador aponta para o rodapé do vídeo.',
        scriptSpeech: 'Qual das duas você usaria? Comente "POLO" aqui embaixo que eu te mando o link direto no WhatsApp com desconto!',
        onScreenText: 'Comente "POLO" para receber o catálogo 📲',
        audioEffect: 'Efeito sonoro de "ding" ao apontar.',
      },
    ],
  },
  {
    id: 'script_02',
    title: 'O Teste do Algodão Piquet: Por que essa peça dura 3 anos',
    format: 'reels',
    totalDuration: '15 segundos',
    hookType: 'Demonstração de Qualidade',
    pillar: 'Produto & Bastidores',
    scenes: [
      {
        id: 's1',
        number: 1,
        timeRange: '0:00 – 0:03',
        visualCue: 'Close macro puxando levemente a costura reforçada do ombro para demonstrar resistência.',
        scriptSpeech: 'Sabe por que a gola da sua polo comum enrola na primeira lavagem? Olha isso aqui.',
        onScreenText: 'Por que golas comuns estragam rápido? ⚠️',
        audioEffect: 'Efeito sonoro de tensão / foco.',
      },
      {
        id: 's2',
        number: 2,
        timeRange: '0:03 – 0:08',
        visualCue: 'Comparativo lado a lado: tecido comum ralo vs Piquet estruturado de alta costura.',
        scriptSpeech: 'Nossas peças usam fibra dupla de algodão penteado. Não deforma, não desbota e respira o dia todo.',
        onScreenText: 'Algodão Piquet Duplo: não deforma ✅',
        audioEffect: 'Trilha enérgica em ascensão.',
      },
      {
        id: 's3',
        number: 3,
        timeRange: '0:08 – 0:15',
        visualCue: 'Pessoa vestindo a peça impecável e olhando no espelho.',
        scriptSpeech: 'Qualidade que você sente no toque. Garanta a sua pelo link da bio com frete grátis!',
        onScreenText: 'Frete Grátis na primeira compra 📦',
        audioEffect: 'Encerramento com clique e logotipo.',
      },
    ],
  },
];

interface VideoScriptsViewProps {
  onScheduleVideo?: (title: string, date: string, time: string) => void;
  onNavigateToCalendar: () => void;
}

export const VideoScriptsView: React.FC<VideoScriptsViewProps> = ({
  onScheduleVideo,
  onNavigateToCalendar,
}) => {
  const [scripts, setScripts] = useState<VideoScript[]>(INITIAL_SCRIPTS);
  const [selectedScriptId, setSelectedScriptId] = useState<string>(INITIAL_SCRIPTS[0].id);
  const [copied, setCopied] = useState(false);

  const currentScript = scripts.find((s) => s.id === selectedScriptId) || scripts[0];

  const handleCopyFullScript = () => {
    if (!currentScript) return;
    const text = `🎬 ROTEIRO DE VÍDEO: ${currentScript.title}
Formato: ${currentScript.format.toUpperCase()} | Duração: ${currentScript.totalDuration}
Gancho: ${currentScript.hookType}

${currentScript.scenes
  .map(
    (s) => `[Cena ${s.number} (${s.timeRange})]
• Enquadramento: ${s.visualCue}
• Texto na tela: ${s.onScreenText}
• Locução: "${s.scriptSpeech}"
• Áudio: ${s.audioEffect}`
  )
  .join('\n\n')}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleAddScene = () => {
    const nextNum = currentScript.scenes.length + 1;
    const newScene: Scene = {
      id: `scene_${Date.now()}`,
      number: nextNum,
      timeRange: '0:18 – 0:22',
      visualCue: 'Nova ação em cena...',
      scriptSpeech: 'Texto da nova cena...',
      onScreenText: 'Texto na tela...',
      audioEffect: 'Efeito sonoro...',
    };
    setScripts((prev) =>
      prev.map((sc) =>
        sc.id === currentScript.id ? { ...sc, scenes: [...sc.scenes, newScene] } : sc
      )
    );
  };

  const handleUpdateScene = (sceneId: string, updates: Partial<Scene>) => {
    setScripts((prev) =>
      prev.map((sc) => {
        if (sc.id !== currentScript.id) return sc;
        return {
          ...sc,
          scenes: sc.scenes.map((sn) => (sn.id === sceneId ? { ...sn, ...updates } : sn)),
        };
      })
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7FAFF] overflow-hidden select-none">
      {/* Top Header */}
      <div className="px-6 py-4 bg-white border-b border-[#E6EFFB] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Clapperboard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-[18px] text-[#0B1D52] tracking-tight">
              Roteiros de Vídeo Cena a Cena
            </h2>
            <p className="text-[12px] text-[#64748B]">
              Estruture roteiros de alta retenção para Reels, TikTok e Shorts com instruções visuais e de locução.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyFullScript}
            className="px-3.5 py-2 rounded-xl border border-[#E6EFFB] hover:border-[#0867E8] bg-white text-[#0B1D52] hover:text-[#0867E8] text-[12.5px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Roteiro Copiado!' : 'Copiar Roteiro'}</span>
          </button>

          {onScheduleVideo && (
            <button
              onClick={() => {
                onScheduleVideo(currentScript.title, '2026-11-12', '18:00');
                onNavigateToCalendar();
              }}
              className="px-4 py-2 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white text-[12.5px] font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>Agendar no Calendário</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content (Left Script Picker + Right Storyboard) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Script Selector */}
        <aside className="w-80 border-r border-[#E6EFFB] bg-white p-4 space-y-3 overflow-y-auto cg-scroll shrink-0">
          <div className="text-[11px] font-bold text-[#64748B] tracking-wider uppercase">
            ROTEIROS DISPONÍVEIS
          </div>

          <div className="space-y-2">
            {scripts.map((script) => (
              <button
                key={script.id}
                onClick={() => setSelectedScriptId(script.id)}
                className={cn(
                  'w-full p-3 rounded-xl border text-left transition-all cursor-pointer',
                  selectedScriptId === script.id
                    ? 'border-[#0867E8] bg-[#EDF4FF]/70 shadow-xs ring-1 ring-[#0867E8]/20'
                    : 'border-[#E6EFFB] hover:border-[#CBD5E1] bg-white hover:bg-[#F8FAFC]'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 uppercase">
                    {script.format}
                  </span>
                  <span className="text-[11px] text-[#64748B] font-semibold flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {script.totalDuration}
                  </span>
                </div>
                <h4 className="font-bold text-[13px] text-[#0B1D52] line-clamp-2">
                  {script.title}
                </h4>
                <div className="text-[11px] text-[#64748B] mt-1 truncate">
                  Pilar: {script.pillar}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Right Storyboard Editor (Scene by Scene) */}
        <main className="flex-1 overflow-y-auto cg-scroll p-6 space-y-6">
          {/* Header Summary Card */}
          <div className="p-5 rounded-2xl bg-white border border-[#E6EFFB] shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full uppercase">
                {currentScript.format} · {currentScript.totalDuration}
              </span>
              <h3 className="font-extrabold text-[18px] text-[#0B1D52] mt-1.5">
                {currentScript.title}
              </h3>
              <p className="text-[12px] text-[#64748B]">
                Tipo de Gancho: <span className="font-bold text-[#0B1D52]">{currentScript.hookType}</span>
              </p>
            </div>

            <button
              onClick={handleAddScene}
              className="px-3 py-1.5 rounded-xl border border-[#0867E8] text-[#0867E8] hover:bg-[#EDF4FF] text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Cena</span>
            </button>
          </div>

          {/* Scene Cards Timeline */}
          <div className="space-y-4">
            {currentScript.scenes.map((scene) => (
              <div
                key={scene.id}
                className="bg-white rounded-2xl border border-[#E6EFFB] shadow-xs overflow-hidden transition-all hover:shadow-md"
              >
                {/* Scene Header */}
                <div className="px-5 py-3 bg-[#F8FAFC] border-b border-[#E6EFFB] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-[#0867E8] text-white font-bold text-[12px] flex items-center justify-center">
                      {scene.number}
                    </span>
                    <span className="font-bold text-[14px] text-[#0B1D52]">
                      Cena {scene.number}
                    </span>
                    <span className="text-[12px] text-[#64748B] font-semibold">
                      ({scene.timeRange})
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-[#64748B] bg-white px-2 py-0.5 rounded border border-[#E6EFFB]">
                    {scene.audioEffect}
                  </span>
                </div>

                {/* Scene Grid Content */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Visual Cue & Camera */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-1">
                      <Play className="w-3 h-3 text-[#0867E8]" /> Ação Visual & Enquadramento
                    </label>
                    <textarea
                      rows={3}
                      value={scene.visualCue}
                      onChange={(e) =>
                        handleUpdateScene(scene.id, { visualCue: e.target.value })
                      }
                      className="w-full p-2.5 rounded-xl border border-[#E6EFFB] text-[12.5px] text-[#0B1D52] bg-[#F7FAFF] outline-none focus:border-[#0867E8] leading-relaxed"
                    />
                  </div>

                  {/* Right: Speech / Script */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-1">
                      🗣️ Fala / Narração (Locução)
                    </label>
                    <textarea
                      rows={3}
                      value={scene.scriptSpeech}
                      onChange={(e) =>
                        handleUpdateScene(scene.id, { scriptSpeech: e.target.value })
                      }
                      className="w-full p-2.5 rounded-xl border border-[#E6EFFB] text-[12.5px] text-[#0B1D52] bg-[#F7FAFF] outline-none focus:border-[#0867E8] leading-relaxed font-medium"
                    />
                  </div>

                  {/* Bottom: On Screen Text */}
                  <div className="md:col-span-2 pt-1 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#0867E8] shrink-0">
                        Texto na Tela:
                      </span>
                      <input
                        type="text"
                        value={scene.onScreenText}
                        onChange={(e) =>
                          handleUpdateScene(scene.id, { onScreenText: e.target.value })
                        }
                        className="flex-1 px-3 py-1.5 rounded-lg border border-[#E6EFFB] text-[12px] font-semibold text-[#0B1D52] bg-white outline-none focus:border-[#0867E8]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};
