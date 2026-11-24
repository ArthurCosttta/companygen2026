export function normalizeInviteCodeInput(raw: string): string {
  const clean = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14);

  if (!clean) return '';
  if (clean.length <= 4) return clean;

  // Tratamento especial para códigos com palavras de 5 letras no meio (ex.: AI10-NATAL-VERT)
  // Trata também quando colado ou digitado como AI10NATALVER (ou AI10-NATA-LVER)
  if (clean.startsWith('AI10NATAL') || clean.startsWith('AI10NATL')) {
    if (clean.length <= 9) return `${clean.slice(0, 4)}-${clean.slice(4, 9)}`;
    const suffix = clean.slice(9, 13);
    if (suffix === 'VER' || suffix === 'VERT') {
      return `${clean.slice(0, 4)}-NATAL-VERT`;
    }
    return `${clean.slice(0, 4)}-NATAL-${suffix}`;
  }

  // Alias para versão cortada em 12 caracteres (AI10-NATA-LVER)
  if (clean === 'AI10NATALVER' || clean === 'AI10NATALVERT') {
    return 'AI10-NATAL-VERT';
  }

  // Padrão 4-4-4 (AI10-XXXX-XXXX)
  if (clean.length <= 8) return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  if (clean.length <= 12) return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
  return `${clean.slice(0, 4)}-${clean.slice(4, 9)}-${clean.slice(9, 13)}`;
}

export function buildAccessCreditsSummary(credits: number): string {
  const safeCredits = Math.max(0, Math.round(Number(credits) || 0));
  const messagesEstimate = Math.max(10, Math.round(safeCredits * 0.8));
  return `Cobre gerar sua vitrine IA + criar imagens + ~${messagesEstimate} atendimentos no WhatsApp`;
}
