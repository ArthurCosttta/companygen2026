import assert from 'node:assert/strict';

const BASE_URL = process.env.SMOKE_URL || 'https://companygen-app.web.app';

async function checkEndpoint(path, expectedStatus = 200) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12_000) });
  assert.equal(
    res.status,
    expectedStatus,
    `Expected HTTP ${expectedStatus} on ${url}, got ${res.status}`,
  );
  return res;
}

async function run() {
  console.log(`[post-deploy-smoke] Verifying ${BASE_URL} ...`);
  const home = await checkEndpoint('/', 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /CompanyGen|<div id="root">/i, 'Root HTML missing mount node');

  const plans = await checkEndpoint('/api/checkout/plans', 200);
  const plansJson = await plans.json();
  assert.ok(Array.isArray(plansJson?.plans) && plansJson.plans.length >= 1, 'Checkout plans missing');

  const accessPage = await checkEndpoint('/?route=access', 200);
  const accessHtml = await accessPage.text();
  assert.match(accessHtml, /CompanyGen|<div id="root">/i, 'Access HTML missing mount node');

  const unauthImages = await checkEndpoint('/api/images/status', 401);
  const unauthJson = await unauthImages.json().catch(() => null);
  assert.equal(unauthJson?.ok, false, 'Expected fail-closed auth payload on unauthenticated /api/images/status');

  console.log('[post-deploy-smoke] ALL CHECKS PASSED!');
}

run().catch((err) => {
  console.error('[post-deploy-smoke] FAILED:', err);
  process.exit(1);
});
