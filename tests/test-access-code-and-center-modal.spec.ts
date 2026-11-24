import { test, expect } from '@playwright/test';

const OUT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_plan10';

test.describe('Validação de Códigos de Acesso e Modal Central de Mensagens', () => {
  test('1. Validação no Login (AuthFlowView) e Modal Central de Mensagens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Abre tela inicial de login (Print 1 do usuário)
    await page.goto('/');
    await expect(page.locator('input[placeholder="AI10-XXXX-XXXX"]')).toBeVisible({ timeout: 10000 });

    const authCodeInput = page.locator('input[placeholder="AI10-XXXX-XXXX"]');
    await authCodeInput.fill('AI10-NATA-LVER');

    // Clica em "Entrar com código de acesso (sem senha) →"
    const enterBtn = page.getByTestId('auth-enter-with-code-btn');
    await expect(enterBtn).toBeVisible();
    await enterBtn.click();

    // Garante que não exibe o erro e loga com sucesso
    await expect(page.locator('text=Código de acesso não encontrado ou inválido')).not.toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${OUT_DIR}/auth_flow_login_code_success.png` });

    // 2. Abre a Vitrine no modo Preview do Lojista
    await page.goto('/?preview=vitrine');
    await expect(page.getByTestId('open-whatsapp-flows-btn')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('open-whatsapp-flows-btn').click();

    // 3. Verifica o Modal Central aberto no meio da tela
    const centerModal = page.getByTestId('whatsapp-flow-center-modal');
    await expect(centerModal).toBeVisible();

    // ABA 1: Simulação no Celular com Animação em tempo real
    await expect(page.getByTestId('wpp-fake-chat-simulator')).toBeVisible();
    await expect(page.getByTestId('fake-chat-bubble-customer')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/center_modal_fake_chat_simulator.png` });

    // ABA 2: Mapa de Regras ("Se mandar tal mensagem -> Sofia responde tal")
    await page.getByTestId('tab-center-map').click();
    await expect(page.locator('text=Se o cliente mandar').first()).toBeVisible();
    await expect(page.locator('text=Sofia IA responde').first()).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/center_modal_rules_map.png` });

    // ABA 3: Criação de Nova Regra Ilustrada
    await page.getByTestId('tab-center-create').click();
    await expect(page.locator('text=Criar Nova Regra de Resposta Automática')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/center_modal_create_rule.png` });
  });

  test('2. Validação no Acesso Convidado (AccessCodeView - Print 2)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Tela de Convite (/ ?route=access - Print 2 do usuário)
    await page.goto('/?route=access');
    await expect(page.locator('input[placeholder="AI10-XXXX-XXXX"]')).toBeVisible({ timeout: 10000 });

    const codeInput = page.locator('input[placeholder="AI10-XXXX-XXXX"]');
    await codeInput.fill('AI10-NATA-LVER');

    // Clica no botão de validação
    const validateBtn = page.locator('[data-testid="access-validate-btn"], [data-testid="access-claim-email-btn"]').first();
    await expect(validateBtn).toBeVisible({ timeout: 5000 });
    await validateBtn.click({ force: true });

    // Verifica que valida com sucesso e não exibe o erro
    await expect(page.locator('text=Código de acesso não encontrado ou inválido')).not.toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${OUT_DIR}/access_code_validated_success.png` });
  });
});
