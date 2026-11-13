import React, { useState } from 'react';
import type { Asset } from '@/compiler/types';
import { registerUploadedImage } from '@/services/image-search';
import {
  Search,
  Upload,
  ExternalLink,
  Check,
  Image as ImageIcon,
  Shield,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ImageLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  selectedAssetId?: string | null;
  onSelectAsset: (asset: Asset) => void;
  onRefreshAssets?: () => void;
}

export const ImageLibrary: React.FC<ImageLibraryProps> = ({
  isOpen,
  onClose,
  assets,
  selectedAssetId,
  onSelectAsset,
  onRefreshAssets,
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
      const asset = await registerUploadedImage(files[0]);
      onRefreshAssets?.();
      onSelectAsset(asset);
      onClose();
    } catch (err) {
      console.error('Falha no upload:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 rounded-2xl bg-white border border-[#E6EFFB]">
        <DialogHeader className="pb-3 border-b border-[#E6EFFB]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EDF4FF] text-[#0867E8] flex items-center justify-center font-bold">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-[17px] font-bold text-[#0B1D52]">
                  Biblioteca de Fotografias Autorizadas ({assets.length})
                </DialogTitle>
                <p className="text-[12px] text-[#64748B]">
                  Imagens autorizadas via API oficial com licenças comerciais verificadas.
                </p>
              </div>
            </div>

            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <div className="px-3 py-1.5 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white font-semibold text-[13px] flex items-center gap-1.5 transition-colors shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>{isUploading ? 'Enviando...' : 'Fazer Upload'}</span>
              </div>
            </label>
          </div>

          {/* Search bar */}
          <div className="mt-3 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por termo, etiqueta ou fotógrafo (ex: polo, minimal, clothes, headset)..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F7FAFF] border border-[#E6EFFB] text-[13px] text-[#0B1D52] outline-none focus:border-[#0867E8] transition-colors"
            />
          </div>
        </DialogHeader>

        {/* Grid of photos */}
        <div className="flex-1 overflow-y-auto py-4 cg-scroll">
          {filteredAssets.length === 0 ? (
            <div className="py-12 text-center text-[#64748B]">
              <ImageIcon className="w-10 h-10 mx-auto text-[#CBD5E1] mb-2" />
              <p className="font-medium text-[14px]">Nenhuma fotografia encontrada para o termo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {filteredAssets.map((asset) => {
                const isSelected = selectedAssetId === asset.asset_id;
                const src = asset.local_path.startsWith('blob:') || asset.local_path.startsWith('data:')
                  ? asset.local_path
                  : `./${asset.local_path.replace(/^\.?\//, '')}`;

                return (
                  <div
                    key={asset.asset_id}
                    onClick={() => {
                      onSelectAsset(asset);
                      onClose();
                    }}
                    className={`group relative rounded-xl border overflow-hidden cursor-pointer bg-white transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-[#0867E8] ring-2 ring-[#0867E8]/20'
                        : 'border-[#E6EFFB] hover:border-[#BFDBFE]'
                    }`}
                  >
                    {/* Image Container */}
                    <div className="relative aspect-[4/5] bg-[#F1F5F9] overflow-hidden">
                      <img
                        src={src}
                        alt={asset.title || asset.asset_id}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                        loading="lazy"
                      />

                      {/* Selected checkmark */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#0867E8] text-white flex items-center justify-center shadow-md">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Resolution badge */}
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-medium backdrop-blur-xs">
                        {asset.width} × {asset.height}
                      </div>
                    </div>

                    {/* Metadata Footer */}
                    <div className="p-2 space-y-1 bg-white">
                      <div className="font-semibold text-[11.5px] text-[#0B1D52] truncate">
                        {asset.title || asset.asset_id}
                      </div>

                      <div className="text-[10px] text-[#64748B] flex items-center justify-between">
                        <span className="truncate max-w-[110px]" title={asset.photographer}>
                          {asset.photographer}
                        </span>
                        {asset.source_url && (
                          <a
                            href={asset.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#0867E8] hover:underline flex items-center gap-0.5 ml-1"
                            title="Ver origem da licença"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[9.5px] text-[#24A677] font-medium truncate">
                        <Shield className="w-3 h-3 shrink-0" />
                        <span className="truncate">{asset.license}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
