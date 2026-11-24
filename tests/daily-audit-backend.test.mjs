import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createWorkspaceApi } from '../server/workspace.mjs';
import { stripAiDashFlags } from '../shared/formula-ir/composer-schema.mjs';

const NORMAL_USER_ID = '400809f3-1111-4444-8888-444444444444';
const NORMAL_EMAIL = 'arthurcostacopy@gmail.com';
const ADMIN_USER_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_EMAIL = 'arthurpolarbuy@gmail.com';
const EXPIRES = Math.floor(Date.now() / 1000) + 3600;

function makeJwt(sub, email) {
  return (
    'eyJhbGciOiJIUzI1NiJ9.' +
    Buffer.from(JSON.stringify({ sub, email, exp: EXPIRES })).toString('base64url') +
    '.sig'
  );
}

const NORMAL_JWT = makeJwt(NORMAL_USER_ID, NORMAL_EMAIL);
const ADMIN_JWT = makeJwt(ADMIN_USER_ID, ADMIN_EMAIL);

async function startTempServer(root) {
  const fetchProvider = async (url, options = {}) => {
    if (String(url).includes('/auth/v1/user')) {
      const auth = String(options.headers?.Authorization || '');
      if (auth.includes(ADMIN_JWT)) {
        return Response.json({ id: ADMIN_USER_ID, email: ADMIN_EMAIL }, { status: 200 });
      }
      if (auth.includes(NORMAL_JWT)) {
        return Response.json({ id: NORMAL_USER_ID, email: NORMAL_EMAIL }, { status: 200 });
      }
      return Response.json({ error: 'invalid' }, { status: 401 });
    }
    if (String(url).includes('/rest/v1/')) {
      return Response.json({ code: 'PGRST205' }, { status: 404 });
    }
    return fetch(url, options);
  };
  const api = createWorkspaceApi({ root, fetch: fetchProvider });
  const server = http.createServer((req, res) =>
    api.handler(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    close: () => new Promise((resolve) => server.close(resolve)),
    request: (pathname, method = 'GET', body, token = NORMAL_JWT) =>
      fetch(`${origin}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
  };
}

test('Auditorias Backend: stripAiDashFlags, Admin Isolation, analyze-brief allowlist, dia-a-dia, group_items & Zero Debit on Failure', async () => {
  assert.equal(stripAiDashFlags('Banho e tosa -- entrega hoje — rápida'), 'Banho e tosa, entrega hoje, rápida');
  assert.equal(stripAiDashFlags('https://exemplo.com/a--b?x=1'), 'https://exemplo.com/a--b?x=1');

  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-daily-audit-'));
  const app = await startTempServer(root);
  try {
    // 1. Admin isolation: arthurcostacopy@gmail.com must be isAdmin: false & blocked on /api/admin/overview
    const meNormalRes = await app.request('/api/admin/status', 'GET', undefined, NORMAL_JWT);
    assert.equal(meNormalRes.status, 200);
    const meNormal = await meNormalRes.json();
    assert.equal(meNormal.isAdmin, false);

    const adminOverviewBlocked = await app.request('/api/admin/overview', 'GET', undefined, NORMAL_JWT);
    assert.equal(adminOverviewBlocked.status, 403);

    const meAdminRes = await app.request('/api/admin/status', 'GET', undefined, ADMIN_JWT);
    assert.equal(meAdminRes.status, 200);
    const meAdmin = await meAdminRes.json();
    assert.equal(meAdmin.isAdmin, true);

    // Seed 50 cr ledger & profile for NORMAL_USER_ID
    const userDir = path.join(root, NORMAL_USER_ID);
    await mkdir(userDir, { recursive: true });
    await writeFile(
      path.join(userDir, 'credits_ledger.json'),
      JSON.stringify([
        {
          id: 'seed-50',
          user_id: NORMAL_USER_ID,
          delta: 50,
          balance_after: 50,
          operation_type: 'welcome_invite',
          created_at: new Date().toISOString(),
        },
      ]),
      'utf8',
    );

    const initProfRes = await app.request('/api/profile');
    const initProf = await initProfRes.json();
    await app.request('/api/profile', 'PUT', {
      revision: initProf.revision,
      profile: {
        ...initProf.profile,
        business: {
          ...initProf.profile.business,
          name: 'Pet Minas Banho e Tosa',
          segment: 'Pet Shop',
          businessModel: 'produtos',
        },
        catalog: {
          products: [
            { id: 'p1', sku: 'PET-1', name: 'Banho simples', category: 'Banho', priceCents: 5000, stock: 20, active: true },
            { id: 'p2', sku: 'PET-2', name: 'Tosa higiênica', category: 'Estética', priceCents: 7000, stock: 20, active: true },
            { id: 'p3', sku: 'PET-3', name: 'Hidratação de Pelos', category: 'Spa', priceCents: 9000, stock: 10, active: true },
          ],
        },
      },
      publish: false,
    });

    // 2. analyze-brief works in store-molde allowlist without false block
    const briefRes = await app.request('/api/store-molde/analyze-brief', 'POST', {
      profile: {
        business: { name: 'Pet Minas Banho e Tosa', segment: 'Pet Shop' },
        catalog: { products: [{ name: 'Banho simples', category: 'Banho', priceCents: 5000 }] },
      },
    });
    assert.equal(briefRes.status, 200);
    const briefJson = await briefRes.json();
    assert.equal(briefJson.ok, true);
    assert.ok(Array.isArray(briefJson.questionsJson?.questions));
    assert.ok(briefJson.questionsJson.questions.length >= 1 && briefJson.questionsJson.questions.length <= 5);

    // 3. group_items on CatalogGrid costs 0 cr & stores selectedSkuIds
    const moldeStateRes = await app.request('/api/store-molde/state');
    const moldeState = await moldeStateRes.json();
    const sectionsList = Array.isArray(moldeState?.formulasIr?.sections) ? moldeState.formulasIr.sections : [];
    const catalogSecId = sectionsList.find((s) => s.type === 'CatalogGrid')?.id || 'sec_catalogo';
    const closingSecId = sectionsList.find((s) => s.type === 'ClosingScheduleSplit')?.id || 'sec_closing';

    const groupRes = await app.request('/api/store-molde/patch-section', 'POST', {
      sectionId: catalogSecId,
      action: 'group_items',
      selectedSkuIds: ['PET-1', 'PET-3'],
    });
    assert.equal(groupRes.status, 200);
    const groupJson = await groupRes.json();
    assert.equal(groupJson.debited, 0);
    const catSec = groupJson.formulaIr.sections.find((s) => s.id === catalogSecId);
    assert.deepEqual(catSec.config.selectedSkuIds, ['PET-1', 'PET-3']);

    // 4. Daily schedule patch on ClosingScheduleSplit with useGlm: false does NOT paste raw command string
    const dailyRes = await app.request('/api/store-molde/patch-section', 'POST', {
      sectionId: closingSecId,
      microTarget: 'schedule',
      instruction: 'mudar o layout para ficar melhor, faz mostrando dia a dia o que tera',
      useGlm: false,
    });
    assert.equal(dailyRes.status, 200);
    const dailyJson = await dailyRes.json();
    const closingSec = dailyJson.formulaIr.sections.find((s) => s.id === closingSecId);
    assert.ok(!closingSec.config.title.toLowerCase().includes('mudar o layout'));
    assert.ok(!closingSec.config.subtitle.toLowerCase().includes('mudar o layout'));
    assert.ok(Array.isArray(closingSec.config.slots) && closingSec.config.slots.length === 7);
    assert.match(closingSec.config.slots[0], /Segunda/i);
    assert.match(closingSec.config.slots[6], /Domingo/i);
    assert.equal(dailyJson.balanceAfter, 45);

    // 5. Simulated failure on patch-section must NOT charge credits (remains 45)
    const failRes = await app.request('/api/store-molde/patch-section', 'POST', {
      sectionId: 'sec_hero',
      instruction: 'mudar titulo para ficar melhor',
      simulateGlmFailure: true,
    });
    assert.equal(failRes.status, 502);
    const stateCheck = await (await app.request('/api/store-molde/state')).json();
    assert.equal(stateCheck.balance, 45);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
