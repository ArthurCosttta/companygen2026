import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormulaV9Document } from '../schemas/formula-v9.schema';

const MAX_HISTORY_SNAPSHOTS = 25;

function cloneDocumentSnapshot<T>(doc: T): T {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(doc);
    }
  } catch {
    // fallback JSON clone
  }
  return JSON.parse(JSON.stringify(doc)) as T;
}

export function isTypingInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest('[contenteditable="true"]')) return true;
  return false;
}

interface HistoryStackState {
  snapshots: FormulaV9Document[];
  index: number;
}

export interface UseFormulaUndoHistoryOptions {
  enableKeyboardShortcuts?: boolean;
  onRestore?: (doc: FormulaV9Document) => void;
}

/**
 * Keeps up to 25 immutable snapshots of FormulaV9Document with Ctrl+Z / Ctrl+Y support,
 * using synchronous ref state + React mirror so Undo/Redo executes deterministically in 0ms
 * and ignores shortcuts while typing in INPUT / TEXTAREA / SELECT / contentEditable.
 */
export function useFormulaUndoHistory(
  initialDocument: FormulaV9Document,
  options: UseFormulaUndoHistoryOptions = {},
) {
  const { enableKeyboardShortcuts = true, onRestore } = options;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const historyRef = useRef<HistoryStackState>({
    snapshots: [cloneDocumentSnapshot(initialDocument)],
    index: 0,
  });

  const [history, setHistory] = useState<HistoryStackState>(() => historyRef.current);

  const commitState = useCallback((next: HistoryStackState) => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const current = history.snapshots[history.index] ?? initialDocument;
  const canUndo = history.index > 0;
  const canRedo = history.index < history.snapshots.length - 1;

  const push = useCallback(
    (nextDocument: FormulaV9Document) => {
      const frozen = cloneDocumentSnapshot(nextDocument);
      const prev = historyRef.current;
      const sliced = prev.snapshots.slice(0, prev.index + 1);
      const nextSnapshots = [...sliced, frozen];
      if (nextSnapshots.length > MAX_HISTORY_SNAPSHOTS) {
        nextSnapshots.splice(0, nextSnapshots.length - MAX_HISTORY_SNAPSHOTS);
      }
      commitState({
        snapshots: nextSnapshots,
        index: nextSnapshots.length - 1,
      });
    },
    [commitState],
  );

  const replaceCurrent = useCallback(
    (nextDocument: FormulaV9Document) => {
      const frozen = cloneDocumentSnapshot(nextDocument);
      const prev = historyRef.current;
      const copy = [...prev.snapshots];
      copy[prev.index] = frozen;
      commitState({
        ...prev,
        snapshots: copy,
      });
    },
    [commitState],
  );

  const reset = useCallback(
    (baseDocument: FormulaV9Document) => {
      commitState({
        snapshots: [cloneDocumentSnapshot(baseDocument)],
        index: 0,
      });
    },
    [commitState],
  );

  const undo = useCallback((): FormulaV9Document | null => {
    const prev = historyRef.current;
    if (prev.index <= 0) return null;
    const nextIndex = prev.index - 1;
    const restoredDoc = cloneDocumentSnapshot(prev.snapshots[nextIndex]);
    commitState({
      ...prev,
      index: nextIndex,
    });
    onRestoreRef.current?.(restoredDoc);
    return restoredDoc;
  }, [commitState]);

  const redo = useCallback((): FormulaV9Document | null => {
    const prev = historyRef.current;
    if (prev.index >= prev.snapshots.length - 1) return null;
    const nextIndex = prev.index + 1;
    const restoredDoc = cloneDocumentSnapshot(prev.snapshots[nextIndex]);
    commitState({
      ...prev,
      index: nextIndex,
    });
    onRestoreRef.current?.(restoredDoc);
    return restoredDoc;
  }, [commitState]);

  useEffect(() => {
    if (!enableKeyboardShortcuts || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const hasModifier = event.ctrlKey || event.metaKey;
      if (!hasModifier || event.altKey) return;

      // BUG-F04-05: Never hijack native browser Ctrl+Z / Ctrl+Y inside text inputs
      if (
        isTypingInteractiveTarget(event.target) ||
        isTypingInteractiveTarget(document.activeElement)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        if (historyRef.current.index <= 0) return;
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (historyRef.current.index >= historyRef.current.snapshots.length - 1) return;
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcuts, undo, redo]);

  return {
    current,
    push,
    replaceCurrent,
    reset,
    undo,
    redo,
    canUndo,
    canRedo,
    historySize: history.snapshots.length,
    historyIndex: history.index,
  };
}
