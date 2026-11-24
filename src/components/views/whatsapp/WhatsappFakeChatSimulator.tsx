import * as React from 'react';
import {
  ArrowLeft,
  ArrowCounterClockwise,
  Check,
  CheckFat,
  DotsThreeVertical,
  PaperPlaneRight,
  Phone,
  Play,
  Smiley,
  VideoCamera,
} from '@phosphor-icons/react';
import type { WhatsappMessageFlow } from '../../../../shared/formula-ir/spreadsheet-intelligence.mjs';

export interface WhatsappFakeChatSimulatorProps {
  flow: WhatsappMessageFlow;
  storeName?: string;
  agentName?: string;
  onClose?: () => void;
  onApprove?: () => void;
  isApproved?: boolean;
}

export function WhatsappFakeChatSimulator({
  flow,
  storeName = 'Atendimento Oficial',
  agentName = 'Sofia IA',
  onClose,
  onApprove,
  isApproved = false,
}: WhatsappFakeChatSimulatorProps) {
  // Estado da timeline simulada: 0 = trigger cliente, 1 = digitando passo 1, 2 = resposta 1, 3 = digitando passo 2, 4 = resposta 2
  const [phase, setPhase] = React.useState<number>(0);
  const [isTyping, setIsTyping] = React.useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = React.useState<number>(1);

  const steps = flow.steps || [];

  React.useEffect(() => {
    let active = true;
    setPhase(0);
    setIsTyping(false);

    // Passo 0: Cliente envia pergunta imediatamente
    const baseDelay = 900 / speedMultiplier;
    const typingDelay = 1300 / speedMultiplier;

    const t1 = setTimeout(() => {
      if (!active) return;
      setIsTyping(true); // Sofia começa a digitar a resposta da etapa 01

      const t2 = setTimeout(() => {
        if (!active) return;
        setIsTyping(false);
        setPhase(1); // Exibe resposta 01

        if (steps.length > 1) {
          const t3 = setTimeout(() => {
            if (!active) return;
            setIsTyping(true); // Sofia digita a resposta da etapa 02

            const t4 = setTimeout(() => {
              if (!active) return;
              setIsTyping(false);
              setPhase(2); // Exibe resposta 02
            }, typingDelay);

            return () => clearTimeout(t4);
          }, baseDelay * 1.2);

          return () => clearTimeout(t3);
        }
      }, typingDelay);

      return () => clearTimeout(t2);
    }, baseDelay);

    return () => {
      active = false;
      clearTimeout(t1);
    };
  }, [flow.id, steps.length, speedMultiplier]);

  const restartSimulation = () => {
    setPhase(0);
    setIsTyping(false);
    // Dispara recálculo ao resetar
    const prev = speedMultiplier;
    setSpeedMultiplier(prev === 1 ? 1.001 : 1);
  };

  const showInstant = () => {
    setIsTyping(false);
    setPhase(steps.length);
  };

  return (
    <div
      data-testid="wpp-fake-chat-simulator"
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#EFEAE2] shadow-sm"
    >
      {/* Top Bar estilo WhatsApp */}
      <div className="flex items-center justify-between bg-[#075E54] px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar para edição do fluxo"
              className="rounded-full p-1 text-white/90 hover:bg-white/10"
            >
              <ArrowLeft className="size-4" weight="bold" />
            </button>
          ) : null}
          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 font-bold text-white shadow-xs">
            {storeName.charAt(0).toUpperCase()}
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border border-emerald-900 bg-emerald-400" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-xs font-semibold leading-tight text-white">{storeName}</h4>
            <p className="flex items-center gap-1 text-[11px] text-emerald-100">
              <span>{agentName}</span>
              <span>·</span>
              <span className="text-emerald-200">online</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-white/90">
          <button type="button" aria-label="Chamada de voz" className="hover:text-white">
            <Phone className="size-4" weight="regular" />
          </button>
          <button type="button" aria-label="Chamada de vídeo" className="hover:text-white">
            <VideoCamera className="size-4" weight="regular" />
          </button>
          <button type="button" aria-label="Mais opções" className="hover:text-white">
            <DotsThreeVertical className="size-4" weight="bold" />
          </button>
        </div>
      </div>

      {/* Área da Conversa Simulada com Papel de Parede */}
      <div
        className="flex min-h-[340px] flex-col justify-between p-4"
        style={{
          backgroundImage:
            'radial-gradient(#075e54 0.5px, transparent 0.5px), radial-gradient(#075e54 0.5px, #efeae2 0.5px)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 10px 10px',
          opacity: 0.98,
        }}
      >
        <div className="space-y-3">
          {/* Badge de Data */}
          <div className="flex justify-center">
            <span className="rounded-lg bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-600 shadow-2xs">
              Hoje · Simulação em tempo real
            </span>
          </div>

          {/* Balão 01: Mensagem do Cliente (Trigger) */}
          <div className="flex justify-end">
            <div
              data-testid="fake-chat-bubble-customer"
              className="relative max-w-[85%] rounded-2xl rounded-tr-xs bg-[#E7FFDB] dark:bg-[#064E3B] px-3.5 py-2.5 text-xs text-slate-900 dark:text-white shadow-2xs"
            >
              <p className="leading-relaxed">{flow.sampleCustomerTrigger}</p>
              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-600 dark:text-emerald-200/80">
                <span>14:30</span>
                <CheckFat className="size-3 text-sky-500" weight="fill" />
              </div>
            </div>
          </div>

          {/* Indicador de Digitação da Sofia */}
          {isTyping ? (
            <div
              data-testid="fake-chat-typing-indicator"
              className="flex items-center gap-2 rounded-2xl rounded-tl-xs bg-white px-3.5 py-2 text-xs text-slate-600 shadow-2xs w-fit"
            >
              <div className="flex items-center gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-emerald-600" style={{ animationDelay: '0ms' }} />
                <span className="size-1.5 animate-bounce rounded-full bg-emerald-600" style={{ animationDelay: '150ms' }} />
                <span className="size-1.5 animate-bounce rounded-full bg-emerald-600" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[11px] font-medium text-slate-500">{agentName} está digitando...</span>
            </div>
          ) : null}

          {/* Balão 02: Resposta 01 da Sofia */}
          {phase >= 1 && steps[0] ? (
            <div className="flex justify-start">
              <div
                data-testid="fake-chat-bubble-sofia-0"
                className="relative max-w-[88%] rounded-2xl rounded-tl-xs bg-white px-3.5 py-2.5 text-xs text-slate-900 shadow-2xs"
              >
                <div className="mb-1 flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                    {steps[0].label || 'Resposta imediata'}
                  </span>
                  <span className="rounded-sm bg-emerald-50 px-1 text-[9px] font-semibold text-emerald-800">
                    Sofia IA
                  </span>
                </div>
                <p className="whitespace-pre-line leading-relaxed text-slate-800">{steps[0].body}</p>
                <div className="mt-1 flex items-center justify-end text-[10px] text-slate-400">
                  <span>14:31</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Balão 03: Resposta 02 da Sofia (Follow-up / Pix / CTA) */}
          {phase >= 2 && steps[1] ? (
            <div className="flex justify-start">
              <div
                data-testid="fake-chat-bubble-sofia-1"
                className="relative max-w-[88%] rounded-2xl rounded-tl-xs bg-white px-3.5 py-2.5 text-xs text-slate-900 shadow-2xs"
              >
                <div className="mb-1 flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                    {steps[1].label || 'Complemento de Fechamento'}
                  </span>
                  <span className="rounded-sm bg-emerald-50 px-1 text-[9px] font-semibold text-emerald-800">
                    Sofia IA
                  </span>
                </div>
                <p className="whitespace-pre-line leading-relaxed text-slate-800">{steps[1].body}</p>
                <div className="mt-1 flex items-center justify-end text-[10px] text-slate-400">
                  <span>14:31</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Barra de Controles da Simulação */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2.5 shadow-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="fake-chat-restart-btn"
              onClick={restartSimulation}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowCounterClockwise className="size-3" weight="bold" />
              <span>Reiniciar</span>
            </button>
            <button
              type="button"
              data-testid="fake-chat-instant-btn"
              onClick={showInstant}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Play className="size-3" weight="bold" />
              <span>Ver Completo</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onApprove ? (
              <button
                type="button"
                data-testid="fake-chat-approve-flow-btn"
                onClick={onApprove}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-semibold transition-colors ${
                  isApproved
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                <Check className="size-3" weight="bold" />
                <span>{isApproved ? 'Fluxo Aprovado' : 'Aprovar Fluxo'}</span>
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
              >
                Voltar à Edição
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Input de mensagem desabilitado na simulação */}
      <div className="flex items-center gap-2 border-t border-slate-200 bg-[#F0F2F5] px-3 py-2 text-slate-400">
        <Smiley className="size-5" />
        <div className="flex-1 rounded-xl bg-white px-3 py-1.5 text-xs text-slate-400">
          Modo simulação automática ativa
        </div>
        <PaperPlaneRight className="size-5 text-emerald-600" weight="fill" />
      </div>
    </div>
  );
}
