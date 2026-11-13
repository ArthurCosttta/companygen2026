export type ActionId =
  | 'search.open'
  | 'search.query'
  | 'search.selectProduct'
  | 'product.open'
  | 'product.selectVariant'
  | 'quantity.change'
  | 'kit.selectSlot'
  | 'kit.selectProduct'
  | 'cart.open'
  | 'cart.add'
  | 'cart.update'
  | 'cart.remove'
  | 'cart.review'
  | 'cart.close'
  | 'whatsapp.open'
  | 'booking.review';

export const registeredActions: readonly ActionId[] = [
  'search.open',
  'search.query',
  'search.selectProduct',
  'product.open',
  'product.selectVariant',
  'quantity.change',
  'kit.selectSlot',
  'kit.selectProduct',
  'cart.open',
  'cart.add',
  'cart.update',
  'cart.remove',
  'cart.review',
  'cart.close',
  'whatsapp.open',
  'booking.review'
] as const;

export type ActionEvent<T = Record<string, unknown>> = {
  componentId: string;
  actionId: ActionId;
  source?: string;
  payload?: T;
  timestamp?: number;
};

export type ActionHandler<T = any> = (event: ActionEvent<T>) => void | Promise<void>;

/**
 * Dispatcher central de ações tipadas com guardas contra cliques duplicados
 * e validação de payload.
 */
export class ActionDispatcher {
  private handlers = new Map<ActionId, Set<ActionHandler>>();
  private lastDispatches = new Map<string, number>();
  private duplicateGuardWindowMs = 250;

  constructor(guardWindowMs = 250) {
    this.duplicateGuardWindowMs = guardWindowMs;
  }

  public subscribe<T = any>(actionId: ActionId, handler: ActionHandler<T>): () => void {
    if (!registeredActions.includes(actionId)) {
      throw new Error(`ActionId '${actionId}' não registrado.`);
    }
    if (!this.handlers.has(actionId)) {
      this.handlers.set(actionId, new Set());
    }
    this.handlers.get(actionId)!.add(handler);
    return () => this.handlers.get(actionId)?.delete(handler);
  }

  public dispatch<T = any>(event: ActionEvent<T>, guardDuplicate = true): boolean {
    if (!registeredActions.includes(event.actionId)) {
      console.warn(`[ActionDispatcher] Ação desconhecida: ${event.actionId}`);
      return false;
    }

    const now = Date.now();
    const eventKey = `${event.componentId}:${event.actionId}:${JSON.stringify(event.payload || {})}`;

    if (guardDuplicate) {
      const last = this.lastDispatches.get(eventKey) || 0;
      if (now - last < this.duplicateGuardWindowMs) {
        return false; // bloqueado por guarda de duplicidade
      }
      this.lastDispatches.set(eventKey, now);
    }

    const eventWithTimestamp: ActionEvent<T> = {
      ...event,
      timestamp: now
    };

    const listeners = this.handlers.get(event.actionId);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        try {
          listener(eventWithTimestamp);
        } catch (e) {
          console.error(`[ActionDispatcher] Erro ao executar handler de ${event.actionId}:`, e);
        }
      }
    }

    return true;
  }

  public clearHistory(): void {
    this.lastDispatches.clear();
  }
}

export const defaultDispatcher = new ActionDispatcher();
