import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  computeStoreIdentityId,
  pickExperienceCombo,
  sanitizeCustomHtmlBlock,
  auditCopyConversion,
} from '../server/storefront-experience-matrix.mjs';
import { computeOrdersDreSummary } from '../server/ai-spreadsheet-engine.mjs';

describe('FILA 19 — Jogo Combinatório GLM, Sandbox HTML & DRE Contábil', () => {
  it('19A: gera store_identity_id determinístico e combinações distintas', () => {
    const id1 = computeStoreIdentityId({ slug: 'petgen', niche: 'petshop', name: 'PetGen' });
    const id2 = computeStoreIdentityId({ slug: 'techfix', niche: 'eletronicos', name: 'TechFix' });
    assert.match(id1, /^cg_[0-9a-f]{8}$/);
    assert.notEqual(id1, id2);
    const combo1 = pickExperienceCombo(id1);
    assert.equal(combo1.sectionOrder.length, 3);
  });

  it('19B: sanitizeCustomHtmlBlock bloqueia XSS (<script>, onerror=, javascript:)', () => {
    const dirty = '<div onclick="alert(1)"><img src="x" onerror=alert(2)><script>fetch("/api/me")</script><a href="javascript:alert(3)">ok</a></div>';
    const clean = sanitizeCustomHtmlBlock(dirty);
    assert.equal(/<script/i.test(clean), false);
    assert.equal(/onerror|onclick/i.test(clean), false);
    assert.equal(/javascript:/i.test(clean), false);
  });

  it('19B: auditCopyConversion detecta placeholders genéricos', () => {
    const audit = auditCopyConversion([
      { id: 's1', type: 'HeroSection', config: { title: 'Lorem ipsum', subtitle: 'Subtítulo exemplo' } },
    ]);
    assert.equal(audit.issues.length, 1);
    assert.ok(audit.score < 100);
  });

  it('19C: zero ocorrência de amount: 15 hardcoded em storefront-molde-fs.mjs', async () => {
    const src = await readFile(new URL('../server/storefront-molde-fs.mjs', import.meta.url), 'utf8');
    assert.equal(/amount:\s*15\b/.test(src), false);
  });

  it('19D: computeOrdersDreSummary calcula DRE exato em centavos', () => {
    const dre = computeOrdersDreSummary([
      { status: 'paid', total_cents: 10000, items: [{ qty: 2, unit_cost_cents: 2000 }], fee_cents: 500 },
      { status: 'paid', total_cents: 5000, loss_cents: 1500 },
      { status: 'cancelled', total_cents: 9999 },
    ]);
    assert.equal(dre.grossRevenueCents, 15000);
    assert.equal(dre.cmvCents, 4000);
    assert.equal(dre.feesCents, 500);
    assert.equal(dre.lossesCents, 1500);
    assert.equal(dre.netProfitCents, 9000);
    assert.equal(dre.marginPercent, 60);
  });
});
