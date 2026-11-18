import { useEffect, useState } from 'react';

export function getBrandHorizontalLogo(isDark: boolean): string {
  return isDark ? '/brand/logo-horizontal-escura.webp' : '/brand/logo-horizontal-clara.webp';
}

export function getBrandSymbolLogo(isDark: boolean): string {
  return isDark ? '/brand/simbolo-branco.webp' : '/brand/simbolo-colorido.webp';
}

export function getBrandVerticalLogo(isDark: boolean): string {
  return isDark ? '/brand/logo-vertical-escura.webp' : '/brand/logo-vertical-clara.webp';
}

export function readStoredDarkMode(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (document.documentElement.classList.contains('dark')) return true;
  try {
    const saved = window.localStorage.getItem('cg_theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {
    // Ignore storage access errors
  }
  return false;
}

export function useDocumentDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => readStoredDarkMode());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const onCustomTheme = () => sync();
    window.addEventListener('companygen:theme-change', onCustomTheme);
    window.addEventListener('storage', onCustomTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener('companygen:theme-change', onCustomTheme);
      window.removeEventListener('storage', onCustomTheme);
    };
  }, []);

  return isDark;
}
