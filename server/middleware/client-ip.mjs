/**
 * Extrai o IP real do cliente respeitando cabeçalhos de proxy (Cloud Run / Firebase Hosting)
 * evitando que todos os clientes por trás do load balancer dividam o mesmo balde de rate-limit.
 */
function normalizeIp(raw) {
  let clean = String(raw || '').trim();
  if (!clean) return '';
  if (clean.startsWith('::ffff:')) clean = clean.slice(7);
  return clean.replace(/[^0-9a-fA-F:.,]/g, '').slice(0, 64);
}

function isPrivateOrLoopback(ip) {
  if (!ip) return true;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('169.254.') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
}

export function resolveClientIp(req) {
  const socketIp = normalizeIp(req?.socket?.remoteAddress || '');
  const trustProxy = Boolean(process.env.K_SERVICE || process.env.TRUST_PROXY === '1' || isPrivateOrLoopback(socketIp));
  if (trustProxy) {
    const xff = String(req?.headers?.['x-forwarded-for'] || '').trim();
    if (xff) {
      const first = normalizeIp(xff.split(',')[0]);
      if (first) return first;
    }
    const realIp = normalizeIp(req?.headers?.['x-real-ip'] || '');
    if (realIp) return realIp;
  }
  return socketIp || '127.0.0.1';
}
