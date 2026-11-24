import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ARTIFACT_ONBOARDING_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_onboarding_v2';
const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '88888888-8888-4888-8888-888888888888';

function samplePngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJklEQVR42mNgYmD4z8DAwMQABIz///9nYGRkZGBkAAHGBkZGhgEAAQYFAwE26jUAAAAASUVORK5CYII=',
    'base64',
  );
}

test.describe('Onboarding Contexto Enriquecido + CSS Tuple Multipliers + Planilha Reativa + Logo/Fotos', () => {
  test.beforeAll(() => {
    fs.mkdirSync(path.resolve(ARTIFACT_ONBOARDING_DIR), { recursive: true });
  });

  test('Valida fluxo completo: DRE reativo, CSV com URLs públicas, upload de logo, multiplicadores CSS e envio de marketingConcept', async ({
    page,
  }) => {
    const user = {
      id: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'onboarding.v2@example.invalid',
      app_metadata: {},
      user_metadata: { company_name: '' },
      created_at: new Date().toISOString(),
    };
    const session = {
      access_token: 'v2-token',
      refresh_token: 'v2-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    };

    let savedProfilePayload: Record<string, unknown> | null = null;
    const initialProfile = {
      schemaVersion: 1,
      onboarding: {
        whatsappConnected: false,
        whatsappConfirmed: false,
        fichaCompleted: false,
        storeGenerated: false,
      },
      business: { name: '', segment: '', businessModel: 'produtos', description: '' },
      brand: { primaryColor: '#09090B', accentColor: '#2563EB', logoUrl: '' },
      catalog: { products: [] },
      payment: { pixKey: '' },
      storefront: { published: false, publicSlug: '', sourceRevision: 1 },
    };

    await page.addInitScript(
      ({ key, val }) => {
        localStorage.setItem(key, JSON.stringify(val));
        localStorage.setItem('cg_theme', 'light');
      },
      { key: SUPABASE_STORAGE_KEY, val: session },
    );

    await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
      route.fulfill({ json: user }),
    );

    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const pathname = new URL(req.url()).pathname;

      if (pathname === '/api/profile') {
        if (req.method() === 'PUT') {
          const body = JSON.parse(req.postData() || '{}') as { profile?: Record<string, unknown> };
          if (body.profile) {
            savedProfilePayload = body.profile;
          }
          return route.fulfill({ json: { revision: 2, provider: 'local', profile: body.profile || initialProfile } });
        }
        return route.fulfill({ json: { revision: 1, provider: 'local', profile: savedProfilePayload || initialProfile } });
      }

      if (pathname === '/api/store-molde/generate-full') {
        return route.fulfill({
          json: {
            ok: true,
            generatedBy: 'glm-atomic-v3',
            modelUsed: 'zai-org/GLM-5.3',
            formulasIr: {
              version: '9.0',
              storeIdentityId: 'atelier-v2',
              designTokens: {
                accent: '#2563EB',
                accentDeep: '#1D4ED8',
                surface: '#FFFFFF',
                surfaceAlt: '#F8FAFC',
                card: '#FFFFFF',
                ink: '#09090B',
                inkMuted: '#475569',
                footerBg: '#09090B',
                fontStyle: 'editorial_serif',
                radiusPx: 14,
              },
              sections: [
                { id: 'sec_hdr', type: 'HeaderNav', config: { ctaLabel: 'WhatsApp', showBag: true, showSearch: true, links: [] } },
                { id: 'sec_hero', type: 'HeroSection', config: { title: 'Atelier V2', subtitle: 'Curadoria artesanal', primaryCta: { label: 'Ver Catálogo', href: '#catalogo' } } },
              ],
            },
          },
        });
      }

      if (pathname === '/api/credits/balance') {
        return route.fulfill({ json: { ok: true, balance: 150, isAdmin: false, banned: false } });
      }

      return route.fulfill({ json: { ok: true } });
    });

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/');

    await expect(page.getByTestId('ignition-stage')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('ignition-store-input').fill('Atelier Papelaria V2');

    // 1. Subir planilha financeira DRE -> deve disparar feedback reativo de erro claro
    await page.getByTestId('ignition-file-input').setInputFiles({
      name: 'fluxo_caixa.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Data;Receita;Despesa;Saldo;Boleto\n01/11;0;3500;-3500;B01', 'utf8'),
    });
    await expect(page.getByTestId('ignition-spreadsheet-reactive-card')).toContainText(
      'Planilha financeira detectada',
    );

    // 2. Subir CSV de catálogo real com link público de foto -> mostra fotos extraídas + grid de itens + ★ carro-chefe
    await page.getByTestId('ignition-file-input').setInputFiles({
      name: 'catalogo_atelier.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        [
          'SKU;Produto;Categoria;Preco;Foto_URL',
          'CAD-01;Caderno Polido A5;Cadernos;69,90;https://images.unsplash.com/photo-1544816155-12df9643f363?w=400',
          'KIT-02;Kit Presente Cafe;Kits;149,00;https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400',
        ].join('\n'),
        'utf8',
      ),
    });
    await expect(page.getByTestId('ignition-dropzone-loaded')).toBeVisible();
    await expect(page.getByTestId('ignition-spreadsheet-reactive-card')).toContainText('2 fotos extraídas');
    await expect(page.getByTestId('ignition-photos-grid')).toBeVisible();

    // 3. Upload da Logo -> extração de paleta real
    await page.getByTestId('ignition-logo-input').setInputFiles({
      name: 'logo-atelier.png',
      mimeType: 'image/png',
      buffer: samplePngBuffer(),
    });
    await expect(page.getByTestId('ignition-logo-uploader')).toContainText('Paleta extraída da logo');

    // 4. Contexto de marca & objetivo para o GLM (sem seletores de layout poluídos)
    await page.getByTestId('multiplier-voice-warm_artisan').click();
    await page.getByTestId('multiplier-growth-goal').selectOption('raise_ticket');
    await page.getByTestId('multiplier-objection-input').fill('Entrega garantida no mesmo dia');

    await page.getByTestId('ignition-whatsapp-input').fill('11987654321');
    await page.getByTestId('ignition-pix-input').fill('11987654321');

    await page.screenshot({ path: `${ARTIFACT_ONBOARDING_DIR}/onboarding_full_context_1440.png`, fullPage: true });

    // 5. Submeter e verificar que marketingConcept + logo + fotos chegaram ao profile salvo!
    await page.getByTestId('ignition-submit-btn').click();
    await expect.poll(() => Boolean(savedProfilePayload)).toBe(true);

    const mc = (savedProfilePayload as unknown as { marketingConcept?: Record<string, unknown> })?.marketingConcept;
    expect(mc?.brandVoice).toBe('warm_artisan');
    expect(mc?.heroLayout).toBe('hero_split');
    expect(mc?.showcaseLayout).toBe('bento_spotlight');
    expect(mc?.gridDensity).toBe('3');
    expect(mc?.growthGoal).toBe('raise_ticket');
    expect(mc?.coreProductSku).toBe('CAD-01');
    expect(mc?.mainObjection).toBe('Entrega garantida no mesmo dia');
  });
});
