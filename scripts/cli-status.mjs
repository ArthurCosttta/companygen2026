#!/usr/bin/env node
import { chromium } from 'playwright';

const baseUrl = process.env.CG_DIAG_URL || 'http://127.0.0.1:1245';
const email = process.env.CG_DIAG_EMAIL;
const password = process.env.CG_DIAG_PASSWORD;
const instagram = process.argv.find(arg => arg.startsWith('--instagram='))?.split('=')[1];
const probeFlow = process.argv.includes('--flow');

if (!email || !password) {
  console.error('Defina CG_DIAG_EMAIL e CG_DIAG_PASSWORD para consultar as APIs autenticadas.');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const login = page.locator('input[type="email"]');
  if (await login.isVisible().catch(() => false)) {
    await login.fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
  }
  await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('-auth-token')), undefined, { timeout: 15000 });

  const report = await page.evaluate(async ({ instagram, probeFlow }) => {
    const key = Object.keys(localStorage).find(item => item.includes('-auth-token'));
    const token = JSON.parse(localStorage.getItem(key) || '{}')?.access_token;
    if (!token) throw new Error('Login sem token de acesso.');
    const request = async (path, body) => {
      const response = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${value.error || ''}`);
      return value;
    };
    const [worker, profile, orders] = await Promise.all([
      request('/api/whatsapp/api/dados'),
      request('/api/profile'),
      request('/api/orders'),
    ]);
    const templates = Array.isArray(worker.templates) ? worker.templates : [];
    const badTemplates = templates
      .filter(t => /\*|\bSKU\b/i.test(String(t.body || t.resposta || '')))
      .map(t => t.id);
    const summary = {
      server: location.origin,
      worker: {
        conectado: worker.conectado,
        status: worker.status,
        numeroBot: worker.numeroBot || '',
        botAtivo: worker.config?.botAtivo,
        iaAtiva: worker.config?.iaAtiva,
        qrDisponivel: Boolean(worker.qr),
        conversas: worker.conversas?.length || 0,
        contatos: worker.contatos?.length || 0,
        mensagens: (worker.conversas || []).reduce((n, c) => n + (c.mensagensTotal || c.mensagens?.length || 0), 0),
        moldes: templates.length,
        moldesComMarcadores: badTemplates,
      },
      profileRevision: profile.revision ?? null,
      storeName: profile.profile?.business?.name || '',
      orders: Array.isArray(orders.orders) ? orders.orders.length : Array.isArray(orders) ? orders.length : null,
    };
    if (instagram) {
      const analyzed = await request('/api/instagram/analyze', { handle: instagram });
      let logoStatus = null;
      let logoType = '';
      if (analyzed.logoUrl) {
        const imageResponse = await fetch(analyzed.logoUrl);
        logoStatus = imageResponse.status;
        logoType = imageResponse.headers.get('content-type') || '';
      }
      summary.instagram = {
        ok: analyzed.ok,
        handle: analyzed.handle,
        fullName: analyzed.fullName,
        bio: analyzed.bio,
        source: analyzed.source,
        logoUrl: analyzed.logoUrl,
        logoStatus,
        logoType,
        error: analyzed.error || '',
      };
    }
    if (probeFlow) {
      const before = performance.now();
      const greeting = await request('/api/whatsapp/api/fluxo/simular', {
        jid: 'diagnostico-cli@s.whatsapp.net', nomeCliente: 'Diagnóstico CLI', texto: 'oi',
      });
      summary.greeting = {
        flow: greeting.flow,
        elapsedMs: Math.round(performance.now() - before),
        clean: !/\*|\bSKU\b/i.test(String(greeting.reply?.texto || '')),
      };
    }
    return summary;
  }, { instagram, probeFlow });
  console.log(JSON.stringify(report, null, 2));
  if (report.worker.moldesComMarcadores.length || report.instagram?.ok === false || (report.instagram?.logoUrl && report.instagram.logoStatus !== 200) || report.greeting?.clean === false) process.exitCode = 1;
} finally {
  await browser.close();
}
