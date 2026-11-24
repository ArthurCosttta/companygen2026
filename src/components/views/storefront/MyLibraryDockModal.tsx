import * as React from 'react';
import {
  FileSpreadsheet,
  FolderOpen,
  Image as ImageIcon,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import type { BusinessProfile } from '@/schemas/profile.schema';

export interface MyLibraryDockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BusinessProfile;
  ownerId: string;
}

interface LibraryItem {
  id: string;
  title: string;
  category: 'Imagem da Loja' | 'Catálogo' | 'Configuração';
  url?: string;
  previewText?: string;
}

export function MyLibraryDockModal({
  open,
  onOpenChange,
  profile,
  ownerId,
}: MyLibraryDockModalProps) {
  const { showToast } = useToast();
  const [filterCat, setFilterCat] = React.useState<'all' | LibraryItem['category']>('all');
  const [hiddenIds, setHiddenIds] = React.useState<string[]>([]);

  const items = React.useMemo<LibraryItem[]>(() => {
    const out: LibraryItem[] = [];
    const brand = (profile.brand || {}) as {
      logoUrl?: string;
      storefrontPhotoUrl?: string;
      heroImageUrl?: string;
      heroBackgroundUrl?: string;
    };
    if (brand.logoUrl && !brand.logoUrl.startsWith('data:image/svg+xml')) {
      out.push({ id: 'brand-logo', title: 'Logo da Marca', category: 'Imagem da Loja', url: brand.logoUrl });
    }
    if (brand.storefrontPhotoUrl) {
      out.push({ id: 'brand-fachada', title: 'Foto da Frente da Loja', category: 'Imagem da Loja', url: brand.storefrontPhotoUrl });
    }
    if (brand.heroImageUrl) {
      out.push({ id: 'brand-hero', title: 'Arte / Capa Principal', category: 'Imagem da Loja', url: brand.heroImageUrl });
    }
    if (brand.heroBackgroundUrl) {
      out.push({ id: 'brand-hero-bg', title: 'Fundo Editorial da Vitrine', category: 'Imagem da Loja', url: brand.heroBackgroundUrl });
    }

    for (const p of (profile.catalog?.products || []).slice(0, 60)) {
      if (p.imageUrl && !p.imageUrl.startsWith('data:image/svg+xml')) {
        out.push({
          id: `prod-${p.id}`,
          title: p.name,
          category: 'Catálogo',
          url: p.imageUrl,
        });
      }
    }

    if (profile.business?.description) {
      out.push({
        id: 'cfg-brief',
        title: 'Descrição da Loja (Onboarding)',
        category: 'Configuração',
        previewText: profile.business.description,
      });
    }
    if (profile.business?.address) {
      out.push({
        id: 'cfg-address',
        title: 'Endereço Oficial',
        category: 'Configuração',
        previewText: profile.business.address,
      });
    }
    return out.filter((i) => !hiddenIds.includes(i.id));
  }, [hiddenIds, profile]);

  const visibleItems = React.useMemo(
    () => (filterCat === 'all' ? items : items.filter((i) => i.category === filterCat)),
    [filterCat, items],
  );

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      maxWidth="xl"
      title="Minha Biblioteca & Arquivos Enviados"
      description="Logos, fachada da loja, fotos do catálogo e informações enviadas no onboarding reunidas em um só lugar."
      footer={
        <div className="flex justify-end">
          <ActionButton variant="secondary" size={44} onClick={() => onOpenChange(false)}>
            Fechar Biblioteca
          </ActionButton>
        </div>
      }
    >
      <div data-testid="my-library-modal" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'Imagem da Loja', 'Catálogo', 'Configuração'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filterCat === cat
                    ? 'border-[#09090B] bg-[#09090B] text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {cat === 'all' ? `Tudo (${items.length})` : cat}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-medium text-slate-500">Workspace: {ownerId.slice(0, 8)}</span>
        </div>

        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <FolderOpen className="size-8 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-[#0F172A]">Nenhum arquivo neste filtro</p>
            <p className="mt-1 text-xs text-slate-500">
              Suba sua logo, fachada ou fotos de produtos para vê-los listados aqui com acesso rápido.
            </p>
          </div>
        ) : (
          <div className="grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((it) => (
              <article
                key={it.id}
                className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {it.category === 'Imagem da Loja' ? (
                        <ImageIcon className="size-3" />
                      ) : it.category === 'Catálogo' ? (
                        <Sparkles className="size-3" />
                      ) : (
                        <FileSpreadsheet className="size-3" />
                      )}
                      {it.category}
                    </span>
                    <button
                      type="button"
                      title="Ocultar da lista rápida"
                      onClick={() => {
                        setHiddenIds((prev) => [...prev, it.id]);
                        showToast({ type: 'neutral', message: `"${it.title}" ocultado da visualização.` });
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  {it.url ? (
                    <div className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                      <img src={it.url} alt={it.title} loading="lazy" className="size-full object-cover" />
                    </div>
                  ) : null}

                  <p className="truncate text-xs font-bold text-[#0F172A]">{it.title}</p>
                  {it.previewText ? (
                    <p className="line-clamp-3 text-[11px] leading-relaxed text-slate-600">{it.previewText}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </ModalContainer>
  );
}
