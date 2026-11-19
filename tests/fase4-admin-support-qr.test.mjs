import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createWorkspaceApi } from '../server/workspace.mjs';

function makeFakeJwt(userId, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

test('Fase 4: Admin arthurpolarbuy@gmail.com, Suporte Tickets, QR Code /q/:slug redirect e contador', async () => {
  const prevPersistence = process.env.CG_PERSISTENCE;
  const prevAdminEmails = process.env.CG_ADMIN_EMAILS;
  process.env.CG_PERSISTENCE = 'local';
  delete process.env.CG_ADMIN_EMAILS;

  const adminId = '11111111-1111-4111-8111-111111111111';
  const clientId = '22222222-2222-4222-8222-222222222222';
  const adminToken = makeFakeJwt(adminId, 'arthurpolarbuy@gmail.com');
  const userToken = makeFakeJwt(clientId, 'lojista@teste.com');
  const tokenMap = new Map([
    [adminToken, { id: adminId, email: 'arthurpolarbuy@gmail.com' }],
    [userToken, { id: clientId, email: 'lojista@teste.com' }],
  ]);

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-f4-admin-'));
  const api = createWorkspaceApi({
    root: tmpRoot,
    fetch: async (url, options = {}) => {
      if (String(url).includes('/auth/v1/user')) {
        const authHeader = new Headers(options.headers || {}).get('authorization') || '';
        const info = tokenMap.get(authHeader.slice(7));
        return Response.json(info || { error: 'invalid' }, { status: info ? 200 : 401 });
      }
      return fetch(url, options);
    },
  });
  const server = http.createServer((req, res) => {
    api.handler(req, res, () => {
      res.writeHead(404);
      res.end('not found');
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Admin email reconhece arthurpolarbuy@gmail.com e nega lojista
    const adminStatusRes = await fetch(`${baseUrl}/api/admin/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminStatus = await adminStatusRes.json();
    assert.equal(adminStatusRes.status, 200);
    assert.equal(adminStatus.isAdmin, true);

    const userOverviewRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(userOverviewRes.status, 403);

    // 2. Cliente envia chamado de suporte com print anexado e servidor valida MIME inválido
    const invalidAttachmentRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: 'whatsapp',
        subject: 'Teste MIME invalido',
        description: 'Nao deve aceitar HTML disfarçado de imagem.',
        attachmentDataUrl: 'data:text/html;base64,PGgxPk9pPC9oMT4=',
      }),
    });
    assert.equal(invalidAttachmentRes.status, 400);

    const samplePngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const createTicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: 'whatsapp',
        subject: 'Dúvida na conexão do número',
        description: 'Preciso confirmar se o modo seguro está ativo.',
        storeName: 'Loja Bela Flor',
        attachmentDataUrl: samplePngDataUrl,
      }),
    });
    const ticketJson = await createTicketRes.json();
    assert.equal(createTicketRes.status, 200);
    assert.equal(ticketJson.ok, true);
    assert.equal(ticketJson.ticket.status, 'open');
    assert.equal(ticketJson.ticket.attachment_url, samplePngDataUrl);

    // 3. Admin visualiza chamado e resolve
    const resolveRes = await fetch(`${baseUrl}/api/admin/tickets/resolve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: ticketJson.ticket.id,
        status: 'resolved',
        adminNote: 'Verificado e confirmado ativo!',
      }),
    });
    const resolveJson = await resolveRes.json();
    assert.equal(resolveRes.status, 200);
    assert.equal(resolveJson.ticket.status, 'resolved');

    // 4. Admin cria QR Code nomeado e testa redirect + incremento de acessos
    const createQrRes = await fetch(`${baseUrl}/api/admin/qr-campaigns`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Panfleto Centro',
        targetUrl: 'https://companygen.store/?qr=panfleto-centro',
      }),
    });
    const qrJson = await createQrRes.json();
    assert.equal(createQrRes.status, 200);
    assert.equal(qrJson.campaign.slug, 'panfleto-centro');
    assert.ok(qrJson.campaign.pngDataUrl.startsWith('data:image/png;base64,'));

    const redirectRes = await fetch(`${baseUrl}/q/panfleto-centro`, { redirect: 'manual' });
    assert.equal(redirectRes.status, 302);
    assert.equal(redirectRes.headers.get('location'), 'https://companygen.store/?qr=panfleto-centro');

    const overviewRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const overview = await overviewRes.json();
    assert.equal(overview.ok, true);
    assert.equal(overview.qrCampaigns[0].scans_count, 1);
    assert.equal(overview.tickets[0].status, 'resolved');

    // 5. Regressão BUG-F02-07: 12 chamadas dryRun=true em /api/access/validate não esgotam o rate-limit do submit real
    for (let i = 0; i < 12; i++) {
      const dryRes = await fetch(`${baseUrl}/api/access/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'AI10-FARM-LUME', dryRun: true }),
      });
      assert.equal(dryRes.status, 200);
    }
    const realValidateRes = await fetch(`${baseUrl}/api/access/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'AI10-FARM-LUME' }),
    });
    assert.equal(realValidateRes.status, 200);
    const realValidateJson = await realValidateRes.json();
    assert.equal(realValidateJson.valid, true);
  } finally {
    server.close();
    await api.close();
    await fs.rm(tmpRoot, { recursive: true, force: true });
    if (prevPersistence !== undefined) process.env.CG_PERSISTENCE = prevPersistence;
    else delete process.env.CG_PERSISTENCE;
    if (prevAdminEmails !== undefined) process.env.CG_ADMIN_EMAILS = prevAdminEmails;
    else delete process.env.CG_ADMIN_EMAILS;
  }
});
