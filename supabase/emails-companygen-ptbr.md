# Templates de E-mail Personalizados — CompanyGen (PT-BR)

Cole estes templates no painel do Supabase:
**Authentication → Email Templates** (`https://supabase.com/dashboard/project/irahjajgudbdkgggffum/auth/templates`)

> **Observação:** Após publicar o domínio `https://companygen.store` com o app atualizado, a URL `https://companygen.store/brand/assinatura-email.png` carregará a assinatura oficial transparente diretamente nos e-mails.

---

## 1. Template: **Magic Link** (Recarga de Créditos / Acesso Rápido)

* **Subject (Assunto):**
  `Seu acesso & créditos no CompanyGen estão prontos`

* **Body (HTML):**
```html
<div style="font-family:Inter,Arial,sans-serif;background:#F8FAFC;padding:32px 16px;color:#0F172A;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;padding:32px;">
    <div style="margin-bottom:24px;">
      <img src="https://companygen.store/brand/assinatura-email.png" alt="CompanyGen — Sua loja e atendimento com IA" height="48" style="display:block;height:48px;width:auto;" />
    </div>

    <h1 style="font-size:20px;font-weight:800;margin:0 0 12px;color:#0F172A;">
      Acesse sua conta CompanyGen
    </h1>
    <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 24px;">
      Recebemos uma atualização na sua conta (compra aprovada, recarga de créditos ou solicitação de acesso). Clique no botão abaixo para entrar direto com segurança:
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:12px;">
        Entrar no CompanyGen agora →
      </a>
    </div>

    <p style="font-size:12px;line-height:1.5;color:#64748B;margin:0;border-top:1px solid #E2E8F0;padding-top:16px;">
      Este link expira em poucos minutos e vale para 1 acesso. Se você não solicitou este e-mail, pode ignorá-lo com segurança.
    </p>
  </div>
</div>
```

---

## 2. Template: **Invite User** (Novo Comprador na Kiwify sem Conta Prévia)

* **Subject (Assunto):**
  `Bem-vindo ao CompanyGen — ative seus créditos agora`

* **Body (HTML):**
```html
<div style="font-family:Inter,Arial,sans-serif;background:#F8FAFC;padding:32px 16px;color:#0F172A;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;padding:32px;">
    <div style="margin-bottom:24px;">
      <img src="https://companygen.store/brand/assinatura-email.png" alt="CompanyGen — Sua loja e atendimento com IA" height="48" style="display:block;height:48px;width:auto;" />
    </div>

    <h1 style="font-size:20px;font-weight:800;margin:0 0 12px;color:#0F172A;">
      Seu acesso ao CompanyGen foi liberado!
    </h1>
    <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 24px;">
      Sua compra foi confirmada e já preparamos sua loja com créditos de IA. Clique no botão abaixo para criar sua senha e resgatar seus créditos automaticamente:
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#10B981;color:#FFFFFF;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:12px;">
        Ativar minha conta e créditos →
      </a>
    </div>

    <p style="font-size:12px;line-height:1.5;color:#64748B;margin:0;border-top:1px solid #E2E8F0;padding-top:16px;">
      Qualquer dúvida, abra <strong>Ajustes → Reportar Problema / Suporte</strong> dentro do aplicativo.
    </p>
  </div>
</div>
```
