import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getSofiaCachedContext,
  setSofiaCachedContext,
  invalidateSofiaContextCache,
} from '../server/ai-sofia-local.mjs';

describe('FILA 20 — Warm Cache Sofia & Slim Desktop Config', () => {
  it('20B: Sofia Warm Cache armazena, retorna hit e invalida por userId', () => {
    invalidateSofiaContextCache('user-test-20');
    assert.equal(getSofiaCachedContext('user-test-20'), null);

    setSofiaCachedContext('user-test-20', { profile: { business: { name: 'PetGen' } } });
    const hit = getSofiaCachedContext('user-test-20');
    assert.equal(hit?.profile?.business?.name, 'PetGen');

    invalidateSofiaContextCache('user-test-20');
    assert.equal(getSofiaCachedContext('user-test-20'), null);
  });

  it('20A: package.json configura afterPack slim-electron-locales e compressão NSIS maximum', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.build.afterPack, './scripts/slim-electron-locales.mjs');
    assert.equal(pkg.build.nsis.compression, 'maximum');
  });
});
