/**
 * Map em memória com teto máximo (evicção LRU simples) e TTL oportunista
 * para impedir vazamento de RAM em processos Node de longa duração / Cloud Run.
 */
export class BoundedTtlMap {
  constructor({ maxEntries = 2000, defaultTtlMs = 3600_000 } = {}) {
    this.maxEntries = Math.max(1, Number(maxEntries) || 2000);
    this.defaultTtlMs = Math.max(1, Number(defaultTtlMs) || 3600_000);
    this._map = new Map();
    this._opsSinceSweep = 0;
  }

  get size() {
    return this._map.size;
  }

  _sweepExpired(limit = 40) {
    const now = Date.now();
    let checked = 0;
    for (const [k, wrapper] of this._map.entries()) {
      if (wrapper.expiresAt <= now) {
        this._map.delete(k);
      }
      checked += 1;
      if (checked >= limit) break;
    }
  }

  has(key) {
    const wrapper = this._map.get(key);
    if (!wrapper) return false;
    if (wrapper.expiresAt <= Date.now()) {
      this._map.delete(key);
      return false;
    }
    return true;
  }

  get(key) {
    const wrapper = this._map.get(key);
    if (!wrapper) return undefined;
    if (wrapper.expiresAt <= Date.now()) {
      this._map.delete(key);
      return undefined;
    }
    // Promote on access so eviction behaves as true LRU
    this._map.delete(key);
    this._map.set(key, wrapper);
    return wrapper.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this._opsSinceSweep += 1;
    if (this._opsSinceSweep >= 150) {
      this._opsSinceSweep = 0;
      this._sweepExpired(60);
    }
    if (this._map.has(key)) {
      this._map.delete(key);
    }
    while (this._map.size >= this.maxEntries) {
      const oldest = this._map.keys().next().value;
      if (oldest === undefined) break;
      this._map.delete(oldest);
    }
    this._map.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, Number(ttlMs) || this.defaultTtlMs),
    });
    return this;
  }

  delete(key) {
    return this._map.delete(key);
  }

  clear() {
    this._map.clear();
  }
}
