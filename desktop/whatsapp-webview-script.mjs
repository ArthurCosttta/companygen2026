/**
 * Scripts puros injetados no <webview> oficial do WhatsApp Web (https://web.whatsapp.com/)
 * pelo processo principal do Electron (`desktop/main.mjs`), mantendo a mesma lógica
 * testável diretamente em Chromium via Playwright.
 */

export function buildWebviewIdentityScript() {
  return `(() => {
    const preferredKeys = ['last-wid-md', 'last-wid', 'last-wid-deprecated'];
    const values = preferredKeys.map((key) => {
      try { return localStorage.getItem(key); } catch { return null; }
    }).filter(Boolean);

    let phoneE164 = '';
    for (const value of values) {
      const text = String(value);
      const jid = text.match(/(\\d{10,15})(?::\\d+)?@(?:c\\.us|s\\.whatsapp\\.net)/i);
      if (jid) {
        phoneE164 = jid[1];
        break;
      }
      try {
        const parsed = JSON.parse(text);
        const serialized = String(parsed?.wid?._serialized || parsed?.wid || parsed?.serialized || parsed?.user || '');
        const parsedJid = serialized.match(/(\\d{10,15})(?::\\d+)?@(?:c\\.us|s\\.whatsapp\\.net)/i);
        if (parsedJid) {
          phoneE164 = parsedJid[1];
          break;
        }
      } catch {}
    }

    const extractDigitsOnly = (v) => String(v || '').replace(/\\D/g, '');
    if (!phoneE164) {
      try {
        const widUser = window?.Store?.Conn?.wid?.user || window?.Store?.User?.getMaybeMePnUser?.()?.user || '';
        const digits = extractDigitsOnly(widUser);
        if (digits.length >= 10 && digits.length <= 15) phoneE164 = digits;
      } catch {}
    }

    const hasPaneSide = Boolean(document.querySelector('#pane-side'));
    const hasQr = Boolean(
      document.querySelector('canvas[aria-label*="Scan" i], [data-testid="qrcode"] canvas, [data-ref] canvas'),
    );
    const loggedIn = hasPaneSide && !hasQr;
    const connected = Boolean(loggedIn);

    return {
      connected,
      loggedIn,
      phoneE164,
      source: 'webview-storage',
    };
  })()`;
}

