import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { callGlm53Json } from './storefront-molde-fs.mjs';
import { getCreditBalance, debitCredits, refundCredits } from './access-and-checkout.mjs';
import { recalculateOrderTotals } from './sync-engine.mjs';

function cleanStr(v, max = 200) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function handleGlobalAiRoutes(req, res, ctx) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/api/ai/global-command') return false;
  if (req.method !== 'POST') throw new ctx.ApiError(405, 'Método indisponível.');

  const { user, directory, readJson, send, ApiError, loadProfileState, saveProfileState, readJsonFile, atomicWriteJson } = ctx;
  const body = await readJson(req, 2 * 1024 * 1024);
  const prompt = cleanStr(body?.prompt, 1200);
  const activeTab = cleanStr(body?.activeTab || 'store', 40);
  const attachments = Array.isArray(body?.attachments)
    ? body.attachments.slice(0, 4).map((a) => ({
        name: cleanStr(a?.name || 'anexo', 80),
        textSnippet: cleanStr(a?.textSnippet || '', 1200),
      }))
    : [];
  if (!prompt && attachments.length === 0) throw new ApiError(400, 'Digite o comando ou dúvida para a IA.');

  const snap = await loadProfileState(user, directory);
  const profile = snap?.current?.data || {};
  const ordersPath = path.join(directory, 'orders.json');
  const existingOrders = await readJsonFile(ordersPath, []);
  const catalogSummary = (profile?.catalog?.products || []).slice(0, 15).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    priceCents: p.priceCents,
    stockQty: p.stockQty ?? p.stock ?? 0,
  }));

  const glm = await callGlm53Json({
    systemPrompt: `Você é a IA Unificada do sistema CompanyGen atuando em TODAS as telas (onboarding, Minha Loja, Pedidos, WhatsApp, Ajustes, Vitrine).
Responda APENAS JSON válido em PT-BR com:
{
  "assistantMessage": "resposta clara e curta do que você fez ou vai orientar",
  "costCategory": "free_navigation_or_help" | "ai_mutation",
  "actions": [
    // Escolha 1 ou mais ações executáveis em lote:
    // {"type":"fill_onboarding","businessName":"...","description":"...","goalText":"...","address":"...","whatsapp":"...","pixKey":"...","products":[{"name":"...","category":"...","priceCents":4990}]}
    // {"type":"create_order","customerName":"...","customerPhone":"...","paymentMethod":"pix|cartao|dinheiro","notes":"...","items":[{"name":"...","qty":1,"unitPriceCents":4990}]}
    // {"type":"delete_all_orders","filter":"all|simulations"}
    // {"type":"create_whatsapp_flows","flows":[{"title":"...","triggerKeywords":["palavra"],"replyTemplate":"texto com {produto} e {preco}"}]} // suporta até 25 fluxos personalizados por vez!
    // {"type":"upsert_catalog_item","name":"...","category":"...","priceCents":4990,"stockQty":10,"description":"..."}
    // {"type":"update_store_settings","name":"...","address":"...","hours":"...","pixKey":"..."}
    // {"type":"navigate_tab","tab":"store|whatsapp|dashboard|settings"}
  ]
}
Regras: Preços sempre em centavos inteiros (R$ 49,90 = 4990). Se o usuário pedir para criar 20 mensagens personalizadas ou excluir todos os pedidos, emita diretamente a ação correspondente sem recusar.`,
    userPrompt: JSON.stringify({
      activeTab,
      storeName: profile?.business?.name || '',
      segment: profile?.business?.segment || '',
      address: profile?.business?.address || '',
      whatsapp: profile?.whatsapp?.phoneE164 || '',
      pixKey: profile?.payment?.pixKey || '',
      catalogCount: catalogSummary.length,
      catalogSample: catalogSummary,
      ordersCount: Array.isArray(existingOrders) ? existingOrders.length : 0,
      attachments,
      userCommand: prompt || 'Analise o arquivo anexo e sugira ou execute a melhor ação.',
    }),
    maxTokens: 2200,
    timeoutMs: 32000,
  });

  if (!glm.ok || !glm.data || typeof glm.data !== 'object') {
    throw new ApiError(502, 'A IA Global não respondeu a tempo. Nenhum crédito foi cobrado (0 cr).');
  }

  const actions = Array.isArray(glm.data.actions) ? glm.data.actions.slice(0, 12) : [];
  const mutatesPersistedData = actions.some((a) =>
    ['create_order', 'delete_all_orders', 'create_whatsapp_flows', 'upsert_catalog_item', 'update_store_settings'].includes(String(a?.type || '')),
  );
  const debitAmount = mutatesPersistedData ? 0.5 : 0;

  let debitRef = null;
  let balanceAfter = undefined;
  if (debitAmount > 0) {
    const bal = await getCreditBalance({ user, bearer: user?.bearer, directory, readJsonFile });
    if (bal < debitAmount) {
      return send(res, 402, {
        ok: false,
        status: 402,
        error: 'CREDITS_INSUFFICIENT',
        message: `Saldo insuficiente (${bal} cr disponíveis, necessário ${debitAmount} cr).`,
        balance: bal,
        required: debitAmount,
      });
    }
    const debited = await debitCredits({
      user,
      bearer: user?.bearer,
      directory,
      action: 'patch_micro',
      amount: debitAmount,
      metadata: { source: 'global_ai_agent', prompt: prompt.slice(0, 80) },
      readJsonFile,
      atomicWriteJson,
    });
    if (!debited?.ok) {
      return send(res, 402, { ok: false, error: debited?.error || 'CREDITS_INSUFFICIENT', balance: bal, required: debitAmount });
    }
    debitRef = debited.entry?.id || null;
    balanceAfter = debited.balanceAfter;
  }

  const clientEvents = [];
  const stepsExecuted = [];
  let profileUpdated = false;
  let ordersUpdated = false;

  try {
    let nextProfile = JSON.parse(JSON.stringify(profile));
    let ordersList = Array.isArray(existingOrders) ? [...existingOrders] : [];

    for (const act of actions) {
      const t = String(act?.type || '');
      if (t === 'delete_all_orders') {
        const onlySim = String(act.filter || '') === 'simulations';
        const beforeLen = ordersList.length;
        ordersList = onlySim
          ? ordersList.filter((o) => !o?.isSimulation && !String(o?.order_ref || '').startsWith('SIM-'))
          : [];
        ordersUpdated = true;
        stepsExecuted.push(`Removidos ${beforeLen - ordersList.length} pedido(s)`);
      } else if (t === 'create_whatsapp_flows') {
        const incoming = Array.isArray(act.flows) ? act.flows.slice(0, 25) : [];
        if (incoming.length > 0) {
          nextProfile.whatsapp = nextProfile.whatsapp || {};
          const prevFlows = Array.isArray(nextProfile.whatsapp.customFlows) ? nextProfile.whatsapp.customFlows : [];
          const newFlows = incoming.map((fl, idx) => ({
            id: `flow_ai_${Date.now().toString(36)}_${idx}`,
            title: cleanStr(fl?.title || `Fluxo IA ${idx + 1}`, 70),
            triggerKeywords: Array.isArray(fl?.triggerKeywords)
              ? fl.triggerKeywords.map((k) => cleanStr(k, 40)).filter(Boolean).slice(0, 8)
              : [cleanStr(fl?.title || 'catalogo', 30).toLowerCase()],
            replyTemplate: cleanStr(fl?.replyTemplate || fl?.message || 'Olá! Como posso ajudar com este item?', 600),
            active: true,
            createdBy: 'global_ai_agent',
            updatedAt: new Date().toISOString(),
          }));
          nextProfile.whatsapp.customFlows = [...newFlows, ...prevFlows].slice(0, 80);
          profileUpdated = true;
          stepsExecuted.push(`Criadas ${newFlows.length} mensagens personalizadas do WhatsApp`);
        }
      } else if (t === 'fill_onboarding') {
        const products = Array.isArray(act.products)
          ? act.products.slice(0, 12).map((p, idx) => ({
              id: `ai_onb_${Date.now().toString(36)}_${idx}`,
              sku: `IA-${String(idx + 1).padStart(3, '0')}`,
              name: cleanStr(p?.name || `Item ${idx + 1}`, 80),
              category: cleanStr(p?.category || 'Geral', 48),
              description: cleanStr(p?.description || '', 220),
              priceCents: Math.max(0, Math.round(Number(p?.priceCents || 0))),
              variation: 'Padrão',
              stock: 15,
              stockQty: 15,
              trackStock: true,
              active: true,
              approvedAsset: false,
              itemType: 'produto_fisico',
            }))
          : undefined;
        clientEvents.push({
          type: 'onboarding-fill',
          payload: {
            ...(act.businessName ? { businessName: cleanStr(act.businessName, 90) } : {}),
            ...(act.description ? { description: cleanStr(act.description, 420) } : {}),
            ...(act.goalText ? { goalText: cleanStr(act.goalText, 240) } : {}),
            ...(act.address ? { address: cleanStr(act.address, 220) } : {}),
            ...(act.whatsapp ? { whatsapp: cleanStr(act.whatsapp, 32) } : {}),
            ...(act.pixKey !== undefined ? { pixKey: cleanStr(act.pixKey, 120) } : {}),
            ...(products ? { products } : {}),
          },
        });
      } else if (t === 'navigate_tab') {
        const tab = cleanStr(act.tab, 24);
        if (['store', 'whatsapp', 'dashboard', 'settings'].includes(tab)) {
          clientEvents.push({ type: 'navigate-tab', tab });
        }
      } else if (t === 'upsert_catalog_item') {
        const itemName = cleanStr(act.name, 80);
        if (itemName) {
          nextProfile.catalog = nextProfile.catalog || { products: [] };
          const list = Array.isArray(nextProfile.catalog.products) ? [...nextProfile.catalog.products] : [];
          const existingIdx = list.findIndex((p) => String(p?.name || '').toLowerCase() === itemName.toLowerCase());
          const newProd = {
            id: existingIdx >= 0 ? list[existingIdx].id : `prod_${randomUUID().slice(0, 8)}`,
            sku: existingIdx >= 0 ? list[existingIdx].sku : `SKU-${Date.now().toString(36).toUpperCase().slice(-4)}`,
            name: itemName,
            category: cleanStr(act.category || list[existingIdx]?.category || 'Geral', 48),
            description: cleanStr(act.description || list[existingIdx]?.description || `${itemName} disponível pelo WhatsApp.`, 240),
            priceCents: Number.isFinite(Number(act.priceCents)) ? Math.max(0, Math.round(Number(act.priceCents))) : Number(list[existingIdx]?.priceCents || 0),
            variation: existingIdx >= 0 ? list[existingIdx].variation || 'Padrão' : 'Padrão',
            stock: Number.isFinite(Number(act.stockQty)) ? Math.max(0, Math.round(Number(act.stockQty))) : Number(list[existingIdx]?.stockQty ?? 10),
            stockQty: Number.isFinite(Number(act.stockQty)) ? Math.max(0, Math.round(Number(act.stockQty))) : Number(list[existingIdx]?.stockQty ?? 10),
            trackStock: true,
            active: true,
            imageUrl: existingIdx >= 0 ? list[existingIdx].imageUrl || '' : '',
            updatedAt: new Date().toISOString(),
          };
          if (existingIdx >= 0) list[existingIdx] = newProd;
          else list.unshift(newProd);
          nextProfile.catalog.products = list;
          profileUpdated = true;
        }
      } else if (t === 'update_store_settings') {
        nextProfile.business = nextProfile.business || {};
        nextProfile.payment = nextProfile.payment || {};
        if (act.name) nextProfile.business.name = cleanStr(act.name, 90);
        if (act.address) nextProfile.business.address = cleanStr(act.address, 220);
        if (act.hours) nextProfile.business.hours = cleanStr(act.hours, 120);
        if (act.pixKey !== undefined) nextProfile.payment.pixKey = cleanStr(act.pixKey, 120);
        profileUpdated = true;
      } else if (t === 'create_order') {
        const itemsIn = Array.isArray(act.items) && act.items.length > 0 ? act.items : [{ name: 'Pedido Assistido IA', qty: 1, unitPriceCents: 0 }];
        const mappedItems = itemsIn.map((it, idx) => {
          const matchedProd = (nextProfile?.catalog?.products || []).find(
            (p) => String(p?.name || '').toLowerCase() === cleanStr(it?.name, 80).toLowerCase(),
          );
          const unitPriceCents = Number.isFinite(Number(it?.unitPriceCents)) && Number(it.unitPriceCents) > 0
            ? Math.round(Number(it.unitPriceCents))
            : Number(matchedProd?.priceCents || 0);
          return {
            productId: matchedProd?.id || `ia_item_${idx}`,
            sku: matchedProd?.sku || `IA-${idx + 1}`,
            name: cleanStr(it?.name || matchedProd?.name || 'Item', 80),
            qty: Math.max(1, Math.round(Number(it?.qty || 1))),
            unitPriceCents,
          };
        });
        const subtotal = mappedItems.reduce((acc, it) => acc + it.qty * it.unitPriceCents, 0);
        const nowIso = new Date().toISOString();
        const ref = `CG-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const rawOrder = {
          id: randomUUID(),
          order_ref: ref,
          customer_name: cleanStr(act.customerName || 'Cliente Balcão', 80),
          customer_phone: cleanStr(act.customerPhone || '', 30),
          items: mappedItems,
          items_summary: mappedItems.map((i) => `${i.qty}x ${i.name}`).join(', '),
          total_cents: subtotal,
          payment_method: cleanStr(act.paymentMethod || 'pix', 24),
          status: 'pendente',
          source_channel: 'ai_global_copilot',
          notes: cleanStr(act.notes || prompt, 240),
          created_at: nowIso,
          updated_at: nowIso,
        };
        const finalized = typeof recalculateOrderTotals === 'function' ? recalculateOrderTotals(rawOrder, nextProfile) : rawOrder;
        ordersList.unshift(finalized);
        ordersUpdated = true;
      }
    }

    if (profileUpdated) {
      await saveProfileState(user, directory, nextProfile, { source: 'global_ai_agent' });
      clientEvents.push({ type: 'refresh-profile' });
    }
    if (ordersUpdated) {
      await atomicWriteJson(ordersPath, ordersList);
      clientEvents.push({ type: 'refresh-orders' });
    }
  } catch (err) {
    if (debitAmount > 0 && debitRef) {
      await refundCredits({
        user,
        directory,
        action: 'patch_micro',
        amount: debitAmount,
        metadata: { reason: 'global_ai_exec_error', referenceId: debitRef },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => null);
    }
    throw err;
  }

  return send(res, 200, {
    ok: true,
    assistantMessage: cleanStr(glm.data.assistantMessage || 'Pronto!', 500),
    actionsExecuted: actions.map((a) => a?.type).filter(Boolean),
    stepsExecuted,
    clientEvents,
    debited: debitAmount,
    balanceAfter,
  });
}
