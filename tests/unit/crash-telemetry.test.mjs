import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createWorkspaceApi } from '../../server/workspace.mjs';
import {
  inferSuspectedFilesAndCause,
  rememberServerErrorForCorrelation,
} from '../../server/crash-telemetry.mjs';

function makeJwt(sub, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ sub, email, exp })).toString('base64url');
  return `${header}.${payload}.sig`;
}

const NORMAL_USER_ID = '11111111-1111-4111-8111-111111119999';
const ADMIN_USER_ID = '22222222-2222-4222-8222-222222229999';
const NORMAL_JWT = makeJwt(NORMAL_USER_ID, 'lojista-normal@example.com');
const ADMIN_JWT = makeJwt(ADMIN_USER_ID, 'arthurpolarbuy@gmail.com');

test('inferSuspectedFilesAndCause aponta módulos exatos e diagnóstico sem ler 100 arquivos', () => {
  const chunk = inferSuspectedFilesAndCause({
    message: "TypeError: Cannot read properties of undefined (reading 'default')",
    route: '/store',
  });
  assert.ok(chunk.suspectedFiles.includes('src/utils/chunk-recovery.ts'));
  assert.ok(chunk.suspectedFiles.includes('src/app/App.tsx'));

  const zipErr = inferSuspectedFilesAndCause({
    message: 'Falha no buildFaithfulStorefrontZip ao empacotar imagens',
    breadcrumbs: [{ summary: 'Clique em Baixar Loja (.ZIP)' }],
  });
  assert.ok(zipErr.suspectedFiles.includes('src/components/views/storefront/storefront-zip-builder.ts'));
});

test('Telemetria contextual: captura erros de usuário normal, mascara PII, correlaciona backend, restringe leitura ao Admin e reabre se recorrer', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-crash-telemetry-'));
  const prevPersistence = process.env.CG_PERSISTENCE;
  process.env.CG_PERSISTENCE = 'local';

  const mockFetch = async (url, init) => {
    if (String(url).includes('/auth/v1/user')) {
      const tok = String(init?.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
      const parts = tok.split('.');
      if (parts.length !== 3) return new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 });
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return new Response(JSON.stringify({ id: claims.sub, email: claims.email }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  };
  const api = createWorkspaceApi({
    root,
    fetch: mockFetch,
  });

  const server = http.createServer((req, res) => {
    void api.handler(req, res, () => {
      res.writeHead(404).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    // Simula falha prévia no backend para testar correlação automática
    rememberServerErrorForCorrelation({
      userId: NORMAL_USER_ID,
      method: 'PUT',
      endpoint: '/api/profile',
      statusCode: 422,
      message: 'Confirme ou revise o item "Dipirona 500mg" antes de publicar.',
    });

    const crashRes = await fetch(`${origin}/api/telemetry/crash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NORMAL_JWT}`,
      },
      body: JSON.stringify({
        severity: 'critical',
        source: 'client_react',
        category: 'REACT_RENDER_CRASH',
        title: 'Crash em Painel Principal Bearer eyJhbGciOiJIUzI1NiJ9.abcdef.ghijk',
        message: 'Cannot read properties of undefined (reading \'default\')',
        stack: 'at src/components/views/onboarding/OnboardingSynthesisStage.tsx:102:14',
        componentStack: '\n    at Lazy\n    at RouteErrorBoundary',
        appContext: {
          route: '/?theme=light',
          activeTab: 'store',
          onboardingStep: 'synthesis',
          storeName: 'FarmaSub',
          segment: 'Farmácia & Drogaria',
          productsCount: 15,
          lowSpec: true,
        },
        breadcrumbs: [
          { at: new Date().toISOString(), kind: 'navigation', summary: 'Onboarding Passo 5' },
          {
            at: new Date().toISOString(),
            kind: 'network',
            summary: 'PUT /api/profile -> 422',
            endpoint: '/api/profile',
            statusCode: 422,
            durationMs: 112,
          },
        ],
      }),
    });
    assert.equal(crashRes.status, 201);
    const crashBody = await crashRes.json();
    assert.equal(crashBody.ok, true);
    assert.ok(crashBody.fingerprint);
    assert.ok(crashBody.suspectedFiles.includes('src/utils/chunk-recovery.ts'));

    // Usuário normal NÃO pode ler logs do Admin (fail-closed 403)
    const normalRead = await fetch(`${origin}/api/admin/logs/crashes`, {
      headers: { Authorization: `Bearer ${NORMAL_JWT}` },
    });
    assert.equal(normalRead.status, 403);

    // Admin vê o crash completo com contexto rico, PII mascarada e correlação backend
    const adminRead = await fetch(`${origin}/api/admin/logs/crashes`, {
      headers: { Authorization: `Bearer ${ADMIN_JWT}` },
    });
    assert.equal(adminRead.status, 200);
    const logsData = await adminRead.json();
    assert.equal(logsData.ok, true);
    assert.equal(logsData.summary.openCount, 1);
    assert.equal(logsData.summary.normalUserOpenCount, 1);
    const entry = logsData.logs[0];
    assert.ok(!entry.title.includes('abcdef'));
    assert.ok(entry.aiContextPrompt.includes('FarmaSub'));
    assert.ok(entry.aiContextPrompt.includes('PUT /api/profile'));
    assert.equal(entry.correlatedServerErrors.length, 1);

    // Overview do Admin inclui badge de alerta para erros de usuários normais
    const overviewRes = await fetch(`${origin}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${ADMIN_JWT}` },
    });
    assert.equal(overviewRes.status, 200);
    const overview = await overviewRes.json();
    assert.equal(overview.summary.normalUserOpenCrashes, 1);
    assert.ok(overview.incidents.some((i) => String(i.type || '').startsWith('USER_CRASH:')));

    // Admin marca como resolvido
    const resolveRes = await fetch(`${origin}/api/admin/logs/crashes/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_JWT}`,
      },
      body: JSON.stringify({ fingerprint: entry.fingerprint, status: 'resolved' }),
    });
    assert.equal(resolveRes.status, 200);
    const afterResolve = await (
      await fetch(`${origin}/api/admin/logs/crashes?status=open`, {
        headers: { Authorization: `Bearer ${ADMIN_JWT}` },
      })
    ).json();
    assert.equal(afterResolve.summary.openCount, 0);

    // Se o mesmo erro voltar a ocorrer para usuário normal, reabre automaticamente!
    await fetch(`${origin}/api/telemetry/crash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NORMAL_JWT}`,
      },
      body: JSON.stringify({
        severity: 'critical',
        source: 'client_react',
        category: 'REACT_RENDER_CRASH',
        title: 'Crash em Painel Principal',
        message: 'Cannot read properties of undefined (reading \'default\')',
      }),
    });
    const reopened = await (
      await fetch(`${origin}/api/admin/logs/crashes?status=open`, {
        headers: { Authorization: `Bearer ${ADMIN_JWT}` },
      })
    ).json();
    assert.equal(reopened.summary.openCount, 1);
    assert.equal(reopened.logs[0].occurrences, 2);
  } finally {
    if (prevPersistence === undefined) delete process.env.CG_PERSISTENCE;
    else process.env.CG_PERSISTENCE = prevPersistence;
    await api.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