export function buildWebviewPollScript() {
  return `(() => {
    const normalizeText = (raw) =>
      String(raw || '')
        .normalize('NFKD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[\\u200e\\u200f\\u202a-\\u202e]/g, '')
        .replace(/[*_~\\x60"'.,!?;:()\\[\\]{}]/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim()
        .toLowerCase();

    const extractDigits = (raw) => String(raw || '').replace(/\\D/g, '');

    const hashTextSimple = (raw) => {
      const s = normalizeText(raw);
      let h = 2166136261;
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = (h * 16777619) >>> 0;
      }
      return s ? (h.toString(16) + ':' + s.length) : '';
    };

    const getState = () => {
      if (!window.__cgWaResponderState) {
        window.__cgWaResponderState = {
          baselineDone: false,
          seenSignatures: {},
          processedMsgIds: {},
          botSentTexts: [],
          sentSofiaHashes: [],
          lastMainChatKey: '',
          pendingOpenedTitle: '',
          pendingOpenedAt: 0,
        };
      }
      const st = window.__cgWaResponderState;
      const cutoff = Date.now() - 10 * 60 * 1000;
      st.botSentTexts = (st.botSentTexts || []).filter((entry) => entry && entry.ts >= cutoff);
      st.sentSofiaHashes = (Array.isArray(st.sentSofiaHashes) ? st.sentSofiaHashes : []).slice(-50);
      return st;
    };

    const st = getState();

    const preferredKeys = ['last-wid-md', 'last-wid', 'last-wid-deprecated'];
    let selfPhone = '';
    for (const key of preferredKeys) {
      let val = null;
      try { val = localStorage.getItem(key); } catch {}
      if (!val) continue;
      const m = String(val).match(/(\\d{10,15})(?::\\d+)?@(?:c\\.us|s\\.whatsapp\\.net)/i);
      if (m) { selfPhone = m[1]; break; }
    }
    if (!selfPhone) {
      try {
        const widUser = window?.Store?.Conn?.wid?.user || window?.Store?.User?.getMaybeMePnUser?.()?.user || '';
        const d = extractDigits(widUser);
        if (d.length >= 10 && d.length <= 15) selfPhone = d;
      } catch {}
    }

    const queryFirst = (root, candidates) => {
      if (!root) return null;
      for (const sel of candidates) {
        try {
          const el = root.querySelector(sel);
          if (el) return el;
        } catch {}
      }
      return null;
    };

    const paneSide = queryFirst(document, ['#pane-side', '[data-testid="chat-list"]', '[aria-label*="Lista de conversas" i]']);
    const hasQr = Boolean(
      document.querySelector('canvas[aria-label*="Scan" i], [data-testid="qrcode"] canvas, [data-ref] canvas'),
    );
    if (!paneSide || hasQr) {
      st.baselineDone = false;
      st.lastMainChatKey = '';
      st.degradedPollCount = 0;
      return {
        loggedIn: false,
        connected: false,
        phoneE164: selfPhone,
        action: 'waiting_login',
        selectorHealth: 'ok',
      };
    }

    const isBotSentMatch = (text) => {
      const norm = normalizeText(text);
      if (!norm) return false;
      const h = hashTextSimple(text);
      const nowTs = Date.now();
      const inHashQueue = (st.sentSofiaHashes || []).some(
        (entry) => entry && entry.hash === h && nowTs - Number(entry.ts || 0) <= 10 * 60 * 1000,
      );
      if (inHashQueue) return true;
      return (st.botSentTexts || []).some((entry) => {
        if (!entry || nowTs - Number(entry.ts || 0) > 10 * 60 * 1000) return false;
        if (entry.norm === norm) return true;
        if (norm.length >= 14 && entry.norm.includes(norm)) return true;
        if (entry.norm.length >= 14 && norm.includes(entry.norm)) return true;
        const headA = norm.slice(0, 32);
        const headB = String(entry.norm || '').slice(0, 32);
        return headA.length >= 18 && headA === headB;
      });
    };

    const extractRowTitle = (row) => {
      const explicit =
        row.querySelector('[data-testid="cell-frame-title"] span[title]') ||
        row.querySelector('[data-testid="cell-frame-title"] span[dir="auto"]') ||
        row.querySelector('[data-testid="cell-frame-title"]') ||
        row.querySelector('span[title][dir="auto"]') ||
        row.querySelector('span[title]');
      return String(explicit?.getAttribute('title') || explicit?.textContent || '').trim();
    };

    const parseRowInfo = (row) => {
      const title = extractRowTitle(row);
      const unreadEl = row.querySelector(
        '[data-testid="icon-unread-count"], [aria-label*="não lida" i], [aria-label*="nao lida" i], [aria-label*="unread" i]',
      );
      let unreadCount = 0;
      if (unreadEl) {
        const fromText = parseInt(String(unreadEl.textContent || '').replace(/\\D/g, ''), 10);
        const fromAria = parseInt(String(unreadEl.getAttribute('aria-label') || '').replace(/\\D/g, ''), 10);
        unreadCount = Number.isFinite(fromText) && fromText > 0
          ? fromText
          : Number.isFinite(fromAria) && fromAria > 0
            ? fromAria
            : 1;
      }
      const rowText = String(row.innerText || row.textContent || '').replace(/\\s+/g, ' ').trim();
      const signature = normalizeText(title) + '|' + unreadCount + '|' + normalizeText(rowText);
      return { title, unreadCount, signature };
    };

    const getSidebarRows = () => {
      const candidates = Array.from(paneSide.querySelectorAll('[role="row"], [role="listitem"]'));
      if (candidates.length > 0) return candidates;
      return Array.from(paneSide.querySelectorAll('[data-testid="cell-frame-container"]'));
    };

    const clickSidebarRow = (row) => {
      const clickable =
        row.querySelector('[data-testid="cell-frame-container"]') ||
        row.querySelector('[tabindex="-1"]') ||
        row.querySelector('[role="gridcell"]') ||
        row;
      try { clickable.scrollIntoView({ block: 'nearest' }); } catch {}
      const evtInit = { bubbles: true, cancelable: true, view: window };
      clickable.dispatchEvent(new MouseEvent('mousedown', evtInit));
      clickable.dispatchEvent(new MouseEvent('mouseup', evtInit));
      clickable.dispatchEvent(new MouseEvent('click', evtInit));
    };

    const shouldSkipChatTitle = (title) => {
      const norm = normalizeText(title);
      if (!norm) return true;
      if (norm === 'whatsapp' || norm === 'whatsapp business') return true;
      if (norm === 'arquivadas' || norm === 'archived') return true;
      return false;
    };

    const getMainHeaderTitle = (mainEl) => {
      const header = mainEl.querySelector('header');
      if (!header) return '';
      const directTestId = header.querySelector('[data-testid="conversation-info-header-chat-title"]');
      if (directTestId) {
        const nested = directTestId.querySelector('span[title], span[dir="auto"]');
        const txt = String(
          nested?.getAttribute('title') ||
            nested?.textContent ||
            directTestId.getAttribute('title') ||
            directTestId.textContent ||
            '',
        ).trim();
        if (txt) return txt;
      }
      const infoHeader = header.querySelector('[data-testid="conversation-info-header"]');
      if (infoHeader) {
        const infoSpan =
          infoHeader.querySelector('span[dir="auto"]:not([data-testid="selectable-text"])') ||
          infoHeader.querySelector('span[title]:not([data-testid="selectable-text"])');
        const txt = String(infoSpan?.getAttribute('title') || infoSpan?.textContent || '').trim();
        if (txt) return txt;
      }
      const span =
        header.querySelector('span[dir="auto"][title]') ||
        header.querySelector('span[dir="auto"]:not([data-testid="selectable-text"])') ||
        header.querySelector('span[title]');
      return String(span?.getAttribute('title') || span?.textContent || '').trim();
    };

    const isGroupOrChannelMain = (mainEl, sampleDataId) => {
      if (/@g\\.us|@newsletter|status@broadcast/i.test(sampleDataId || '')) return true;
      if (mainEl.querySelector('[data-id*="@g.us"], [data-id*="@newsletter"]')) return true;
      const header = mainEl.querySelector('header');
      if (!header) return false;
      if (header.querySelector('[data-icon="default-group"], [data-icon="newsletter-outline"]')) return true;
      const subtitleText = normalizeText(
        header.querySelector('[data-testid="selectable-text"]')?.textContent || '',
      );
      if (/dados do grupo|group info/.test(subtitleText)) return true;
      return false;
    };

    const collectMainMessages = (mainEl) => {
      let candidates = Array.from(mainEl.querySelectorAll('[data-testid^="conv-msg-"]'));
      if (candidates.length === 0) {
        candidates = Array.from(mainEl.querySelectorAll('div[data-id]'));
      }
      if (candidates.length > 0) {
        return candidates.filter(
          (el) => !el.parentElement || !el.parentElement.closest('[data-testid^="conv-msg-"], div[data-id]'),
        );
      }
      return Array.from(mainEl.querySelectorAll('.message-in, .message-out'));
    };

    const extractMessageText = (msgEl) => {
      const textEls = Array.from(
        msgEl.querySelectorAll('span.selectable-text, [data-testid="selectable-text"]'),
      );
      if (textEls.length > 0) {
        const parts = [];
        for (const el of textEls) {
          if (el.parentElement && el.parentElement.closest('span.selectable-text, [data-testid="selectable-text"]')) {
            continue;
          }
          const t = String(el.innerText || el.textContent || '').trim();
          if (t) parts.push(t);
        }
        const joined = parts.join('\\n').trim();
        if (joined) return joined;
      }
      const copyable = msgEl.querySelector('[data-pre-plain-text]');
      if (copyable) {
        return String(copyable.innerText || copyable.textContent || '').trim();
      }
      return '';
    };

    const buildMsgKey = (msgEl, chatTitle, idx, text) => {
      const dataId = msgEl.getAttribute('data-id');
      if (dataId) return dataId;
      const testId = msgEl.getAttribute('data-testid');
      if (testId && testId.startsWith('conv-msg-')) return testId;
      const pre = msgEl.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
      return chatTitle + '|' + idx + '|' + pre + '|' + text.slice(0, 80);
    };

    const classifyDirection = (msgEl, mainEl, chatTitle, isSelfChat, prePlain) => {
      const dataId = msgEl.getAttribute('data-id') || '';
      const hasOutClass =
        msgEl.classList.contains('message-out') ||
        Boolean(msgEl.closest('.message-out')) ||
        Boolean(msgEl.querySelector('.message-out'));
      const hasInClass =
        msgEl.classList.contains('message-in') ||
        Boolean(msgEl.closest('.message-in')) ||
        Boolean(msgEl.querySelector('.message-in'));

      if (/^false_/.test(dataId) || hasInClass) return { isIncoming: true, isOutgoing: false };
      if (/^true_/.test(dataId) || hasOutClass) return { isIncoming: false, isOutgoing: true };

      if (msgEl.querySelector('[data-testid="tail-in"], [data-icon="tail-in"]')) {
        return { isIncoming: true, isOutgoing: false };
      }
      if (
        msgEl.querySelector(
          '[data-testid="tail-out"], [data-icon="tail-out"], [data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-time"], [data-testid="msg-check"], [data-testid="msg-dblcheck"], [data-testid="msg-time"], [data-testid="msg-dblcheck-ack"]',
        )
      ) {
        return { isIncoming: false, isOutgoing: true };
      }

      if (isSelfChat) return { isIncoming: false, isOutgoing: true };

      // Em chats 1:1 sem tail-in/tail-out (bolhas consecutivas), verifica alinhamento do balão em #main e autor em data-pre-plain-text
      const bubble = msgEl.querySelector('[data-testid="msg-container"]') || msgEl;
      try {
        const mainRect = mainEl.getBoundingClientRect();
        const msgRect = bubble.getBoundingClientRect();
        if (mainRect.width > 200 && msgRect.width > 0 && msgRect.width < mainRect.width * 0.85) {
          const leftOffset = msgRect.left - mainRect.left;
          const rightOffset = mainRect.right - msgRect.right;
          if (leftOffset < mainRect.width * 0.16 && rightOffset > mainRect.width * 0.08) {
            return { isIncoming: true, isOutgoing: false };
          }
          if (rightOffset < mainRect.width * 0.12 && leftOffset > mainRect.width * 0.18) {
            return { isIncoming: false, isOutgoing: true };
          }
        }
      } catch {}

      const authorMatch = String(prePlain || '').match(/^\\[[^\\]]+\\]\\s*(.+?):\\s*$/);
      if (authorMatch && chatTitle) {
        const authorNorm = normalizeText(authorMatch[1]);
        const titleNorm = normalizeText(chatTitle);
        if (authorNorm && titleNorm && authorNorm === titleNorm) {
          return { isIncoming: true, isOutgoing: false };
        }
      }

      return { isIncoming: false, isOutgoing: false };
    };

    const seedMainMessages = (mainEl, chatTitle) => {
      const msgs = collectMainMessages(mainEl);
      for (let i = 0; i < msgs.length; i += 1) {
        const m = msgs[i];
        const txt = extractMessageText(m);
        const key = buildMsgKey(m, chatTitle, i, txt);
        if (key) st.processedMsgIds[key] = Date.now();
      }
      return msgs;
    };

    const rows = getSidebarRows();

    // 1) Baseline inicial: evita responder backlog antigo de dias/semanas anteriores
    if (!st.baselineDone) {
      for (const row of rows) {
        const info = parseRowInfo(row);
        if (info.signature) st.seenSignatures[info.signature] = true;
      }
      const mainInit = document.querySelector('#main');
      if (mainInit) {
        const initTitle = getMainHeaderTitle(mainInit);
        st.lastMainChatKey = normalizeText(initTitle);
        seedMainMessages(mainInit, initTitle);
      }
      st.baselineDone = true;
      return {
        loggedIn: true,
        connected: true,
        phoneE164: selfPhone,
        action: 'baseline',
      };
    }

    // 2) Verifica o chat aberto em #main
    const mainEl = document.querySelector('#main');
    if (mainEl) {
      const chatTitle = getMainHeaderTitle(mainEl);
      const chatKey = normalizeText(chatTitle);
      const msgs = collectMainMessages(mainEl);
      if (msgs.length > 0 && chatTitle && !shouldSkipChatTitle(chatTitle)) {
        const lastEl = msgs[msgs.length - 1];
        const dataId = lastEl.getAttribute('data-id') || '';

        if (!isGroupOrChannelMain(mainEl, dataId)) {
          const prePlain = lastEl.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
          const jidMatch = dataId.match(/(?:false|true)_(\\d{10,15})@(?:c\\.us|s\\.whatsapp\\.net)/i);
          const chatPhone = jidMatch ? jidMatch[1] : extractDigits(chatTitle).length >= 10 ? extractDigits(chatTitle) : '';
          const isSelfChat =
            Boolean(selfPhone && chatPhone && chatPhone === selfPhone) ||
            /^(?:meu n[uú]mero|you|voc[eê])\\b|\\(voc[eê]\\)|\\(you\\)/i.test(chatKey);

          const switchedChats = chatKey !== st.lastMainChatKey;
          const wasPendingUnreadSwitch =
            Boolean(st.pendingOpenedTitle) &&
            normalizeText(st.pendingOpenedTitle) === chatKey &&
            Date.now() - st.pendingOpenedAt < 10_000;

          if (switchedChats) {
            st.lastMainChatKey = chatKey;
            if (!wasPendingUnreadSwitch) {
              // Conversa aberta manualmente pelo usuário: marca histórico atual como já visto para não responder mensagens antigas
              seedMainMessages(mainEl, chatTitle);
              st.pendingOpenedTitle = '';
            }
          }

          if (wasPendingUnreadSwitch) {
            st.pendingOpenedTitle = '';
          }

          // Garante que mensagens anteriores ao último balão não disparem duplicadas depois
          for (let i = 0; i < msgs.length - 1; i += 1) {
            const olderKey = buildMsgKey(msgs[i], chatTitle, i, extractMessageText(msgs[i]));
            if (olderKey && !st.processedMsgIds[olderKey]) {
              st.processedMsgIds[olderKey] = Date.now();
            }
          }

          const { isIncoming, isOutgoing } = classifyDirection(lastEl, mainEl, chatTitle, isSelfChat, prePlain);
          const text = extractMessageText(lastEl);
          const msgKey = buildMsgKey(lastEl, chatTitle, msgs.length - 1, text);
          const textNormKey = chatKey + '::' + normalizeText(text);
          const recentlySeenNorm =
            st.processedTextHashes &&
            st.processedTextHashes[textNormKey] &&
            Date.now() - st.processedTextHashes[textNormKey] < 90_000;

          if (text && !st.processedMsgIds[msgKey] && !recentlySeenNorm) {
            st.processedMsgIds[msgKey] = Date.now();
            if (!st.processedTextHashes) st.processedTextHashes = {};
            st.processedTextHashes[textNormKey] = Date.now();

            // Human Takeover Detection: .message-out manual sem assinatura em sentSofiaHashes fora de self-chat
            if (isOutgoing && !isSelfChat && !isBotSentMatch(text)) {
              const customerKey = chatPhone || chatKey;
              return {
                loggedIn: true,
                connected: true,
                phoneE164: selfPhone,
                action: 'manual_human_takeover',
                customerKey,
                customerName: chatTitle,
                chatTitle,
                chatPhone: chatPhone || '',
                msgKey,
                snippet: text.slice(0, 140),
                ts: Date.now(),
              };
            }

            if (!isBotSentMatch(text) && (isIncoming || (isSelfChat && !isBotSentMatch(text))) && (!isOutgoing || isSelfChat)) {
              for (const row of rows) {
                const info = parseRowInfo(row);
                if (info.title && normalizeText(info.title) === chatKey && info.signature) {
                  st.seenSignatures[info.signature] = true;
                }
              }
              return {
                loggedIn: true,
                connected: true,
                phoneE164: selfPhone,
                action: 'incoming',
                chatTitle,
                chatPhone: chatPhone || (isSelfChat ? selfPhone : '') || '',
                isSelfChat,
                msgKey,
                prePlain,
                text,
              };
            }
          }
        }
      }
    }

    // 3) Procura conversas não lidas na barra lateral que mudaram após o baseline
    for (const row of rows) {
      const info = parseRowInfo(row);
      if (!info.title || info.unreadCount <= 0 || shouldSkipChatTitle(info.title)) continue;
      if (st.seenSignatures[info.signature]) continue;

      st.seenSignatures[info.signature] = true;
      st.pendingOpenedTitle = info.title;
      st.pendingOpenedAt = Date.now();
      clickSidebarRow(row);
      return {
        loggedIn: true,
        connected: true,
        phoneE164: selfPhone,
        action: 'opened_unread_chat',
        chatTitle: info.title,
      };
    }

    const composerProbe = document.querySelector('#main [contenteditable="true"], #main footer div[role="textbox"]');
    const isMissingSidebar = rows.length === 0;
    const isMissingComposer = Boolean(document.querySelector('#main') && !composerProbe);
    if (isMissingSidebar || isMissingComposer) {
      st.degradedPollCount = Number(st.degradedPollCount || 0) + 1;
    } else {
      st.degradedPollCount = 0;
    }
    const selectorHealth = st.degradedPollCount >= 3 ? 'degraded' : 'ok';
    const missingSelector =
      selectorHealth === 'degraded'
        ? isMissingSidebar
          ? 'sidebar_rows'
          : 'main_composer'
        : '';

    return {
      loggedIn: true,
      connected: true,
      phoneE164: selfPhone,
      action: 'idle',
      selectorHealth,
      ...(missingSelector ? { missingSelector } : {}),
    };
  })()`;
}

