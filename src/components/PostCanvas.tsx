import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { PostSceneIR, Asset } from '@/compiler/types';
import { renderSceneToCanvas } from '@/compiler/render-post';
import { ChevronLeft, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';

interface PostCanvasProps {
  scene: PostSceneIR;
  assetMap: Map<string, Asset>;
  selectedLayerId?: string | null;
  onSelectLayer?: (layerId: string | null) => void;
  showSafeMargin?: boolean;
  onPrevSlide?: () => void;
  onNextSlide?: () => void;
  canPrevSlide?: boolean;
  canNextSlide?: boolean;
  className?: string;
}

export const PostCanvas: React.FC<PostCanvasProps> = ({
  scene,
  assetMap,
  selectedLayerId,
  onSelectLayer,
  showSafeMargin = false,
  onPrevSlide,
  onNextSlide,
  canPrevSlide = false,
  canNextSlide = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Render scene whenever scene, assetMap, selectedLayerId or showSafeMargin changes
  const render = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsRendering(true);
    try {
      await renderSceneToCanvas(scene, canvasRef.current, assetMap, {
        showSafeMarginGuide: showSafeMargin,
        selectedLayerId,
      });
    } catch (err) {
      console.error('Error rendering scene to canvas:', err);
    } finally {
      setIsRendering(false);
    }
  }, [scene, assetMap, selectedLayerId, showSafeMargin]);

  useEffect(() => {
    render();
  }, [render]);

  // Click on canvas to select layer by coordinate
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !onSelectLayer) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1080 / rect.width;
    const scaleY = 1350 / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check layers in reverse paint order (topmost layer first)
    const allLayers = [
      ...scene.decorations,
      ...scene.text_layers,
      ...scene.shape_layers,
      ...scene.image_layers,
    ].sort((a, b) => b.z_index - a.z_index);

    const hit = allLayers.find(
      (l) =>
        l.visible &&
        l.role !== 'background' &&
        clickX >= l.x &&
        clickX <= l.x + l.width &&
        clickY >= l.y &&
        clickY <= l.y + l.height
    );

    onSelectLayer(hit ? hit.id : null);
  };

  const warnings = scene.metadata.warnings.filter((w) => w.severity === 'error' || w.severity === 'warning');

  return (
    <div className={`relative flex flex-col items-center select-none ${className}`} ref={containerRef}>
      {/* 4:5 Canvas Wrapper with subtle shadow and border */}
      <div className="relative w-full aspect-[4/5] max-h-[460px] rounded-2xl overflow-hidden shadow-lg border border-[#E6EFFB] bg-white group">
        <canvas
          ref={canvasRef}
          width={1080}
          height={1350}
          onClick={handleCanvasClick}
          className="w-full h-full object-contain cursor-pointer transition-transform duration-150"
          style={{ imageRendering: 'auto' }}
        />

        {/* Carousel Navigation Arrows overlay */}
        {canPrevSlide && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrevSlide?.();
            }}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-[#0B1D52] shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Slide anterior"
            aria-label="Slide anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {canNextSlide && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNextSlide?.();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-[#0B1D52] shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Próximo slide"
            aria-label="Próximo slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Safe margin badge indicator */}
        {showSafeMargin && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#0867E8]/85 text-white text-[10px] font-medium flex items-center gap-1 backdrop-blur-xs">
            <ShieldCheck className="w-3 h-3" />
            <span>Margem segura 72px</span>
          </div>
        )}

        {isRendering && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-medium backdrop-blur-xs">
            Renderizando...
          </div>
        )}
      </div>

      {/* Warnings & Notices */}
      {warnings.length > 0 && (
        <div className="w-full mt-2 space-y-1">
          {warnings.slice(0, 2).map((w, idx) => (
            <div
              key={idx}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-2 ${
                w.severity === 'error'
                  ? 'bg-[#FEF2F2] text-[#D94C4C] border border-[#FEE2E2]'
                  : 'bg-[#FFFBEB] text-[#B45309] border border-[#FEF3C7]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
