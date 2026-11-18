import React, { useState } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';

export interface ProductImageDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  image: {
    rawUrl: string;
    thumbnailUrl?: string;
    declaredWidth?: number;
    declaredHeight?: number;
    sourceDomain?: string;
    titleSnippet?: string;
  } | null;
  onSetOfficialPhoto: (imageUrl: string) => Promise<void> | void;
}

export function ProductImageDetailModal({
  open,
  onOpenChange,
  productName,
  image,
  onSetOfficialPhoto,
}: ProductImageDetailModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isApplying, setIsApplying] = useState(false);

  React.useEffect(() => {
    if (open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsApplying(false);
    }
  }, [open, image]);

  if (!open || !image) return null;

  const displayUrl = image.rawUrl || image.thumbnailUrl || '';
  const width = image.declaredWidth || 0;
  const height = image.declaredHeight || 0;
  const hasDimensions = width > 0 && height > 0;
  const isHighRes = width >= 800 || height >= 800;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(3, prev + 0.35));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.7, prev - 0.35));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleConfirmOfficial = async () => {
    if (!displayUrl || isApplying) return;
    setIsApplying(true);
    try {
      await onSetOfficialPhoto(displayUrl);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      role="dialog"
      data-testid="product-image-detail-modal"
      aria-modal="true"
      aria-label="Inspeção detalhada de imagem do produto"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseUp={handleMouseUp}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
              Inspeção em Alta Resolução
            </span>
            <h3 className="text-lg font-bold text-white truncate max-w-lg">
              {productName || 'Foto do Produto'}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {hasDimensions && (
              <span
                className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-full border ${
                  isHighRes
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}
              >
                {width} × {height} px {isHighRes ? '• Alta Nitidez' : '• Resolução Média'}
              </span>
            )}
            {image.sourceDomain && (
              <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 rounded-full border border-slate-700">
                <Globe className="w-3 h-3 text-slate-400" />
                {image.sourceDomain}
              </span>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Palco da Imagem */}
        <div
          className="relative flex-1 min-h-[380px] max-h-[60vh] bg-[#0b0f19] flex items-center justify-center overflow-hidden select-none cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
        >
          {/* Fundo quadriculado sutil para transparência */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle, #ffffff 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          />

          <img
            src={displayUrl}
            alt={image.titleSnippet || productName}
            className="max-w-full max-h-[58vh] object-contain transition-transform duration-75 ease-out shadow-2xl rounded-lg"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            }}
            draggable={false}
          />

          {/* Barra Flutuante de Controles de Zoom */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-full shadow-lg backdrop-blur-md">
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-slate-800 transition"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono font-medium text-slate-200">
              {Math.round(zoom * 100)}%
            </span>
            <button
              data-testid="image-detail-zoom-in"
              onClick={handleZoomIn}
              className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-slate-800 transition"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <button
              onClick={handleResetZoom}
              className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-slate-800 transition"
              title="Resetar Zoom"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir URL original em nova aba
            </a>
          </div>

          <div className="flex items-center gap-3">
            <ActionButton
              variant="secondary"
              onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </ActionButton>

            <ActionButton
              data-testid="image-detail-confirm-official"
              variant="success"
              onClick={handleConfirmOfficial}
              disabled={isApplying}
              className="bg-[#10B981] hover:bg-[#059669] text-white font-bold"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {isApplying ? 'Definindo foto...' : 'Definir como Foto Oficial do Produto'}
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