export function buildWebviewSendScript({
  chatTitle = '',
  text = '',
  typingDurationMs = 0,
  replyJobId = '',
  preferNativeHumanTyping = false,
}) {
  const safeChatTitle = JSON.stringify(String(chatTitle || ''));
  const safeText = JSON.stringify(String(text || ''));
  const safeTypingMs = Math.max(0, Math.min(11000, Number(typingDurationMs) || 0));
  const safeJobId = JSON.stringify(String(replyJobId || ''));
  const safeNative = Boolean(preferNativeHumanTyping);
  return `(async () => {
    const targetTitle = ${safeChatTitle};
    const replyText = ${safeText};
    const typingMs = ${safeTypingMs};
    const replyJobId = ${safeJobId};
    const preferNative = ${safeNative};
    if (!replyText.trim()) return { ok: false, error: 'Resposta vazia' };

    const normalizeText = (raw) =>
      String(raw || '')
        .normalize('NFKD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[\\u200e\\u200f\\u202a-\\u202e]/g, '')
        .replace(/[*_~\\x60"'.,!?;:()\\[\\]{}]/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim()
        .toLowerCase();

    const hashTextSimple = (raw) => {
      const s = normalizeText(raw);
      let h = 2166136261;
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = (h * 16777619) >>> 0;
      }
      return s ? (h.toString(16) + ':' + s.length) : '';
    };

    if (!window.__cgWaResponderState) {
      window.__cgWaResponderState = {
        baselineDone: true,
        seenSignatures: {},
        processedMsgIds: {},
        processedTextHashes: {},
        sentJobIds: {},
        botSentTexts: [],
        sentSofiaHashes: [],
        lastMainChatKey: '',
        pendingOpenedTitle: '',
        pendingOpenedAt: 0,
      };
    }
    const st = window.__cgWaResponderState;
    if (!st.sentJobIds) st.sentJobIds = {};
    if (!Array.isArray(st.sentSofiaHashes)) st.sentSofiaHashes = [];
    if (replyJobId && st.sentJobIds[replyJobId]) {
      return { ok: true, method: 'dedup_job_id' };
    }
    st.botSentTexts.push({ norm: normalizeText(replyText), raw: replyText, ts: Date.now() });
    st.sentSofiaHashes.push({ hash: hashTextSimple(replyText), norm: normalizeText(replyText), ts: Date.now() });
    if (st.sentSofiaHashes.length > 50) st.sentSofiaHashes = st.sentSofiaHashes.slice(-50);

    const mainEl = document.querySelector('#main');
    const getHeaderTitle = () => {
      if (!mainEl) return '';
      const header = mainEl.querySelector('header');
      if (!header) return '';
      const directTestId = header.querySelector('[data-testid="conversation-info-header-chat-title"]');
      if (directTestId) {
        const nested = directTestId.querySelector('span[title], span[dir="auto"]');
        const txt = String(
          nested?.getAttribute('title') ||
            nested?.textContent ||
            directTestId.getAttribute('title') ||
            directTestId.textContent ||
            '',
        ).trim();
        if (txt) return txt;
      }
      const span =
        header.querySelector('span[dir="auto"][title]') ||
        header.querySelector('span[dir="auto"]:not([data-testid="selectable-text"])') ||
        header.querySelector('span[title]');
      return String(span?.getAttribute('title') || span?.textContent || '').trim();
    };

    const currentTitle = getHeaderTitle();
    if (targetTitle && normalizeText(currentTitle) !== normalizeText(targetTitle)) {
      const paneSide = document.querySelector('#pane-side');
      if (paneSide) {
        const rows = Array.from(paneSide.querySelectorAll('[role="row"], [role="listitem"], [data-testid="cell-frame-container"]'));
        for (const row of rows) {
          const span =
            row.querySelector('[data-testid="cell-frame-title"] span[title]') ||
            row.querySelector('[data-testid="cell-frame-title"] span[dir="auto"]') ||
            row.querySelector('span[title][dir="auto"], span[title]');
          const title = String(span?.getAttribute('title') || span?.textContent || '').trim();
          if (title && normalizeText(title) === normalizeText(targetTitle)) {
            const clickable =
              row.querySelector('[data-testid="cell-frame-container"]') ||
              row.querySelector('[tabindex="-1"]') ||
              row.querySelector('[role="gridcell"]') ||
              row;
            const evtInit = { bubbles: true, cancelable: true, view: window };
            clickable.dispatchEvent(new MouseEvent('mousedown', evtInit));
            clickable.dispatchEvent(new MouseEvent('mouseup', evtInit));
            clickable.dispatchEvent(new MouseEvent('click', evtInit));
            return { ok: false, switchedChat: true };
          }
        }
      }
      return { ok: false, error: 'Conversa alvo não localizada no WhatsApp Web.' };
    }

    const footer = mainEl?.querySelector('footer') || document;
    const composer =
      footer.querySelector('div[contenteditable="true"][data-lexical-editor="true"]') ||
      footer.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      footer.querySelector('[role="textbox"][contenteditable="true"]') ||
      footer.querySelector('div[contenteditable="true"]');

    if (!composer) {
      return { ok: false, error: 'Caixa de mensagem do WhatsApp Web indisponível.' };
    }

    composer.focus();
    try {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(composer);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch {}

    // No Desktop Electron, sempre preferimos digitação humana nativa palavra por palavra (anti-flag + sem duplicação no Lexical)
    if (preferNative) {
      try {
        composer.click();
        composer.focus();
        const existingNorm = normalizeText(composer.innerText || composer.textContent || '');
        if (existingNorm.length > 0) {
          document.execCommand('selectAll');
          document.execCommand('delete');
        }
      } catch {}
      const remainingNorm = normalizeText(composer.innerText || composer.textContent || '');
      return {
        ok: false,
        needsNativeInsert: true,
        ...(remainingNorm.length > 0 ? { composerStillHasText: true } : {}),
      };
    }

    // Simula digitação real em blocos no WhatsApp Web (sinaliza "digitando..." para o cliente)
    let inserted = false;
    try {
      const words = replyText.split(/(\\s+)/).filter(Boolean);
      const chunkSize = Math.max(2, Math.ceil(words.length / Math.min(18, Math.max(4, Math.floor(typingMs / 350)))));
      const chunks = [];
      for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(''));
      }
      const stepDelay = chunks.length > 1 && typingMs > 0 ? Math.max(120, Math.floor(typingMs / chunks.length)) : 0;

      for (let cIdx = 0; cIdx < chunks.length; cIdx += 1) {
        const chunk = chunks[cIdx];
        const lines = chunk.split(/\\r?\\n/);
        let chunkOk = true;
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i]) {
            const okExec = document.execCommand('insertText', false, lines[i]);
            if (!okExec) chunkOk = false;
          }
          if (i < lines.length - 1) {
            composer.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: true, bubbles: true }),
            );
          }
        }
        if (!chunkOk && cIdx === 0) break;
        if (stepDelay > 0 && cIdx < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, stepDelay));
        }
      }
      inserted = normalizeText(composer.innerText || composer.textContent || '').length > 0;
    } catch {}

    let sendBtn = null;
    const findSendButton = () => {
      const byIcon =
        footer.querySelector('[data-icon="wds-ic-send-filled"]')?.closest('button, [role="button"]') ||
        footer.querySelector('[data-icon="send"]')?.closest('button, [role="button"]') ||
        footer.querySelector('[data-icon="wds-ic-send-filled"]') ||
        footer.querySelector('[data-icon="send"]');
      if (byIcon) return byIcon;
      return (
        footer.querySelector('button[aria-label*="Enviar" i], [role="button"][aria-label*="Enviar" i]') ||
        footer.querySelector('button[aria-label*="Send" i], [role="button"][aria-label*="Send" i]') ||
        footer.querySelector('[data-testid="compose-btn-send"]') ||
        footer.querySelector('button[data-testid="send"]')
      );
    };

    const getComposerNorm = () => normalizeText(composer.innerText || composer.textContent || '');
    const replyHeadNorm = normalizeText(replyText).slice(0, 24);

    if (inserted) {
      for (let i = 0; i < 7; i += 1) {
        await new Promise((r) => setTimeout(r, 90));
        sendBtn = findSendButton();
        if (sendBtn) break;
      }
      // Se execCommand inseriu DOM mas Lexical não exibiu botão enviar, só limpa se realmente esvaziar antes do paste
      if (!sendBtn) {
        try {
          composer.focus();
          document.execCommand('selectAll');
          document.execCommand('delete');
        } catch {}
        await new Promise((r) => setTimeout(r, 60));
        inserted = getComposerNorm().length > 0;
      }
    }

    // Fallback: paste sintético único SOMENTE se o composer estiver realmente vazio (evita duplicação 3x no Lexical!)
    if (!inserted && getComposerNorm().length === 0) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', replyText);
        const pasteEvt = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        composer.dispatchEvent(pasteEvt);
        await new Promise((r) => setTimeout(r, 90));
        inserted = getComposerNorm().length > 0;
      } catch {}
      if (inserted && !sendBtn) {
        for (let i = 0; i < 6; i += 1) {
          await new Promise((r) => setTimeout(r, 90));
          sendBtn = findSendButton();
          if (sendBtn) break;
        }
      }
    } else if (getComposerNorm().length > 0 && !sendBtn) {
      sendBtn = findSendButton();
      inserted = true;
    }

    if (inserted && sendBtn) {
      if (replyJobId) st.sentJobIds[replyJobId] = Date.now();
      sendBtn.click();
      await new Promise((r) => setTimeout(r, 150));
      const remaining = getComposerNorm().length;
      if (remaining > 0) {
        const retryBtn = findSendButton();
        if (retryBtn) retryBtn.click();
      }
      return { ok: true, method: 'send_button' };
    }

    const leftoverNorm = getComposerNorm();
    if (leftoverNorm.length > 0 && replyHeadNorm && leftoverNorm.includes(replyHeadNorm)) {
      return { ok: false, composerAlreadyHasText: true };
    }

    // Limpa antes de delegar para guest.insertText nativo no Electron
    try {
      composer.focus();
      document.execCommand('selectAll');
      document.execCommand('delete');
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
    if (getComposerNorm().length > 0) {
      return { ok: false, needsNativeInsert: true, composerStillHasText: true };
    }
    return { ok: false, needsNativeInsert: true };
  })()`;
}

