import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MessageSquare,
  Monitor,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
} from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { PENDING_GUEST_CLAIM_KEY } from '@/components/auth/GuestClaimEmailModal';
import { saveLocalShowcaseSession, supabase } from '@/services/supabase-client';
import { resolveBrandedAppOrigin } from '@/components/views/storefront/storefront-utils';
import { normalizeInviteCodeInput } from '@/utils/inviteCode';
import { getBrandHorizontalLogo, useDocumentDarkMode } from '@/utils/themeLogos';

type DesktopOsTarget = 'win64' | 'win32' | 'mac' | 'linux';

const DESKTOP_OS_CATALOG: ReadonlyArray<{
  id: DesktopOsTarget;
  label: string;
  shortLabel: string;
  extLabel: string;
  hint: string;
  downloadName: string;
}> = [
  {
    id: 'win64',
    label: 'Windows 64-bit',
    shortLabel: 'Win 64-bit',
    extLabel: 'Instalador .EXE v1.1.0',
    hint: 'Windows 10 / 11 padrão (instalador completo com WhatsApp integrado).',
    downloadName: 'CompanyGen-Windows-64bit-1.1.0.exe',
  },
  {
    id: 'win32',
    label: 'Windows 32-bit / PC Leve',
    shortLabel: 'Win 32-bit',
    extLabel: 'Instalador .EXE Leve v1.1.0',
    hint: 'Compatível com Windows 7 / 8 / 10 32-bit e computadores de caixa com pouca RAM.',
    downloadName: 'CompanyGen-Windows-32bit-Leve-1.1.0.exe',
  },
  {
    id: 'mac',
    label: 'macOS',
    shortLabel: 'macOS',
    extLabel: 'App Launcher .ZIP',
    hint: 'Mac Apple Silicon ou Intel — abre a loja em janela própria sem navegador pesado.',
    downloadName: 'CompanyGen-macOS-App.zip',
  },
  {
    id: 'linux',
    label: 'Linux',
    shortLabel: 'Linux',
    extLabel: 'Launcher .ZIP (.sh)',
    hint: 'Ubuntu, Debian, Mint ou Fedora em janela dedicada.',
    downloadName: 'CompanyGen-Linux-App.zip',
  },
];

function detectClientDesktopOs(): DesktopOsTarget {
  if (typeof navigator === 'undefined') return 'win64';
  const ua = `${navigator.userAgent || ''} ${navigator.platform || ''}`;
  if (/Mac|Darwin/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  if (/Windows|Win32|Win64|WOW64/i.test(ua)) {
    const is64 = /Win64|WOW64|x64|amd64/i.test(ua);
    const navMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (!is64 || (typeof navMem === 'number' && navMem <= 4)) {
      return 'win32';
    }
    return 'win64';
  }
  return 'win64';
}

const SIGNUP_DRAFT_KEY = 'cg_signup_draft_v1';

interface SignupDraft {
  companyName: string;
  email: string;
}

function readSignupDraft(): SignupDraft {
  if (typeof window === 'undefined') return { companyName: '', email: '' };
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!raw) return { companyName: '', email: '' };
    const parsed = JSON.parse(raw) as Partial<SignupDraft>;
    return {
      companyName: typeof parsed.companyName === 'string' ? parsed.companyName : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
    };
  } catch {
    return { companyName: '', email: '' };
  }
}

