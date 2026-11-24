/**
 * Low-spec / weak store PC performance mode ("Modo Desempenho (PC Leve)").
 * Automatically detects low RAM / low core count / Windows 7/32-bit environments
 * unless the user explicitly overrides it in Settings.
 */

export type LowSpecPreference = 'auto' | 'on' | 'off';

const LOW_SPEC_STORAGE_KEY = 'cg_low_spec_mode';
const LOW_SPEC_CLASS = 'cg-low-spec';

export function readLowSpecPreference(): LowSpecPreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(LOW_SPEC_STORAGE_KEY);
    if (raw === 'on' || raw === 'off' || raw === 'auto') return raw;
  } catch {
    // Ignore storage read restrictions
  }
  return 'auto';
}

export function detectHardwareLowSpec(): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const memGb = Number(nav.deviceMemory || 0);
    const cores = Number(nav.hardwareConcurrency || 0);
    const ua = String(nav.userAgent || '');
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isElectronSoftware = /Electron/i.test(ua);
    const isLegacyWinOr32 = /Windows NT (6\.[0-3]|5\.)|WOW64|Win32/i.test(ua);
    if (prefersReducedMotion || isLegacyWinOr32 || isElectronSoftware) return true;
    if (memGb > 0 && memGb <= 8) return true;
    if (cores > 0 && cores <= 6) return true;
    return false;
  } catch {
    return false;
  }
}

export function isLowSpecEnabled(): boolean {
  const pref = readLowSpecPreference();
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return detectHardwareLowSpec();
}

export function syncLowSpecClassOnHtml(): boolean {
  const enabled = isLowSpecEnabled();
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle(LOW_SPEC_CLASS, enabled);
  }
  return enabled;
}

export function setLowSpecPreference(pref: LowSpecPreference): boolean {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOW_SPEC_STORAGE_KEY, pref);
    } catch {
      // Ignore storage write error
    }
  }
  const enabled = syncLowSpecClassOnHtml();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('companygen:low-spec-change', { detail: { pref, enabled } }),
    );
  }
  return enabled;
}
