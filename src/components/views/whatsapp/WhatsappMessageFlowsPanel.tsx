import * as React from 'react';
import {
  ChatCircleDots,
  Check,
  DeviceMobile,
  Eye,
  PencilSimple,
  Plus,
  Sparkle,
  Trash,
  X,
} from '@phosphor-icons/react';
import { authenticatedFetch } from '@/services/supabase-client';
import { useToast } from '@/components/ui';
import type { BusinessProfile } from '@/schemas/profile.schema';
import {
  buildWorkspaceWhatsappFlows,
  type WhatsappMessageFlow,
} from '../../../../shared/formula-ir/spreadsheet-intelligence.mjs';
import { WhatsappFakeChatSimulator } from './WhatsappFakeChatSimulator';
import { WhatsappFlowCenterModal } from './WhatsappFlowCenterModal';

export interface WhatsappMessageFlowsPanelProps {
  profile?: Partial<BusinessProfile> | null;
  owner?: string;
  compact?: boolean;
  defaultSimulate?: boolean;
}

export function WhatsappMessageFlowsPanel({
  profile,
  owner,
  compact = false,
  defaultSimulate = false,
}: WhatsappMessageFlowsPanelProps) {
  const { showToast } = useToast();
  const [flows, setFlows] = React.useState<WhatsappMessageFlow[]>(() =>
    buildWorkspaceWhatsappFlows({ profile: (profile || {}) as Record<string, unknown>, focus: 'geral' }),
  );
  const [selectedId, setSelectedId] = React.useState<string>(() => flows[0]?.id || '');
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [focusMode, setFocusMode] = React.useState<'objecao' | 'upsell'>('objecao');
  const [editingStepIdx, setEditingStepIdx] = React.useState<number | null>(null);
  const [draftStepText, setDraftStepText] = React.useState('');
  const [showFakeChat, setShowFakeChat] = React.useState<boolean>(defaultSimulate);
  const [centerModalOpen, setCenterModalOpen] = React.useState<boolean>(false);

  // Estado para criação de nova mensagem molde personalizada
  const [creatingCustom, setCreatingCustom] = React.useState<boolean>(false);
  const [customTitle, setCustomTitle] = React.useState('');
  const [customTrigger, setCustomTrigger] = React.useState('');
  const [customStep1, setCustomStep1] = React.useState('');
  const [customStep2, setCustomStep2] = React.useState('');

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    authenticatedFetch('/api/whatsapp/ai/message-flows', { method: 'GET' }, owner)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.ok && Array.isArray(data.flows) && data.flows.length > 0) {
          setFlows(data.flows);
          setSelectedId((prev) =>
            data.flows.some((f: WhatsappMessageFlow) => f.id === prev) ? prev : data.flows[0].id,
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [owner]);

  const activeFlow = flows.find((f) => f.id === selectedId) || flows[0] || null;
  const approvedCount = flows.filter((f) => f.status === 'approved').length;
  const storeName = profile?.business?.name || 'Nossa Loja';
  const agentName = profile?.agent?.name || 'Sofia';

  const dispatchFlowAction = async (
    flowId: string,
    action: 'approve' | 'toggle' | 'edit' | 'delete',
    extra?: { enabledInBot?: boolean; steps?: WhatsappMessageFlow['steps'] },
  ) => {
    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/message-flows/action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flowId, action, ...extra }),
        },
        owner,
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.flows)) {
        setFlows(data.flows);
        if (action === 'delete' && selectedId === flowId) {
          setSelectedId(data.flows[0]?.id || '');
        }
      } else {
        throw new Error('offline');
      }
    } catch {
      setFlows((prev) => {
        if (action === 'delete') {
          const next = prev.filter((f) => f.id !== flowId);
          if (selectedId === flowId) setSelectedId(next[0]?.id || '');
          return next;
        }
        return prev.map((f) => {
          if (f.id !== flowId) return f;
          if (action === 'approve') return { ...f, status: 'approved', enabledInBot: true };
          if (action === 'toggle') return { ...f, enabledInBot: !f.enabledInBot };
          if (action === 'edit' && extra?.steps) return { ...f, status: 'approved', steps: extra.steps };
          return f;
        });
      });
    }

    if (action === 'approve') {
      showToast({ type: 'success', message: 'Fluxo aprovado para atendimento.' });
    } else if (action === 'edit') {
      showToast({ type: 'success', message: 'Etapa atualizada e aprovada.' });
      setEditingStepIdx(null);
    } else if (action === 'delete') {
      showToast({ type: 'success', message: 'Fluxo removido.' });
    }
  };

  const handleGenerateMore = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/message-flows/generate-more',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ focus: focusMode }),
        },
        owner,
      );
      const data = await res.json().catch(() => null);
      if (res.status === 402) {
        showToast({
          type: 'amber',
          message: String(data?.error || 'Saldo insuficiente para gerar mais mensagens.'),
        });
        return;
      }
      if (res.ok && data?.ok && Array.isArray(data.flows)) {
        setFlows(data.flows);
        const newest = data.flows[data.flows.length - 1];
        if (newest?.id) setSelectedId(newest.id);
        showToast({
          type: 'success',
          message: `${data.addedCount || 2} novos fluxos adicionados para revisão.`,
        });
        return;
      }
      throw new Error('fallback');
    } catch {
      const fresh = buildWorkspaceWhatsappFlows({
        profile: (profile || {}) as Record<string, unknown>,
        focus: focusMode,
        existingTitles: flows.map((f) => f.title),
      }).slice(0, 2);
      if (fresh.length > 0) {
        setFlows((prev) => [...prev, ...fresh]);
        setSelectedId(fresh[0].id);
        showToast({ type: 'success', message: `${fresh.length} novos fluxos sugeridos.` });
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveCustomFlow = async () => {
    if (!customTitle.trim() || !customTrigger.trim() || !customStep1.trim()) {
      showToast({ type: 'amber', message: 'Preencha o título, a dúvida do cliente e a resposta.' });
      return;
    }
    const newFlowId = `custom-flow-${Date.now()}`;
    const newSteps: WhatsappMessageFlow['steps'] = [
      { stepOrder: 1, role: 'assistant', label: 'Resposta Principal', body: customStep1.trim() },
    ];
    if (customStep2.trim()) {
      newSteps.push({ stepOrder: 2, role: 'assistant', label: 'Complemento de Fechamento', body: customStep2.trim() });
    }
    const newFlow: WhatsappMessageFlow = {
      id: newFlowId,
      title: customTitle.trim(),
      intentTag: 'custom_template',
      status: 'approved',
      enabledInBot: true,
      sampleCustomerTrigger: customTrigger.trim(),
      steps: newSteps,
    };

    setFlows((prev) => [newFlow, ...prev]);
    setSelectedId(newFlowId);
    setCreatingCustom(false);
    setCustomTitle('');
    setCustomTrigger('');
    setCustomStep1('');
    setCustomStep2('');

    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/message-flows/action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', flow: newFlow }),
        },
        owner,
      );
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (Array.isArray(data?.flows)) setFlows(data.flows);
      }
    } catch {
      // Preserva em memória caso offline momentâneo
    }
    showToast({ type: 'success', message: 'Nova mensagem molde salva e ativada!' });
  };

  return (
    <div
      data-testid="whatsapp-message-flows-panel"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xs"
    >
      {/* Header minimalista branco */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-950">Fluxos-Molde de Conversa WhatsApp</h3>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
              Sofia IA
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {approvedCount} de {flows.length} fluxos aprovados para o atendimento automático
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="open-center-flow-modal-btn"
            onClick={() => setCenterModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-950 shadow-2xs transition-all hover:bg-emerald-100 hover:border-emerald-400"
          >
            <DeviceMobile className="size-4 text-emerald-700" weight="bold" />
            <span>Simulador no Meio da Tela</span>
          </button>

          <button
            type="button"
            data-testid="wpp-create-custom-flow-btn"
            onClick={() => setCreatingCustom(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <Plus className="size-3.5" weight="bold" />
            <span>Escrever mensagem molde</span>
          </button>

          <select
            aria-label="Foco das próximas mensagens"
            value={focusMode}
            onChange={(e) => setFocusMode(e.target.value as 'objecao' | 'upsell')}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-slate-950 focus:outline-none"
          >
            <option value="objecao">Dúvidas de preço e prazo</option>
            <option value="upsell">Sugestão de combo e complementos</option>
          </select>

          <button
            type="button"
            data-testid="wpp-generate-more-flows-btn"
            disabled={generating}
            onClick={() => void handleGenerateMore()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            <Sparkle className="size-3.5" weight="fill" />
            <span>{generating ? 'Gerando...' : 'Gerar mais mensagens'}</span>
          </button>
        </div>
      </div>

      {/* Modal / Formulário inline de criação de mensagem molde */}
      {creatingCustom ? (
        <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-950">Criar Nova Mensagem Molde</h4>
            <button
              type="button"
              onClick={() => setCreatingCustom(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Título do fluxo
              </label>
              <input
                type="text"
                placeholder="Ex: Política de Troca ou Reserva de Horário"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Dúvida ou frase típica do cliente (gatilho)
              </label>
              <input
                type="text"
                placeholder="Ex: Vocês aceitam encomenda para o próximo sábado?"
                value={customTrigger}
                onChange={(e) => setCustomTrigger(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Resposta da Sofia (Etapa 1)
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Sim! Para sábado reservamos com até 24h de antecedência. Qual item do cardápio você prefere?"
                value={customStep1}
                onChange={(e) => setCustomStep1(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Complemento de Fechamento / Pix (Etapa 2 - Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Pagando no Pix você garante 5% de desconto imediato. Posso gerar sua chave?"
                value={customStep2}
                onChange={(e) => setCustomStep2(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCreatingCustom(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="wpp-save-custom-flow-btn"
                onClick={handleSaveCustomFlow}
                className="rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Salvar Mensagem Molde
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Coluna Esquerda (Lista limpa) + Coluna Direita (1 Fluxo por estado / Conversa Fake) */}
      <div className={compact ? 'mt-4 flex flex-col gap-3' : 'mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12'}>
        <div className={compact ? 'space-y-1.5' : 'space-y-1.5 lg:col-span-5'}>
          {loading ? (
            <div className="rounded-xl border border-slate-100 p-4 text-xs text-slate-400">
              Carregando fluxos...
            </div>
          ) : (
            flows.map((flow) => {
              const selected = activeFlow?.id === flow.id;
              const isApproved = flow.status === 'approved';
              return (
                <div
                  key={flow.id}
                  data-testid={`wpp-flow-item-${flow.id}`}
                  className={`flex items-start justify-between gap-2 rounded-xl border p-3 transition-all ${
                    selected
                      ? 'border-slate-950 bg-slate-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(flow.id);
                      setEditingStepIdx(null);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <strong className="block truncate text-xs font-semibold text-slate-950">
                      {flow.title}
                    </strong>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span
                        className={`size-1.5 rounded-full ${
                          isApproved ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                      <span>{isApproved ? 'Aprovado' : 'Aguardando aprovação'}</span>
                    </span>
                  </button>

                  <label className="mt-0.5 flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={flow.enabledInBot}
                      onChange={() => void dispatchFlowAction(flow.id, 'toggle')}
                      aria-label={`Ativar ${flow.title}`}
                      className="accent-slate-950"
                    />
                    <span>Ativo</span>
                  </label>
                </div>
              );
            })
          )}
        </div>

        {/* Estado focado: 1 fluxo por vez OU Simulador de Conversa Fake */}
        <div className={compact ? '' : 'lg:col-span-7'}>
          {activeFlow ? (
            showFakeChat ? (
              <WhatsappFakeChatSimulator
                flow={activeFlow}
                storeName={storeName}
                agentName={agentName}
                isApproved={activeFlow.status === 'approved'}
                onApprove={() => void dispatchFlowAction(activeFlow.id, 'approve')}
                onClose={() => setShowFakeChat(false)}
              />
            ) : (
              <div
                data-testid="wpp-flow-detail-card"
                className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/40 p-4"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-medium text-slate-500">Quando o cliente perguntar</span>
                      <p className="mt-0.5 text-xs font-semibold text-slate-900">
                        “{activeFlow.sampleCustomerTrigger}”
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="wpp-simulate-fake-chat-btn"
                        onClick={() => setShowFakeChat(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50"
                      >
                        <ChatCircleDots className="size-3.5 text-emerald-600" weight="bold" />
                        <span>Ver no Card</span>
                      </button>
                      <button
                        type="button"
                        data-testid="wpp-open-center-modal-btn"
                        onClick={() => setCenterModalOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-950 shadow-2xs hover:bg-emerald-100"
                      >
                        <DeviceMobile className="size-3.5 text-emerald-700" weight="bold" />
                        <span>Modal Central</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {activeFlow.steps.map((step, sIdx) => {
                      const isEditing = editingStepIdx === sIdx;
                      return (
                        <div
                          key={`${activeFlow.id}-step-${sIdx}`}
                          className="rounded-xl border border-slate-200 bg-white p-3.5"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              Etapa 0{sIdx + 1} · {step.label}
                            </span>
                            {!isEditing ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStepIdx(sIdx);
                                  setDraftStepText(step.body);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-950"
                              >
                                <PencilSimple className="size-3" weight="regular" />
                                <span>Ajustar</span>
                              </button>
                            ) : null}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                rows={3}
                                value={draftStepText}
                                onChange={(e) => setDraftStepText(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-950 focus:border-slate-950 focus:outline-none"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingStepIdx(null)}
                                  className="rounded-lg border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextSteps = activeFlow.steps.map((st, idx) =>
                                      idx === sIdx ? { ...st, body: draftStepText } : st,
                                    );
                                    void dispatchFlowAction(activeFlow.id, 'edit', { steps: nextSteps });
                                  }}
                                  className="rounded-lg bg-slate-950 px-3 py-1 text-[11px] font-semibold text-white"
                                >
                                  Salvar e aprovar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs leading-relaxed text-slate-700">{step.body}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    data-testid="wpp-flow-delete-btn"
                    onClick={() => void dispatchFlowAction(activeFlow.id, 'delete')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600"
                  >
                    <Trash className="size-3.5" weight="regular" />
                    <span>Excluir</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFakeChat(true)}
                      className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="size-3.5 text-slate-500" />
                      <span>Testar conversa</span>
                    </button>

                    <button
                      type="button"
                      data-testid="wpp-flow-approve-btn"
                      onClick={() => void dispatchFlowAction(activeFlow.id, 'approve')}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold transition-colors ${
                        activeFlow.status === 'approved'
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'bg-slate-950 text-white hover:bg-slate-800'
                      }`}
                    >
                      <Check className="size-3.5" weight="bold" />
                      <span>{activeFlow.status === 'approved' ? 'Fluxo aprovado' : 'Aprovar fluxo'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
              Selecione um fluxo à esquerda ou clique em "Gerar mais mensagens".
            </div>
          )}
        </div>
      </div>

      <WhatsappFlowCenterModal
        isOpen={centerModalOpen}
        onClose={() => setCenterModalOpen(false)}
        profile={profile}
        owner={owner}
        initialFlowId={activeFlow?.id}
      />
    </div>
  );
}
