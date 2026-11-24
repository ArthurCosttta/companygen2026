import JSZip from 'jszip';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  buildDefaultMensagemMolde,
  formatCurrencyBRL,
  hydrateMensagemMolde,
  sanitizePhoneE164,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import type { WhatsappRuntimeStatus } from '@/hooks/useConnectionPhase';
import { deriveThemeTokensFromHex } from '../../../../shared/formula-ir/composer-schema.mjs';
import { ensureFormulaV9 } from '../../../../shared/formula-ir/neutral-fallback-v9.mjs';

const SAFE_CSS_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function safeCssHex(val: unknown, fallback = '#0B4DB8'): string {
  const clean = String(val ?? '').trim();
  return SAFE_CSS_HEX_RE.test(clean) ? clean : fallback;
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isRealPhoto(url?: string): boolean {
  const s = String(url || '').trim();
  return Boolean(s && !s.startsWith('data:image/svg+xml'));
}

function resolveConnectedDigits(
  profile: BusinessProfile,
  runtimeStatus?: WhatsappRuntimeStatus | null,
): string {
  const candidates = [
    runtimeStatus?.numeroBot,
    runtimeStatus?.phoneE164,
    profile.whatsapp?.phoneE164,
    profile.whatsapp?.displayPhone,
  ];
  for (const raw of candidates) {
    const clean = sanitizePhoneE164(raw || '');
    if (clean.length >= 10) return clean;
  }
  return '';
}

const SAFE_MOLDE_REL_RE = /^(?:index\.html|styles\.css|app\.js|data\/formulas-ir\.json|pages\/[a-z0-9._-]+\.html|assets\/[a-z0-9._/-]+)$/i;

function isSafeMoldeRelPath(relPath: string): boolean {
  return (
    Boolean(relPath) &&
    !relPath.includes('..') &&
    !relPath.includes('\\') &&
    SAFE_MOLDE_REL_RE.test(relPath)
  );
}

function appendOfflineAndHostingFiles(
  zip: JSZip,
  {
    storeName,
    accentHex,
    surfaceHex,
    inkHex,
  }: {
    storeName: string;
    accentHex?: string;
    surfaceHex?: string;
    inkHex?: string;
  },
): void {
  const safeStoreName = escapeHtml(storeName || 'Minha Loja');
  const safeAccent = safeCssHex(accentHex, '#0B4DB8');
  const safeSurface = safeCssHex(surfaceHex, '#F8FAFC');
  const safeInk = safeCssHex(inkHex, '#0F172A');

  // 100% estático — ZERO interpolação de dados do lojista/usuário para impedir injeção em cmd.exe
  // Verifica o conjunto obrigatório (index.html + styles.css + app.js) e sobe servidor HTTP local
  // em 127.0.0.1 para carregar CSS, JS, páginas e imagens sem bloqueios de file:// no Windows.
  const psHttpScript = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$root=[System.IO.Path]::GetFullPath((Get-Location).Path).TrimEnd([char]92)",
    "$sep=[System.IO.Path]::DirectorySeparatorChar",
    "$mime=@{'.html'='text/html; charset=utf-8';'.css'='text/css; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.mjs'='text/javascript; charset=utf-8';'.json'='application/json; charset=utf-8';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.webp'='image/webp';'.gif'='image/gif';'.avif'='image/avif';'.woff2'='font/woff2';'.txt'='text/plain; charset=utf-8'}",
    "$l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)",
    "$l.Start(64)",
    "$port=$l.LocalEndpoint.Port",
    "$url='http://127.0.0.1:'+$port+'/index.html'",
    "Write-Host ('[CompanyGen] Vitrine servida em '+$url)",
    "Write-Host '[CompanyGen] Conjunto ativo: index.html + styles.css + app.js + pages/ + assets/'",
    "Write-Host '[CompanyGen] Mantenha esta janela aberta enquanto navega. Feche ou aperte CTRL+C para encerrar.'",
    "if(-not $env:CG_BAT_NO_BROWSER){Start-Process $url}",
    "while($true){$c=$l.AcceptTcpClient();try{$c.NoDelay=$true;$c.ReceiveTimeout=600;$c.SendTimeout=2500;$s=$c.GetStream();$sr=New-Object System.IO.StreamReader($s,[System.Text.Encoding]::ASCII,$false,1024,$true);$req=$sr.ReadLine();while(($hdr=$sr.ReadLine()) -ne $null -and $hdr.Length -gt 0){};$status='404 Not Found';$ctype='text/plain; charset=utf-8';$bytes=[System.Text.Encoding]::UTF8.GetBytes('Arquivo nao encontrado');$headOnly=$false;if($req -match '^(GET|HEAD)\\s+([^\\s]+)\\s+HTTP/'){$method=$matches[1];$headOnly=($method -eq 'HEAD');$raw=($matches[2] -split '\\?')[0];$rel=[System.Uri]::UnescapeDataString($raw).TrimStart('/');if([string]::IsNullOrWhiteSpace($rel)){$rel='index.html'};$segs=$rel -split '/';$bad=$segs|Where-Object{$_ -eq '..' -or $_.StartsWith('.')};$cand=[System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root,($rel -replace '/',$sep)));if((-not $bad) -and $cand.StartsWith($root+$sep,[System.StringComparison]::OrdinalIgnoreCase)){if(Test-Path -LiteralPath $cand -PathType Container){$cand=[System.IO.Path]::Combine($cand,'index.html')};if(Test-Path -LiteralPath $cand -PathType Leaf){$ext=[System.IO.Path]::GetExtension($cand).ToLowerInvariant();if($mime.ContainsKey($ext)){$status='200 OK';$ctype=$mime[$ext];$bytes=[System.IO.File]::ReadAllBytes($cand)}else{$status='403 Forbidden';$bytes=[System.Text.Encoding]::UTF8.GetBytes('Tipo de arquivo nao permitido')}}elseif(Test-Path -LiteralPath ([System.IO.Path]::Combine($root,'404.html')) -PathType Leaf){$ctype='text/html; charset=utf-8';$bytes=[System.IO.File]::ReadAllBytes([System.IO.Path]::Combine($root,'404.html'))}}}else{$status='400 Bad Request';$bytes=[System.Text.Encoding]::UTF8.GetBytes('Requisicao invalida')};$cr=[char]13;$lf=[char]10;$head='HTTP/1.1 '+$status+$cr+$lf+'Content-Type: '+$ctype+$cr+$lf+'Content-Length: '+$bytes.Length+$cr+$lf+'Cache-Control: no-store'+$cr+$lf+'Connection: close'+$cr+$lf+$cr+$lf;$hb=[System.Text.Encoding]::ASCII.GetBytes($head);$s.Write($hb,0,$hb.Length);if(-not $headOnly -and $bytes.Length -gt 0){$s.Write($bytes,0,$bytes.Length)};$s.Flush()}catch{}finally{$c.Close()}}",
  ].join('; ');

  const abrirBat = [
    '@echo off',
    'setlocal',
    'chcp 65001 >nul 2>&1',
    'cd /d "%~dp0"',
    '',
    'if not exist "index.html" goto :missing_files',
    'if not exist "styles.css" goto :missing_files',
    'if not exist "app.js" goto :missing_files',
    'goto :start_server',
    '',
    ':missing_files',
    'echo [CompanyGen] Conjunto de arquivos da vitrine incompleto nesta pasta.',
    'echo Extraia TODO o conteudo do arquivo .ZIP antes de abrir ABRIR-VITRINE.bat.',
    'echo Arquivos obrigatorios esperados juntos: index.html, styles.css, app.js',
    'pause',
    'exit /b 1',
    '',
    ':start_server',
    'echo [CompanyGen] Carregando vitrine completa (index.html, styles.css, app.js, assets)...',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psHttpScript}"`,
    'if errorlevel 1 (',
    '  echo [CompanyGen] Aviso: servidor HTTP local indisponivel, abrindo index.html direto.',
    '  start "" "%~dp0index.html"',
    ')',
    'exit /b 0',
    '',
  ].join('\r\n');
  zip.file('ABRIR-VITRINE.bat', abrirBat);

  zip.file(
    '_redirects',
    ['/home /index.html 301', '/vitrine /index.html 301', '/index /index.html 301', ''].join('\n'),
  );

  zip.file(
    'vercel.json',
    JSON.stringify(
      {
        $schema: 'https://openapi.vercel.sh/vercel.json',
        cleanUrls: true,
        trailingSlash: false,
        headers: [
          {
            source: '/assets/(.*)',
            headers: [
              { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
              { key: 'X-Content-Type-Options', value: 'nosniff' },
            ],
          },
          {
            source: '/(.*)',
            headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
          },
        ],
      },
      null,
      2,
    ) + '\n',
  );

  zip.file(
    '.htaccess',
    [
      'DirectoryIndex index.html',
      'Options -Indexes',
      '<IfModule mod_headers.c>',
      '  Header set X-Content-Type-Options "nosniff"',
      '</IfModule>',
      '<IfModule mod_rewrite.c>',
      '  RewriteEngine On',
      '  RewriteCond %{REQUEST_FILENAME} !-f',
      '  RewriteCond %{REQUEST_FILENAME} !-d',
      '  RewriteCond %{REQUEST_FILENAME}.html -f',
      '  RewriteRule ^(.+?)/?$ $1.html [L]',
      '  RewriteCond %{REQUEST_FILENAME} !-f',
      '  RewriteCond %{REQUEST_FILENAME} !-d',
      '  RewriteRule ^ 404.html [L]',
      '</IfModule>',
      'ErrorDocument 404 /404.html',
      '',
    ].join('\n'),
  );

  zip.file(
    '404.html',
    `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Página não encontrada — ${safeStoreName}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:${safeSurface};color:${safeInk}}
    .card{max-width:460px;width:100%;background:#fff;border:1px solid rgba(15,23,42,.1);border-radius:20px;padding:32px;text-align:center;box-shadow:0 16px 36px -20px rgba(15,23,42,.22)}
    .tag{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(15,23,42,.06);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${safeAccent};margin-bottom:12px}
    h1{margin:0 0 10px;font-size:24px;line-height:1.2}
    p{margin:0 0 22px;color:#475569;font-size:14px;line-height:1.5}
    .btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 22px;border-radius:999px;background:${safeAccent};color:#fff;font-weight:700;font-size:14px;text-decoration:none}
  </style>
</head>
<body>
  <main class="card">
    <span class="tag">${safeStoreName}</span>
    <h1>Página não encontrada</h1>
    <p>O endereço acessado não existe ou foi movido. Volte para a vitrine principal para ver os itens disponíveis.</p>
    <a id="cg-back-home" class="btn" href="/">Voltar para a Vitrine</a>
  </main>
  <script>if(location.protocol==='file:'){var l=document.getElementById('cg-back-home');if(l)l.setAttribute('href','index.html');}</script>
</body>
</html>
`,
  );

  zip.file(
    'LEIA-ME-HOSPEDAGEM.txt',
    [
      `VITRINE ESTÁTICA — ${String(storeName || 'Minha Loja').replace(/[\r\n]+/g, ' ')}`,
      '============================================================',
      '',
      '1) ABRIR NO WINDOWS (OFFLINE / LOCAL)',
      '   a) Extraia TODO o conteúdo deste arquivo .ZIP para uma pasta no seu computador',
      '      (não execute diretamente de dentro do ZIP).',
      '   b) Dê um duplo clique no arquivo ABRIR-VITRINE.bat.',
      '   c) O navegador abrirá sua loja completa com catálogo e calculadora offline.',
      '',
      '2) PUBLICAÇÃO GRÁTIS EM 1 CLIQUE (NETLIFY DROP / CLOUDFLARE PAGES / VERCEL)',
      '   - Netlify Drop: acesse https://app.netlify.com/drop e arraste a pasta extraída.',
      '     (O arquivo _redirects e 404.html já estão configurados.)',
      '   - Cloudflare Pages: crie um projeto "Direct Upload" e envie a pasta extraída.',
      '   - Vercel: faça deploy da pasta extraída (o arquivo vercel.json já está incluído).',
      '',
      '3) HOSPEDAGEM TRADICIONAL (HOSTINGER / CPANEL / APACHE)',
      '   - Envie todo o conteúdo da pasta extraída para dentro de public_html/ usando o',
      '     Gerenciador de Arquivos ou FTP.',
      '   - Importante: ative "Mostrar arquivos ocultos (dotfiles)" para garantir que o',
      '     arquivo .htaccess seja enviado junto.',
      '',
    ].join('\r\n'),
  );
}

