export interface VariationPresetResult {
  label: string;
  chips: string[];
}

export interface StarterModelProduct {
  name: string;
  category: string;
  variation: string;
  priceCents: number;
  description: string;
}

export interface StarterModelStoreTemplate {
  id: string;
  label: string;
  segment: string;
  products: StarterModelProduct[];
}

function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getVariationPresetsForCategory(
  category: string,
  segment = '',
): VariationPresetResult {
  const hay = normalizeText(`${category} ${segment}`);

  if (/calcado|tenis|sapato|sandalia|bota|chinelo/.test(hay)) {
    return {
      label: 'Numeração sugerida',
      chips: ['35', '36', '37', '38', '39', '40', '41', '42'],
    };
  }

  if (/cosmet|beleza|perfume|skincare|serum|creme|cabelo|maquiag/.test(hay)) {
    return {
      label: 'Volumes sugeridos',
      chips: ['30ml', '50ml', '100ml', '200ml', 'Kit'],
    };
  }

  if (/moda|roupa|vestuario|camiset|vestido|blusa|calca|acessor/.test(hay)) {
    return {
      label: 'Tamanhos sugeridos',
      chips: ['P', 'M', 'G', 'GG', 'Único'],
    };
  }

  if (/gastron|doce|bolo|bebida|aliment|cafe|lanch|pizza|burger/.test(hay)) {
    return {
      label: 'Porções sugeridas',
      chips: ['Individual', '300g', '500g', '1kg', 'Combo'],
    };
  }

  if (/pet|animal|racao|banho|tosa|cachorro|gato/.test(hay)) {
    return {
      label: 'Porte / Peso',
      chips: ['Porte P', 'Porte M', 'Porte G', '1kg', '3kg'],
    };
  }

  if (/eletron|celular|informatica|fone|assistencia/.test(hay)) {
    return {
      label: 'Opções técnicas',
      chips: ['128GB', '256GB', 'Preto', 'Branco', 'Bivolt'],
    };
  }

  return {
    label: 'Variações rápidas',
    chips: ['Padrão', 'P', 'M', 'G', 'Kit 2 un.'],
  };
}

export const CURATED_MODEL_STORES: readonly StarterModelStoreTemplate[] = [
  {
    id: 'modelo-moda',
    label: 'Moda & Acessórios',
    segment: 'Moda & Acessórios',
    products: [
      {
        name: 'Camiseta Algodão Pima Essencial',
        category: 'Vestuário',
        variation: 'M',
        priceCents: 11990,
        description: 'Toque macio com modelagem reta confortável.',
      },
      {
        name: 'Bolsa Tote Estruturada Linho',
        category: 'Acessórios',
        variation: 'Único',
        priceCents: 18900,
        description: 'Alça reforçada e bolso interno com zíper.',
      },
      {
        name: 'Conjunto Linho Casual',
        category: 'Vestuário',
        variation: 'G',
        priceCents: 24900,
        description: 'Tecido respirável ideal para o dia a dia.',
      },
    ],
  },
  {
    id: 'modelo-beleza',
    label: 'Beleza & Cosméticos',
    segment: 'Beleza & Cosméticos',
    products: [
      {
        name: 'Sérum Facial Vitamina C 10%',
        category: 'Cosméticos',
        variation: '30ml',
        priceCents: 11990,
        description: 'Ilumina a pele e uniformiza textura com absorção rápida.',
      },
      {
        name: 'Hidratante Corporal Lavanda',
        category: 'Cosméticos',
        variation: '200ml',
        priceCents: 6990,
        description: 'Hidratação intensa com fragrância suave botânica.',
      },
      {
        name: 'Kit Rotina Pele Radiante',
        category: 'Kits',
        variation: 'Kit',
        priceCents: 16900,
        description: 'Limpeza suave + sérum diurno para presente ou uso diário.',
      },
    ],
  },
  {
    id: 'modelo-gastronomia',
    label: 'Gastronomia & Doces',
    segment: 'Gastronomia & Confeitaria',
    products: [
      {
        name: 'Caixa Degustação 8 Doces Artesanais',
        category: 'Confeitaria',
        variation: '500g',
        priceCents: 5490,
        description: 'Seleção diária fresca com embalagem pronta para presente.',
      },
      {
        name: 'Torta Chocolatuda Clássica',
        category: 'Tortas',
        variation: '1kg',
        priceCents: 12900,
        description: 'Massa leve de cacau 50% com cobertura cremosa.',
      },
      {
        name: 'Combo Café da Tarde para 2',
        category: 'Combos',
        variation: 'Combo',
        priceCents: 7800,
        description: 'Bolo caseiro + salgados assados + bebidas à escolha.',
      },
    ],
  },
];

export function findModelTemplateForSegment(
  segment: string,
): StarterModelStoreTemplate {
  const norm = normalizeText(segment);
  if (/cosmet|beleza|farmac|estetica/.test(norm)) {
    return CURATED_MODEL_STORES[1];
  }
  if (/gastron|doce|confeit|aliment|padaria|cafe/.test(norm)) {
    return CURATED_MODEL_STORES[2];
  }
  return CURATED_MODEL_STORES[0];
}

function parsePastedPriceToCents(numericRaw: string): number {
  const clean = String(numericRaw || '').trim();
  if (!clean) return 0;
  let normalized: number;
  if (clean.includes(',')) {
    normalized = Number(clean.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(clean)) {
    normalized = Number(clean.replace(/\./g, ''));
  } else {
    normalized = Number(clean);
  }
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.round(normalized * 100);
}

export function parseQuickPastedCatalogText(
  rawText: string,
  defaultCategory = 'Geral',
): StarterModelProduct[] {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);

  const items: StarterModelProduct[] = [];
  for (const line of lines) {
    // Suporta formatos: "iPhone 15 - R$ 4.299,00", "Geladeira 1.850,50", "Sérum Vitamina C - 119,90", "Tênis Runner | 249.90", sem engolir "Sérum C 10"
    const separatorMatch = line.match(
      /(?:[\-–—|:]\s*(?:r\$\s*)?|r\$\s*)((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*$/i,
    );
    const decimalMatch = !separatorMatch
      ? line.match(/\s+((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2}|\.\d{2}))\s*$/i)
      : null;
    const priceMatch = separatorMatch || decimalMatch;

    let namePart = line;
    let priceCents = 0;

    if (priceMatch && priceMatch.index !== undefined) {
      const parsedCents = parsePastedPriceToCents(priceMatch[1]);
      if (parsedCents > 0) {
        priceCents = parsedCents;
        namePart = line
          .slice(0, priceMatch.index)
          .replace(/[\s\-–—|:/]+$/g, '')
          .trim();
      }
    }

    const cleanName = namePart.slice(0, 90).trim();
    if (cleanName.length < 2) continue;

    items.push({
      name: cleanName,
      category: defaultCategory || 'Geral',
      variation: 'Padrão',
      priceCents: priceCents > 0 ? priceCents : 4990,
      description: '',
    });
  }

  return items;
}
