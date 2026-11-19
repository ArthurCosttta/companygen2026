import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { serializeCreditOp } from './access-and-checkout.mjs';
import { scrubPii } from './pii-scrubber.mjs';

export function getBrtDateKey(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

export async function generateAndDispatchDailyAdminDigest({
  root,
  overviewData,
  readJsonFile,
  atomicWriteJson,
  now = new Date(),
  sendEmailFn = null,
}) {
  const dateKey = getBrtDateKey(now);
  const digestPath = path.join(root, '_admin_daily_digests.json');

  return serializeCreditOp(digestPath, async () => {
    const raw = await readJsonFile(digestPath, []);
    const history = Array.isArray(raw) ? [...raw] : [];
    const existing = history.find((item) => item?.dateKey === dateKey);
    if (existing) {
      return { ok: true, duplicate: true, dateKey, digest: existing };
    }

    const summary = overviewData?.summary || {};
    const funnel = overviewData?.funnelSummary || {};
    const alertsCount = Number(summary.incidentsCount || 0);
    const stalledCount = Number(funnel.stalledOver24h || 0);

    const textSummary = scrubPii(
      [
        `CompanyGen — Resumo Executivo Diário (${dateKey} 08:00 BRT)`,
        `• Lojas ativas: ${summary.totalUsers ?? 0} · Créditos em circulação: ${summary.totalCredits ?? 0}`,
        `• Receita bruta: R$ ${((summary.grossRevenueCents ?? 0) / 100).toFixed(2)} · Margem líquida: R$ ${((summary.netMarginCents ?? 0) / 100).toFixed(2)}`,
        `• Lojas travadas >24h no onboarding: ${stalledCount} · Chamados abertos: ${summary.openTicketsCount ?? 0} · Incidentes: ${alertsCount}`,
        overviewData?.canaryDomAlert?.active ? `• ALERTA CANÁRIO: ${overviewData.canaryDomAlert.message}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    let delivery = { sent: false, channel: 'local_archive' };
    if (typeof sendEmailFn === 'function') {
      await sendEmailFn({ subject: `[CompanyGen Digest] ${dateKey}`, text: textSummary });
      delivery = { sent: true, channel: 'email' };
    }

    const digestRecord = {
      id: randomUUID(),
      dateKey,
      summaryText: textSummary,
      delivery,
      createdAt: now.toISOString(),
    };

    history.push(digestRecord);
    await atomicWriteJson(digestPath, history.slice(-90));
    return { ok: true, duplicate: false, dateKey, digest: digestRecord };
  });
}
