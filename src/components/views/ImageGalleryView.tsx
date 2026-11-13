import React, { useState } from 'react';
import type { Asset } from '@/compiler/types';
import { registerUploadedImage } from '@/services/image-search';
import {
  Image as ImageIcon,
  Upload,
  ExternalLink,
  Shield,
  Search,
} from 'lucide-react';

interface ImageGalleryViewProps {
  assets: Asset[];
  onSelectAssetForPost?: (asset: Asset) => void;
  onRefreshAssets?: () => void;
  onNavigateToCalendar: () => void;
}

export const ImageGalleryView: React.FC<ImageGalleryViewProps> = ({
  assets,
  onRefreshAssets,
  onNavigateToCalendar,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const filteredAssets = assets.filter((a) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      a.title?.toLowerCase().includes(term) ||
      a.photographer?.toLowerCase().includes(term) ||
      a.query?.toLowerCase().includes(term) ||
      a.tags?.some((t) => t.toLowerCase().includes(term))
    );
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    setIsUploading(true);
    try {
      await registerUploadedImage(files[0]);
      onRefreshAssets?.();
    } catch (err) {
      console.error('Falha no upload:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#F7FAFF] cg-scroll select-none">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E6EFFB]">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0867E8] text-white flex items-center justify-center font-bold shadow-xs">
                <ImageIcon className="w-4 h-4" />
              </div>
              <h2 className="text-[22px] font-bold text-[#0B1D52]">
                Banco de Fotografias Autorizadas ({assets.length} imagens)
              </h2>
            </div>
            <p className="text-[13px] text-[#64748B] mt-1">
              Imagens de estoque de alta resolução obtidas de fontes autorizadas com licenças verificadas para uso comercial.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <div className="px-4 py-2 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white font-semibold text-[13px] flex items-center gap-1.5 transition-colors shadow-xs">
                <Upload className="w-4 h-4" />
                <span>{isUploading ? 'Enviando...' : 'Fazer Upload'}</span>
              </div>
            </label>

            <button
              onClick={onNavigateToCalendar}
              className="px-4 py-2 rounded-xl border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] text-[13px] font-semibold text-[#0B1D52] transition-colors"
            >
              ← Voltar ao Calendário
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar fotografias por termo, tag ou fotógrafo (ex: polo, casual, studio, jeans)..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-[#E6EFFB] text-[13px] text-[#0B1D52] outline-none focus:border-[#0867E8] transition-colors shadow-2xs"
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredAssets.map((asset) => {
            const src =
              asset.local_path.startsWith('blob:') || asset.local_path.startsWith('data:')
                ? asset.local_path
                : `./${asset.local_path.replace(/^\.?\//, '')}`;

            return (
              <div
                key={asset.asset_id}
                className="bg-white rounded-xl border border-[#E6EFFB] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div className="relative aspect-[4/5] bg-[#F1F5F9] overflow-hidden">
                  <img
                    src={src}
                    alt={asset.title || asset.asset_id}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-medium backdrop-blur-xs">
                    {asset.width} × {asset.height}
                  </div>
                </div>

                <div className="p-2.5 space-y-1">
                  <div className="font-semibold text-[12px] text-[#0B1D52] truncate">
                    {asset.title || asset.asset_id}
                  </div>
                  <div className="text-[11px] text-[#64748B] flex items-center justify-between">
                    <span className="truncate max-w-[120px]">{asset.photographer}</span>
                    {asset.source_url && (
                      <a
                        href={asset.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#0867E8] hover:underline"
                        title="Ver licença na fonte"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="text-[10px] text-[#24A677] font-medium flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    <span>{asset.license}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
