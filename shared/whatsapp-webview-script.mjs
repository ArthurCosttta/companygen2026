/**
 * Scripts puros injetados no <webview> oficial do WhatsApp Web (https://web.whatsapp.com/)
 * pelo processo principal do Electron (`desktop/main.mjs`) e servidos via Cloud Run
 * (`GET /api/desktop/webview-scripts`, assinados com Ed25519).
 *
 * FILA 13:
 * - Coleta em lote de rajadas (até 12 balões consecutivos por turno, sem descartar anteriores)
 * - Detecção e extração segura de áudio PTT (<=4MB) com play mutado + pause imediato
 * - Proteção total de histórico antigo ao abrir chat manualmente (`seedMainMessages`)
 */

export const WEBVIEW_SCRIPTS_VERSION = '2026.11.19-fila13';

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
          processedTextHashes: {},
          botSentTexts: [],
          sentSofiaHashes: [],
          lastMainChatKey: '',
          pendingOpenedTitle: '',
          pendingOpenedAt: 0,
          pendingUnreadCount: 0,
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

    const detectAudioBubble = (msgEl) => {
      const audioEl = msgEl.querySelector('audio');
      const playMarker = msgEl.querySelector(
        '[data-icon="audio-play"], [data-icon="ptt-play"], [data-testid="audio-play"], [aria-label*="Mensagem de voz" i], [aria-label*="Voice message" i], [aria-label*="Reproduzir mensagem de voz" i]',
      );
      const isAudio = Boolean(audioEl || playMarker);
      if (!isAudio) return { isAudio: false, durationHint: '', durationSeconds: 0 };
      const rawBubbleText = String(msgEl.innerText || msgEl.textContent || '');
      const durMatch = rawBubbleText.match(/\\b(\\d{1,2}):(\\d{2})\\b/);
      let durationHint = '';
      let durationSeconds = 0;
      if (durMatch) {
        durationHint = durMatch[0];
        durationSeconds = parseInt(durMatch[1], 10) * 60 + parseInt(durMatch[2], 10);
      } else if (audioEl && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        durationSeconds = Math.round(audioEl.duration);
        durationHint = '0:' + String(durationSeconds).padStart(2, '0');
      }
      return { isAudio: true, durationHint, durationSeconds };
    };

    const detectImageBubble = (msgEl) => {
      const imgs = Array.from(msgEl.querySelectorAll('img'));
      for (const img of imgs) {
        const src = String(img.currentSrc || img.getAttribute('src') || img.src || '').trim();
        if (!src || (!src.startsWith('blob:') && !src.startsWith('data:image/'))) continue;
        if (img.classList.contains('emoji') || img.hasAttribute('data-plain-text')) continue;
        if (img.closest('[data-testid="quoted-message"], [data-testid="avatar"], [data-testid="author"], header')) {
          continue;
        }
        const natW = Number(img.naturalWidth || 0);
        const natH = Number(img.naturalHeight || 0);
        const rect = img.getBoundingClientRect();
        const dispW = Math.max(Number(rect.width || 0), Number(img.width || 0));
        const dispH = Math.max(Number(rect.height || 0), Number(img.height || 0));
        if (natW > 0 && natW < 48) continue;
        if (natH > 0 && natH < 48) continue;
        const maxW = Math.max(natW, dispW);
        const maxH = Math.max(natH, dispH);
        if (maxW < 48 || maxH < 48) continue;
        return { isImage: true, imgSrc: src, width: maxW, height: maxH };
      }
      return { isImage: false, imgSrc: '', width: 0, height: 0 };
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

    const buildMsgKey = (msgEl, chatTitle, idx, textOrTag) => {
      const dataId = msgEl.getAttribute('data-id');
      if (dataId) return dataId;
      const testId = msgEl.getAttribute('data-testid');
      if (testId && testId.startsWith('conv-msg-')) return testId;
      const pre = msgEl.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
      return chatTitle + '|' + idx + '|' + pre + '|' + String(textOrTag || '').slice(0, 80);
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
        const audio = detectAudioBubble(m);
        const img = detectImageBubble(m);
        const key = buildMsgKey(
          m,
          chatTitle,
          i,
          txt || (audio.isAudio ? 'audio:' + audio.durationHint : img.isImage ? 'image' : ''),
        );
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

    // 2) Verifica o chat aberto em #main com coleta completa de rajada (até 12 balões) + áudio
    const mainEl = document.querySelector('#main');
    if (mainEl) {
      const chatTitle = getMainHeaderTitle(mainEl);
      const chatKey = normalizeText(chatTitle);
      const msgs = collectMainMessages(mainEl);
      if (msgs.length > 0 && chatTitle && !shouldSkipChatTitle(chatTitle)) {
        const lastEl = msgs[msgs.length - 1];
        const lastDataId = lastEl.getAttribute('data-id') || '';

        if (!isGroupOrChannelMain(mainEl, lastDataId)) {
          const jidMatch = lastDataId.match(/(?:false|true)_(\\d{10,15})@(?:c\\.us|s\\.whatsapp\\.net)/i);
          const chatPhone = jidMatch ? jidMatch[1] : extractDigits(chatTitle).length >= 10 ? extractDigits(chatTitle) : '';
          const isSelfChat =
            Boolean(selfPhone && chatPhone && chatPhone === selfPhone) ||
            /^(?:meu n[uú]mero|you|voc[eê])\\b|\\(voc[eê]\\)|\\(you\\)/i.test(chatKey);

          const switchedChats = chatKey !== st.lastMainChatKey;
          const wasPendingUnreadSwitch =
            Boolean(st.pendingOpenedTitle) &&
            normalizeText(st.pendingOpenedTitle) === chatKey &&
            Date.now() - st.pendingOpenedAt < 10_000;
          const unreadCap = wasPendingUnreadSwitch && Number(st.pendingUnreadCount) > 0
            ? Math.min(12, Math.max(1, Number(st.pendingUnreadCount)))
            : 12;

          if (switchedChats) {
            st.lastMainChatKey = chatKey;
            if (!wasPendingUnreadSwitch) {
              // Conversa aberta manualmente pelo lojista: absorve histórico antigo,
              // mas em self-chat de teste ("Meu numero:") preserva a última bolha recente se ainda não foi respondida pelo bot
              const allMsgs = collectMainMessages(mainEl);
              const lastBubble = allMsgs[allMsgs.length - 1];
              const lastText = lastBubble ? extractMessageText(lastBubble) : '';
              const preserveTailSelfTest =
                Boolean(isSelfChat && lastBubble && lastText && !isBotSentMatch(lastText));
              const limitCount = preserveTailSelfTest ? Math.max(0, allMsgs.length - 1) : allMsgs.length;
              for (let si = 0; si < limitCount; si += 1) {
                const m = allMsgs[si];
                const txt = extractMessageText(m);
                const audio = detectAudioBubble(m);
                const img = detectImageBubble(m);
                const key = buildMsgKey(
                  m,
                  chatTitle,
                  si,
                  txt || (audio.isAudio ? 'audio:' + audio.durationHint : img.isImage ? 'image' : ''),
                );
                if (key) st.processedMsgIds[key] = Date.now();
              }
              st.pendingOpenedTitle = '';
              st.pendingUnreadCount = 0;
            }
          }

          if (wasPendingUnreadSwitch) {
            st.pendingOpenedTitle = '';
            st.pendingUnreadCount = 0;
          }

          // Verifica primeiro Human Takeover na última mensagem
          const lastPrePlain = lastEl.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
          const lastDir = classifyDirection(lastEl, mainEl, chatTitle, isSelfChat, lastPrePlain);
          const lastTxt = extractMessageText(lastEl);
          const lastAudio = detectAudioBubble(lastEl);
          const lastImage = detectImageBubble(lastEl);
          const lastKey = buildMsgKey(
            lastEl,
            chatTitle,
            msgs.length - 1,
            lastTxt || (lastAudio.isAudio ? 'audio:' + lastAudio.durationHint : lastImage.isImage ? 'image' : ''),
          );

          if (lastDir.isOutgoing && !isSelfChat && lastTxt && !st.processedMsgIds[lastKey] && !isBotSentMatch(lastTxt)) {
            st.processedMsgIds[lastKey] = Date.now();
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
              msgKey: lastKey,
              snippet: lastTxt.slice(0, 140),
              ts: Date.now(),
            };
          }

          // Caminha de trás para frente coletando TODOS os balões novos consecutivos da rajada (texto + áudio + imagem)
          const batchReversed = [];
          const lowerBound = Math.max(0, msgs.length - 25);
          for (let i = msgs.length - 1; i >= lowerBound; i -= 1) {
            const el = msgs[i];
            const prePlain = el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
            const txt = extractMessageText(el);
            const audio = detectAudioBubble(el);
            const image = detectImageBubble(el);
            const itemKey = buildMsgKey(
              el,
              chatTitle,
              i,
              txt || (audio.isAudio ? 'audio:' + audio.durationHint : image.isImage ? 'image' : ''),
            );

            if (st.processedMsgIds[itemKey]) {
              break;
            }

            const dir = classifyDirection(el, mainEl, chatTitle, isSelfChat, prePlain);
            if (dir.isOutgoing && !isSelfChat) {
              // Chegamos na última resposta da loja/Sofia: encerra a rajada do cliente
              break;
            }
            if (txt && isBotSentMatch(txt)) {
              st.processedMsgIds[itemKey] = Date.now();
              break;
            }

            const eligibleIncoming = (dir.isIncoming || isSelfChat) && (!dir.isOutgoing || isSelfChat);
            if (!eligibleIncoming) continue;

            if (audio.isAudio || image.isImage || txt) {
              const kind = audio.isAudio && !txt
                ? 'audio'
                : image.isImage && txt
                  ? 'text_image'
                  : image.isImage
                    ? 'image'
                    : 'text';
              batchReversed.push({
                kind,
                hasAudio: audio.isAudio,
                hasImage: image.isImage,
                imgMsgKey: image.isImage ? itemKey : '',
                durationHint: audio.durationHint,
                durationSeconds: audio.durationSeconds,
                text: txt,
                msgKey: itemKey,
                prePlain,
              });
            }

            if (batchReversed.length >= unreadCap) {
              break;
            }
          }

          if (batchReversed.length > 0) {
            const batch = batchReversed.reverse();
            const nowTs = Date.now();
            if (!st.processedTextHashes) st.processedTextHashes = {};
            const freshItems = [];
            for (const item of batch) {
              st.processedMsgIds[item.msgKey] = nowTs;
              if (item.kind === 'text' && item.text && !item.hasAudio && !item.hasImage) {
                const textNormKey = chatKey + '::' + normalizeText(item.text);
                const recentlySeen =
                  st.processedTextHashes[textNormKey] &&
                  nowTs - st.processedTextHashes[textNormKey] < 90_000 &&
                  batch.length === 1;
                if (recentlySeen) continue;
                st.processedTextHashes[textNormKey] = nowTs;
              }
              freshItems.push(item);
            }

            if (freshItems.length > 0) {
              for (const row of rows) {
                const info = parseRowInfo(row);
                if (info.title && normalizeText(info.title) === chatKey && info.signature) {
                  st.seenSignatures[info.signature] = true;
                }
              }
              const mergedText = freshItems.map((it) => it.text).filter(Boolean).join('\\n');
              const tailItem = freshItems[freshItems.length - 1];
              const firstImageItem = freshItems.find((it) => it.hasImage && it.imgMsgKey);
              return {
                loggedIn: true,
                connected: true,
                phoneE164: selfPhone,
                action: 'incoming',
                chatTitle,
                chatPhone: chatPhone || (isSelfChat ? selfPhone : '') || '',
                isSelfChat,
                msgKey: tailItem.msgKey,
                prePlain: tailItem.prePlain || '',
                text: mergedText,
                items: freshItems,
                hasAudio: freshItems.some((it) => it.kind === 'audio' || it.hasAudio),
                hasImage: freshItems.some((it) => it.kind === 'image' || it.kind === 'text_image' || it.hasImage),
                imgMsgKey: firstImageItem ? firstImageItem.imgMsgKey : '',
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
      st.pendingUnreadCount = info.unreadCount;
      clickSidebarRow(row);
      return {
        loggedIn: true,
        connected: true,
        phoneE164: selfPhone,
        action: 'opened_unread_chat',
        chatTitle: info.title,
        unreadCount: info.unreadCount,
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

export function buildWebviewAudioExtractScript({ msgKey = '' } = {}) {
  const safeMsgKey = JSON.stringify(String(msgKey || ''));
  return `(async () => {
    const targetMsgKey = ${safeMsgKey};
    const MAX_BYTES = 4 * 1024 * 1024;
    const mainEl = document.querySelector('#main');
    if (!mainEl) return { ok: false, reason: 'main_not_found' };

    const findBubble = () => {
      if (targetMsgKey) {
        const all = Array.from(mainEl.querySelectorAll('div[data-id], [data-testid^="conv-msg-"]'));
        const exact = all.find(
          (el) => el.getAttribute('data-id') === targetMsgKey || el.getAttribute('data-testid') === targetMsgKey,
        );
        if (exact) return exact;
      }
      const audioNodes = Array.from(
        mainEl.querySelectorAll('audio, [data-icon="audio-play"], [data-icon="ptt-play"], [data-testid="audio-play"]'),
      );
      const lastNode = audioNodes[audioNodes.length - 1];
      return lastNode ? lastNode.closest('div[data-id], [data-testid^="conv-msg-"], .message-in') || lastNode.parentElement : null;
    };

    const bubble = findBubble();
    if (!bubble) return { ok: false, reason: 'audio_bubble_not_found' };

    const getAudioEl = () =>
      bubble.querySelector('audio') ||
      Array.from(document.querySelectorAll('audio')).find((a) => a.src && a.src.startsWith('blob:')) ||
      null;

    const muteAll = (muted) => {
      try {
        for (const a of Array.from(document.querySelectorAll('audio'))) {
          a.muted = muted;
          if (muted) a.volume = 0;
        }
      } catch {}
    };

    let audioEl = getAudioEl();
    let clickedPlay = false;

    if (!audioEl || !audioEl.src) {
      muteAll(true);
      const playBtn =
        bubble.querySelector('[data-icon="audio-play"], [data-icon="ptt-play"], [data-testid="audio-play"]')?.closest('button, [role="button"]') ||
        bubble.querySelector('button[aria-label*="Reproduzir" i], button[aria-label*="Play" i]') ||
        bubble.querySelector('[data-icon="audio-play"], [data-icon="ptt-play"]');
      if (playBtn) {
        try {
          playBtn.click();
          clickedPlay = true;
        } catch {}
      }
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        muteAll(true);
        audioEl = getAudioEl();
        if (audioEl && audioEl.src && (audioEl.src.startsWith('blob:') || audioEl.src.startsWith('https:'))) {
          break;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    if (audioEl) {
      try { audioEl.pause(); } catch {}
    }
    if (clickedPlay) {
      const pauseBtn =
        bubble.querySelector('[data-icon="audio-pause"], [data-icon="ptt-pause"], [data-testid="audio-pause"]')?.closest('button, [role="button"]') ||
        bubble.querySelector('button[aria-label*="Pausar" i], button[aria-label*="Pause" i]');
      if (pauseBtn) {
        try { pauseBtn.click(); } catch {}
      }
    }
    muteAll(true);

    if (!audioEl || !audioEl.src) {
      return { ok: false, reason: 'audio_src_unavailable' };
    }

    try {
      const res = await fetch(audioEl.src);
      if (!res.ok) return { ok: false, reason: 'audio_fetch_failed' };
      const blob = await res.blob();
      if (!blob || blob.size < 16) return { ok: false, reason: 'empty_audio_blob' };
      if (blob.size > MAX_BYTES) {
        return { ok: false, reason: 'audio_too_large', sizeBytes: blob.size };
      }
      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < buf.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
      }
      const audioBase64 = btoa(binary);
      const durationSeconds = Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? Math.round(audioEl.duration) : 0;
      return {
        ok: true,
        audioBase64,
        mimeType: blob.type || 'audio/ogg',
        sizeBytes: blob.size,
        durationSeconds,
      };
    } catch (err) {
      return { ok: false, reason: err?.message || 'audio_extract_error' };
    }
  })()`;
}

export function buildWebviewImageExtractScript({ msgKey = '' } = {}) {
  const safeMsgKey = JSON.stringify(String(msgKey || ''));
  return `(async () => {
    const targetMsgKey = ${safeMsgKey};
    const MAX_DIM = 960;
    const MAX_BYTES = Math.floor(1.2 * 1024 * 1024);
    const mainEl = document.querySelector('#main');
    if (!mainEl) return { ok: false, reason: 'main_not_found' };

    const isPhotoImg = (img) => {
      if (!img) return false;
      const src = String(img.currentSrc || img.getAttribute('src') || img.src || '').trim();
      if (!src || (!src.startsWith('blob:') && !src.startsWith('data:image/'))) return false;
      if (img.classList.contains('emoji') || img.hasAttribute('data-plain-text')) return false;
      if (img.closest('[data-testid="quoted-message"], [data-testid="avatar"], [data-testid="author"], header')) {
        return false;
      }
      const natW = Number(img.naturalWidth || 0);
      const natH = Number(img.naturalHeight || 0);
      const rect = img.getBoundingClientRect();
      const dispW = Math.max(Number(rect.width || 0), Number(img.width || 0));
      const dispH = Math.max(Number(rect.height || 0), Number(img.height || 0));
      if (natW > 0 && natW < 48) return false;
      if (natH > 0 && natH < 48) return false;
      return Math.max(natW, dispW) >= 48 && Math.max(natH, dispH) >= 48;
    };

    const findBubble = () => {
      const all = Array.from(mainEl.querySelectorAll('div[data-id], [data-testid^="conv-msg-"], .message-in'));
      if (targetMsgKey) {
        const exact = all.find(
          (el) => el.getAttribute('data-id') === targetMsgKey || el.getAttribute('data-testid') === targetMsgKey,
        );
        if (exact) return exact;
        const parts = targetMsgKey.split('|');
        const preHint = parts.length >= 3 ? parts[2] : '';
        if (preHint) {
          const byPre = all.find(
            (el) => el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') === preHint,
          );
          if (byPre) return byPre;
        }
      }
      const imgs = Array.from(mainEl.querySelectorAll('img')).filter(isPhotoImg);
      const lastImg = imgs[imgs.length - 1];
      return lastImg ? lastImg.closest('div[data-id], [data-testid^="conv-msg-"], .message-in') || lastImg.parentElement : null;
    };

    const bubble = findBubble();
    if (!bubble) return { ok: false, reason: 'image_bubble_not_found' };

    const imgEl = Array.from(bubble.querySelectorAll('img')).find(isPhotoImg) || null;
    if (!imgEl) return { ok: false, reason: 'image_element_not_found' };

    if (!imgEl.complete || !imgEl.naturalWidth) {
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline && (!imgEl.complete || !imgEl.naturalWidth)) {
        await new Promise((r) => setTimeout(r, 80));
      }
    }

    const encodeSourceToJpeg = (source, srcW, srcH, maxDim) => {
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      const targetW = Math.max(1, Math.round(srcW * scale));
      const targetH = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(source, 0, 0, targetW, targetH);
      for (const quality of [0.84, 0.72, 0.58, 0.45]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const commaIdx = dataUrl.indexOf(',');
        const b64Len = commaIdx >= 0 ? dataUrl.length - commaIdx - 1 : dataUrl.length;
        const approxBytes = Math.floor((b64Len * 3) / 4);
        if (approxBytes <= MAX_BYTES) {
          return { dataUrl, width: targetW, height: targetH, sizeBytes: approxBytes };
        }
      }
      return null;
    };

    try {
      let srcW = Number(imgEl.naturalWidth || imgEl.width || 0);
      let srcH = Number(imgEl.naturalHeight || imgEl.height || 0);
      if (srcW < 48 || srcH < 48) {
        return { ok: false, reason: 'image_too_small' };
      }
      let encoded = null;
      try {
        encoded = encodeSourceToJpeg(imgEl, srcW, srcH, MAX_DIM);
        if (!encoded) encoded = encodeSourceToJpeg(imgEl, srcW, srcH, 640);
      } catch {
        const srcUrl = String(imgEl.currentSrc || imgEl.src || '').trim();
        if (srcUrl) {
          const res = await fetch(srcUrl);
          if (res.ok) {
            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob);
            srcW = bitmap.width || srcW;
            srcH = bitmap.height || srcH;
            encoded = encodeSourceToJpeg(bitmap, srcW, srcH, MAX_DIM) || encodeSourceToJpeg(bitmap, srcW, srcH, 640);
            try { bitmap.close(); } catch {}
          }
        }
      }
      if (!encoded || !encoded.dataUrl || encoded.sizeBytes > MAX_BYTES) {
        return { ok: false, reason: 'image_encode_or_size_failed' };
      }
      return {
        ok: true,
        imageBase64: encoded.dataUrl,
        mimeType: 'image/jpeg',
        width: encoded.width,
        height: encoded.height,
        sizeBytes: encoded.sizeBytes,
      };
    } catch (err) {
      return { ok: false, reason: err?.message || 'image_extract_error' };
    }
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
        pendingUnreadCount: 0,
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

export function getWebviewScriptsBundle() {
  return {
    version: WEBVIEW_SCRIPTS_VERSION,
    scripts: {
      identityScript: buildWebviewIdentityScript(),
      pollScript: buildWebviewPollScript(),
      focusComposerScript: buildWebviewFocusComposerScript(),
      checkMediaPreviewScript: buildWebviewCheckMediaPreviewScript(),
      clickMediaSendScript: buildWebviewClickMediaSendScript(),
    },
  };
}
