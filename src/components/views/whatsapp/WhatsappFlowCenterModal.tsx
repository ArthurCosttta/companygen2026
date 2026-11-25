import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChatCircleDots,
  CheckCircle,
  DeviceMobile,
  FlowArrow,
  PencilSimple,
  Play,
  Plus,
  Sparkle,
  X,
} from '@phosphor-icons/react';
import type { BusinessProfile } from '@/schemas/profile.schema';
import {
  buildWorkspaceWhatsappFlows,
  type WhatsappMessageFlow,
} from '../../../../shared/formula-ir/spreadsheet-intelligence.mjs';
import { WhatsappFakeChatSimulator } from './WhatsappFakeChatSimulator';
import { authenticatedFetch } from '@/services/supabase-client';
import { useToast } from '@/components/ui';

export interface WhatsappFlowCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: Partial<BusinessProfile> | null;
  owner?: string;
  initialFlowId?: string;
}

export function WhatsappFlowCenterModal({
  isOpen,
  onClose,
  profile,
  owner,
  initialFlowId,
}: WhatsappFlowCenterModalProps) {
  const { showToast } = useToast();
  const [flows, setFlows] = React.useState<WhatsappMessageFlow[]>(() =>
    buildWorkspaceWhatsappFlows({ profile: (profile || {}) as Record<string, unknown>, focus: 'geral' }),
  );
  const [selectedId, setSelectedId] = React.useState<string>(() => initialFlowId || flows[0]?.id || '');
  const [activeTab, setActiveTab] = React.useState<'simulator' | 'map' | 'create'>('simulator');
  const [editingStepIdx, setEditingStepIdx] = React.useState<{ flowId: string; stepIdx: number } | null>(null);
  const [draftStepText, setDraftStepText] = React.useState('');

  // Form para nova regra ("Se o cliente mandar...")
  const [newTitle, setNewTitle] = React.useState('');
  const [newTrigger, setNewTrigger] = React.useState('');
  const [newStep1, setNewStep1] = React.useState('');
  const [newStep2, setNewStep2] = React.useState('');

  const storeName = profile?.business?.name || 'Sua Loja';
  const agentName = profile?.agent?.name || 'Sofia';

  React.useEffect(() => {
    if (!isOpen) return;
    let active = true;
    authenticatedFetch('/api/whatsapp/ai/message-flows', { method: 'GET' }, owner)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.ok && Array.isArray(data.flows) && data.flows.length > 0) {
          setFlows(data.flows);
          setSelectedId((prev) =>
            prev && data.flows.some((f: WhatsappMessageFlow) => f.id === prev) ? prev : data.flows[0].id,
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, owner]);

  if (!isOpen) return null;

  const activeFlow = flows.find((f) => f.id === selectedId) || flows[0] || null;

  const handleApprove = async (flowId: string) => {
    try {
      await authenticatedFetch(
        '/api/whatsapp/ai/message-flows/action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flowId, action: 'approve' }),
        },
        owner,
      );
    } catch {}
    setFlows((prev) =>
      prev.map((f) => (f.id === flowId ? { ...f, status: 'approved', enabledInBot: true } : f)),
    );
    showToast({ type: 'success', message: 'Fluxo aprovado com sucesso!' });
  };

  const handleToggle = async (flowId: string) => {
    try {
      await authenticatedFetch(
        '/api/whatsapp/ai/message-flows/action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flowId, action: 'toggle' }),
        },
        owner,
      );
    } catch {}
    setFlows((prev) =>
      prev.map((f) => (f.id === flowId ? { ...f, enabledInBot: !f.enabledInBot } : f)),
    );
  };

  const handleSaveNewRule = () => {
    if (!newTitle.trim() || !newTrigger.trim() || !newStep1.trim()) {
      showToast({ type: 'amber', message: 'Preencha a frase do cliente e a resposta da Sofia.' });
      return;
    }
    const newId = `rule-${Date.now()}`;
    const newRule: WhatsappMessageFlow = {
      id: newId,
      title: newTitle.trim(),
      intentTag: 'custom_rule',
      status: 'approved',
      enabledInBot: true,
      sampleCustomerTrigger: newTrigger.trim(),
      steps: [
        { stepOrder: 1, role: 'assistant' as const, label: 'Resposta Principal', body: newStep1.trim() },
        ...(newStep2.trim()
          ? [{ stepOrder: 2, role: 'assistant' as const, label: 'Fechamento / Pix', body: newStep2.trim() }]
          : []),
      ],
    };
    setFlows((prev) => [newRule, ...prev]);
    setSelectedId(newId);
    setActiveTab('simulator');
    setNewTitle('');
    setNewTrigger('');
    setNewStep1('');
    setNewStep2('');
    void authenticatedFetch(
      '/api/whatsapp/ai/message-flows/action',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', flow: newRule }),
      },
      owner,
    ).catch(() => {});
    showToast({ type: 'success', message: 'Nova regra de resposta adicionada e salva!' });
  };

  const handleSaveStepEdit = (flowId: string, stepIdx: number) => {
    setFlows((prev) =>
      prev.map((f) => {
        if (f.id !== flowId) return f;
        const nextSteps = f.steps.map((st, idx) => (idx === stepIdx ? { ...st, body: draftStepText } : st));
        return { ...f, steps: nextSteps, status: 'approved' };
      }),
    );
    setEditingStepIdx(null);
    showToast({ type: 'success', message: 'Resposta atualizada!' });
  };

  return (
    <AnimatePresence>
      <div
        data-testid="whatsapp-flow-center-modal"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
      >
        {/* Backdrop suave */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/65"
        />

        {/* Janela Central do Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        >
          {/* Header do Modal com Seletor de Modo */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-2xs">
                <ChatCircleDots className="size-5" weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-950">
                    Fluxo & Simulação WhatsApp
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    <Sparkle className="size-3 text-emerald-600" weight="fill" />
                    <span>{storeName}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Veja as mensagens acontecendo ao vivo e entenda exatamente o que o cliente recebe.
                </p>
              </div>
            </div>

            {/* Abas Superiores no Centro */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
              <button
                type="button"
                data-testid="tab-center-simulator"
                onClick={() => setActiveTab('simulator')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                  activeTab === 'simulator'
                    ? 'bg-white text-slate-950 shadow-xs font-bold'
                    : 'hover:text-slate-900'
                }`}
              >
                <DeviceMobile className="size-3.5" weight="bold" />
                <span>Simulação no Celular</span>
              </button>
              <button
                type="button"
                data-testid="tab-center-map"
                onClick={() => setActiveTab('map')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                  activeTab === 'map'
                    ? 'bg-white text-slate-950 shadow-xs font-bold'
                    : 'hover:text-slate-900'
                }`}
              >
                <FlowArrow className="size-3.5" weight="bold" />
                <span>Mapa de Regras ("Se mandar...")</span>
              </button>
              <button
                type="button"
                data-testid="tab-center-create"
                onClick={() => setActiveTab('create')}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition-all ${
                  activeTab === 'create'
                    ? 'bg-white text-slate-950 shadow-xs font-bold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Plus className="size-3.5" weight="bold" />
                <span>Nova Regra</span>
              </button>
            </div>

            {/* Botão Fechar */}
            <button
              type="button"
              data-testid="close-center-flow-modal-btn"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar modal"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Corpo do Modal de acordo com a Aba Ativa */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* ABA 1: SIMULADOR NO CELULAR */}
            {activeTab === 'simulator' ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                {/* Seletor de qual fluxo simular (Coluna Esquerda) */}
                <div className="space-y-2 md:col-span-5">
                  <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Escolha qual pergunta testar
                  </span>
                  <div className="space-y-1.5">
                    {flows.map((flow) => {
                      const isSelected = (activeFlow?.id === flow.id);
                      return (
                        <button
                          key={flow.id}
                          type="button"
                          data-testid={`center-flow-select-${flow.id}`}
                          onClick={() => setSelectedId(flow.id)}
                          className={`flex w-full flex-col items-start rounded-2xl border p-3 text-left transition-all ${
                            isSelected
                              ? 'border-slate-950 bg-slate-900 text-white shadow-xs'
                              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-950'}`}>
                            {flow.title}
                          </span>
                          <span
                            className={`mt-1 line-clamp-1 text-[11px] ${
                              isSelected ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            “{flow.sampleCustomerTrigger}”
                          </span>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                                flow.status === 'approved'
                                  ? isSelected
                                    ? 'bg-emerald-400/20 text-emerald-300'
                                    : 'bg-emerald-50 text-emerald-800'
                                  : isSelected
                                    ? 'bg-slate-700 text-slate-300'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {flow.status === 'approved' ? '✓ Aprovado' : 'Aguardando'}
                            </span>
                            <span
                              className={`text-[10px] ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}
                            >
                              {flow.steps.length} mensagens
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Simulador Interativo WhatsApp no Meio (Coluna Direita) */}
                <div className="md:col-span-7">
                  {activeFlow ? (
                    <WhatsappFakeChatSimulator
                      flow={activeFlow}
                      storeName={storeName}
                      agentName={agentName}
                      isApproved={activeFlow.status === 'approved'}
                      onApprove={() => void handleApprove(activeFlow.id)}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ABA 2: MAPA DE REGRAS ("SE MANDAR TAL...") */}
            {activeTab === 'map' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <p className="text-xs text-slate-500">
                    Regras ativas no robô: quando o cliente perguntar a frase à esquerda, a Sofia responde o texto à direita.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Plus className="size-3.5" weight="bold" />
                    <span>Adicionar nova regra</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {flows.map((flow) => {
                    return (
                      <div
                        key={flow.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-all hover:border-slate-300"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            <h4 className="text-xs font-bold text-slate-950">{flow.title}</h4>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(flow.id);
                                setActiveTab('simulator');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Play className="size-3 text-emerald-600" weight="fill" />
                              <span>Simular no celular</span>
                            </button>

                            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
                              <input
                                type="checkbox"
                                checked={flow.enabledInBot}
                                onChange={() => void handleToggle(flow.id)}
                                className="accent-slate-950"
                              />
                              <span>Ativo no Bot</span>
                            </label>
                          </div>
                        </div>

                        {/* Bloco Ilustrado: Se o cliente mandar -> Sofia responde */}
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-stretch">
                          {/* Entrada: Gatilho do Cliente */}
                          <div className="rounded-xl border border-emerald-200 dark:border-emerald-700/50 bg-[#E7FFDB]/70 dark:bg-[#064E3B] p-3 sm:col-span-5">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                              🟢 Se o cliente mandar:
                            </span>
                            <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">
                              “{flow.sampleCustomerTrigger}”
                            </p>
                          </div>

                          {/* Seta Visual */}
                          <div className="hidden items-center justify-center sm:col-span-1 sm:flex">
                            <FlowArrow className="size-5 text-slate-400" />
                          </div>

                          {/* Saída: Respostas da Sofia */}
                          <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-6">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">
                              🤖 Sofia IA responde:
                            </span>
                            {flow.steps.map((st, idx) => {
                              const isEditing =
                                editingStepIdx?.flowId === flow.id && editingStepIdx?.stepIdx === idx;
                              return (
                                <div key={idx} className="rounded-lg border border-slate-200 bg-white p-2">
                                  <div className="mb-1 flex items-center justify-between">
                                    <span className="text-[10px] font-semibold text-slate-500">
                                      Passo 0{idx + 1} · {st.label}
                                    </span>
                                    {!isEditing ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingStepIdx({ flowId: flow.id, stepIdx: idx });
                                          setDraftStepText(st.body);
                                        }}
                                        className="text-slate-400 hover:text-slate-900"
                                      >
                                        <PencilSimple className="size-3" />
                                      </button>
                                    ) : null}
                                  </div>

                                  {isEditing ? (
                                    <div className="space-y-1.5">
                                      <textarea
                                        rows={2}
                                        value={draftStepText}
                                        onChange={(e) => setDraftStepText(e.target.value)}
                                        className="w-full rounded border border-slate-300 p-1 text-xs focus:border-slate-950 focus:outline-none"
                                      />
                                      <div className="flex justify-end gap-1">
                                        <button
                                          type="button"
                                          onClick={() => setEditingStepIdx(null)}
                                          className="px-2 py-0.5 text-[10px] text-slate-500"
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveStepEdit(flow.id, idx)}
                                          className="rounded bg-slate-950 px-2 py-0.5 text-[10px] font-semibold text-white"
                                        >
                                          Salvar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-700">{st.body}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* ABA 3: CRIAR NOVA REGRA ("SE MANDAR TAL...") */}
            {activeTab === 'create' ? (
              <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
                <div>
                  <h4 className="text-sm font-bold text-slate-950">Criar Nova Regra de Resposta Automática</h4>
                  <p className="text-xs text-slate-500">
                    Defina o que o cliente pergunta e exatamente como a Sofia deve responder no WhatsApp.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Nome da Regra (para identificação interna)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Entrega aos Sábados ou Reserva de Mesa"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      🟢 Se o cliente mandar algo parecido com (Gatilho):
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Vocês entregam no fim de semana ou aceitam encomenda?"
                      value={newTrigger}
                      onChange={(e) => setNewTrigger(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      🤖 Sofia deve responder (Passo 1):
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Ex: Sim! Atendemos aos sábados e domingos das 09h às 15h. Nossos produtos são feitos na hora com ingredientes frescos."
                      value={newStep1}
                      onChange={(e) => setNewStep1(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      ⚡ Complemento / Fechamento Pix (Passo 2 - Opcional):
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Ex: Pagando pelo Pix você ganha 5% de desconto imediato. Quer que eu separe o seu pedido agora?"
                      value={newStep2}
                      onChange={(e) => setNewStep2(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('simulator')}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      data-testid="save-new-center-rule-btn"
                      onClick={handleSaveNewRule}
                      className="rounded-xl bg-slate-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
                    >
                      Salvar Regra e Simular
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer do Modal */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle className="size-4 text-emerald-600" weight="fill" />
              <span>Sofia IA sincronizada com os produtos e preços cadastrados</span>
            </div>

            <button
              type="button"
              data-testid="center-flow-done-btn"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-xl bg-slate-950 px-5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
            >
              Concluir e Voltar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
