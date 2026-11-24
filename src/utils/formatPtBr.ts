export function pluralizePt(count: number, singular: string, plural: string): string {
  const n = Math.max(0, Math.round(Number(count) || 0));
  return `${n} ${n === 1 ? singular : plural}`;
}
