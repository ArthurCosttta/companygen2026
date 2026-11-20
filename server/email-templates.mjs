export function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtCredits(val) {
  return Number(val || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function creditsAddedEmail({
  storeName = 'Sua Loja',
  amount = 0,
  newBalance = 0,
  reasonLabel = 'Créditos adicionados',
  note = '',
  appUrl = 'https://companygen.store/?route=access',
}) {
  const safeStore = escapeHtml(storeName || 'Sua Loja');
  const safeReason = escapeHtml(reasonLabel || 'Ajuste de créditos');
  const safeNote = escapeHtml(note || '');
  const safeUrl = /^https?:\/\//i.test(String(appUrl || ''))
    ? escapeHtml(appUrl)
    : 'https://companygen.store/?route=access';

  const formattedAdded = fmtCredits(amount);
  const formattedBalance = fmtCredits(newBalance);
  const estimatedMsgs = Math.max(0, Math.floor((Number(newBalance || 0) + 1e-9) / 0.1)).toLocaleString('pt-BR');

  const subject = `Você recebeu +${formattedAdded} créditos no CompanyGen`;

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#38bdf8;">CompanyGen · Créditos de IA</div>
        <h1 style="margin:8px 0 0;font-size:20px;line-height:1.3;">+${formattedAdded} créditos liberados na sua conta</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 14px;">Olá, <strong>${safeStore}</strong>!</p>
        <p style="margin:0 0 18px;">Seus novos créditos de IA já foram creditados e estão prontos para usar na Sofia (WhatsApp) e na sua Vitrine.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;border-radius:12px;padding:16px;margin-bottom:18px;">
          <tr>
            <td style="font-size:12px;color:#475569;padding-bottom:6px;">Créditos adicionados</td>
            <td align="right" style="font-size:15px;font-weight:700;color:#059669;padding-bottom:6px;">+${formattedAdded} cr</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#475569;padding-bottom:6px;">Novo saldo total</td>
            <td align="right" style="font-size:15px;font-weight:700;color:#0f172a;padding-bottom:6px;">${formattedBalance} cr (~${estimatedMsgs} msgs)</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#475569;">Motivo</td>
            <td align="right" style="font-size:12px;font-weight:600;color:#334155;">${safeReason}</td>
          </tr>
        </table>
        ${safeNote ? `<p style="margin:0 0 18px;padding:12px 14px;background:#eff6ff;border-left:3px solid #2563eb;border-radius:8px;font-size:13px;color:#1e3a8a;"><strong>Observação:</strong> ${safeNote}</p>` : ''}
        <p style="margin:0 0 8px;">
          <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Abrir CompanyGen</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
        Notificação transacional automática · CompanyGen (companygen.store)
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Olá, ${storeName || 'Sua Loja'}!`,
    `Você recebeu +${formattedAdded} créditos no CompanyGen.`,
    `Novo saldo total: ${formattedBalance} cr (~${estimatedMsgs} mensagens na Sofia).`,
    `Motivo: ${reasonLabel || 'Ajuste de créditos'}`,
    note ? `Observação: ${note}` : '',
    `Acesse: ${appUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}
