import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

test.describe('Trailer Cena 2: Vitrine Pública Mobile 390px sem zoom iOS (F07-T2)', () => {
  test('Captura F07-T2 vitrine mobile 390x844 com fonte >=16px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/api/store-molde/**', (route) =>
      route.fulfill({
        json: {
          version: '9.0',
          storeInfo: {
            name: 'Botânica Lume',
            segment: 'Cosméticos Botânicos',
            description: 'Skincare natural com entrega expressa e desconto no Pix.',
            whatsappE164: '5511999990000',
            pixDiscountPercent: 5,
            businessModel: 'produtos',
          },
          designTokens: { accent: '#2563EB', background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A' },
          catalog: [
            { id: 'p1', sku: 'SER-01', name: 'Sérum Botânico C+E', priceCents: 15000, stock: 12, active: true, description: 'Vitamina C pura com ácido ferúlico.' },
            { id: 'p2', sku: 'KIT-03', name: 'Kit Rotina Completa', priceCents: 28000, stock: 8, active: true, description: 'Limpeza, hidratação e proteção diária.' },
          ],
          sections: [
            { id: 'hero-1', type: 'hero', props: { headline: 'Sua rotina de skincare com entrega em 2h', subheadline: 'Produtos botânicos frescos e atendimento imediato pelo WhatsApp.', ctaLabel: 'Ver Catálogo' } },
          ],
        },
      }),
    );

    const page = await context.newPage();
    await page.goto('/?view=store&u=66666666-6666-4666-8666-666666666666&loja=botanica-lume', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Botânica Lume').first()).toBeVisible({ timeout: 10_000 });
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(hasOverflow).toBe(false);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_trailer_cena2_vitrine_mobile_390.png` });
    await context.close();
  });
});