async function resolveImageAsUint8Array(
  url: string,
  owner?: string,
): Promise<{ ext: string; bytes: Uint8Array } | null> {
  if (!url) return null;
  if (/^data:image\/svg\+xml/i.test(url)) return null;
  if (url.startsWith('data:image/')) {
    try {
      const match = url.match(/^data:image\/(png|jpe?g|webp|gif|avif);base64,([a-z0-9+/=\s_-]+)$/i);
      if (!match) return null;
      const extRaw = match[1].toLowerCase().replace('jpeg', 'jpg');
      const normalizedB64 = match[2].replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
      const binary = atob(normalizedB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return { ext: extRaw || 'png', bytes };
    } catch {
      return null;
    }
  }
  if (/\.svg(?:[?#].*)?$/i.test(url)) return null;
  try {
    const fetchUrl = url.startsWith('/media/') && owner ? `/api/whatsapp${url}` : url;
    const timeoutSignal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(4500)
        : undefined;
    const res = fetchUrl.startsWith('/api/') && owner
      ? await authenticatedFetch(fetchUrl, { method: 'GET', signal: timeoutSignal }, owner).catch(() =>
          fetch(fetchUrl, { signal: timeoutSignal }),
        )
      : await fetch(fetchUrl, { signal: timeoutSignal });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || 'image/jpeg').toLowerCase();
    if (contentType.includes('svg')) return null;
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : contentType.includes('gif')
          ? 'gif'
          : contentType.includes('avif')
            ? 'avif'
            : 'jpg';
    const buffer = await res.arrayBuffer();
    return { ext, bytes: new Uint8Array(buffer) };
  } catch {
    return null;
  }
}

export async function buildFaithfulStorefrontZip({
  profile,
  runtimeStatus,
  owner,
  onProgress,
}: {
  profile: BusinessProfile;
  runtimeStatus?: WhatsappRuntimeStatus | null;
  owner?: string;
  onProgress?: (pct: number) => void;
}): Promise<{ blob: Blob; filename: string; fileCount: number; assetCount: number }> {
  const zip = new JSZip();
  const storeName = profile.business?.name?.trim() || 'Minha Loja';

  // Empacotador 1:1 da Pasta Molde (Formula-IR v9.0 ou v8.2) quando disponível
  if (owner && owner !== 'default') {
    try {
      const stateRes = await authenticatedFetch('/api/store-molde/state', { method: 'GET' }, owner);
      if (stateRes.ok) {
        const stateData = await stateRes.json().catch(() => null);
        const ir = stateData?.formulasIr;
        const hasV9Sections = ir?.version === '9.0' && Array.isArray(ir.sections) && ir.sections.length > 0;
        const hasV8Pages = Array.isArray(ir?.pages) && ir.pages.length > 0;
        if (ir && (hasV9Sections || hasV8Pages)) {
          onProgress?.(20);
          const pagePaths: string[] = Array.from(
            new Set([
              ...(hasV9Sections ? ['index.html'] : []),
              ...(Array.isArray(ir.pages)
                ? ir.pages.map((p: { filename?: string; slug?: string }) =>
                    p?.filename
                      ? String(p.filename)
                      : p?.slug
                        ? `pages/${String(p.slug).replace(/^pages\//, '').replace(/\.html$/i, '')}.html`
                        : 'index.html',
                  )
                : []),
            ]),
          );
          const assetPaths: string[] = Array.isArray(stateData.generatedAssets) ? stateData.generatedAssets : [];
          const coreFiles = [
            'styles.css',
            'app.js',
            'data/formulas-ir.json',
            ...pagePaths,
            ...assetPaths,
          ];
          const uniqueFiles = Array.from(
            new Set(
              coreFiles
                .map((relPath) => String(relPath || '').replace(/^\/+/, ''))
                .filter((cleanRel) => isSafeMoldeRelPath(cleanRel)),
            ),
          );
          let packedCount = 0;
          let packedAssets = 0;

          const fetchBatchSize = 4;
          for (let i = 0; i < uniqueFiles.length; i += fetchBatchSize) {
            const batch = uniqueFiles.slice(i, i + fetchBatchSize);
            const results = await Promise.all(
              batch.map(async (cleanRel) => {
                const assetPath = `/api/store-molde/${encodeURIComponent(owner)}/${cleanRel}`;
                const fileRes = await authenticatedFetch(assetPath, { method: 'GET' }, owner).catch(() =>
                  fetch(assetPath),
                );
                if (!fileRes.ok) return null;
                const contentType = (fileRes.headers.get('content-type') || '').toLowerCase();
                if (cleanRel.startsWith('assets/')) {
                  if (contentType.includes('svg') || cleanRel.toLowerCase().endsWith('.svg')) {
                    return null;
                  }
                  const buf = new Uint8Array(await fileRes.arrayBuffer());
                  return { cleanRel, isAsset: true, data: buf };
                }
                const txt = await fileRes.text();
                if (!cleanRel.endsWith('.html')) {
                  if (
                    contentType.includes('text/html') ||
                    /^\s*<!doctype\s+html/i.test(txt) ||
                    /^\s*<html[\s>]/i.test(txt)
                  ) {
                    return null;
                  }
                }
                if (cleanRel.endsWith('.css') && !txt.trim()) {
                  return null;
                }
                return { cleanRel, isAsset: false, data: txt };
              }),
            );
            for (const item of results) {
              if (!item) continue;
              zip.file(item.cleanRel, item.data);
              if (item.isAsset) packedAssets += 1;
              packedCount += 1;
            }
          }

          const hasRequiredBundleSet = Boolean(
            zip.file('index.html') && zip.file('styles.css') && zip.file('app.js'),
          );
          if (packedCount >= 3 && hasRequiredBundleSet) {
            const moldeTokens = ir.designTokens || ir.themeTokens || {};
            appendOfflineAndHostingFiles(zip, {
              storeName,
              accentHex: moldeTokens.accent,
              surfaceHex: moldeTokens.surface,
              inkHex: moldeTokens.ink,
            });
            onProgress?.(90);
            const blob = await zip.generateAsync({ type: 'blob' });
            const safeSlug = storeName
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '') || 'vitrine';
            onProgress?.(100);
            return {
              blob,
              filename: `${safeSlug}-pasta-molde.zip`,
              fileCount: Object.keys(zip.files).filter((k) => !zip.files[k].dir).length,
              assetCount: packedAssets,
            };
          }
        }
      }
    } catch {
      // Fallback para gerador in-memory caso offline
    }
  }

  const assetsFolder = zip.folder('assets');
  const activeProducts = (profile.catalog?.products || []).filter((p) => p.active !== false);
  const waDigits = resolveConnectedDigits(profile, runtimeStatus);

  const v9Doc = ensureFormulaV9(profile);
  const layoutVariant: string = v9Doc.designTokens?.fontStyle === 'editorial_serif' ? 'editorial_lookbook' : 'artisan_atelier';
  const baseTokens = v9Doc.designTokens || deriveThemeTokensFromHex(profile.brand?.primaryColor || '#0B4DB8', 'modern_sans');
  const tokens = {
    surface: safeCssHex(baseTokens.surface, '#F8FAFC'),
    surfaceAlt: safeCssHex(baseTokens.surfaceAlt, '#EFF6FF'),
    card: safeCssHex(baseTokens.card, '#FFFFFF'),
    ink: safeCssHex(baseTokens.ink, '#0F172A'),
    inkMuted: safeCssHex(baseTokens.inkMuted, '#475569'),
    accent: safeCssHex(baseTokens.accent, '#2563EB'),
    accentText: safeCssHex('#FFFFFF', '#FFFFFF'),
    border: safeCssHex('#E2E8F0', '#E2E8F0'),
  };
  const dnaId = String(profile.brand?.primaryColor || 'v9').replace(/\*\/|[\r\n]/g, '');
  const addressText = profile.business?.address || '';
  const hoursText = profile.business?.hours || '';

  onProgress?.(20);
  let assetCount = 0;

  async function packAsset(url: string | undefined, baseName: string): Promise<string> {
    if (!isRealPhoto(url) || !assetsFolder) return '';
    const resolved = await resolveImageAsUint8Array(url!, owner);
    if (!resolved) return '';
    const fileName = `${baseName}.${resolved.ext}`;
    assetsFolder.file(fileName, resolved.bytes);
    assetCount += 1;
    return `assets/${fileName}`;
  }

  const brandExtended = profile.brand as {
    logoUrl?: string;
    heroImageUrl?: string;
    heroBackgroundUrl?: string;
    pageBackgroundUrl?: string;
    sectionBackgrounds?: Record<string, string>;
  } | undefined;

  const [logoSrc, explicitHeroSrc, heroBgSrc, pageBgSrc] = await Promise.all([
    packAsset(brandExtended?.logoUrl, 'brand-logo'),
    packAsset(brandExtended?.heroImageUrl, 'brand-hero'),
    packAsset(brandExtended?.heroBackgroundUrl, 'brand-hero-bg'),
    packAsset(brandExtended?.pageBackgroundUrl, 'brand-page-bg'),
  ]);

  const sectionBgSrcMap: Record<string, string> = {};
  const secBgEntries = Object.entries(brandExtended?.sectionBackgrounds || {});
  const packedSecBgs = await Promise.all(
    secBgEntries.map(async ([secKey, bgUrl]) => {
      const packed = await packAsset(bgUrl, `section-${secKey.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`);
      return packed ? [secKey, packed] as const : null;
    }),
  );
  for (const entry of packedSecBgs) {
    if (entry) sectionBgSrcMap[entry[0]] = entry[1];
  }

  onProgress?.(45);

  const exportProducts: Array<{
    id: string;
    name: string;
    category: string;
    variation: string;
    description: string;
    priceCents: number;
    priceFormatted: string;
    itemType: string;
    imageSrc: string;
    mensagemMolde: string;
  }> = new Array(activeProducts.length);

  for (let start = 0; start < activeProducts.length; start += 4) {
    const chunk = activeProducts.slice(start, start + 4);
    await Promise.all(
      chunk.map(async (p: CatalogProduct, offset: number) => {
        const idx = start + offset;
        const imageSrc = await packAsset(p.imageUrl, `prod-${idx + 1}`);
        const baseMolde = p.mensagemMolde?.trim() || buildDefaultMensagemMolde(p, storeName);
        const hydrated = hydrateMensagemMolde(baseMolde, p, { storeName });
        exportProducts[idx] = {
          id: p.id,
          name: p.name,
          category: p.category || 'Geral',
          variation: p.variation || 'Padrão',
          description: p.description || '',
          priceCents: p.priceCents,
          priceFormatted: p.priceCents > 0 ? formatCurrencyBRL(p.priceCents) : 'Sob consulta',
          itemType: p.itemType || 'produto_fisico',
          imageSrc,
          mensagemMolde: hydrated,
        };
      }),
    );
  }

  const effectiveHeroSrc = explicitHeroSrc || exportProducts.find((p) => Boolean(p.imageSrc))?.imageSrc || '';

  onProgress?.(70);

  const useSerifDisplay = v9Doc.designTokens?.fontStyle === 'editorial_serif';
  const rawRadius = Number(v9Doc.designTokens?.radiusPx || 16);
  const safeRadius = Number.isFinite(rawRadius) ? Math.max(8, Math.min(28, Math.round(rawRadius))) : 16;
  const radiusCss = `${safeRadius}px`;

  const cssContent = `/* Vitrine Fiel CompanyGen v9 · Fonte: ${v9Doc.designTokens?.fontStyle || 'modern_sans'} · DNA: ${dnaId} */
:root {
  --surface: ${tokens.surface};
  --surface-alt: ${tokens.surfaceAlt};
  --card: ${tokens.card};
  --ink: ${tokens.ink};
  --ink-muted: ${tokens.inkMuted};
  --accent: ${tokens.accent};
  --accent-text: ${tokens.accentText};
  --border: ${tokens.border};
  --radius: ${radiusCss};
  --font-display: ${useSerifDisplay ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"};
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--surface);
  color: var(--ink);
  line-height: 1.5;
  ${pageBgSrc ? `background-image: linear-gradient(${tokens.surface}DC, ${tokens.surface}EE), url("${pageBgSrc}"); background-size: cover; background-position: center top;` : ''}
}
.container { max-width: 1152px; margin: 0 auto; padding: 0 18px; }
.top-notice {
  background: ${layoutVariant === 'clinical_grid' ? 'var(--accent)' : 'var(--surface-alt)'};
  color: ${layoutVariant === 'clinical_grid' ? 'var(--accent-text)' : 'var(--ink)'};
  border-bottom: 1px solid var(--border);
  text-align: center;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 700;
}
.header {
  position: sticky; top: 0; z-index: 30;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.header-inner {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 18px; max-width: 1152px; margin: 0 auto;
}
.brand-row { display: flex; align-items: center; gap: 12px; }
.brand-logo {
  width: 42px; height: 42px; object-fit: cover;
  border-radius: var(--radius); border: 1px solid var(--border);
}
.brand-monogram {
  width: 42px; height: 42px; border-radius: var(--radius);
  display: flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--accent-text); font-weight: 800;
}
.brand-name { font-family: var(--font-display); font-weight: 800; font-size: 18px; }
.search-input {
  min-height: 42px; min-width: 210px; flex: 1; padding: 8px 14px;
  border-radius: var(--radius); border: 1px solid var(--border);
  background: var(--surface-alt); color: var(--ink); font-size: 14px;
}
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 18px; border-radius: var(--radius);
  border: 1px solid transparent; cursor: pointer; font-weight: 700; font-size: 13px;
  text-decoration: none;
}
.btn-accent { background: var(--accent); color: var(--accent-text); }
.btn-ink { background: var(--ink); color: var(--surface); }
.btn-outline { background: var(--card); color: var(--ink); border-color: var(--border); }
.section { max-width: 1152px; margin: 28px auto 0; padding: 0 18px; }
.hero-box {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: ${layoutVariant === 'editorial_lookbook' ? '42px 0' : '28px'};
  ${layoutVariant === 'editorial_lookbook' ? 'background: transparent; border: none; border-bottom: 1px solid var(--border); border-radius: 0;' : ''}
  ${layoutVariant === 'clinical_grid' ? 'background: var(--card); border-left: 5px solid var(--accent);' : ''}
  display: grid; grid-template-columns: 1.25fr 0.85fr; gap: 26px; align-items: center;
}
.hero-title {
  font-family: var(--font-display);
  font-size: ${layoutVariant === 'editorial_lookbook' ? 'clamp(30px, 5vw, 48px)' : 'clamp(24px, 3.8vw, 38px)'};
  font-weight: 800; line-height: 1.12; margin: 10px 0 12px;
}
.hero-sub { color: var(--ink-muted); font-size: 15px; margin: 0 0 18px; max-width: 60ch; }
.hero-media { width: 100%; border-radius: var(--radius); object-fit: cover; aspect-ratio: ${layoutVariant === 'editorial_lookbook' ? '3/4' : '4/3'}; }
.hero-signature-card {
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px;
  display: flex; flex-direction: column; gap: 10px;
}
.badge {
  display: inline-block; padding: 4px 10px; border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
}
.trust-bar {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 14px;
  padding: 14px 18px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
}
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  min-height: 40px; padding: 0 14px; border-radius: ${layoutVariant === 'editorial_lookbook' ? '2px' : '999px'};
  border: 1px solid var(--border); background: var(--card); color: var(--ink);
  font-weight: 700; font-size: 12px; cursor: pointer;
}
.chip.active { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.panel {
  background: var(--surface-alt); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 22px;
}
.catalog-grid {
  display: grid;
  grid-template-columns: ${layoutVariant === 'bistro_menu_rows' ? 'repeat(auto-fill, minmax(340px, 1fr))' : 'repeat(auto-fill, minmax(250px, 1fr))'};
  gap: ${layoutVariant === 'bistro_menu_rows' ? '14px' : '20px'};
}
.card {
  background: ${layoutVariant === 'editorial_lookbook' ? 'transparent' : 'var(--card)'};
  border: ${layoutVariant === 'editorial_lookbook' ? 'none' : '1px solid var(--border)'};
  border-radius: var(--radius); overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-between;
}
.card-bistro {
  background: var(--card); border: 1px solid var(--border); border-radius: 16px;
  padding: 12px; display: flex; align-items: center; gap: 14px;
}
.card-bistro-img, .card-bistro-mono {
  width: 86px; height: 86px; flex-shrink: 0; border-radius: 12px; object-fit: cover;
}
.card-bistro-mono {
  background: var(--surface-alt); color: var(--accent); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 22px;
}
.card-thumb {
  width: 100%; aspect-ratio: ${layoutVariant === 'editorial_lookbook' ? '3/4' : '4/3'};
  object-fit: cover; display: block; border-radius: ${layoutVariant === 'editorial_lookbook' ? '2px' : '12px'};
}
.card-mono {
  width: 100%; aspect-ratio: ${layoutVariant === 'editorial_lookbook' ? '3/4' : '4/3'};
  background: var(--surface-alt); color: var(--accent);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: var(--font-display); font-weight: 900; font-size: 28px;
  border-radius: ${layoutVariant === 'editorial_lookbook' ? '2px' : '12px'};
}
.card-body { padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.card-title { font-family: var(--font-display); font-weight: 800; font-size: 16px; margin: 0; }
.card-desc { font-size: 12px; color: var(--ink-muted); margin: 0; }
.card-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 0 14px 14px;
}
.price { font-weight: 900; font-size: 15px; }
.footer {
  margin-top: 48px; padding: 28px 18px;
  background: var(--surface-alt); border-top: 1px solid var(--border);
}
.drawer {
  position: fixed; inset: 0 0 0 auto; width: min(390px, 100%);
  background: var(--card); border-left: 1px solid var(--border);
  box-shadow: -12px 0 36px rgba(15, 23, 42, .16);
  display: none; flex-direction: column; padding: 20px; z-index: 60;
}
.drawer.open { display: flex; }
@media (max-width: 780px) {
  .hero-box { grid-template-columns: 1fr; padding: 20px; }
  .catalog-grid { grid-template-columns: 1fr; }
}
@media (max-width: 420px) {
  html, body { max-width: 100%; overflow-x: hidden; }
  .container, .section { padding-left: 14px; padding-right: 14px; }
  .header-inner { align-items: stretch; padding-left: 14px; padding-right: 14px; }
  .header-inner > div:last-child { max-width: none !important; min-width: 0; flex-wrap: wrap; }
  .search-input { min-width: 0; width: 100%; }
  .catalog-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .card-footer { align-items: stretch; flex-direction: column; }
  .price { white-space: nowrap; }
  .btn { width: 100%; min-width: 0; padding: 0 14px; text-align: center; line-height: 1.2; }
  .hero-box, .panel { padding: 18px 14px; }
}
`;

  zip.file('styles.css', cssContent);

  const sectionHtmlParts: string[] = [];

  for (const sec of v9Doc.sections) {
    const cfg = (sec.config || {}) as Record<string, any>;
    const customSecBg = sectionBgSrcMap[sec.id] || (sec.type === 'HeroSection' ? heroBgSrc : '');

    if (sec.type === 'HeaderNav') {
      const logoMarkup = logoSrc
        ? `<img class="brand-logo" src="${logoSrc}" alt="${escapeHtml(storeName)}" />`
        : `<div class="brand-monogram">${escapeHtml(storeName.slice(0, 2).toUpperCase())}</div>`;
      sectionHtmlParts.push(`
  <header class="header">
    <div class="header-inner">
      <div class="brand-row">
        ${logoMarkup}
        <div>
          <div class="brand-name">${escapeHtml(storeName)}</div>
          ${profile.business?.segment ? `<div style="font-size:11px;color:var(--ink-muted)">${escapeHtml(profile.business.segment)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex:1;max-width:440px">
        <input id="search-input" class="search-input" type="search" placeholder="Buscar no catálogo..." />
        <button type="button" class="btn btn-accent" data-cg-open-cart>Sacola (<span id="cart-count">0</span>)</button>
      </div>
    </div>
  </header>`);
    } else if (sec.type === 'HeroSection') {
      const atomicRole = String((v9Doc as unknown as { atomicBlueprint?: { sections?: Array<{ tuple?: string[] }> } })?.atomicBlueprint?.sections?.find((s) => s?.tuple?.[0] === sec.id)?.tuple?.[1] || '');
      const isCenteredHero = cfg.variant === 'centered' || atomicRole === 'hero_centered';
      const heroBgInline = customSecBg
        ? `style="background-image:linear-gradient(100deg,${tokens.surfaceAlt}EE,${tokens.surfaceAlt}C8),url('${customSecBg}');background-size:cover;background-position:center;"`
        : '';
      const rightCol = effectiveHeroSrc
        ? `<img class="hero-media" src="${effectiveHeroSrc}" alt="${escapeHtml(storeName)}" />`
        : `<div class="hero-signature-card">
            <strong style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-muted)">Destaques do Catálogo</strong>
            ${exportProducts.slice(0, 2).map((sp) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 10px;background:var(--surface-alt);border-radius:10px;font-size:13px"><strong>${escapeHtml(sp.name)}</strong><span>${escapeHtml(sp.priceFormatted)}</span></div>`).join('')}
          </div>`;
      if (isCenteredHero) {
        sectionHtmlParts.push(`
  <section class="section">
    <div class="hero-box" ${heroBgInline} style="grid-template-columns:1fr;text-align:center;">
      <div style="max-width:680px;margin:0 auto">
        <h1 class="hero-title">${escapeHtml(cfg.title || storeName)}</h1>
        ${cfg.subtitle ? `<p class="hero-sub" style="margin-inline:auto">${escapeHtml(cfg.subtitle)}</p>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center">
          <a href="#catalog-section" class="btn btn-accent">${escapeHtml(cfg.primaryCta?.label || 'Ver catálogo')}</a>
        </div>
      </div>
    </div>
  </section>`);
      } else {
        sectionHtmlParts.push(`
  <section class="section">
    <div class="hero-box" ${heroBgInline}>
      <div>
        <h1 class="hero-title">${escapeHtml(cfg.title || storeName)}</h1>
        ${cfg.subtitle ? `<p class="hero-sub">${escapeHtml(cfg.subtitle)}</p>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
          <a href="#catalog-section" class="btn btn-accent">${escapeHtml(cfg.primaryCta?.label || 'Ver catálogo')}</a>
          ${addressText ? `<span style="font-size:12px;color:var(--ink-muted)">${escapeHtml(addressText)}</span>` : ''}
        </div>
      </div>
      <div>${rightCol}</div>
    </div>
  </section>`);
      }
    } else if (sec.type === 'DifferentialsStrip') {
      sectionHtmlParts.push(`
  <section class="section">
    <div class="trust-bar">
      ${hoursText ? `<div><small style="color:var(--ink-muted);display:block;font-weight:700">HORÁRIO</small><strong style="font-size:13px">${escapeHtml(hoursText)}</strong></div>` : ''}
      ${addressText ? `<div><small style="color:var(--ink-muted);display:block;font-weight:700">ENDEREÇO</small><strong style="font-size:13px">${escapeHtml(addressText)}</strong></div>` : ''}
      <div><small style="color:var(--ink-muted);display:block;font-weight:700">ATENDIMENTO</small><strong style="font-size:13px">Confirmado direto no WhatsApp</strong></div>
    </div>
  </section>`);
    } else if (sec.type === 'InteractiveExperience') {
      const builderBg = customSecBg
        ? `style="background-image:linear-gradient(${tokens.surfaceAlt}E8,${tokens.surfaceAlt}F5),url('${customSecBg}');background-size:cover;background-position:center;"`
        : '';
      sectionHtmlParts.push(`
  <section class="section">
    <div class="panel" ${builderBg}>
      <h2 style="font-family:var(--font-display);margin:4px 0 4px">${escapeHtml(cfg.title || 'Simulador')}</h2>
      <p style="font-size:13px;color:var(--ink-muted);margin:0 0 14px">${escapeHtml(cfg.subtitle || '')}</p>
      <div id="builder-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px"></div>
      <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <strong id="builder-summary">Subtotal: R$ 0,00</strong>
        <button type="button" class="btn btn-accent" data-cg-commit-builder>${escapeHtml(cfg.primaryAction?.label || 'Adicionar seleção à sacola')}</button>
      </div>
    </div>
  </section>`);
    } else if (sec.type === 'CatalogGrid') {
      sectionHtmlParts.push(`<section class="section"><div id="cat-chips" class="chips"></div></section>`);
      sectionHtmlParts.push(`
  <section class="section" id="catalog-section">
    <div style="margin-bottom:14px">
      <h2 style="font-family:var(--font-display);margin:0">${escapeHtml(cfg.title || 'Catálogo')}</h2>
      <p style="font-size:13px;color:var(--ink-muted);margin:4px 0 0">${escapeHtml(cfg.subtitle || '')}</p>
    </div>
    <div id="catalog-grid" class="catalog-grid"></div>
  </section>`);
    } else if (sec.type === 'ClosingScheduleSplit') {
      sectionHtmlParts.push(`
  <section class="section" id="booking-panel">
    <div class="panel" style="background:var(--card)">
      <h2 style="font-family:var(--font-display);margin:4px 0 12px">${escapeHtml(cfg.title || 'Fale com a loja')}</h2>
      <div class="chips" style="margin-bottom:14px">
        ${(Array.isArray(cfg.slots) ? cfg.slots : ['Hoje · 17:00', 'Amanhã · 10:00']).map((sl: string) => `<button type="button" class="chip" data-cg-slot="${escapeHtml(sl)}">${escapeHtml(sl)}</button>`).join('')}
      </div>
      <button type="button" class="btn btn-accent" data-cg-send-booking>${escapeHtml(cfg.ctaLabel || 'Confirmar no WhatsApp')}</button>
    </div>
  </section>`);
    } else if (sec.type === 'RichFooter') {
      sectionHtmlParts.push(`
  <footer class="footer">
    <div class="container" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px">
      <div>
        <strong style="font-size:16px">${escapeHtml(storeName)}</strong>
        ${cfg.tagline ? `<div style="font-size:12px;color:var(--ink-muted)">${escapeHtml(cfg.tagline)}</div>` : ''}
      </div>
      <a class="btn btn-accent" target="_blank" rel="noopener noreferrer" href="${waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Olá, ${storeName}! Vim pelo site.`)}` : '#'}">Falar no WhatsApp</a>
    </div>
  </footer>`);
    }
  }

  const storeDataJson = JSON.stringify({
    storeName,
    waDigits,
    layoutVariant,
    products: exportProducts,
  }).replace(/</g, '\\u003c');

  zip.file(
    'catalog.json',
    JSON.stringify({ storeName, layoutVariant, dnaId, waDigits, products: exportProducts }, null, 2),
  );

  const jsContent = `const STORE_DATA = ${storeDataJson};
const cart = [];
const builderSelection = [];
let selectedServiceIdx = 0;
let selectedSlot = 'Amanhã · 14:30';
let activeCat = 'Todas';
let queryText = '';

function buildWaUrl(text){
  const q = encodeURIComponent(text || 'Olá!');
  return STORE_DATA.waDigits ? ('https://wa.me/' + STORE_DATA.waDigits + '?text=' + q) : ('https://wa.me/?text=' + q);
}
function escapeHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeJsAttr(s){ return String(s==null?'':s).replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'").replace(/\\r|\\n|\\u2028|\\u2029/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatBRL(c){ return 'R$ ' + ((Number(c)||0)/100).toFixed(2).replace('.', ','); }

function renderProductCard(p){
  const mono = escapeHtml(String(p.name||'').slice(0,2).toUpperCase());
  const pidAttr = escapeHtml(p.id);
  const imgSrc = escapeHtml(p.imageSrc);
  if (STORE_DATA.layoutVariant === 'bistro_menu_rows') {
    const media = p.imageSrc ? '<img class="card-bistro-img" loading="lazy" decoding="async" src="' + imgSrc + '" alt="' + escapeHtml(p.name) + '" />' : '<div class="card-bistro-mono">' + mono + '</div>';
    return '<article class="card-bistro">' + media + '<div style="flex:1;min-width:0"><small style="color:var(--accent);font-weight:700">' + escapeHtml(p.category) + '</small><h3 class="card-title">' + escapeHtml(p.name) + '</h3>' + (p.description ? '<p class="card-desc">' + escapeHtml(p.description) + '</p>' : '') + '<div class="price">' + escapeHtml(p.priceFormatted) + '</div></div><button type="button" class="btn btn-accent" style="border-radius:999px;width:44px;height:44px;padding:0" data-cg-add-cart="' + pidAttr + '">+</button></article>';
  }
  const media = p.imageSrc ? '<img class="card-thumb" loading="lazy" decoding="async" src="' + imgSrc + '" alt="' + escapeHtml(p.name) + '" />' : '<div class="card-mono">' + mono + '</div>';
  return '<article class="card"><div><div style="padding:10px 10px 0">' + media + '</div><div class="card-body"><small style="color:var(--ink-muted);text-transform:uppercase;font-weight:700;font-size:10px">' + escapeHtml(p.category) + '</small><h3 class="card-title">' + escapeHtml(p.name) + '</h3>' + (p.description ? '<p class="card-desc">' + escapeHtml(p.description) + '</p>' : '') + '</div></div><div class="card-footer"><span class="price">' + escapeHtml(p.priceFormatted) + '</span><button type="button" class="btn ' + (STORE_DATA.layoutVariant === 'editorial_lookbook' ? 'btn-ink' : 'btn-accent') + '" data-cg-add-cart="' + pidAttr + '">+ Sacola</button></div></article>';
}

function renderCatalog(){
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  const items = STORE_DATA.products.filter(p => {
    if (activeCat !== 'Todas' && p.category !== activeCat) return false;
    if (queryText && !(p.name + ' ' + p.description + ' ' + p.category).toLowerCase().includes(queryText)) return false;
    return true;
  });
  grid.innerHTML = items.length ? items.map(renderProductCard).join('') : '<p style="color:var(--ink-muted)">Nenhum item encontrado.</p>';
}

function renderBuilder(){
  const el = document.getElementById('builder-grid');
  if (!el) return;
  const items = STORE_DATA.products.slice(0, 9);
  el.innerHTML = items.map(p => '<button type="button" class="chip" style="min-height:52px;border-radius:12px;justify-content:space-between;display:flex;align-items:center;padding:8px 12px" data-cg-toggle-builder="' + escapeHtml(p.id) + '"><span>' + escapeHtml(p.name) + '</span><strong>' + escapeHtml(p.priceFormatted) + '</strong></button>').join('');
}
window.toggleBuilder = (id) => {
  builderSelection.push(id);
  const sum = builderSelection.reduce((acc, pid) => acc + (STORE_DATA.products.find(x => x.id === pid)?.priceCents || 0), 0);
  const el = document.getElementById('builder-summary');
  if (el) el.textContent = builderSelection.length + ' itens · Subtotal: ' + formatBRL(sum);
};
window.commitBuilder = () => {
  builderSelection.splice(0).forEach(pid => window.addCart(pid));
};

window.selectSlot = (sl, btn) => {
  selectedSlot = sl;
  document.querySelectorAll('#booking-panel .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
};
window.sendBookingWhatsapp = () => {
  const srv = STORE_DATA.products[selectedServiceIdx] || STORE_DATA.products[0];
  if (!srv) return;
  window.open(buildWaUrl('Olá ' + STORE_DATA.storeName + '! Quero agendar: ' + srv.name + ' · Horário: ' + selectedSlot), '_blank');
};
window.sendCustomOrder = () => {
  const note = document.getElementById('custom-order-note')?.value || '';
  window.open(buildWaUrl('Olá ' + STORE_DATA.storeName + '! Pedido sob medida: ' + note), '_blank');
};

window.addCart = (id) => {
  const p = STORE_DATA.products.find(x => x.id === id);
  if (!p) return;
  const ex = cart.find(c => c.id === id);
  if (ex) ex.qty += 1; else cart.push({ ...p, qty: 1 });
  renderCart();
  document.getElementById('cart-drawer').classList.add('open');
};
window.removeCart = (id) => {
  const idx = cart.findIndex(c => c.id === id);
  if (idx >= 0) cart.splice(idx, 1);
  renderCart();
};
function renderCart(){
  const cnt = cart.reduce((a, b) => a + b.qty, 0);
  const cEl = document.getElementById('cart-count');
  if (cEl) cEl.textContent = String(cnt);
  const list = document.getElementById('cart-items');
  if (!list) return;
  if (!cart.length) { list.innerHTML = '<p style="color:var(--ink-muted)">Sua sacola está vazia.</p>'; return; }
  const total = cart.reduce((a, b) => a + b.priceCents * b.qty, 0);
  const msg = 'Olá ' + STORE_DATA.storeName + '! Pedido:\\n' + cart.map(i => '- ' + i.qty + 'x ' + i.name).join('\\n') + '\\nTotal: ' + formatBRL(total);
  list.innerHTML = cart.map(i => '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding:8px 0"><div><strong>' + Number(i.qty || 1) + 'x ' + escapeHtml(i.name) + '</strong><br><small>' + escapeHtml(i.priceFormatted) + '</small></div><button type="button" class="btn btn-outline" data-cg-remove-cart="' + escapeHtml(i.id) + '">Remover</button></div>').join('') + '<div style="margin:12px 0"><strong>Total: ' + escapeHtml(formatBRL(total)) + '</strong></div><a class="btn btn-accent" style="width:100%" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(buildWaUrl(msg)) + '">Enviar Pedido no WhatsApp</a>';
}

document.addEventListener('click', (ev) => {
  const target = ev.target && ev.target.closest ? ev.target.closest('[data-cg-open-cart],[data-cg-close-cart],[data-cg-add-cart],[data-cg-remove-cart],[data-cg-cat],[data-cg-service-idx],[data-cg-toggle-builder],[data-cg-commit-builder],[data-cg-slot],[data-cg-send-booking]') : null;
  if (!target) return;
  if (target.hasAttribute('data-cg-open-cart')) {
    document.getElementById('cart-drawer')?.classList.add('open');
  } else if (target.hasAttribute('data-cg-close-cart')) {
    document.getElementById('cart-drawer')?.classList.remove('open');
  } else if (target.hasAttribute('data-cg-add-cart')) {
    window.addCart(target.getAttribute('data-cg-add-cart'));
  } else if (target.hasAttribute('data-cg-remove-cart')) {
    window.removeCart(target.getAttribute('data-cg-remove-cart'));
  } else if (target.hasAttribute('data-cg-cat')) {
    window.setCat(target.getAttribute('data-cg-cat'));
  } else if (target.hasAttribute('data-cg-service-idx')) {
    selectedServiceIdx = Number(target.getAttribute('data-cg-service-idx')) || 0;
    document.querySelectorAll('#booking-services .chip').forEach(c => c.classList.remove('active'));
    target.classList.add('active');
  } else if (target.hasAttribute('data-cg-toggle-builder')) {
    window.toggleBuilder(target.getAttribute('data-cg-toggle-builder'));
  } else if (target.hasAttribute('data-cg-commit-builder')) {
    window.commitBuilder();
  } else if (target.hasAttribute('data-cg-slot')) {
    window.selectSlot(target.getAttribute('data-cg-slot'), target);
  } else if (target.hasAttribute('data-cg-send-booking')) {
    window.sendBookingWhatsapp();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const cats = ['Todas', ...Array.from(new Set(STORE_DATA.products.map(p => p.category)))];
  const catWrap = document.getElementById('cat-chips');
  if (catWrap) {
    catWrap.innerHTML = cats.map(c => '<button type="button" class="chip ' + (c==='Todas'?'active':'') + '" data-cg-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>').join('');
  }
  const sEl = document.getElementById('search-input');
  if (sEl) sEl.addEventListener('input', e => { queryText = e.target.value.trim().toLowerCase(); renderCatalog(); });
  const srvWrap = document.getElementById('booking-services');
  if (srvWrap) {
    srvWrap.innerHTML = STORE_DATA.products.slice(0, 4).map((s, idx) => '<button type="button" class="chip ' + (idx===0?'active':'') + '" style="border-radius:12px;min-height:46px" data-cg-service-idx="' + Number(idx) + '">' + escapeHtml(s.name) + ' · ' + escapeHtml(s.priceFormatted) + '</button>').join('');
  }
  renderBuilder();
  renderCatalog();
  renderCart();
});
window.setCat = (c) => {
  activeCat = c;
  document.querySelectorAll('#cat-chips .chip').forEach(el => el.classList.toggle('active', el.textContent === c));
  renderCatalog();
};
`;

  zip.file('app.js', jsContent);

  const htmlDoc = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(storeName)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body data-layout-variant="${escapeHtml(layoutVariant)}" data-dna="${escapeHtml(dnaId)}">
${sectionHtmlParts.join('\n')}
  <aside id="cart-drawer" class="drawer">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <strong>Sua Sacola</strong>
      <button type="button" class="btn btn-outline" style="min-height:36px;padding:0 12px" data-cg-close-cart>Fechar</button>
    </div>
    <div id="cart-items" style="flex:1;overflow:auto"></div>
  </aside>
  <script src="app.js"></script>
</body>
</html>
`;

  zip.file('index.html', htmlDoc);
  appendOfflineAndHostingFiles(zip, {
    storeName,
    accentHex: tokens.accent,
    surfaceHex: tokens.surface,
    inkHex: tokens.ink,
  });
  onProgress?.(90);

  const blob = await zip.generateAsync({ type: 'blob' });
  onProgress?.(100);

  const safeSlug =
    (profile.publishedStore?.publicSlug || storeName)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '') || 'minha-loja';

  return {
    blob,
    filename: `vitrine-${safeSlug}.zip`,
    fileCount: Object.keys(zip.files).filter((k) => !zip.files[k].dir).length,
    assetCount,
  };
}