export function AuthFlowView() {
  const { showToast } = useToast();
  const isDark = useDocumentDarkMode();
  const initialDraft = readSignupDraft();
  const [validatedInvite] = useState<{ code: string; credits: number } | null>(() => {
    try {
      const raw = sessionStorage.getItem('cg_validated_invite');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { code?: string; credits?: number };
      if (parsed && typeof parsed.code === 'string' && parsed.code.trim()) {
        return { code: parsed.code.trim(), credits: Number(parsed.credits) || 100 };
      }
      return null;
    } catch {
      return null;
    }
  });

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [companyName, setCompanyName] = useState(initialDraft.companyName);
  const [activationCode, setActivationCode] = useState(validatedInvite?.code || '');
  const [codeBusy, setCodeBusy] = useState(false);
  const [email, setEmail] = useState(initialDraft.email);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [feedback, setFeedback] = useState<{ error: boolean; duplicate?: boolean; message: string } | null>(null);

  // TELA 03: Modal Recuperar Senha
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [detectedOs] = useState<DesktopOsTarget>(() => detectClientDesktopOs());
  const [selectedOs, setSelectedOs] = useState<DesktopOsTarget>(() => detectClientDesktopOs());
  const selectedOsSpec =
    DESKTOP_OS_CATALOG.find((item) => item.id === selectedOs) || DESKTOP_OS_CATALOG[0];

  const handleDownloadDesktopPackage = () => {
    const downloadUrl = `/api/desktop/download?os=${encodeURIComponent(selectedOsSpec.id)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = selectedOsSpec.downloadName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast({
      type: 'success',
      message: `Iniciando download para ${selectedOsSpec.label} (${selectedOsSpec.downloadName})...`,
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        SIGNUP_DRAFT_KEY,
        JSON.stringify({ companyName, email }),
      );
    } catch {
      // Ignore sessionStorage errors
    }
  }, [companyName, email]);

  const isCoolingDown = Date.now() < cooldownUntil;
  const isLoginBlocked = email.trim().length === 0 || password.length === 0 || isCoolingDown;
  const isSignupBlocked =
    companyName.trim().length < 2 || !email.includes('@') || password.length < 6;

  async function handleEnterWithActivationCode() {
    if (busy || codeBusy) return;
    const cleanCode = normalizeInviteCodeInput(activationCode).trim();
    if (!/^AI10-[A-Z0-9]{3,5}-[A-Z0-9]{3,5}$/i.test(cleanCode)) {
      const el = typeof document !== 'undefined' ? document.getElementById('auth-activation-code') : null;
      el?.focus();
      setFeedback({
        error: true,
        message: 'Digite o código de ativação completo acima no formato AI10-XXXX-XXXX para entrar sem senha.',
      });
      return;
    }

    setCodeBusy(true);
    setFeedback(null);
    try {
      const valRes = await fetch('/api/access/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode }),
      });
      const valData = await valRes.json().catch(() => null);
      if (!valRes.ok || !valData?.valid) {
        setFeedback({
          error: true,
          message: valData?.error || 'Código de acesso inválido, expirado ou já vinculado a um e-mail.',
        });
        return;
      }

      const startRes = await fetch('/api/access/guest-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode }),
      });
      const guestData = await startRes.json().catch(() => null);
      if (!startRes.ok || !guestData?.ok || !guestData?.token) {
        setFeedback({
          error: true,
          message: guestData?.error || 'Não foi possível entrar com este código agora.',
        });
        return;
      }

      saveLocalShowcaseSession({
        token: guestData.token,
        user: guestData.user,
        code: cleanCode,
        credits: Number(guestData.balance ?? guestData.credits) || 0,
        balance: Number(guestData.balance ?? guestData.credits) || 0,
        savedAt: new Date().toISOString(),
      });
      showToast({
        type: 'success',
        message: guestData.resumed
          ? `Código ${cleanCode} reaberto! Você pode vincular seu e-mail no topo a qualquer momento.`
          : `Código ${cleanCode} ativado! Monte sua loja agora e vincule seu e-mail quando quiser.`,
        durationMs: 4000,
      });
    } catch {
      setFeedback({
        error: true,
        message: 'Erro de conexão ao validar o código de ativação.',
      });
    } finally {
      setCodeBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || isCoolingDown) return;

    const cleanActivation = normalizeInviteCodeInput(activationCode).trim();
    if (/^AI10-[A-Z0-9]{3,5}-[A-Z0-9]{3,5}$/i.test(cleanActivation)) {
      try {
        const valRes = await fetch('/api/access/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: cleanActivation, dryRun: true }),
        });
        const valJson = await valRes.json().catch(() => null);
        if (valRes.ok && valJson?.valid) {
          if (valJson.claimedWithoutEmail) {
            const gs = await fetch('/api/access/guest-start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: cleanActivation }),
            }).then((r) => r.json()).catch(() => null);
            if (gs?.token) {
              const pending = JSON.stringify({
                guestToken: gs.token,
                code: cleanActivation,
                email: email.trim().toLowerCase(),
                savedAt: new Date().toISOString(),
              });
              localStorage.setItem(PENDING_GUEST_CLAIM_KEY, pending);
              sessionStorage.setItem(PENDING_GUEST_CLAIM_KEY, pending);
            }
          } else {
            sessionStorage.setItem(
              'cg_validated_invite',
              JSON.stringify({
                code: cleanActivation,
                credits: Number(valJson.credits) || 100,
                validatedAt: new Date().toISOString(),
              }),
            );
          }
        }
      } catch {}
    }

    setBusy(true);
    setFeedback(null);
    try {
      const cleanEmail = email.trim();
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        setFailedAttempts(0);
        showToast({
          type: 'success',
          message: 'Login confirmado! Carregando seu espaço...',
          durationMs: 1500,
        });
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(15);
          } catch {
            // Ignore vibration failures
          }
        }
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            company_name: companyName.trim(),
          },
        },
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
          setFeedback({
            error: true,
            duplicate: true,
            message: 'Este e-mail já possui uma loja cadastrada.',
          });
          return;
        }
        throw error;
      }

      try {
        window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
      } catch {
        // Ignore sessionStorage errors
      }
      showToast({
        type: 'success',
        message: 'Conta criada com sucesso! Vamos configurar sua loja...',
        durationMs: 2000,
      });
      if (!data.session) {
        setFeedback({
          error: false,
          message: 'Conta criada! Confira seu e-mail para confirmar o acesso.',
        });
      }
    } catch {
      const nextFails = failedAttempts + 1;
      setFailedAttempts(nextFails);
      if (mode === 'login' && nextFails >= 3) {
        setCooldownUntil(Date.now() + 3000);
        window.setTimeout(() => setCooldownUntil(0), 3100);
      }
      const message =
        mode === 'login'
          ? 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.'
          : 'Falha de conexão com o servidor. Seus dados continuam preenchidos, tente novamente.';
      setFeedback({ error: true, message });
      showToast({ type: 'error', message, durationMs: 3500 });
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = resetEmail.trim();
    if (resetBusy || !cleanEmail.includes('@')) return;

    setResetBusy(true);
    setResetMessage('');
    try {
      const origin = resolveBrandedAppOrigin();
      await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo:
          typeof window !== 'undefined'
            ? (origin || window.location.origin) + window.location.pathname
            : undefined,
      });
    } catch {
      // Keep neutral security message against account enumeration
    } finally {
      setResetBusy(false);
      setResetMessage(
        'Se o e-mail existir em nossa base, as instruções foram enviadas.',
      );
      showToast({
        type: 'success',
        message: 'Link de recuperação enviado para sua caixa de entrada!',
        durationMs: 3000,
      });
    }
  }

  return (
    <main className="min-h-dvh w-full max-w-full overflow-x-hidden bg-[#F8FAFC] text-[#0F172A] dark:bg-[#090D16] dark:text-slate-100 md:grid md:grid-cols-2 md:items-stretch">
      {/* Left Brand Panel (Desktop Royal Blue & Slate Highlight) */}
      <section
        aria-label="Apresentação CompanyGen"
        className="flex min-w-0 flex-col justify-between bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#1D4ED8] p-6 text-white sm:p-10 md:p-12"
      >
        <div className="flex flex-col gap-1.5">
          <img
            src="/brand/logo-horizontal-escura.webp"
            alt="CompanyGen"
            className="h-10 w-auto self-start object-contain"
          />
          <p className="text-xs font-medium text-blue-200">
            Vitrine Online & Atendimento WhatsApp
          </p>

          {/* Diagrama visual de 5s (Web 24h -> Sofia .exe -> Pedidos) */}
          <div
            data-testid="auth-flow-5s-diagram"
            aria-label="Como o sistema funciona em 3 passos"
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-blue-200 ring-1 ring-white/20">
                <Store className="size-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-white">Vitrine 24h Web</span>
            </div>
            <ArrowRight className="hidden sm:block size-3.5 shrink-0 text-blue-300" aria-hidden="true" />
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-emerald-300 ring-1 ring-white/20">
                <MessageSquare className="size-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-white">Sofia no PC (.exe)</span>
            </div>
            <ArrowRight className="hidden sm:block size-3.5 shrink-0 text-blue-300" aria-hidden="true" />
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-amber-300 ring-1 ring-white/20">
                <ShoppingBag className="size-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-white">Pedidos no Painel</span>
            </div>
          </div>
        </div>

        <div className="hidden md:block my-8 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-blue-100">
            <Sparkles className="size-3.5 text-[#F59E0B]" aria-hidden="true" />
            <span>Pronto para vender em minutos</span>
          </div>

          <h1 className="max-w-md text-3xl font-bold tracking-tight text-white md:text-4xl">
            Sua loja online e seu WhatsApp trabalhando juntos
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-slate-200">
            Cadastre seus produtos, publique sua vitrine personalizada e receba pedidos organizados direto no WhatsApp e no painel de caixa.
          </p>

          <ul className="grid gap-3 pt-2 text-sm text-slate-100">
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-200">
                <Store className="size-4" aria-hidden="true" />
              </span>
              <span>Vitrine profissional pronta para compartilhar no Instagram</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
                <MessageSquare className="size-4" aria-hidden="true" />
              </span>
              <span>WhatsApp real integrado com respostas rápidas e chave Pix</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-200">
                <ShoppingBag className="size-4" aria-hidden="true" />
              </span>
              <span>Controle de pedidos da vitrine e vendas do balcão em tempo real</span>
            </li>
          </ul>
        </div>

        <div
          data-testid="landing-download-options"
          className="mt-4 rounded-2xl border border-white/20 bg-white/10 p-4 text-xs text-slate-100 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Monitor className="size-4 text-emerald-300" aria-hidden="true" />
              <span className="font-bold text-white">Baixar Aplicativo Desktop (v1.1.0)</span>
            </div>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold text-blue-100">
              Detectado: {DESKTOP_OS_CATALOG.find((o) => o.id === detectedOs)?.shortLabel}
            </span>
          </div>

          <div role="radiogroup" aria-label="Selecione seu sistema operacional" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {DESKTOP_OS_CATALOG.map((osOpt) => {
              const active = selectedOs === osOpt.id;
              return (
                <button
                  key={osOpt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-testid={`landing-os-select-${osOpt.id}`}
                  onClick={() => setSelectedOs(osOpt.id)}
                  className={`rounded-xl border px-2.5 py-2 text-left transition ${
                    active
                      ? 'border-white bg-white text-[#0F172A] shadow-sm'
                      : 'border-white/20 bg-white/5 text-slate-100 hover:bg-white/15'
                  }`}
                >
                  <div className="text-[11.5px] font-extrabold leading-tight">{osOpt.shortLabel}</div>
                  <div className={`mt-0.5 text-[10px] ${active ? 'text-slate-600' : 'text-blue-200'}`}>
                    {osOpt.id === 'win64'
                      ? '.exe 64-bit'
                      : osOpt.id === 'win32'
                        ? '.exe Leve'
                        : osOpt.id === 'mac'
                          ? '.zip Mac'
                          : '.zip Linux'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-slate-950/35 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white">
                {selectedOsSpec.label} · {selectedOsSpec.extLabel}
              </p>
              <p className="text-[10.5px] text-slate-300 leading-snug">{selectedOsSpec.hint}</p>
            </div>
            <button
              type="button"
              data-testid="landing-download-os-btn"
              onClick={handleDownloadDesktopPackage}
              className="inline-flex shrink-0 min-h-[40px] items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-xs font-extrabold text-slate-950 shadow-sm transition hover:bg-emerald-300"
            >
              <Download className="size-4" aria-hidden="true" />
              <span>Baixar {selectedOsSpec.shortLabel}</span>
            </button>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 pt-3 text-xs text-slate-300">
          <ShieldCheck className="size-4 text-emerald-400" aria-hidden="true" />
          <span>Dados isolados por conta e backup automático seguro</span>
        </div>
      </section>

      {/* Right Auth Card (TELA 01 Login / TELA 02 Signup) */}
      <section
        aria-labelledby="auth-heading"
        className="flex min-w-0 items-center justify-center p-4 py-8 sm:p-8 md:p-12"
      >
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {validatedInvite ? (
            <div
              data-testid="auth-invite-banner"
              className="mb-5 flex flex-col gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900"
            >
              <div className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-bold">
                    Convite {validatedInvite.code} validado (+{validatedInvite.credits} créditos de IA)
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    Entre ou crie sua conta abaixo para resgatar seus créditos imediatamente.
                  </p>
                </div>
              </div>
              {validatedInvite.code.toUpperCase() === 'AI10-FARM-LUME' ? (
                <button
                  type="button"
                  data-testid="auth-open-showcase-lume-btn"
                  onClick={async () => {
                    try {
                      const r = await fetch('/api/access/local-showcase-login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: 'AI10-FARM-LUME' }),
                      });
                      const j = await r.json().catch(() => null);
                      if (r.ok && j?.ok && j.token) {
                        saveLocalShowcaseSession({
                          token: j.token,
                          user: j.user,
                          code: 'AI10-FARM-LUME',
                          credits: Number(j.credits) || 65,
                          balance: Number(j.balance ?? 65),
                          savedAt: new Date().toISOString(),
                        });
                      } else {
                        setFeedback({
                          error: true,
                          message: j?.error || 'Não foi possível carregar o perfil de teste.',
                        });
                      }
                    } catch (err) {
                      console.warn('[AuthFlowView] Falha ao entrar no perfil showcase:', err);
                      setFeedback({
                        error: true,
                        message: 'Erro de conexão ao carregar o perfil de teste.',
                      });
                    }
                  }}
                  className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-center text-xs font-bold text-white hover:bg-emerald-800 transition"
                >
                  Carregar Perfil de Teste (AI10-FARM-LUME) →
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <img
              src={getBrandHorizontalLogo(isDark)}
              alt="CompanyGen"
              data-testid="auth-brand-logo"
              className="mb-3 h-7 w-auto object-contain bg-transparent"
            />
            <p className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
              {mode === 'signup' ? 'Nova loja' : 'Acesso do lojista'}
            </p>
            <h2
              id="auth-heading"
              className="text-2xl font-bold tracking-tight text-[#0F172A]"
            >
              {mode === 'signup'
                ? 'Comece a Vender Online em Minutos'
                : 'Entrar no CompanyGen'}
            </h2>
            <p className="text-sm text-slate-600">
              {mode === 'signup'
                ? 'Crie sua conta grátis para configurar sua vitrine e atender clientes.'
                : 'Acesse o painel da sua loja e acompanhe pedidos em tempo real.'}
            </p>
          </div>

          <form
            role="form"
            aria-label={
              mode === 'signup'
                ? 'Cadastro de Nova Loja'
                : 'Acesso ao Painel da Loja'
            }
            onSubmit={handleSubmit}
            className="mt-6 space-y-4"
          >
            {mode === 'signup' ? (
              <div>
                <label
                  htmlFor="auth-company-name"
                  className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                >
                  Nome da Sua Loja
                </label>
                <input
                  id="auth-company-name"
                  type="text"
                  required
                  aria-required="true"
                  minLength={2}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Atelier Bella Vista"
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            ) : null}

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor="auth-activation-code"
                  className="block text-sm font-semibold text-[#0F172A]"
                >
                  Código de ativação / acesso
                </label>
                <span className="text-[11px] font-medium text-slate-400">
                  Opcional se já tiver conta
                </span>
              </div>
              <div className="relative">
                <KeyRound
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="auth-activation-code"
                  data-testid="auth-activation-code-input"
                  type="text"
                  autoComplete="off"
                  spellCheck="false"
                  maxLength={16}
                  value={activationCode}
                  onChange={(e) => setActivationCode(normalizeInviteCodeInput(e.target.value))}
                  placeholder="AI10-XXXX-XXXX"
                  className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-sm font-bold tracking-wider text-[#0F172A] placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-email"
                className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
              >
                {mode === 'signup' ? 'Seu Melhor E-mail' : 'E-mail de Acesso'}
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                aria-required="true"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lojista@empresa.com.br"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-semibold text-[#0F172A]"
                >
                  {mode === 'signup' ? 'Crie uma Senha Forte' : 'Sua Senha'}
                </label>
                {mode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setResetMessage('');
                      setResetModalOpen(true);
                    }}
                    className="text-xs font-medium text-slate-500 underline-offset-4 hover:text-[#2563EB] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    Esqueci minha senha
                  </button>
                ) : null}
              </div>

              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  aria-required="true"
                  minLength={mode === 'signup' ? 6 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white pr-12 pl-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar Senha' : 'Mostrar Senha'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-1 flex min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  {showPassword ? (
                    <EyeOff className="size-[18px]" aria-hidden="true" />
                  ) : (
                    <Eye className="size-[18px]" aria-hidden="true" />
                  )}
                </button>
              </div>
              {mode === 'signup' ? (
                <p className="mt-1 text-xs text-slate-500">
                  Mínimo de 6 letras e números
                </p>
              ) : null}
            </div>

            {feedback ? (
              <div
                role={feedback.error ? 'alert' : 'status'}
                className={
                  feedback.duplicate
                    ? 'rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'
                    : feedback.error
                      ? 'rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700'
                      : 'rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'
                }
              >
                <span>{feedback.message}</span>
                {feedback.duplicate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setFeedback(null);
                    }}
                    className="ml-2 font-semibold text-[#1D4ED8] underline underline-offset-4"
                  >
                    Fazer Login
                  </button>
                ) : null}
              </div>
            ) : null}

            <ActionButton
              type="submit"
              variant="primary"
              size={48}
              fullWidth
              disabled={mode === 'login' ? isLoginBlocked : isSignupBlocked}
              isLoading={busy}
              loadingText={mode === 'signup' ? 'Criando loja...' : 'Entrando...'}
              rightIcon={
                mode === 'signup' ? (
                  <Check className="size-[18px]" aria-hidden="true" />
                ) : (
                  <ArrowRight className="size-[18px]" aria-hidden="true" />
                )
              }
            >
              {mode === 'signup'
                ? 'Criar Minha Conta e Começar'
                : 'Entrar no Meu Painel'}
            </ActionButton>

            <button
              type="button"
              data-testid="auth-enter-with-code-btn"
              disabled={busy || codeBusy}
              onClick={() => void handleEnterWithActivationCode()}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
            >
              <KeyRound className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {codeBusy
                  ? 'Validando código de acesso...'
                  : 'Entrar com código de acesso (sem senha) →'}
              </span>
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              data-testid="auth-open-access-btn"
              onClick={() => {
                try {
                  const url = new URL(window.location.href);
                  url.pathname = '/access';
                  url.searchParams.delete('route');
                  window.history.pushState({}, '', url.toString());
                } catch (err) {
                  console.warn('[AuthFlowView] Falha ao atualizar histórico de navegação:', err);
                }
                window.dispatchEvent(new CustomEvent('companygen:open-access'));
              }}
              className="text-xs font-medium text-slate-600 hover:text-[#2563EB] transition"
            >
              Possui código de convite?{' '}
              <span className="font-bold underline underline-offset-2">Inserir código de acesso</span>
            </button>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4 text-center">
            {mode === 'login' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setFeedback(null);
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                Criar conta da minha loja
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setFeedback(null);
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                Já tenho conta · Fazer Login
              </button>
            )}
          </div>
        </div>
      </section>

      {/* TELA 03: Modal Recuperar Senha */}
      <ModalContainer
        open={resetModalOpen}
        onOpenChange={setResetModalOpen}
        role="dialog"
        maxWidth="sm"
        mobileHeight="auto"
        preventCloseWhileSubmitting={resetBusy}
        title="Recuperar Acesso à Conta"
        description="Digite o e-mail cadastrado na sua loja para enviarmos o link de recuperação."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ActionButton
              variant="secondary"
              size={44}
              disabled={resetBusy}
              onClick={() => setResetModalOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              type="submit"
              form="reset-password-form"
              variant="primary"
              size={46}
              disabled={!resetEmail.includes('@')}
              isLoading={resetBusy}
              loadingText="Enviando..."
              leftIcon={<Mail className="size-4" aria-hidden="true" />}
            >
              Enviar Link de Recuperação
            </ActionButton>
          </div>
        }
      >
        <form
          id="reset-password-form"
          onSubmit={handleResetPassword}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="reset-password-email"
              className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
            >
              E-mail cadastrado
            </label>
            <input
              id="reset-password-email"
              type="email"
              required
              autoFocus
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="lojista@empresa.com.br"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          {resetMessage ? (
            <p
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              {resetMessage}
            </p>
          ) : null}
        </form>
      </ModalContainer>
    </main>
  );
}
