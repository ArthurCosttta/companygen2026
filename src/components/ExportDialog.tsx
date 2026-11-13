import React, { useState } from 'react';
import type { CampaignSpec } from '@/schemas/campaign.schema';
import type { StudioPost } from '@/compiler/build-post-ir';
import type { Asset } from '@/compiler/types';
import { downloadCampaignZip, downloadPostZip } from '@/services/export-zip';
import {
  Download,
  Package,
  FileArchive,
  CheckCircle2,
  Loader2,
  FolderTree,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  campaignSpec: CampaignSpec;
  posts: StudioPost[];
  assets: Asset[];
  currentPost?: StudioPost;
}

interface ExportStep {
  name: string;
  status: 'pending' | 'in_progress' | 'done' | 'error';
  detail?: string;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  campaignSpec,
  posts,
  assets,
  currentPost,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');
  const [steps, setSteps] = useState<ExportStep[]>([
    { name: 'Importando JSON', status: 'done' },
    { name: 'Validando posts', status: 'done' },
    { name: 'Buscando imagens', status: 'done' },
    { name: 'Montando composição', status: 'done' },
    { name: 'Renderizando slides', status: 'pending' },
    { name: 'Exportando arquivos', status: 'pending' },
  ]);

  const totalSlides = posts.reduce((sum, p) => sum + p.slides.length, 0);

  const handleExportFullCampaign = async () => {
    setIsExporting(true);
    setProgressPercent(10);
    setSteps((prev) =>
      prev.map((s) =>
        s.name === 'Renderizando slides' ? { ...s, status: 'in_progress' } : s
      )
    );

    try {
      await downloadCampaignZip(campaignSpec, posts, assets, (step, cur, tot, msg) => {
        setCurrentMessage(msg);
        const pct = Math.round((cur / tot) * 85) + 10;
        setProgressPercent(pct);
        if (step.includes('slides')) {
          setSteps((prev) =>
            prev.map((s) =>
              s.name === 'Renderizando slides'
                ? { ...s, status: cur === tot ? 'done' : 'in_progress', detail: `${cur}/${tot}` }
                : s
            )
          );
        } else if (step.includes('ZIP')) {
          setSteps((prev) =>
            prev.map((s) =>
              s.name === 'Exportando arquivos' ? { ...s, status: 'in_progress' } : s
            )
          );
        }
      });

      setProgressPercent(100);
      setSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
      setCurrentMessage('Exportação concluída com sucesso!');
    } catch (err) {
      console.error('Export error:', err);
      setCurrentMessage('Erro ao exportar arquivos.');
      setSteps((prev) =>
        prev.map((s) => (s.status === 'in_progress' ? { ...s, status: 'error' } : s))
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCurrentPost = async () => {
    if (!currentPost) return;
    setIsExporting(true);
    setProgressPercent(20);
    try {
      await downloadPostZip(currentPost, campaignSpec, assets, (_step, cur, tot, msg) => {
        setCurrentMessage(msg);
        setProgressPercent(Math.round((cur / tot) * 90));
      });
      setProgressPercent(100);
      setCurrentMessage(`Post ${currentPost.id} exportado com sucesso!`);
    } catch (err) {
      console.error('Post export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isExporting && onClose()}>
      <DialogContent className="max-w-xl flex flex-col p-6 rounded-2xl bg-white border border-[#E6EFFB]">
        <DialogHeader className="pb-3 border-b border-[#E6EFFB]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EDF4FF] text-[#0867E8] flex items-center justify-center font-bold">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-[17px] font-bold text-[#0B1D52]">
                Exportar Posts e Campanha
              </DialogTitle>
              <p className="text-[12px] text-[#64748B]">
                Gera arquivos PNG em resolução exata 1080 × 1350 px e pacotes ZIP estruturados.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="py-3 space-y-4">
          {/* Options cards */}
          {!isExporting && progressPercent === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Full Campaign ZIP */}
              <div
                onClick={handleExportFullCampaign}
                className="p-4 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] hover:border-[#0867E8] hover:bg-[#EDF4FF] cursor-pointer transition-all space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-white border border-[#E6EFFB] flex items-center justify-center text-[#0867E8] shadow-2xs group-hover:scale-105 transition-transform">
                    <FileArchive className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#0867E8]/10 text-[#0867E8]">
                    Completo
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-[14px] text-[#0B1D52]">
                    Campanha Completa (ZIP)
                  </h4>
                  <p className="text-[11.5px] text-[#64748B] mt-0.5">
                    {posts.length} posts · {totalSlides} slides PNG · schedule.csv · legendas · manifestos
                  </p>
                </div>
              </div>

              {/* Single Post ZIP */}
              <div
                onClick={handleExportCurrentPost}
                className="p-4 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] hover:border-[#0867E8] hover:bg-[#EDF4FF] cursor-pointer transition-all space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-white border border-[#E6EFFB] flex items-center justify-center text-[#0867E8] shadow-2xs group-hover:scale-105 transition-transform">
                    <Download className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-[#64748B]">
                    Post Atual
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-[14px] text-[#0B1D52]">
                    Post Selecionado (ZIP)
                  </h4>
                  <p className="text-[11.5px] text-[#64748B] mt-0.5">
                    {currentPost?.slides.length || 0} slides · caption.txt · post.json
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Real-time Progress & Verification Status matching Section 10 */}
          {(isExporting || progressPercent > 0) && (
            <div className="p-4 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] space-y-3">
              <div className="flex items-center justify-between text-[12px] font-semibold text-[#0B1D52]">
                <span>Status da Fila de Exportação</span>
                <span>{progressPercent}%</span>
              </div>

              <Progress value={progressPercent} className="h-2 bg-[#E6EFFB]" />

              {currentMessage && (
                <div className="text-[11.5px] text-[#0867E8] font-medium flex items-center gap-1.5">
                  {isExporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{currentMessage}</span>
                </div>
              )}

              {/* Step list matching prompt contract */}
              <div className="divide-y divide-[#E6EFFB] border border-[#E6EFFB] rounded-xl bg-white overflow-hidden text-[12px]">
                {steps.map((st, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between">
                    <span className="text-[#0B1D52] font-medium">{st.name}</span>
                    <div className="flex items-center gap-1.5">
                      {st.detail && <span className="text-[#64748B] text-[11px]">{st.detail}</span>}
                      {st.status === 'done' && (
                        <span className="text-[#24A677] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>✓</span>
                        </span>
                      )}
                      {st.status === 'in_progress' && (
                        <span className="text-[#0867E8] font-semibold flex items-center gap-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Processando</span>
                        </span>
                      )}
                      {st.status === 'pending' && (
                        <span className="text-[#94A3B8]">Pendente</span>
                      )}
                      {st.status === 'error' && (
                        <span className="text-[#D94C4C] font-semibold">Falha</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ZIP Structure description */}
          <div className="p-3 rounded-xl border border-[#E6EFFB] bg-white text-[11.5px] text-[#64748B] space-y-1">
            <div className="font-semibold text-[#0B1D52] flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-[#0867E8]" />
              <span>Estrutura do arquivo ZIP:</span>
            </div>
            <p>
              <code>COMPANYGEN_CAMPAIGN/posts/post_xxx/slide_0x.png</code>, <code>caption.txt</code>, <code>campaign.json</code>, <code>schedule.csv</code> e <code>credits.md</code>.
            </p>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-[#E6EFFB] flex items-center justify-end">
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] text-[13px] font-semibold text-[#64748B] transition-colors"
          >
            {progressPercent === 100 ? 'Fechar' : 'Cancelar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
