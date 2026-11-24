import { useEffect, useState } from 'react';
import { createEmptyProfile, type BusinessProfile, type CatalogProduct } from '@/schemas/profile.schema';
import { AtomicSectionRenderer } from './AtomicSectionRenderers';
import { resolveFontVoices } from './AtomicGrammarCompiler';
import * as atomicGrammar from '../../../../shared/formula-ir/atomic-grammar.mjs';

export interface VirtualHarnessPayload {
  clause: string;
  caseId: string;
  label: string;
  canvasMode?: 'default' | 'pure_white' | 'isolated_white';
  hideBanner?: boolean;
  stagePaddingPx?: number;
  primaryColor?: string;
  accentColor?: string;
  groundMode?: 'warm_linen' | 'soft_tint' | 'cool_mist' | 'pure_gallery';
  engineSeed?: Record<string, unknown>;
  storeName?: string;
  logoUrl?: string;
  products?: CatalogProduct[];
  sections: Array<Record<string, unknown>>;
}

const NOW_ISO = '2026-11-22T20:00:00.000Z';

const DEFAULT_PRODUCTS: CatalogProduct[] = [
  {
    id: 'vp_1',
    sku: 'SKU-001',
    name: 'Caderno Artesanal Pólen A5',
    category: 'Cadernos',
    description: 'Papel pólen 90g costura exposta.',
    priceCents: 6490,
    variation: 'A5 160 pág.',
    stock: 15,
    stockQty: 15,
    active: true,
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&q=80',
    approvedAsset: true,
    updatedAt: NOW_ISO,
  },
  {
    id: 'vp_2',
    sku: 'SKU-002',
    name: 'Kit Escrita Execução Latte',
    category: 'Escrita',
    description: 'Caneta metálica + estojo rígido.',
    priceCents: 11900,
    variation: 'Preto Matte',
    stock: 9,
    stockQty: 9,
    active: true,
    imageUrl: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600&q=80',
    approvedAsset: true,
    updatedAt: NOW_ISO,
  },
  {
    id: 'vp_3',
    sku: 'SKU-003',
    name: 'Cesta Café & Papelaria',
    category: 'Kits Presente',
    description: 'Mix café especial + bloco kraft.',
    priceCents: 18990,
    variation: 'Caixa M',
    stock: 6,
    stockQty: 6,
    active: true,
    imageUrl: '',
    approvedAsset: true,
    updatedAt: NOW_ISO,
  },
  {
    id: 'vp_4',
    sku: 'SKU-004',
    name: 'Planner Mesa Semanal Minimal',
    category: 'Organização',
    description: '52 semanas datáveis papel 120g.',
    priceCents: 5490,
    variation: '52 Folhas',
    stock: 22,
    stockQty: 22,
    active: true,
    imageUrl: '',
    approvedAsset: true,
    updatedAt: NOW_ISO,
  },
];

function hydrateVirtualSections(payload: VirtualHarnessPayload): Array<Record<string, unknown>> {
  const primaryHex = payload.primaryColor || '#18181B';
  const accentHex = payload.accentColor || '#D8A848';
  const groundMode = payload.groundMode || 'warm_linen';
  const resolveTokens = (atomicGrammar as unknown as {
    resolveSectionSurfaceTokens: (args: Record<string, unknown>) => Record<string, unknown>;
  }).resolveSectionSurfaceTokens;

  let prevIsDark: boolean | null = null;
  return (payload.sections || []).map((sec, idx) => {
    const surfaceTokens =
      sec.surfaceTokens && typeof sec.surfaceTokens === 'object'
        ? (sec.surfaceTokens as Record<string, unknown>)
        : resolveTokens({
            primaryHex,
            accentHex,
            surfaceStr: String(sec.surface || ''),
            sectionIndex: idx,
            prevIsDark,
            groundMode,
          });
    prevIsDark = Boolean(surfaceTokens.isDark);
    return {
      ...sec,
      surfaceTokens,
      boundProducts: Array.isArray(sec.boundProducts)
        ? sec.boundProducts
        : payload.products || DEFAULT_PRODUCTS,
    };
  });
}