export function buildWebviewClickSendScript(replyJobId = '') {
  const safeJobId = JSON.stringify(String(replyJobId || ''));
  return `(() => {
    const replyJobId = ${safeJobId};
    const st = (window.__cgWaResponderState = window.__cgWaResponderState || { sentJobIds: {} });
    if (!st.sentJobIds) st.sentJobIds = {};
    if (replyJobId && st.sentJobIds[replyJobId]) {
      return { ok: true, method: 'dedup_job_id' };
    }
    const mainEl = document.querySelector('#main');
    const footer = mainEl?.querySelector('footer') || document;
    const composer =
      footer.querySelector('div[contenteditable="true"][data-lexical-editor="true"]') ||
      footer.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      footer.querySelector('[role="textbox"][contenteditable="true"]') ||
      footer.querySelector('div[contenteditable="true"]');
    const sendBtn =
      footer.querySelector('[data-icon="wds-ic-send-filled"]')?.closest('button, [role="button"]') ||
      footer.querySelector('[data-icon="send"]')?.closest('button, [role="button"]') ||
      footer.querySelector('[data-icon="wds-ic-send-filled"]') ||
      footer.querySelector('[data-icon="send"]') ||
      footer.querySelector('button[aria-label*="Enviar" i], [role="button"][aria-label*="Enviar" i]') ||
      footer.querySelector('button[aria-label*="Send" i], [role="button"][aria-label*="Send" i]') ||
      footer.querySelector('[data-testid="compose-btn-send"]') ||
      footer.querySelector('button[data-testid="send"]');
    if (sendBtn) {
      if (replyJobId) st.sentJobIds[replyJobId] = Date.now();
      sendBtn.click();
      return { ok: true, method: 'send_button' };
    }
    const hasText = String(composer?.innerText || composer?.textContent || '').trim().length > 0;
    return { ok: false, hasComposerText: hasText, error: 'Botão enviar não encontrado' };
  })()`;
}

