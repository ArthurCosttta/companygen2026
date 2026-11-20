import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import {
  sanitizeCustomerDisplayName,
  isShortClosingConfirmation,
} from '../server/ai-sofia-local.mjs';
import { sanitizePublicStoreProfile } from '../server/public-storefront-loader.mjs';
import { listAllTickets } from '../server/support-and-qr.mjs';

describe('FILA 16 — Estabilização de Campo', () => {
  it('16A-3: sanitiza "Meu numero:" e isSelfChat para nome neutro', () => {
    assert.equal(sanitizeCustomerDisplayName('Meu numero:', false), '');
    assert.equal(sanitizeCustomerDisplayName('Você', false), '');
    assert.equal(sanitizeCustomerDisplayName('Arthur', true), '');
    assert.equal(sanitizeCustomerDisplayName('+55 61 99999-0000', false), '');
    assert.equal(sanitizeCustomerDisplayName('Arthur Costa', false), 'Arthur');
  });

  it('16A-4: detecta confirmação curta após pergunta de fechamento', () => {
    assert.equal(
      isShortClosingConfirmation('sim, pode prosseguir', [
        'Confirmando: 1x Corte de unhas + 1x Ração. Posso seguir com Pix e entrega?',
      ]),
      true,
    );
    assert.equal(
      isShortClosingConfirmation('sim', ['Olá! Qual produto você procura?']),
      false,
    );
  });

  it('16B-1: preserva stock, stockQty, trackStock e autoPausedOutOfStock sem marcar Esgotado falso', () => {
    const out = sanitizePublicStoreProfile({
      catalog: {
        products: [
          { id: '1', sku: 'SKU1', name: 'Ração', priceCents: 14990 },
          { id: '2', sku: 'SKU2', name: 'Coleira', priceCents: 3500, stock: 0, trackStock: true },
        ],
      },
    });
    assert.equal(out.catalog.products[0].trackStock, false);
    assert.equal(out.catalog.products[0].stock, undefined);
    assert.equal(out.catalog.products[1].trackStock, true);
    assert.equal(out.catalog.products[1].stock, 0);
  });

  it('16D-2: listAllTickets mescla chamados locais e do Supabase sem perder fallback local', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cg-f16-'));
    try {
      await writeFile(
        path.join(tmpDir, '_support_tickets.json'),
        JSON.stringify([
          {
            id: 'local-1',
            subject: 'Erro local fallback',
            status: 'open',
            created_at: '2026-11-20T12:00:00.000Z',
          },
        ]),
      );
      const tickets = await listAllTickets({
        root: tmpDir,
        readJsonFile: async (p, def) => {
          try {
            const fs = await import('node:fs/promises');
            return JSON.parse(await fs.readFile(p, 'utf8'));
          } catch {
            return def;
          }
        },
        fetchImpl: async () => new Response('[]', { status: 200 }),
      });
      assert.ok(tickets.some((t) => t.id === 'local-1'));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
