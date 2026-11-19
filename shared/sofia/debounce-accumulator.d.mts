export interface BurstDebounceItem<TMeta = unknown> {
  texts: string[];
  firstSeenAt: number;
  meta: TMeta;
  timer: ReturnType<typeof setTimeout>;
}

export function createBurstDebounceAccumulator<TMeta = unknown>(options: {
  debounceMs?: number;
  maxWaitMs?: number;
  onFlush: (customerKey: string, mergedText: string, meta: TMeta) => void | Promise<void>;
}): {
  pendingBurstBuffers: Map<string, BurstDebounceItem<TMeta>>;
  enqueue: (customerKey: string, text: string, meta: TMeta) => void;
  cancel: (customerKey: string) => void;
  flushKey: (customerKey: string) => void;
  clearAll: () => void;
};
