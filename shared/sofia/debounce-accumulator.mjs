/**
 * Pure Message Burst Debounce Accumulator (C61 / BUG-F05-04):
 * - Waits `debounceMs` (default 4500ms) after the latest message from the same `customerKey`.
 * - Enforces a hard `maxWaitMs` (default 10000ms) ceiling since `firstSeenAt` so continuous bursts still reply.
 * - Concatenates messages with `\n` and triggers 1 single `onFlush`.
 */
export function createBurstDebounceAccumulator({
  debounceMs = 4500,
  maxWaitMs = 10000,
  onFlush,
}) {
  const pendingBurstBuffers = new Map();

  const flushKey = (customerKey) => {
    const entry = pendingBurstBuffers.get(customerKey);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingBurstBuffers.delete(customerKey);
    const mergedText = entry.texts.filter(Boolean).join('\n').trim();
    if (mergedText) {
      void onFlush(customerKey, mergedText, entry.meta);
    }
  };

  const enqueue = (customerKey, text, meta) => {
    const cleanText = String(text || '').trim();
    if (!cleanText || !customerKey) return;
    const now = Date.now();
    const existing = pendingBurstBuffers.get(customerKey);
    if (existing) {
      clearTimeout(existing.timer);
      existing.texts.push(cleanText);
      existing.meta = meta;
      const elapsed = now - existing.firstSeenAt;
      const remainingCeiling = Math.max(0, maxWaitMs - elapsed);
      const nextDelay = Math.min(debounceMs, remainingCeiling);
      if (nextDelay <= 0) {
        flushKey(customerKey);
        return;
      }
      existing.timer = setTimeout(() => flushKey(customerKey), nextDelay);
      return;
    }

    const firstDelay = Math.min(debounceMs, maxWaitMs);
    const timer = setTimeout(() => flushKey(customerKey), firstDelay);
    pendingBurstBuffers.set(customerKey, {
      texts: [cleanText],
      firstSeenAt: now,
      meta,
      timer,
    });
  };

  const cancel = (customerKey) => {
    const entry = pendingBurstBuffers.get(customerKey);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingBurstBuffers.delete(customerKey);
  };

  const clearAll = () => {
    for (const entry of pendingBurstBuffers.values()) {
      clearTimeout(entry.timer);
    }
    pendingBurstBuffers.clear();
  };

  return {
    pendingBurstBuffers,
    enqueue,
    cancel,
    flushKey,
    clearAll,
  };
}
