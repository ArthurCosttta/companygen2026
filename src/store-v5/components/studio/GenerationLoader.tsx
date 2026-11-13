import React, { useEffect, useState } from 'react';

export type GenerationLoaderProps = {
  promptText: string;
  storeName?: string;
  onComplete: () => void;
  durationMs?: number;
};

const STAGES = [
  { id: 'niche', label: 'Análise forense do nicho e proposta de valor', detail: 'Mapeando modelo de negócio e jornada do cliente' },
  { id: 'art', label: 'Direção de Arte: Paleta, tipografia e contraste', detail: 'Definindo atmosfera sensorial e arquétipo' },
  { id: 'media', label: 'Geração dos prompts de imagem fotográficos', detail: 'Projetando slots com transparência e proporções' },
  { id: 'genome', label: 'Compilação do genoma da loja (ProjectSpec V2)', detail: 'Montando seções, produtos, regras e WhatsApp' },
  { id: 'render', label: 'Renderização da interface viva no navegador', detail: 'Aplicando física visual e preparando eventos de clique' }
];

export const GenerationLoader: React.FC<GenerationLoaderProps> = ({
  promptText,
  storeName,
  onComplete,
  durationMs = 1800
}) => {
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    const stageDuration = durationMs / STAGES.length;

    const interval = setInterval(() => {
      setCurrentStageIdx(prev => {
        if (prev < STAGES.length - 1) {
          const next = prev + 1;
          setProgress(Math.round(((next + 1) / STAGES.length) * 100));
          return next;
        } else {
          clearInterval(interval);
          setProgress(100);
          setTimeout(() => {
            onComplete();
          }, 350);
          return prev;
        }
      });
    }, stageDuration);

    return () => clearInterval(interval);
  }, [durationMs, onComplete]);

  return (
    <div className="generation-loader-overlay" role="status" aria-live="polite">
      <div className="generation-loader-card">
        {/* Header com Aura de IA */}
        <div className="generation-loader-head">
          <div className="ai-pulse-orb">
            <span className="ai-core">✦</span>
          </div>
          <div>
            <h3>Criando Loja com IA</h3>
            <p>{storeName ? `Projeto: ${storeName}` : 'Compilando nova experiência visual...'}</p>
          </div>
        </div>

        {/* Prompt do Usuário em Destaque */}
        {promptText && (
          <div className="generation-prompt-quote">
            <span className="quote-icon">“</span>
            <p>{promptText}</p>
          </div>
        )}

        {/* Barra de Progresso Viva */}
        <div className="generation-progress-wrap">
          <div className="generation-progress-bar">
            <div
              className="generation-progress-fill"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="generation-progress-meta">
            <span>{STAGES[currentStageIdx].label}</span>
            <strong>{progress}%</strong>
          </div>
        </div>

        {/* Checklist de Etapas Concluídas em Tempo Real */}
        <div className="generation-stages-list">
          {STAGES.map((st, idx) => {
            const isDone = idx < currentStageIdx;
            const isCurrent = idx === currentStageIdx;
            return (
              <div
                key={st.id}
                className={`generation-stage-item ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-active' : ''}`}
              >
                <div className="stage-status-icon">
                  {isDone ? (
                    <span className="icon-check">✓</span>
                  ) : isCurrent ? (
                    <span className="icon-pulse">●</span>
                  ) : (
                    <span className="icon-pending">○</span>
                  )}
                </div>
                <div className="stage-info">
                  <strong>{st.label}</strong>
                  <small>{st.detail}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
