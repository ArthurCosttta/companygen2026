import React, { useState } from 'react';
import type { CampaignSpec, ProductSpec } from '@/schemas/campaign.schema';
import type { StudioPost } from '@/compiler/build-post-ir';
import type { Asset } from '@/compiler/types';
import { Sparkles, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Generate30DaysDialogProps {
  isOpen: boolean;
  onClose: () => void;
  campaignSpec: CampaignSpec;
  products: ProductSpec[];
  assets: Asset[];
  onAddGeneratedPosts: (newPosts: StudioPost[]) => Promise<void>;
}

export const Generate30DaysDialog: React.FC<Generate30DaysDialogProps> = ({
  isOpen,
  onClose,
  campaignSpec,
  products,
  assets: _assets,
  onAddGeneratedPosts,
}) => {
  const [postFrequency, setPostFrequency] = useState<'daily' | 'thrice_weekly' | 'workdays'>('workdays');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const generated: StudioPost[] = [];
      const baseDate = new Date(campaignSpec.campaign.start_date || '2026-11-09');
      const preferredHours = ['07:00', '08:00', '09:00', '10:00', '11:00', '14:00', '16:00', '18:00', '20:00'];
      const topics = [
        { title: 'Nova coleção de polos', template: 'cover', query: 'polo shirt' },
        { title: 'Produto em destaque', template: 'product_focus', query: 'polo shirt studio photo' },
        { title: '3 formas de usar a polo', template: 'editorial_split', query: 'casual polo outfit jeans' },
        { title: 'Dicas de combinações', template: 'editorial_split', query: 'minimal mens casual outfit' },
        { title: 'Guia de cores da estação', template: 'cover', query: 'mens clothing collection' },
        { title: 'Calças e peças em alta', template: 'editorial_split', query: 'smart casual mens outfit' },
        { title: 'Bastidores da produção', template: 'detail', query: 'folded casual clothes' },
        { title: 'Cuidados com suas peças', template: 'detail', query: 'blue polo shirt detail' },
        { title: 'Oferta especial da semana', template: 'cta', query: 'mens clothing collection' },
        { title: 'Look de fim de semana', template: 'cover', query: 'polo shirt fashion outfit' },
        { title: 'Reposição de estoque', template: 'product_focus', query: 'mens outfit flat lay' },
        { title: 'Versatilidade no dia a dia', template: 'editorial_split', query: 'minimal mens fashion outfit' },
      ];

      let count = 0;
      for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
        const currentDate = new Date(baseDate);
        currentDate.setDate(baseDate.getDate() + dayOffset);
        const dayOfWeek = currentDate.getDay(); // 0 = Dom, 6 = Sáb

        if (postFrequency === 'workdays' && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
        if (postFrequency === 'thrice_weekly' && ![1, 3, 5].includes(dayOfWeek)) continue;

        count++;
        const isoDate = currentDate.toISOString().split('T')[0];
        const time = preferredHours[count % preferredHours.length];
        const topic = topics[count % topics.length];
        const postId = `gen_post_${String(count).padStart(3, '0')}`;
        const prod = products[count % Math.max(1, products.length)];

        const slides = [
          {
            id: `s1_${postId}`,
            template: topic.template,
            headline: topic.title,
            body: 'Qualidade e elegância para todas as ocasiões.',
            image_query: topic.query,
          },
          {
            id: `s2_${postId}`,
            template: 'editorial_split',
            headline: 'Composições exclusivas',
            body: 'Confira as sugestões do nosso time de estilo.',
            image_query: 'folded casual clothes',
          },
          {
            id: `s3_${postId}`,
            template: 'detail',
            headline: 'Acabamento premium',
            body: 'Costuras reforçadas e toque suave.',
            image_query: 'blue polo shirt detail',
          },
          {
            id: `s4_${postId}`,
            template: 'product_focus',
            headline: prod ? prod.name : 'Peça em destaque',
            body: 'Disponível nos tamanhos P ao GG.',
            image_query: 'polo shirt studio photo',
            show_price: true,
          },
          {
            id: `s5_${postId}`,
            template: 'cta',
            headline: 'Garanta a sua peça',
            body: 'Fale com nossa equipe no WhatsApp ou visite a loja.',
            cta_label: 'Ver produtos',
            image_query: 'mens clothing collection',
          },
        ];

        generated.push({
          id: postId,
          date: isoDate,
          time,
          type: 'carousel',
          status: count <= 2 ? 'published' : count <= 5 ? 'planned' : 'draft',
          title: topic.title,
          product_ids: prod ? [prod.id] : [],
          caption: `${topic.title}. Conheça nossa coleção e encontre sua próxima peça favorita!`,
          slides,
        });

        if (generated.length >= 24) break;
      }

      await onAddGeneratedPosts(generated);
      onClose();
    } catch (err) {
      console.error('Error generating 30 days:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isGenerating && onClose()}>
      <DialogContent className="max-w-lg p-6 rounded-2xl bg-white border border-[#E6EFFB]">
        <DialogHeader className="pb-3 border-b border-[#E6EFFB]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0867E8] text-white flex items-center justify-center font-bold shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-[17px] font-bold text-[#0B1D52]">
                Gerar Calendário de 30 Dias
              </DialogTitle>
              <p className="text-[12px] text-[#64748B]">
                Distribui posts com carrosséis temáticos nos melhores horários.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="py-3 space-y-3 text-[13px]">
          <div className="space-y-1.5">
            <label className="font-semibold text-[#0B1D52] flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#0867E8]" />
              <span>Frequência de Publicação:</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPostFrequency('workdays')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  postFrequency === 'workdays'
                    ? 'border-[#0867E8] bg-[#EDF4FF] text-[#0867E8] font-bold shadow-xs'
                    : 'border-[#E6EFFB] bg-white text-[#64748B] hover:border-[#BFDBFE]'
                }`}
              >
                Seg a Sex
              </button>
              <button
                type="button"
                onClick={() => setPostFrequency('thrice_weekly')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  postFrequency === 'thrice_weekly'
                    ? 'border-[#0867E8] bg-[#EDF4FF] text-[#0867E8] font-bold shadow-xs'
                    : 'border-[#E6EFFB] bg-white text-[#64748B] hover:border-[#BFDBFE]'
                }`}
              >
                3x por semana
              </button>
              <button
                type="button"
                onClick={() => setPostFrequency('daily')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  postFrequency === 'daily'
                    ? 'border-[#0867E8] bg-[#EDF4FF] text-[#0867E8] font-bold shadow-xs'
                    : 'border-[#E6EFFB] bg-white text-[#64748B] hover:border-[#BFDBFE]'
                }`}
              >
                Todos os dias
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F7FAFF] border border-[#E6EFFB] space-y-1 text-[12px] text-[#64748B]">
            <p>
              • Cada post será gerado com <strong>5 slides temáticos</strong> (Capa, Destaque, Editorial, Detalhe e CTA).
            </p>
            <p>• As fotografias serão selecionadas do banco de 20 imagens autorizadas.</p>
            <p>• Horários estratégicos calculados entre 07:00 e 20:00.</p>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-[#E6EFFB] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 rounded-xl border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] text-[13px] font-semibold text-[#64748B] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-5 py-2 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white text-[13px] font-bold transition-colors shadow-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isGenerating ? 'Compilando 30 dias...' : 'Gerar 30 dias'}</span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