export function VirtualTupleHarness() {
  const [payload, setPayload] = useState<VirtualHarnessPayload>(() => ({
    clause: 'init',
    caseId: '00',
    label: 'Waiting for virtual payload',
    sections: [],
  }));
  const [replayNonce, setReplayNonce] = useState(0);

  useEffect(() => {
    const win = window as unknown as {
      __setVirtualHarnessPayload?: (next: VirtualHarnessPayload) => void;
      __REPLAY_STUDIO_SPEC?: () => void;
    };
    win.__setVirtualHarnessPayload = (next: VirtualHarnessPayload) => {
      setPayload(next);
    };
    win.__REPLAY_STUDIO_SPEC = () => {
      setReplayNonce((n) => n + 1);
    };
  }, []);

  const products = payload.products && payload.products.length > 0 ? payload.products : DEFAULT_PRODUCTS;
  const storeName = payload.storeName || 'Papelaria Atelier';
  const primaryColor = payload.primaryColor || '#18181B';
  const accentColor = payload.accentColor || '#D8A848';
  const { bodyFontFamily } = resolveFontVoices(payload.engineSeed);
  const hydratedSections = hydrateVirtualSections({ ...payload, products });

  const baseProfile = createEmptyProfile();
  const mockProfile: BusinessProfile = {
    ...baseProfile,
    business: {
      ...baseProfile.business,
      name: storeName,
      segment: 'Papelaria Editorial',
      businessModel: 'produtos',
      description: 'Curadoria autoral em papel pólen 90g e presentes.',
      address: 'Av. Paulista, 900 · São Paulo',
      hours: 'Seg–Sáb 09h–19h',
    },
    brand: {
      ...baseProfile.brand,
      primaryColor,
      accentColor,
      fontStyle: 'clean_geometric',
      logoUrl: payload.logoUrl || '',
      instagram: '@papelaria.atelier',
    },
    catalog: {
      ...baseProfile.catalog,
      products,
    },
    payment: {
      ...baseProfile.payment,
      pixKey: '11987654321',
      pixDiscountPercent: 5,
      acceptedMethods: ['pix'],
    },
  };

  const isWhiteCanvas = payload.canvasMode === 'pure_white' || payload.canvasMode === 'isolated_white';
  const showBanner = !payload.hideBanner && !isWhiteCanvas;
  const stagePad = payload.canvasMode === 'isolated_white' ? Number(payload.stagePaddingPx ?? 48) : 0;

  return (
    <div
      data-testid="virtual-tuple-harness-root"
      data-clause={payload.clause}
      data-case-id={payload.caseId}
      data-canvas-mode={payload.canvasMode || 'default'}
      className={isWhiteCanvas ? 'min-h-screen w-full overflow-x-clip bg-white' : 'min-h-screen w-full overflow-x-clip bg-[#F8FAFC]'}
      style={{ fontFamily: bodyFontFamily }}
    >
      {showBanner ? (
        <div
          data-testid="virtual-harness-banner"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-700"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
              {payload.clause}
            </span>
            <span className="font-mono font-semibold text-blue-700">{payload.caseId}</span>
            <span className="font-medium text-slate-900">{payload.label}</span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            sections={hydratedSections.length} · ground={payload.groundMode || 'warm_linen'}
          </span>
        </div>
      ) : null}

      <main
        data-testid="virtual-harness-stage"
        className="w-full"
        style={stagePad > 0 ? { padding: `${stagePad}px`, backgroundColor: '#FFFFFF' } : undefined}
      >
        {hydratedSections.map((sec, idx) => {
          const tupleArr = Array.isArray(sec.tuple) ? (sec.tuple as string[]) : undefined;
          return (
            <AtomicSectionRenderer
              key={`${payload.caseId}-${replayNonce}-${String(tupleArr?.[0] || idx)}`}
              section={sec}
              index={idx}
              storeName={storeName}
              logoUrl={payload.logoUrl || ''}
              profile={mockProfile}
              engineSeed={payload.engineSeed}
              products={products}
              primaryColor={primaryColor}
              accentColor={accentColor}
              appliedCoupon={null}
              onApplyCoupon={() => {}}
              onAddToCart={() => {}}
            />
          );
        })}
      </main>
    </div>
  );
}
