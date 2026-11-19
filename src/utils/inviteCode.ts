export function normalizeInviteCodeInput(raw: string): string {
  const clean = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

  if (!clean) return '';
  if (clean.length <= 4) return clean;
  if (clean.length <= 8) return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}

export function buildAccessCreditsSummary(credits: number): string {
  const safeCredits = Math.max(0, Math.round(Number(credits) || 0));
  const messagesEstimate = Math.max(10, Math.round(safeCredits * 0.8));
  return `Cobre gerar sua vitrine IA + criar imagens + ~${messagesEstimate} atendimentos no WhatsApp`;
}
