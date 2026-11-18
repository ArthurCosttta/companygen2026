/**
 * Pasta Molde Static HTML / CSS / Offline Vanilla JS Emitter (Formula-IR v9.0)
 * Renders any Formula-IR v9.0 document (up to 7 sections + 5 interactive atoms)
 * into semantic, offline-ready HTML/CSS/JS with zero hardcoded niche copy.
 */
import { WHITELISTED_ICONS } from '../shared/formula-ir/composer-schema.mjs';

export function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatBrl(cents) {
  const safe = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safe / 100);
}

const RASTER_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;

export function toRelativeMoldeAsset(url, relPrefix = '') {
  const clean = String(url || '').trim();
  if (!clean) return '';
  if (/^data:/i.test(clean)) {
    return RASTER_DATA_IMAGE_RE.test(clean) ? clean : '';
  }
  if (/^(?:javascript|vbscript):/i.test(clean) || /^\/\//.test(clean)) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  const idx = clean.indexOf('assets/');
  if (idx >= 0) return `${relPrefix}${clean.slice(idx)}`;
  return `${relPrefix}${clean.replace(/^\/+/, '')}`;
}

export function safeHref(url) {
  const clean = String(url ?? '').replace(/[\u0000-\u001F\u007F]+/g, '').trim();
  if (!clean) return '#';
  if (/^(?:javascript|data|vbscript):/i.test(clean) || /^\/\//.test(clean)) return '#';
  if (/^(?:https?:\/\/|mailto:|tel:|#)/i.test(clean)) return clean;
  if (/^(?:\.\.\/|\.\/|\/)?[a-z0-9._-][a-z0-9._/-]*\.html(?:[?#].*)?$/i.test(clean)) return clean;
  return '#';
}

export function toRelativeMoldeHref(href, relPrefix = '') {
  const clean = safeHref(href);
  if (!clean || clean.startsWith('#') || /^https?:\/\//i.test(clean) || /^mailto:/i.test(clean) || /^tel:/i.test(clean)) {
    return clean || '#';
  }
  if (relPrefix === '../') {
    if (clean === 'index.html' || clean === './index.html') return '../index.html';
    return safeHref(clean.replace(/^pages\//i, ''));
  }
  return clean;
}

export function safeCssColor(val, fallback = '#0B4DB8') {
  const clean = String(val ?? '').trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)) {
    return clean;
  }
  return fallback;
}

function getFontStack(fontStyle) {
  if (fontStyle === 'editorial_serif') {
    return "'Georgia', 'Times New Roman', serif";
  }
  if (fontStyle === 'clean_geometric') {
    return "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif";
  }
  return "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
}

function svgIconMarkup(iconName = 'ShieldCheck') {
  const safeName = WHITELISTED_ICONS.includes(iconName) ? iconName : 'ShieldCheck';
  if (safeName === 'Clock' || safeName === 'Calendar') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  }
  if (safeName === 'MessageCircle') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
  }
  if (safeName === 'Heart') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
  }
  if (safeName === 'Package' || safeName === 'Gift' || safeName === 'ShoppingBag') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
  }
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>';
}

export function buildMoldeStylesCss(tokens = {}) {
  const accent = safeCssColor(tokens.accent, '#0B4DB8');
  const accentDeep = safeCssColor(tokens.accentDeep, '#073B91');
  const surface = safeCssColor(tokens.surface, '#F8FAFC');
  const surfaceAlt = safeCssColor(tokens.surfaceAlt, '#EFF6FF');
  const card = safeCssColor(tokens.card, '#FFFFFF');
  const ink = safeCssColor(tokens.ink, '#0F172A');
  const inkMuted = safeCssColor(tokens.inkMuted, '#475569');
  const footerBg = safeCssColor(tokens.footerBg, '#0F172A');
  const rawRadius = Number(tokens.radiusPx);
  const radius = Number.isFinite(rawRadius) ? Math.max(0, Math.min(48, Math.round(rawRadius))) : 20;
  const fontHeading = getFontStack(tokens.fontStyle);

  return `/* Formula-IR v9.0 · Pasta Molde Stylesheet */
:root {
  --accent: ${accent};
  --accent-deep: ${accentDeep};
  --surface: ${surface};
  --surface-alt: ${surfaceAlt};
  --card: ${card};
  --ink: ${ink};
  --ink-muted: ${inkMuted};
  --footer-bg: ${footerBg};
  --radius: ${radius}px;
  --font-sans: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-heading: ${fontHeading};
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--surface);
  color: var(--ink);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.cg-container { width: 100%; max-width: 1180px; margin: 0 auto; padding: 0 20px; }
.cg-section { padding: 56px 0; }
.cg-header {
  position: sticky; top: 0; z-index: 40;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(15,23,42,0.08);
}
.cg-header-inner {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-height: 68px; padding: 10px 0; flex-wrap: wrap;
}
.cg-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 800; font-size: 1.05rem; }
.cg-brand img { height: 38px; width: auto; max-width: 140px; object-fit: contain; border-radius: 8px; }
.cg-nav { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.cg-nav a { text-decoration: none; font-size: 0.9rem; font-weight: 600; color: var(--ink-muted); }
.cg-nav a:hover { color: var(--accent); }
.cg-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 10px 20px; border-radius: 999px;
  font-weight: 700; font-size: 0.9rem; cursor: pointer; text-decoration: none;
  border: 1px solid transparent; transition: transform 0.14s ease, background-color 0.14s ease, opacity 0.14s ease;
}
.cg-btn:active { transform: scale(0.98); }
.cg-btn-primary { background: var(--accent); color: #FFFFFF; }
.cg-btn-primary:hover { background: var(--accent-deep); }
.cg-btn-secondary { background: #FFFFFF; color: var(--ink); border-color: rgba(15,23,42,0.16); }
.cg-btn-secondary:hover { background: var(--surface-alt); }
.cg-btn-added { background: #059669 !important; color: #FFFFFF !important; border-color: #059669 !important; }
.cg-eyebrow {
  display: inline-block; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 10px;
}
h1, h2, h3 { font-family: var(--font-heading); letter-spacing: -0.02em; margin: 0 0 12px; color: var(--ink); }
.cg-hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 36px; align-items: center; }
.cg-hero-title { font-size: clamp(2rem, 4vw, 3.2rem); line-height: 1.08; }
.cg-hero-sub { font-size: 1.05rem; color: var(--ink-muted); max-width: 58ch; margin: 0 0 24px; }
.cg-hero-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.cg-media-box {
  border-radius: var(--radius); overflow: hidden; background: #F1F5F9;
  border: 1px solid rgba(15,23,42,0.08); aspect-ratio: 4 / 3;
}
.cg-media-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cg-hero-bleed {
  position: relative; border-radius: calc(var(--radius) + 4px); overflow: hidden;
  min-height: 400px; display: flex; align-items: flex-end; background: #0F172A; color: #FFFFFF;
}
.cg-hero-bleed img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
.cg-hero-bleed-content { position: relative; z-index: 2; padding: 36px; max-width: 680px; }
.cg-hero-bleed-content h1, .cg-hero-bleed-content p { color: #FFFFFF; }
.cg-diff-strip {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px;
}
.cg-diff-card {
  display: flex; align-items: flex-start; gap: 12px; padding: 18px;
  border-radius: calc(var(--radius) - 4px); background: var(--card); border: 1px solid rgba(15,23,42,0.08);
}
.cg-diff-icon {
  width: 38px; height: 38px; border-radius: 12px; background: var(--surface-alt);
  color: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.cg-exp-wrap {
  background: var(--card); border: 1px solid rgba(15,23,42,0.1);
  border-radius: calc(var(--radius) + 4px); padding: 28px; box-shadow: 0 18px 40px -24px rgba(15,23,42,0.2);
}
.cg-exp-grid { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 28px; margin-top: 20px; }
.cg-atom-group { margin-bottom: 20px; }
.cg-atom-label { display: block; font-size: 0.85rem; font-weight: 800; color: var(--ink); margin-bottom: 10px; }
.cg-tabs-row, .cg-slots-row { display: flex; flex-wrap: wrap; gap: 8px; }
.cg-pill-btn {
  border: 1px solid rgba(15,23,42,0.14); background: #FFFFFF; color: var(--ink);
  border-radius: 999px; padding: 9px 16px; font-size: 0.85rem; font-weight: 700; cursor: pointer;
}
.cg-pill-btn.is-active { background: var(--accent); color: #FFFFFF; border-color: var(--accent); }
.cg-options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 10px; }
.cg-option-card {
  border: 1.5px solid rgba(15,23,42,0.12); border-radius: 14px; padding: 12px 14px;
  background: #FFFFFF; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 4px;
}
.cg-option-card.is-active { border-color: var(--accent); background: var(--surface-alt); }
.cg-checklist { display: grid; gap: 8px; }
.cg-check-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border: 1px solid rgba(15,23,42,0.12); border-radius: 12px; padding: 10px 14px; cursor: pointer; background: #FFFFFF;
}
.cg-check-item.is-active { border-color: var(--accent); background: var(--surface-alt); }
.cg-slider-box { padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid rgba(15,23,42,0.08); }
.cg-slider-box input[type="range"] { width: 100%; accent-color: var(--accent); }
.cg-summary-panel {
  border-radius: var(--radius); background: var(--surface-alt); padding: 22px;
  border: 1px solid rgba(15,23,42,0.08); display: flex; flex-direction: column; justify-content: space-between; gap: 16px;
}
.cg-summary-lines { list-style: none; padding: 0; margin: 10px 0; display: grid; gap: 6px; font-size: 0.88rem; }
.cg-summary-total { font-size: 1.75rem; font-weight: 900; color: var(--ink); }
.cg-catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(235px, 1fr)); gap: 18px; }
.cg-product-card {
  background: var(--card); border: 1px solid rgba(15,23,42,0.08); border-radius: var(--radius);
  overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;
}
.cg-product-thumb {
  width: 100%; aspect-ratio: 1 / 1; background: #F1F5F9; display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.cg-product-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cg-neutral-gray-box {
  width: 100%; height: 100%; background: #F1F5F9; color: #64748B;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 16px; text-align: center;
}
.cg-neutral-gray-box span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.cg-product-body { padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.cg-price { font-size: 1.15rem; font-weight: 800; color: var(--ink); }
.cg-editorial-grid, .cg-closing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center; }
.cg-highlights-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.cg-card { background: var(--card); border: 1px solid rgba(15,23,42,0.08); border-radius: var(--radius); padding: 22px; }
.cg-faq-list { display: grid; gap: 10px; max-width: 820px; }
.cg-faq-item { background: var(--card); border: 1px solid rgba(15,23,42,0.09); border-radius: 14px; padding: 14px 18px; }
.cg-faq-item summary { font-weight: 700; cursor: pointer; }
.cg-footer { background: var(--footer-bg); color: #E2E8F0; padding: 44px 0 36px; margin-top: 32px; }
.cg-footer a { color: #CBD5E1; }
.cg-drawer-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,0.52); z-index: 90;
  display: none; justify-content: flex-end;
}
.cg-drawer-backdrop.is-open { display: flex; }
.cg-drawer {
  width: 100%; max-width: 420px; background: #FFFFFF; height: 100%; display: flex;
  flex-direction: column; padding: 22px; overflow-y: auto; box-shadow: -12px 0 40px rgba(15,23,42,0.22);
}
@media (max-width: 860px) {
  .cg-hero-grid, .cg-exp-grid, .cg-editorial-grid, .cg-closing-grid { grid-template-columns: 1fr; }
}
@media (max-width: 420px) {
  html, body { max-width: 100%; overflow-x: hidden; }
  .cg-container { padding-left: 14px; padding-right: 14px; }
  .cg-exp-wrap { padding: 18px 14px; }
  .cg-options-grid, .cg-catalog-grid, .cg-highlights-grid, .cg-diff-strip { grid-template-columns: minmax(0, 1fr); }
  .cg-summary-total, .cg-price { white-space: nowrap; }
  .cg-btn { width: 100%; min-width: 0; padding: 11px 14px; text-align: center; line-height: 1.25; }
  .cg-hero-bleed-content { padding: 22px 16px; }
  .cg-product-body, .cg-card { min-width: 0; }
}
`;
}

export function buildMoldeAppJs() {
  return `/* Formula-IR v9.0 · Offline Runtime & Interactive Calculator */
(function () {
  function readJsonScript(id, fallback) {
    try {
      var el = document.getElementById(id);
      return el ? JSON.parse(el.textContent || 'null') : fallback;
    } catch (_e) {
      return fallback;
    }
  }

  var storeData = readJsonScript('cg-store-data', { storeInfo: {}, catalog: [], experiences: {} });
  var cart = [];
  try {
    var saved = localStorage.getItem('cg_molde_cart_v9');
    if (saved) cart = JSON.parse(saved) || [];
  } catch (_e) {}

  function formatBrl(cents) {
    var safe = Number.isFinite(Number(cents)) ? Number(cents) : 0;
    return (safe / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escCssAttr(val) {
    var s = String(val == null ? '' : val);
    return (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
      ? CSS.escape(s)
      : s.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function evaluateInteractiveExperience(expCfg, state, catalog) {
    var controls = Array.isArray(expCfg.controls) ? expCfg.controls : [];
    var calcRule = expCfg.calcRule || {};
    var totalCents = 0;
    var lines = [];
    var selectedProducts = [];
    var byRef = {};
    (catalog || []).forEach(function (item) {
      if (item && item.sku) byRef[String(item.sku).toUpperCase()] = item;
      if (item && item.id) byRef[String(item.id)] = item;
    });

    controls.forEach(function (ctrl) {
      var val = state[ctrl.stateKey];
      if (ctrl.atomType === 'tabs_selector' || ctrl.atomType === 'option_cards') {
        var opt = (ctrl.options || []).find(function (o) { return o.value === val; }) || (ctrl.options || [])[0];
        if (opt) {
          var matched = opt.skuRef ? byRef[String(opt.skuRef).toUpperCase()] || byRef[String(opt.skuRef)] : null;
          var price = matched ? Number(matched.priceCents || 0) : Number(opt.priceCents || opt.priceDeltaCents || 0);
          totalCents += price;
          lines.push(ctrl.label + ': ' + (matched ? matched.name : opt.label));
          if (matched) selectedProducts.push(matched);
        }
      } else if (ctrl.atomType === 'checklist_addons') {
        var list = Array.isArray(val) ? val : [];
        (ctrl.options || []).forEach(function (opt) {
          if (list.indexOf(opt.value) >= 0) {
            var matched = opt.skuRef ? byRef[String(opt.skuRef).toUpperCase()] || byRef[String(opt.skuRef)] : null;
            var addPrice = matched ? Number(matched.priceCents || 0) : Number(opt.priceDeltaCents || opt.priceCents || 0);
            totalCents += addPrice;
            lines.push('+ ' + (matched ? matched.name : opt.label));
            if (matched) selectedProducts.push(matched);
          }
        });
      } else if (ctrl.atomType === 'slider_range') {
        var qty = Number(val !== undefined ? val : ctrl.min || 1);
        totalCents += Math.round(qty * Number(ctrl.pricePerUnitCents || 0));
        lines.push(ctrl.label + ': ' + qty + ' ' + (ctrl.unitLabel || ''));
      } else if (ctrl.atomType === 'slot_time_picker') {
        if (val) lines.push(ctrl.label + ': ' + val);
      }
    });

    var safeTotal = Math.max(0, Math.round(totalCents));
    var pixPct = Math.max(0, Math.min(90, Number(calcRule.pixDiscountPercent || 0)));
    var pixTotal = pixPct > 0 ? Math.max(0, safeTotal - Math.round((safeTotal * pixPct) / 100)) : safeTotal;
    return { totalCents: safeTotal, pixTotalCents: pixTotal, pixDiscountPercent: pixPct, chosenSummaryLines: lines, selectedProducts: selectedProducts };
  }

  function saveCart() {
    try { localStorage.setItem('cg_molde_cart_v9', JSON.stringify(cart)); } catch (_e) {}
    var totalCount = cart.reduce(function (s, i) { return s + Number(i.qty || 1); }, 0);
    document.querySelectorAll('[data-cg-cart-count]').forEach(function (el) { el.textContent = String(totalCount); });
    renderCartItems();
  }

  function addItemToCart(item) {
    if (!item) return;
    var key = item.id || item.sku || item.name;
    var existing = cart.find(function (c) { return (c.id || c.sku || c.name) === key; });
    if (existing) existing.qty = Number(existing.qty || 1) + 1;
    else cart.push({ id: item.id, sku: item.sku, name: item.name, priceCents: Number(item.priceCents || 0), qty: 1 });
    saveCart();
  }

  function renderCartItems() {
    var box = document.getElementById('cg-cart-items');
    var totEl = document.getElementById('cg-cart-total');
    if (!box || !totEl) return;
    if (cart.length === 0) {
      box.innerHTML = '<p style="color:#64748B;font-size:0.9rem;">Sua sacola está vazia. Escolha itens na experiência ou no catálogo.</p>';
      totEl.textContent = formatBrl(0);
      return;
    }
    var sum = 0;
    box.innerHTML = cart.map(function (c, idx) {
      var safeQty = Number.isFinite(Number(c.qty)) ? Math.max(1, Number(c.qty)) : 1;
      sum += Number(c.priceCents || 0) * safeQty;
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #E2E8F0;gap:10px;">' +
        '<div><strong style="font-size:0.9rem;">' + escHtml(c.name) + '</strong><div style="font-size:0.8rem;color:#64748B;">' + escHtml(safeQty) + 'x ' + escHtml(formatBrl(c.priceCents)) + '</div></div>' +
        '<button type="button" data-cg-remove-idx="' + escHtml(idx) + '" style="border:1px solid #CBD5E1;background:#fff;border-radius:8px;padding:4px 9px;cursor:pointer;">Remover</button>' +
      '</div>';
    }).join('');
    totEl.textContent = formatBrl(sum);
    box.querySelectorAll('[data-cg-remove-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cart.splice(Number(btn.getAttribute('data-cg-remove-idx')), 1);
        saveCart();
      });
    });
  }

  function openWhatsApp(customLines) {
    var phone = String((storeData.storeInfo || {}).whatsappE164 || '').replace(/\\D/g, '');
    if (!phone) return;
    var storeName = String((storeData.storeInfo || {}).name || 'Loja');
    var lines = ['Olá ' + storeName + '! Gostaria de continuar com meu pedido:'];
    if (Array.isArray(customLines) && customLines.length > 0) {
      customLines.forEach(function (l) { lines.push('- ' + l); });
    } else if (cart.length > 0) {
      cart.forEach(function (c) { lines.push('- ' + c.qty + 'x ' + c.name + ' (' + formatBrl(c.priceCents) + ')'); });
    }
    var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(lines.join('\\n'));
    window.open(url, '_blank', 'noopener');
  }

  function flashButtonAdded(btn) {
    if (!btn) return;
    var orig = btn.getAttribute('data-orig-label') || btn.textContent;
    btn.setAttribute('data-orig-label', orig);
    btn.classList.add('cg-btn-added');
    btn.textContent = '✓ Adicionado';
    setTimeout(function () {
      btn.classList.remove('cg-btn-added');
      btn.textContent = orig;
    }, 1200);
  }

  // Interactive Experience bindings
  document.querySelectorAll('[data-cg-exp-id]').forEach(function (sectionEl) {
    var expId = sectionEl.getAttribute('data-cg-exp-id');
    var cfg = (storeData.experiences || {})[expId];
    if (!cfg) return;
    var state = Object.assign({}, cfg.stateDefaults || {});

    function updateSummary() {
      var res = evaluateInteractiveExperience(cfg, state, storeData.catalog || []);
      var linesEl = sectionEl.querySelector('[data-cg-summary-lines]');
      var totalEl = sectionEl.querySelector('[data-cg-summary-total]');
      var pixEl = sectionEl.querySelector('[data-cg-summary-pix]');
      if (linesEl) {
        linesEl.innerHTML = res.chosenSummaryLines.map(function (l) { return '<li>• ' + escHtml(l) + '</li>'; }).join('');
      }
      if (totalEl) totalEl.textContent = res.totalCents > 0 ? formatBrl(res.totalCents) : 'Sob consulta';
      if (pixEl) {
        pixEl.textContent = res.pixDiscountPercent > 0 && res.totalCents > 0
          ? 'No Pix (' + res.pixDiscountPercent + '% OFF): ' + formatBrl(res.pixTotalCents)
          : '';
      }
      return res;
    }

    sectionEl.querySelectorAll('[data-cg-atom-select]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-state-key');
        var val = btn.getAttribute('data-value');
        state[key] = val;
        sectionEl.querySelectorAll('[data-cg-atom-select][data-state-key="' + escCssAttr(key) + '"]').forEach(function (sibling) {
          sibling.classList.toggle('is-active', sibling === btn);
        });
        updateSummary();
      });
    });

    sectionEl.querySelectorAll('[data-cg-atom-check]').forEach(function (input) {
      input.addEventListener('change', function () {
        var key = input.getAttribute('data-state-key');
        var val = input.getAttribute('data-value');
        var list = Array.isArray(state[key]) ? state[key].slice() : [];
        if (input.checked && list.indexOf(val) < 0) list.push(val);
        if (!input.checked) list = list.filter(function (v) { return v !== val; });
        state[key] = list;
        if (input.parentElement) input.parentElement.classList.toggle('is-active', input.checked);
        updateSummary();
      });
    });

    sectionEl.querySelectorAll('[data-cg-atom-slider]').forEach(function (range) {
      range.addEventListener('input', function () {
        var key = range.getAttribute('data-state-key');
        state[key] = Number(range.value);
        var valOut = sectionEl.querySelector('[data-cg-slider-val="' + escCssAttr(key) + '"]');
        if (valOut) valOut.textContent = String(range.value);
        updateSummary();
      });
    });

    var primaryBtn = sectionEl.querySelector('[data-cg-exp-primary]');
    if (primaryBtn) {
      primaryBtn.addEventListener('click', function () {
        var res = updateSummary();
        if (res.selectedProducts.length > 0) {
          res.selectedProducts.forEach(addItemToCart);
          flashButtonAdded(primaryBtn);
        } else {
          addItemToCart({
            id: 'exp_' + expId,
            sku: 'EXP-' + expId,
            name: (cfg.title || 'Seleção') + ' (' + res.chosenSummaryLines.join(' | ').slice(0, 60) + ')',
            priceCents: res.totalCents,
          });
          flashButtonAdded(primaryBtn);
        }
      });
    }

    var wppBtn = sectionEl.querySelector('[data-cg-exp-whatsapp]');
    if (wppBtn) {
      wppBtn.addEventListener('click', function () {
        var res = updateSummary();
        openWhatsApp(res.chosenSummaryLines);
      });
    }

    updateSummary();
  });

  // Catalog add-to-bag buttons (inline feedback, zero toast)
  document.querySelectorAll('[data-cg-add-sku]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sku = btn.getAttribute('data-cg-add-sku');
      var item = (storeData.catalog || []).find(function (p) { return (p.sku || p.id) === sku; });
      if (item) {
        addItemToCart(item);
        flashButtonAdded(btn);
      }
    });
  });

  // StepsTimeline tabs
  document.querySelectorAll('[data-cg-timeline-tab]').forEach(function (tabBtn) {
    tabBtn.addEventListener('click', function () {
      var wrap = tabBtn.closest('[data-cg-timeline]');
      var targetId = tabBtn.getAttribute('data-cg-timeline-tab');
      if (!wrap) return;
      wrap.querySelectorAll('[data-cg-timeline-tab]').forEach(function (b) { b.classList.toggle('is-active', b === tabBtn); });
      wrap.querySelectorAll('[data-cg-timeline-panel]').forEach(function (panel) {
        panel.style.display = panel.getAttribute('data-cg-timeline-panel') === targetId ? 'grid' : 'none';
      });
    });
  });

  // Drawer open/close
  var drawerBackdrop = document.getElementById('cg-cart-backdrop');
  document.querySelectorAll('[data-cg-open-cart]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (drawerBackdrop) drawerBackdrop.classList.add('is-open');
    });
  });
  document.querySelectorAll('[data-cg-close-cart]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (drawerBackdrop) drawerBackdrop.classList.remove('is-open');
    });
  });
  var wppCheckout = document.getElementById('cg-cart-whatsapp');
  if (wppCheckout) {
    wppCheckout.addEventListener('click', function () { openWhatsApp(); });
  }
  document.querySelectorAll('[data-cg-direct-wpp]').forEach(function (btn) {
    btn.addEventListener('click', function () { openWhatsApp(); });
  });

  saveCart();
})();
`;
}

function renderInteractiveExperienceHtml(sec, formulasIr, relPrefix) {
  const cfg = sec.config || {};
  const defaults = cfg.stateDefaults || {};
  const controls = Array.isArray(cfg.controls) ? cfg.controls : [];
  const calc = cfg.calcRule || {};
  const imgUrl = toRelativeMoldeAsset(cfg.imageUrl, relPrefix);

  const controlsHtml = controls
    .map((ctrl) => {
      const defVal = defaults[ctrl.stateKey];
      if (ctrl.atomType === 'tabs_selector') {
        return `<div class="cg-atom-group">
          <span class="cg-atom-label">${escapeHtml(ctrl.label)}</span>
          <div class="cg-tabs-row">
            ${(ctrl.options || [])
              .map(
                (o) => `<button type="button" class="cg-pill-btn ${defVal === o.value ? 'is-active' : ''}" data-cg-atom-select data-state-key="${escapeHtml(ctrl.stateKey)}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`,
              )
              .join('')}
          </div>
        </div>`;
      }
      if (ctrl.atomType === 'option_cards') {
        return `<div class="cg-atom-group">
          <span class="cg-atom-label">${escapeHtml(ctrl.label)}</span>
          <div class="cg-options-grid">
            ${(ctrl.options || [])
              .map(
                (o) => `<button type="button" class="cg-option-card ${defVal === o.value ? 'is-active' : ''}" data-cg-atom-select data-state-key="${escapeHtml(ctrl.stateKey)}" data-value="${escapeHtml(o.value)}">
                  <strong style="font-size:0.9rem;">${escapeHtml(o.label)}</strong>
                  ${o.note ? `<span style="font-size:0.78rem;color:var(--ink-muted);">${escapeHtml(o.note)}</span>` : ''}
                  ${Number.isFinite(o.priceCents) ? `<span style="font-size:0.82rem;font-weight:700;color:var(--accent);">${formatBrl(o.priceCents)}</span>` : ''}
                </button>`,
              )
              .join('')}
          </div>
        </div>`;
      }
      if (ctrl.atomType === 'checklist_addons') {
        const list = Array.isArray(defVal) ? defVal : [];
        return `<div class="cg-atom-group">
          <span class="cg-atom-label">${escapeHtml(ctrl.label)}</span>
          <div class="cg-checklist">
            ${(ctrl.options || [])
              .map(
                (o) => `<label class="cg-check-item ${list.includes(o.value) ? 'is-active' : ''}">
                  <span style="display:flex;align-items:center;gap:8px;font-size:0.88rem;font-weight:600;">
                    <input type="checkbox" ${list.includes(o.value) ? 'checked' : ''} data-cg-atom-check data-state-key="${escapeHtml(ctrl.stateKey)}" data-value="${escapeHtml(o.value)}" />
                    ${escapeHtml(o.label)}
                  </span>
                  <span style="font-size:0.82rem;font-weight:700;color:var(--accent);">${o.priceDeltaCents ? `+ ${formatBrl(o.priceDeltaCents)}` : ''}</span>
                </label>`,
              )
              .join('')}
          </div>
        </div>`;
      }
      if (ctrl.atomType === 'slider_range') {
        const init = defVal !== undefined ? Number(defVal) : Number(ctrl.min || 1);
        return `<div class="cg-atom-group">
          <span class="cg-atom-label">${escapeHtml(ctrl.label)}: <strong data-cg-slider-val="${escapeHtml(ctrl.stateKey)}">${init}</strong> ${escapeHtml(ctrl.unitLabel || '')}</span>
          <div class="cg-slider-box">
            <input type="range" min="${Number(ctrl.min || 1)}" max="${Number(ctrl.max || 10)}" step="${Number(ctrl.step || 1)}" value="${init}" data-cg-atom-slider data-state-key="${escapeHtml(ctrl.stateKey)}" />
          </div>
        </div>`;
      }
      if (ctrl.atomType === 'slot_time_picker') {
        return `<div class="cg-atom-group">
          <span class="cg-atom-label">${escapeHtml(ctrl.label)}</span>
          <div class="cg-slots-row">
            ${(ctrl.slots || [])
              .map(
                (slot) => `<button type="button" class="cg-pill-btn ${defVal === slot ? 'is-active' : ''}" data-cg-atom-select data-state-key="${escapeHtml(ctrl.stateKey)}" data-value="${escapeHtml(slot)}">${escapeHtml(slot)}</button>`,
              )
              .join('')}
          </div>
        </div>`;
      }
      return '';
    })
    .join('');

  return `<section class="cg-section" id="experiencia" data-cg-exp-id="${escapeHtml(sec.id)}">
    <div class="cg-container">
      <div class="cg-exp-wrap">
        ${cfg.eyebrow ? `<span class="cg-eyebrow">${escapeHtml(cfg.eyebrow)}</span>` : ''}
        <h2 style="font-size:1.7rem;">${escapeHtml(cfg.title || 'Simulador interativo')}</h2>
        ${cfg.subtitle ? `<p style="color:var(--ink-muted);margin:0;">${escapeHtml(cfg.subtitle)}</p>` : ''}
        <div class="cg-exp-grid">
          <div>${controlsHtml}</div>
          <aside class="cg-summary-panel">
            <div>
              ${imgUrl ? `<div class="cg-media-box" style="margin-bottom:14px;"><img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(cfg.title || '')}" /></div>` : ''}
              <strong style="font-size:0.95rem;">${escapeHtml(calc.summaryTitle || 'Resumo da escolha')}</strong>
              <ul class="cg-summary-lines" data-cg-summary-lines></ul>
              <div class="cg-summary-total" data-cg-summary-total>—</div>
              <div data-cg-summary-pix style="font-size:0.82rem;font-weight:700;color:#047857;margin-top:4px;"></div>
              ${calc.limitNote ? `<p style="font-size:0.78rem;color:var(--ink-muted);margin-top:10px;">${escapeHtml(calc.limitNote)}</p>` : ''}
            </div>
            <div style="display:grid;gap:8px;">
              <button type="button" class="cg-btn cg-btn-primary" data-cg-exp-primary>${escapeHtml(cfg.primaryAction?.label || 'Adicionar à sacola')}</button>
              <button type="button" class="cg-btn cg-btn-secondary" data-cg-exp-whatsapp>${escapeHtml(cfg.secondaryAction?.label || 'Enviar no WhatsApp')}</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderV9SectionHtml(sec, formulasIr, relPrefix = '') {
  if (!sec || !sec.type) return '';
  const cfg = sec.config || {};
  const storeInfo = formulasIr.storeInfo || {};
  const catalog = Array.isArray(formulasIr.catalog) ? formulasIr.catalog : [];

  switch (sec.type) {
    case 'HeaderNav': {
      const logoSrc = toRelativeMoldeAsset(storeInfo.logoUrl, relPrefix);
      const links = Array.isArray(cfg.links) ? cfg.links : [];
      return `<header class="cg-header">
        <div class="cg-container cg-header-inner">
          <a href="${relPrefix}index.html" class="cg-brand">
            ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(storeInfo.name || '')}" />` : ''}
            <span>${escapeHtml(storeInfo.name || 'Minha Loja')}</span>
          </a>
          <nav class="cg-nav">
            ${links.map((l) => `<a href="${escapeHtml(safeHref(toRelativeMoldeHref(l.href, relPrefix)))}">${escapeHtml(l.label)}</a>`).join('')}
            <a href="#catalogo">Catálogo</a>
            <button type="button" class="cg-btn cg-btn-primary" data-cg-open-cart>
              ${escapeHtml(cfg.ctaLabel || 'Sacola')} (<span data-cg-cart-count>0</span>)
            </button>
          </nav>
        </div>
      </header>`;
    }

    case 'HeroSection': {
      const heroImg = toRelativeMoldeAsset(cfg.imageUrl, relPrefix);
      const isBleed = cfg.variant === 'full_bleed' && heroImg;
      if (isBleed) {
        return `<section class="cg-section" style="padding-top:24px;">
          <div class="cg-container">
            <div class="cg-hero-bleed">
              <img src="${escapeHtml(heroImg)}" alt="${escapeHtml(cfg.title || '')}" />
              <div class="cg-hero-bleed-content">
                ${cfg.eyebrow ? `<span class="cg-eyebrow" style="color:#E2E8F0;">${escapeHtml(cfg.eyebrow)}</span>` : ''}
                <h1 class="cg-hero-title">${escapeHtml(cfg.title || '')}</h1>
                ${cfg.subtitle ? `<p class="cg-hero-sub" style="color:#E2E8F0;">${escapeHtml(cfg.subtitle)}</p>` : ''}
                <div class="cg-hero-actions">
                  ${cfg.primaryCta ? `<a class="cg-btn cg-btn-primary" href="${escapeHtml(safeHref(cfg.primaryCta.href))}">${escapeHtml(cfg.primaryCta.label)}</a>` : ''}
                  ${cfg.secondaryCta ? `<button type="button" class="cg-btn cg-btn-secondary" data-cg-direct-wpp>${escapeHtml(cfg.secondaryCta.label)}</button>` : ''}
                </div>
              </div>
            </div>
          </div>
        </section>`;
      }
      return `<section class="cg-section">
        <div class="cg-container cg-hero-grid">
          <div>
            ${cfg.eyebrow ? `<span class="cg-eyebrow">${escapeHtml(cfg.eyebrow)}</span>` : ''}
            <h1 class="cg-hero-title">${escapeHtml(cfg.title || storeInfo.name || '')}</h1>
            ${cfg.subtitle ? `<p class="cg-hero-sub">${escapeHtml(cfg.subtitle)}</p>` : ''}
            <div class="cg-hero-actions">
              ${cfg.primaryCta ? `<a class="cg-btn cg-btn-primary" href="${escapeHtml(safeHref(cfg.primaryCta.href))}">${escapeHtml(cfg.primaryCta.label)}</a>` : ''}
              ${cfg.secondaryCta ? `<button type="button" class="cg-btn cg-btn-secondary" data-cg-direct-wpp>${escapeHtml(cfg.secondaryCta.label)}</button>` : ''}
            </div>
          </div>
          ${heroImg ? `<div class="cg-media-box"><img src="${escapeHtml(heroImg)}" alt="${escapeHtml(cfg.title || '')}" /></div>` : '<div class="cg-media-box"></div>'}
        </div>
      </section>`;
    }

    case 'DifferentialsStrip':
      return `<section class="cg-section" style="padding:24px 0;">
        <div class="cg-container cg-diff-strip">
          ${(cfg.items || [])
            .map(
              (item) => `<div class="cg-diff-card">
                <div class="cg-diff-icon">${svgIconMarkup(item.icon)}</div>
                <div>
                  <strong style="font-size:0.95rem;display:block;">${escapeHtml(item.title)}</strong>
                  ${item.text ? `<span style="font-size:0.84rem;color:var(--ink-muted);">${escapeHtml(item.text)}</span>` : ''}
                </div>
              </div>`,
            )
            .join('')}
        </div>
      </section>`;

    case 'InteractiveExperience':
      return renderInteractiveExperienceHtml(sec, formulasIr, relPrefix);

    case 'EditorialMediaSplit': {
      const imgUrl = toRelativeMoldeAsset(cfg.imageUrl, relPrefix);
      const textBlock = `<div>
        ${cfg.eyebrow ? `<span class="cg-eyebrow">${escapeHtml(cfg.eyebrow)}</span>` : ''}
        <h2 style="font-size:1.75rem;">${escapeHtml(cfg.title || '')}</h2>
        <p style="color:var(--ink-muted);">${escapeHtml(cfg.body || '')}</p>
        ${Array.isArray(cfg.bullets) && cfg.bullets.length ? `<ul style="padding-left:18px;color:var(--ink-muted);">${cfg.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
        ${cfg.ctaLabel ? `<a class="cg-btn cg-btn-secondary" href="${escapeHtml(safeHref(cfg.ctaHref || '#catalogo'))}">${escapeHtml(cfg.ctaLabel)}</a>` : ''}
      </div>`;
      const mediaBlock = imgUrl ? `<div class="cg-media-box"><img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(cfg.title || '')}" /></div>` : '';
      return `<section class="cg-section"><div class="cg-container cg-editorial-grid">${
        cfg.variant === 'media_left' ? `${mediaBlock}${textBlock}` : `${textBlock}${mediaBlock}`
      }</div></section>`;
    }

    case 'StepsTimeline': {
      const tabs = Array.isArray(cfg.tabs) ? cfg.tabs : [];
      return `<section class="cg-section" data-cg-timeline>
        <div class="cg-container">
          <h2 style="font-size:1.75rem;">${escapeHtml(cfg.title || '')}</h2>
          ${cfg.subtitle ? `<p style="color:var(--ink-muted);margin-bottom:18px;">${escapeHtml(cfg.subtitle)}</p>` : ''}
          <div class="cg-tabs-row" style="margin-bottom:18px;">
            ${tabs.map((t, idx) => `<button type="button" class="cg-pill-btn ${idx === 0 ? 'is-active' : ''}" data-cg-timeline-tab="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`).join('')}
          </div>
          ${tabs
            .map(
              (t, idx) => `<div class="cg-highlights-grid" data-cg-timeline-panel="${escapeHtml(t.id)}" style="display:${idx === 0 ? 'grid' : 'none'};">
                ${(t.steps || [])
                  .map(
                    (st) => `<div class="cg-card">
                      <span class="cg-eyebrow">${escapeHtml(st.time)}</span>
                      <h3 style="font-size:1.05rem;">${escapeHtml(st.title)}</h3>
                      <p style="font-size:0.88rem;color:var(--ink-muted);margin:0;">${escapeHtml(st.detail)}</p>
                    </div>`,
                  )
                  .join('')}
              </div>`,
            )
            .join('')}
        </div>
      </section>`;
    }

    case 'HighlightsGrid':
      return `<section class="cg-section">
        <div class="cg-container">
          <h2 style="font-size:1.75rem;">${escapeHtml(cfg.title || '')}</h2>
          ${cfg.subtitle ? `<p style="color:var(--ink-muted);margin-bottom:20px;">${escapeHtml(cfg.subtitle)}</p>` : ''}
          <div class="cg-highlights-grid">
            ${(cfg.cards || [])
              .map((c) => {
                const cardImg = toRelativeMoldeAsset(c.imageUrl, relPrefix);
                return `<div class="cg-card">
                  ${cardImg ? `<div class="cg-media-box" style="margin-bottom:14px;"><img src="${escapeHtml(cardImg)}" alt="${escapeHtml(c.title)}" /></div>` : ''}
                  ${c.eyebrow ? `<span class="cg-eyebrow">${escapeHtml(c.eyebrow)}</span>` : ''}
                  <h3 style="font-size:1.1rem;">${escapeHtml(c.title)}</h3>
                  <p style="font-size:0.9rem;color:var(--ink-muted);">${escapeHtml(c.description || '')}</p>
                  <a class="cg-btn cg-btn-secondary" href="${escapeHtml(safeHref(c.href || '#catalogo'))}">${escapeHtml(c.ctaLabel || 'Ver detalhes')}</a>
                </div>`;
              })
              .join('')}
          </div>
        </div>
      </section>`;

    case 'FaqAccordion':
      return `<section class="cg-section">
        <div class="cg-container">
          <h2 style="font-size:1.75rem;">${escapeHtml(cfg.title || 'Dúvidas frequentes')}</h2>
          <div class="cg-faq-list">
            ${(cfg.items || [])
              .map(
                (it) => `<details class="cg-faq-item">
                  <summary>${escapeHtml(it.q)}</summary>
                  <p style="margin:10px 0 0;font-size:0.92rem;color:var(--ink-muted);">${escapeHtml(it.a)}</p>
                </details>`,
              )
              .join('')}
          </div>
        </div>
      </section>`;

    case 'CatalogGrid':
      return `<section class="cg-section" id="catalogo">
        <div class="cg-container">
          <h2 style="font-size:1.75rem;">${escapeHtml(cfg.title || 'Catálogo')}</h2>
          ${cfg.subtitle ? `<p style="color:var(--ink-muted);margin-bottom:22px;">${escapeHtml(cfg.subtitle)}</p>` : ''}
          <div class="cg-catalog-grid">
            ${catalog
              .filter((p) => p && p.active !== false)
              .map((p) => {
                const itemImg = toRelativeMoldeAsset(p.imageUrl, relPrefix);
                const initials = escapeHtml(
                  String(p.name || 'CG')
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => (w[0] || '').toUpperCase())
                    .join('') || 'CG',
                );
                const thumbHtml = itemImg
                  ? `<img src="${escapeHtml(itemImg)}" alt="${escapeHtml(p.name)}" />`
                  : `<div class="cg-neutral-gray-box">
                      <div style="width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,0.86);border:1px solid rgba(15,23,42,0.12);border-bottom:3px solid var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;color:var(--ink);">${initials}</div>
                      <span>${escapeHtml(p.category || 'Catálogo')}</span>
                    </div>`;
                return `<article class="cg-product-card">
                  <div class="cg-product-thumb">${thumbHtml}</div>
                  <div class="cg-product-body">
                    <span style="font-size:0.72rem;font-weight:700;color:var(--ink-muted);text-transform:uppercase;">${escapeHtml(p.category || 'Geral')}</span>
                    <h3 style="font-size:1rem;margin:0;">${escapeHtml(p.name)}</h3>
                    ${p.variation && p.variation !== 'Padrão' ? `<span style="font-size:0.8rem;color:var(--ink-muted);">${escapeHtml(p.variation)}</span>` : ''}
                    <div class="cg-price">${formatBrl(p.priceCents)}</div>
                    <button type="button" class="cg-btn cg-btn-primary" style="margin-top:auto;" data-cg-add-sku="${escapeHtml(p.sku || p.id)}">${escapeHtml(cfg.itemActionLabel || 'Adicionar à sacola')}</button>
                  </div>
                </article>`;
              })
              .join('')}
          </div>
        </div>
      </section>`;

    case 'ClosingScheduleSplit': {
      const imgUrl = toRelativeMoldeAsset(cfg.imageUrl, relPrefix);
      return `<section class="cg-section">
        <div class="cg-container">
          <div class="cg-exp-wrap cg-closing-grid">
            <div>
              ${cfg.eyebrow ? `<span class="cg-eyebrow">${escapeHtml(cfg.eyebrow)}</span>` : ''}
              <h2 style="font-size:1.65rem;">${escapeHtml(cfg.title || '')}</h2>
              ${cfg.subtitle ? `<p style="color:var(--ink-muted);">${escapeHtml(cfg.subtitle)}</p>` : ''}
              ${Array.isArray(cfg.slots) && cfg.slots.length ? `<div class="cg-tabs-row" style="margin-top:12px;">${cfg.slots.map((s) => `<span class="cg-pill-btn" style="cursor:default;">${escapeHtml(s)}</span>`).join('')}</div>` : ''}
            </div>
            <div>
              ${imgUrl ? `<div class="cg-media-box" style="margin-bottom:16px;"><img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(storeInfo.name || '')}" /></div>` : ''}
              <h3 style="font-size:1.25rem;">${escapeHtml(cfg.whatsappHeading || 'Fale com nossa equipe')}</h3>
              ${cfg.whatsappSubtext ? `<p style="color:var(--ink-muted);">${escapeHtml(cfg.whatsappSubtext)}</p>` : ''}
              <button type="button" class="cg-btn cg-btn-primary" data-cg-direct-wpp>${escapeHtml(cfg.ctaLabel || 'Chamar no WhatsApp')}</button>
            </div>
          </div>
        </div>
      </section>`;
    }

    case 'RichFooter':
      return `<footer class="cg-footer">
        <div class="cg-container" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:20px;align-items:center;">
          <div>
            <strong style="font-size:1.05rem;">${escapeHtml(storeInfo.name || '')}</strong>
            ${cfg.tagline ? `<p style="margin:6px 0 0;color:#CBD5E1;font-size:0.88rem;">${escapeHtml(cfg.tagline)}</p>` : ''}
          </div>
          <div style="font-size:0.82rem;color:#94A3B8;">
            ${storeInfo.address ? `<div>${escapeHtml(storeInfo.address)}</div>` : ''}
            ${storeInfo.hours ? `<div>${escapeHtml(storeInfo.hours)}</div>` : ''}
          </div>
        </div>
      </footer>`;

    default:
      return '';
  }
}

function renderLegacyV8BlockHtml(block, formulasIr) {
  const zoneAttr = block?.zone ? ` data-zone="${escapeHtml(block.zone)}"` : '';
  const cfg = block?.config || {};
  const catalog = Array.isArray(formulasIr?.catalog) ? formulasIr.catalog : [];
  const storeInfo = formulasIr?.storeInfo || {};
  if (block.type === 'step_routine_builder') {
    const steps = Array.isArray(cfg.modes?.[0]?.steps)
      ? cfg.modes[0].steps
      : Array.isArray(cfg.daySteps)
        ? cfg.daySteps
        : [];
    const sumCents = steps.reduce((acc, st) => {
      const p = Array.isArray(st?.options) ? st.options[0] : st;
      return acc + Number(st?.priceCents ?? p?.priceCents ?? 0);
    }, 0);
    return `<section class="cg-section"${zoneAttr}><div class="cg-container"><div class="cg-exp-wrap"><h2>${escapeHtml(cfg.title || '')}</h2><p>${formatBrl(sumCents)}</p></div></div></section>`;
  }
  return `<section class="cg-section"${zoneAttr}><div class="cg-container"><h2>${escapeHtml(cfg.title || storeInfo.name || block.type)}</h2><p>${escapeHtml(cfg.subtitle || '')}</p></div></section>`;
}

export function renderMoldeHtmlPage({ page, formulasIr }) {
  const filename = page?.filename || 'index.html';
  const relPrefix = filename.includes('/') ? '../' : '';
  const storeInfo = formulasIr?.storeInfo || {};
  const catalog = Array.isArray(formulasIr?.catalog) ? formulasIr.catalog : [];

  if (!Array.isArray(page?.sections) && !Array.isArray(formulasIr?.sections) && Array.isArray(page?.blocks)) {
    const legacyHtml = page.blocks.map((b) => renderLegacyV8BlockHtml(b, formulasIr)).join('\n');
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /><title>${escapeHtml(page?.title || storeInfo.name || 'Vitrine')}</title><link rel="stylesheet" href="${relPrefix}styles.css" /></head>
<body>${legacyHtml}<script src="${relPrefix}app.js"></script></body>
</html>`;
  }

  // Support both v9.0 (sections[]) and page-level sections[]
  const rawSections = Array.isArray(page?.sections)
    ? page.sections
    : Array.isArray(formulasIr?.sections)
      ? formulasIr.sections
      : [];

  const hasHeader = rawSections.some((s) => s?.type === 'HeaderNav');
  const hasFooter = rawSections.some((s) => s?.type === 'RichFooter');
  const sections = [
    ...(hasHeader
      ? []
      : [{ id: 'auto_hdr', type: 'HeaderNav', config: { ctaLabel: 'Sacola', showSearch: false, showBag: true, links: [] } }]),
    ...rawSections,
    ...(hasFooter
      ? []
      : [{ id: 'auto_ftr', type: 'RichFooter', config: { tagline: storeInfo.description || storeInfo.name || '', showNewsletter: false } }]),
  ];

  const experiences = {};
  for (const s of sections) {
    if (s?.type === 'InteractiveExperience') {
      experiences[s.id] = s.config;
    }
  }

  const runtimeData = JSON.stringify({
    storeInfo,
    catalog: catalog.filter((p) => p && p.active !== false),
    experiences,
  }).replace(/</g, '\\u003c');

  const bodyHtml = sections.map((sec) => renderV9SectionHtml(sec, formulasIr, relPrefix)).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page?.title || storeInfo.name || 'Vitrine')}</title>
  <link rel="stylesheet" href="${relPrefix}styles.css" />
</head>
<body>
  ${bodyHtml}
  <div class="cg-drawer-backdrop" id="cg-cart-backdrop" role="dialog" aria-modal="true" aria-label="Sacola de pedidos">
    <div class="cg-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #E2E8F0;padding-bottom:12px;">
        <h3 style="margin:0;">Sua Sacola</h3>
        <button type="button" class="cg-btn cg-btn-secondary" style="min-height:36px;padding:6px 12px;" data-cg-close-cart>Fechar</button>
      </div>
      <div id="cg-cart-items" style="flex:1;margin:14px 0;"></div>
      <div style="border-top:1px solid #E2E8F0;padding-top:14px;display:grid;gap:10px;">
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.05rem;">
          <span>Total estimado</span>
          <span id="cg-cart-total">R$ 0,00</span>
        </div>
        <button type="button" id="cg-cart-whatsapp" class="cg-btn cg-btn-primary">Finalizar pedido no WhatsApp</button>
      </div>
    </div>
  </div>
  <script id="cg-store-data" type="application/json">${runtimeData}</script>
  <script src="${relPrefix}app.js"></script>
</body>
</html>
`;
}