export function buildWebviewFocusComposerScript() {
  return `(() => {
    const mainEl = document.querySelector('#main');
    const footer = mainEl?.querySelector('footer') || document;
    const composer =
      footer.querySelector('div[contenteditable="true"][data-lexical-editor="true"]') ||
      footer.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      footer.querySelector('[role="textbox"][contenteditable="true"]') ||
      footer.querySelector('div[contenteditable="true"]');
    if (!composer) return { ok: false };
    composer.click();
    composer.focus();
    return { ok: true };
  })()`;
}

export function buildWebviewCheckMediaPreviewScript() {
  return `(() => {
    const captionHost =
      document.querySelector('[data-testid="media-caption-input-container"]') ||
      document.querySelector('[data-testid="media-editor-drawer"]') ||
      document.querySelector('[data-animate-media-viewer]');
    const captionInput =
      captionHost?.querySelector('div[contenteditable="true"][data-lexical-editor="true"], [role="textbox"][contenteditable="true"], div[contenteditable="true"]') ||
      null;
    const allSendIcons = Array.from(
      document.querySelectorAll('[data-icon="wds-ic-send-filled"], [data-icon="send"], [data-testid="send"], button[aria-label*="Enviar" i], [role="button"][aria-label*="Enviar" i], button[aria-label*="Send" i], [role="button"][aria-label*="Send" i]'),
    );
    const modalSendBtn = allSendIcons
      .map((el) => el.closest('button, [role="button"]') || el)
      .find((btn) => {
        if (!btn) return false;
        const r = btn.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return Boolean(captionHost) || !btn.closest('#main footer');
      });
    const isOpen = Boolean(captionHost || modalSendBtn);
    if (captionInput) {
      try {
        captionInput.click();
        captionInput.focus();
      } catch {}
    }
    return {
      isOpen,
      hasCaptionInput: Boolean(captionInput),
      hasSendButton: Boolean(modalSendBtn),
    };
  })()`;
}

export function buildWebviewClickMediaSendScript() {
  return `(() => {
    const captionHost =
      document.querySelector('[data-testid="media-caption-input-container"]')?.closest('[role="dialog"], div') ||
      document.querySelector('[data-testid="media-editor-drawer"]') ||
      document.querySelector('[data-animate-media-viewer]');
    const allSendCandidates = Array.from(
      document.querySelectorAll('[data-icon="wds-ic-send-filled"], [data-icon="send"], [data-testid="send"], button[aria-label*="Enviar" i], [role="button"][aria-label*="Enviar" i], button[aria-label*="Send" i], [role="button"][aria-label*="Send" i]'),
    );
    const modalBtn = allSendCandidates
      .map((el) => el.closest('button, [role="button"]') || el)
      .find((btn) => {
        if (!btn) return false;
        const r = btn.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return (captionHost && captionHost.contains(btn)) || !btn.closest('#main footer');
      }) || allSendCandidates.map((el) => el.closest('button, [role="button"]') || el).pop();

    if (modalBtn) {
      modalBtn.click();
      return { ok: true, method: 'media_send_button' };
    }
    return { ok: false, error: 'Botão enviar da prévia de mídia não encontrado' };
  })()`;
}
