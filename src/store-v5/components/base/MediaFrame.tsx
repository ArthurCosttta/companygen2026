import React, { useState } from 'react';
import type { Asset, AssetRole } from '../../compiler/types';
import slotRegistry from '../../assets/slot-registry.json' with { type: 'json' };

export type MediaFrameProps = {
  asset?: Asset;
  override?: { url?: string; alt?: string; approved?: boolean };
  role?: AssetRole;
  fit?: 'contain' | 'cover' | 'intrinsic';
  aspectRatio?: string;
  width?: number | string;
  height?: number | string;
  maxBlockPx?: number;
  minBlockPx?: number;
  containerWidth?: number;
  mobileAsset?: Asset;
  mode?: 'studio' | 'standalone';
  onAssetClick?: (asset: Asset) => void;
  className?: string;
  alt?: string;
  priority?: boolean;
  compact?: boolean;
};

export const MediaFrame: React.FC<MediaFrameProps> = ({
  asset,
  override,
  role: roleProp,
  fit: fitProp,
  aspectRatio: ratioProp,
  width,
  height,
  maxBlockPx,
  minBlockPx,
  containerWidth,
  mobileAsset,
  mode = 'studio',
  onAssetClick,
  className = '',
  alt: altProp,
  priority = false,
  compact = false
}) => {
  const [loadError, setLoadError] = useState(false);
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(null);

  const effectiveRole = roleProp || asset?.role || 'product_cutout';
  const isCutout = ['product_cutout', 'category_tile', 'brand_logo', 'icon'].includes(effectiveRole);
  const isFullScene = effectiveRole === 'full_scene';

  // Escolha de Fit: respeita fitProp explicitamente; full_scene só usa cover quando explicitamente pedido
  const effectiveFit: 'contain' | 'cover' | 'fill' = isCutout
    ? 'contain'
    : fitProp === 'contain'
    ? 'contain'
    : fitProp === 'cover'
    ? 'cover'
    : isFullScene
    ? 'contain'
    : 'contain';

  // Seção mobile alternativa para full_scene
  const useMobile = Boolean(
    containerWidth && containerWidth < 480 && mobileAsset?.url
  );
  const activeAsset = useMobile ? mobileAsset! : asset;

  // Fonte efetiva da imagem: override tem prioridade; asset precisa estar ready e aprovado
  const effectiveSrc =
    override?.url ||
    (activeAsset?.status === 'ready' && activeAsset.approved
      ? activeAsset.url || activeAsset.path
      : activeAsset?.url || activeAsset?.path);

  const altText =
    altProp ||
    override?.alt ||
    activeAsset?.alt ||
    activeAsset?.ownerRef ||
    activeAsset?.assetId ||
    'Imagem';

  // Proporção / Aspect ratio adaptativo ao tamanho natural da imagem enviada
  let cssRatio: string | undefined;
  if (naturalDims && naturalDims.w > 0 && naturalDims.h > 0 && effectiveFit === 'contain') {
    const clampedRatio = Math.min(2.6, Math.max(0.55, naturalDims.w / naturalDims.h));
    cssRatio = `${clampedRatio.toFixed(3)} / 1`;
  } else {
    const ratio = ratioProp || activeAsset?.ratio;
    if (ratio && ratio.includes(':')) {
      const [w, h] = ratio.split(':').map(Number);
      if (w && h) cssRatio = `${w} / ${h}`;
    } else if (!isFullScene) {
      cssRatio = '1 / 1';
    }
  }

  // Estilos de container
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: cssRatio,
    width: width || '100%',
    height: height || (effectiveFit === 'contain' && !isCutout ? 'auto' : '100%'),
    maxHeight: maxBlockPx ? `${maxBlockPx}px` : undefined,
    minHeight: minBlockPx ? `${minBlockPx}px` : undefined,
    overflow: 'hidden',
    backgroundColor: isCutout ? 'transparent' : '#ffffff'
  };

  const focalPoint = activeAsset?.focalPoint || { x: 0.5, y: 0.5 };
  const objectPosition = `${focalPoint.x * 100}% ${focalPoint.y * 100}%`;

  const imgStyle: React.CSSProperties = effectiveFit === 'contain'
    ? {
        maxWidth: '100%',
        maxHeight: '100%',
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        objectPosition,
        padding: isCutout ? '4px' : '6px',
        display: 'block'
      }
    : {
        width: '100%',
        height: '100%',
        objectFit: effectiveFit as any,
        objectPosition,
        padding: 0,
        display: 'block'
      };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoadError(false);
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setNaturalDims({ w: naturalWidth, h: naturalHeight });
    }
  };

  const isBrokenOrMissing = !effectiveSrc || loadError;

  // Modo Studio (com ferramentas de edição, placeholders identificados e botões Trocar/Adicionar)
  if (mode === 'studio') {
    const slotDef = activeAsset?.kind
      ? (slotRegistry as Record<string, { width: number; height: number; fit: string }>)[activeAsset.kind]
      : undefined;
    const dims = `${activeAsset?.width || slotDef?.width || 1024} × ${
      activeAsset?.height || slotDef?.height || 1024
    } px`;

    return (
      <div
        className={`media-frame asset-slot ${compact ? 'compact' : ''} ${
          isBrokenOrMissing ? 'needs-asset' : ''
        } ${className}`}
        data-asset-id={activeAsset?.assetId}
        style={containerStyle}
      >
        {!isBrokenOrMissing ? (
          <img
            src={effectiveSrc}
            alt={altText}
            loading={priority ? 'eager' : 'lazy'}
            style={imgStyle}
            onLoad={handleImageLoad}
            onError={() => setLoadError(true)}
          />
        ) : (
          <div
            className="asset-empty"
            aria-label={`Imagem pendente: ${activeAsset?.assetId || 'desconhecido'}`}
          >
            <svg
              viewBox="0 0 56 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              style={{ width: '32px', height: '28px', opacity: 0.6 }}
            >
              <rect x="2" y="2" width="52" height="44" rx="6" />
              <circle cx="38" cy="14" r="4" />
              <path d="M5 38 18 25l9 9 8-8 16 15" />
            </svg>
            {!compact && (
              <>
                <strong style={{ fontSize: '9px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {activeAsset?.kind || 'MÍDIA'}
                </strong>
                <span style={{ fontSize: '9px', fontWeight: 600 }}>{activeAsset?.assetId}</span>
                <small style={{ fontSize: '8px', opacity: 0.7 }}>{dims}</small>
              </>
            )}
          </div>
        )}

        {activeAsset && onAssetClick && (
          <button
            className={`slot-action ${!isBrokenOrMissing ? 'slot-action--hover-only' : 'slot-action--visible'}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAssetClick(activeAsset);
            }}
            aria-label={`${!isBrokenOrMissing ? 'Trocar' : 'Adicionar'} imagem ${
              activeAsset.assetId
            }`}
          >
            {!isBrokenOrMissing ? 'Trocar imagem' : 'Adicionar imagem'}
          </button>
        )}
      </div>
    );
  }

  // Modo Público / Standalone: estritamente limpo, sem classes ou botões de edição
  if (isBrokenOrMissing) {
    return (
      <div
        className={`media-frame media-frame--fallback ${className}`}
        style={{
          ...containerStyle,
          backgroundColor: '#F3F4F6',
          borderRadius: '8px'
        }}
        role="img"
        aria-label={altText}
      />
    );
  }

  return (
    <div className={`media-frame media-frame--ready ${className}`} style={containerStyle}>
      <img
        src={effectiveSrc}
        alt={altText}
        loading={priority ? 'eager' : 'lazy'}
        style={imgStyle}
        onLoad={handleImageLoad}
        onError={() => setLoadError(true)}
      />
    </div>
  );
};
