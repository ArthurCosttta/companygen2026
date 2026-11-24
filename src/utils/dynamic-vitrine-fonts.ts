/**
 * On-demand font loader for generated customer storefronts.
 * Only imports the Latin subset CSS for the active storefront family, keeping
 * the core admin shell lightweight on slow store PCs.
 */

const loadedFontFamilies = new Set<string>(['inter', 'instrument serif', 'jetbrains mono']);

function normalizeFontKey(raw?: string): string {
  const text = String(raw || '').toLowerCase();
  if (!text) return '';
  if (text.includes('playfair')) return 'playfair-display';
  if (text.includes('fraunces')) return 'fraunces';
  if (text.includes('bricolage')) return 'bricolage-grotesque';
  if (text.includes('jakarta')) return 'plus-jakarta-sans';
  if (text.includes('dm sans')) return 'dm-sans';
  if (text.includes('syne')) return 'syne';
  if (text.includes('editorial_serif') || text.includes('serif')) return 'playfair-display';
  if (text.includes('clean_geometric')) return 'plus-jakarta-sans';
  return '';
}

export async function ensureVitrineFontLoaded(fontInput?: string): Promise<void> {
  const key = normalizeFontKey(fontInput);
  if (!key || loadedFontFamilies.has(key)) return;
  loadedFontFamilies.add(key);

  try {
    switch (key) {
      case 'playfair-display':
        await Promise.all([
          import('@fontsource/playfair-display/latin-400.css'),
          import('@fontsource/playfair-display/latin-600.css'),
          import('@fontsource/playfair-display/latin-700.css'),
        ]);
        break;
      case 'fraunces':
        await Promise.all([
          import('@fontsource/fraunces/latin-400.css'),
          import('@fontsource/fraunces/latin-600.css'),
          import('@fontsource/fraunces/latin-700.css'),
        ]);
        break;
      case 'bricolage-grotesque':
        await Promise.all([
          import('@fontsource/bricolage-grotesque/latin-400.css'),
          import('@fontsource/bricolage-grotesque/latin-600.css'),
          import('@fontsource/bricolage-grotesque/latin-700.css'),
        ]);
        break;
      case 'plus-jakarta-sans':
        await Promise.all([
          import('@fontsource/plus-jakarta-sans/latin-400.css'),
          import('@fontsource/plus-jakarta-sans/latin-600.css'),
          import('@fontsource/plus-jakarta-sans/latin-700.css'),
        ]);
        break;
      case 'dm-sans':
        await Promise.all([
          import('@fontsource/dm-sans/latin-400.css'),
          import('@fontsource/dm-sans/latin-600.css'),
          import('@fontsource/dm-sans/latin-700.css'),
        ]);
        break;
      case 'syne':
        await Promise.all([
          import('@fontsource/syne/latin-600.css'),
          import('@fontsource/syne/latin-700.css'),
        ]);
        break;
      default:
        break;
    }
  } catch {
    // Non-fatal fallback to Inter / Georgia system fonts
  }
}
