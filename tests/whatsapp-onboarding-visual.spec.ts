import { test, expect } from '@playwright/test';

// ATENÇÃO: Este teste automatizado é um contrato sintético para validação da transição de passos
// (Conectar -> Confirmar -> Configurar) e layout responsivo. O QR code SVG aqui é meramente mockado
// para o runner de CI. A validação e captura do QR Code REAL emitido pelo Baileys é realizada ao vivo
// em scripts/capture-real-app-flow.mjs e verificada no backend por tests/security-api.test.mjs.

const evidence = 'C:/Users/arthur/Documents/Codex/2026-11-07/teste-whatsapp-ia/delivery-panel/evidence';
const supabaseUrl = 'https://irahjajgudbdkgggffum.supabase.co';
const userId = '33333333-3333-4333-8333-333333333333';

test('onboarding preserva QR, confirmação, agente e entrada no atendimento', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'onboarding@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: 'visual-onboarding-token', refresh_token: 'visual-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };
  await context.addInitScript(({ session }) => localStorage.setItem('sb-irahjajgudbdkgggffum-auth-token', JSON.stringify(session)), { session });
  await context.route(supabaseUrl + '/auth/v1/**', route => route.fulfill({ json: user }));

  const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 12 12"><rect width="12" height="12" fill="white"/><path fill="#102b24" d="M1 1h4v4H1zm1 1v2h2V2zm5-1h4v4H7zm1 1v2h2V2zM1 7h4v4H1zm1 1v2h2V8zm4-2h1v1H6zm2 0h2v1H8zM6 8h2v1H6zm3 0h2v2H9zM6 10h1v1H6zm2 1h3v1H8z"/></svg>`;
  let state = {
    conectado: false, status: 'Iniciando conexão...', numeroBot: '', qr: '',
    persistencia: { provider: 'supabase' },
    configLoja: { nomeLoja: '', nomeAtendente: 'Atendente Virtual', onboardingConcluido: false },
    config: { botAtivo: false, enviarFotoAutomatica: true, ignorarArquivadas: true, somenteNovas: true, responderAudioComAudio: true, delayHumanoMs: 2000 },
    conversas: [], contatos: [], skus: [], documentos: [], templates: [],
  };

  await context.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/workspace') {
      return route.fulfill({ json: request.method() === 'GET' ? { revision: 0, data: {}, provider: 'supabase' } : { revision: 1, provider: 'supabase' } });
    }
    if (pathname === '/api/whatsapp/api/dados') return route.fulfill({ json: state });
    if (pathname === '/api/whatsapp/api/sessao/connect') {
      await new Promise(resolve => setTimeout(resolve, 700));
      state = { ...state, status: 'Aguardando QR Code', qr: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg) };
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/whatsapp/api/whatsapp/perfil') {
      return route.fulfill({ json: { ok: true, conectado: true, nome: 'Loja Alfa Oficial', telefoneFormatado: '+55 (61) 99999-0000', fotoUrl: null } });
    }
    if (pathname === '/api/whatsapp/api/onboarding/salvar') {
      const payload = request.postDataJSON();
      state = { ...state, configLoja: { ...state.configLoja, ...payload, onboardingConcluido: true } };
      return route.fulfill({ json: { ok: true, configLoja: state.configLoja } });
    }
    if (pathname === '/api/whatsapp/api/config/save') {
      state = { ...state, config: { ...state.config, ...request.postDataJSON() } };
      return route.fulfill({ json: { ok: true, config: state.config } });
    }
    return route.fulfill({ status: 404, json: { error: 'Rota não simulada neste teste visual.' } });
  });

  const page = await context.newPage();
  const capture = (name: string) => page.locator('.cg-shell').screenshot({ path: `${evidence}/${name}` });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Minha loja', exact: true }).waitFor();
  await page.locator('.cg-sidebar').getByRole('button', { name: 'WhatsApp', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Conecte o aparelho que atende seus clientes' })).toBeVisible();
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.cg-onboarding')?.scrollTo(0, 0); });
  await capture('22-antes-onboarding-gerando-qr.png');
  await expect(page.getByRole('img', { name: 'QR Code para conectar o WhatsApp' })).toBeVisible({ timeout: 5000 });
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.cg-onboarding')?.scrollTo(0, 0); });
  await capture('23-depois-onboarding-com-qr.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.cg-onboarding')?.scrollTo(0, 0); });
  await capture('23b-onboarding-qr-mobile.png');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 960 });

  state = { ...state, conectado: true, numeroBot: '5561999990000', qr: '', status: 'CONECTADO' };
  await expect(page.getByRole('heading', { name: 'Confirme a conta conectada' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Loja Alfa Oficial', { exact: true })).toBeVisible();
  await page.evaluate(() => document.querySelector('.cg-onboarding')?.scrollTo(0, 0));
  await capture('24-depois-confirmacao-conta-real.png');

  await page.getByRole('button', { name: /Sim, continuar/ }).click();
  await expect(page.getByRole('heading', { name: 'Prepare sua loja e sua atendente' })).toBeVisible();
  await page.getByLabel('Nome da empresa').fill('Loja Alfa');
  await page.getByLabel('Nome da atendente').fill('Lia');
  await expect(page.getByRole('checkbox', { name: /Atender automaticamente/ })).toBeChecked();
  await page.evaluate(() => document.querySelector('.cg-onboarding')?.scrollTo(0, 0));
  await capture('25-depois-configuracao-agente.png');

  await page.evaluate(() => document.querySelector('.cg-onboarding')?.scrollTo(0, 10000));
  await capture('25b-configuracao-agente-e-conclusao.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.querySelector('.cg-onboarding')?.scrollTo(0, 10000));
  await capture('25c-configuracao-agente-mobile.png');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.getByRole('button', { name: /Concluir e abrir atendimento/ }).click();
  await expect(page.getByRole('navigation', { name: 'Áreas do WhatsApp' })).toBeVisible();
  await expect(page.locator('.cg-sidebar').getByText('offline', { exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.cg-sidebar')?.scrollTo(0, 0); });
  await capture('26-depois-onboarding-concluido.png');
  await context.close();
});
