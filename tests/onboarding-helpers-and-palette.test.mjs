import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInviteCodeInput, buildAccessCreditsSummary } from '../src/utils/inviteCode.ts';
import {
  contrastRatio,
  extractPaletteFromRgbaPixels,
} from '../src/utils/logoColorExtractor.ts';
import {
  getVariationPresetsForCategory,
  parseQuickPastedCatalogText,
} from '../src/utils/variationPresets.ts';

test('C11: normalizeInviteCodeInput tolera espaços, minúsculas, quebras e colagem parcial', () => {
  assert.equal(normalizeInviteCodeInput('  ai10  farm   lume \n'), 'AI10-FARM-LUME');
  assert.equal(normalizeInviteCodeInput('ai10'), 'AI10');
  assert.equal(normalizeInviteCodeInput('ai10f'), 'AI10-F');
  assert.equal(normalizeInviteCodeInput('AI10-FARM-LUME-EXTRA'), 'AI10-FARM-LUME');
  assert.match(buildAccessCreditsSummary(100), /~80 atendimentos no WhatsApp/);
});

test('C15 / C111: extractPaletteFromRgbaPixels extrai Azul + Dourado com contraste WCAG AA', () => {
  const width = 64;
  const height = 64;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Metade transparente / branca (deve ser ignorada)
  // 35% azul royal (#0867E8 = 8, 103, 232)
  // 20% dourado (#D97706 = 217, 119, 6)
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    if (i < width * height * 0.45) {
      pixels[off] = 255;
      pixels[off + 1] = 255;
      pixels[off + 2] = 255;
      pixels[off + 3] = 255;
    } else if (i < width * height * 0.80) {
      pixels[off] = 8;
      pixels[off + 1] = 103;
      pixels[off + 2] = 232;
      pixels[off + 3] = 255;
    } else {
      pixels[off] = 217;
      pixels[off + 1] = 119;
      pixels[off + 2] = 6;
      pixels[off + 3] = 255;
    }
  }

  const palette = extractPaletteFromRgbaPixels(pixels);
  assert.equal(palette.fallbackUsed, false);
  assert.ok(palette.primaryHex.startsWith('#'));
  assert.ok(palette.accentHex.startsWith('#'));
  assert.notEqual(palette.primaryHex, palette.accentHex);
  assert.ok(
    contrastRatio(palette.primaryHex, palette.textOnPrimaryHex) >= 4.5,
    `Contraste esperado >= 4.5, obtido ${contrastRatio(palette.primaryHex, palette.textOnPrimaryHex)}`,
  );
});

test('C15: extractPaletteFromRgbaPixels ativa fallback seguro para PNG totalmente transparente/branco', () => {
  const emptyPixels = new Uint8ClampedArray(64 * 64 * 4);
  const res = extractPaletteFromRgbaPixels(emptyPixels);
  assert.equal(res.fallbackUsed, true);
  assert.equal(res.primaryHex, '#0867E8');
  assert.equal(res.accentHex, '#24A677');
});

test('C17 & C18: variationPresets e parser rápido de lista colada funcionam de forma determinística', () => {
  const cosmetic = getVariationPresetsForCategory('Cosméticos');
  assert.ok(cosmetic.chips.includes('30ml'));
  assert.ok(cosmetic.chips.includes('100ml'));

  const clothes = getVariationPresetsForCategory('Roupas');
  assert.deepEqual(clothes.chips.slice(0, 4), ['P', 'M', 'G', 'GG']);

  const parsed = parseQuickPastedCatalogText(
    'Sérum Vitamina C - 119,90\nCreme Lavanda - R$ 69,90\n',
    'Cosméticos',
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Sérum Vitamina C');
  assert.equal(parsed[0].priceCents, 11990);
  assert.equal(parsed[1].name, 'Creme Lavanda');
  assert.equal(parsed[1].priceCents, 6990);

  // Regressão BUG-F02-02: milhares BR, separadores explícitos e proteção contra número no nome do produto
  const brThousands = parseQuickPastedCatalogText(
    'iPhone 15 128GB - R$ 4.299,00\nGeladeira Frost Free 1.850,50\nSérum Vitamina C 10\nCreme Facial 39.90\n',
    'Eletrônicos',
  );
  assert.equal(brThousands.length, 4);
  assert.equal(brThousands[0].name, 'iPhone 15 128GB');
  assert.equal(brThousands[0].priceCents, 429900);
  assert.equal(brThousands[1].name, 'Geladeira Frost Free');
  assert.equal(brThousands[1].priceCents, 185050);
  assert.equal(brThousands[2].name, 'Sérum Vitamina C 10');
  assert.equal(brThousands[2].priceCents, 4990);
  assert.equal(brThousands[3].name, 'Creme Facial');
  assert.equal(brThousands[3].priceCents, 3990);
});
