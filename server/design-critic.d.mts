export interface DesignCriticTip {
  id: string;
  severity: 'warning' | 'info';
  title: string;
  message: string;
  actionType?: string;
}

export function runDesignCritic(
  profile?: object,
  formulaIr?: object,
): DesignCriticTip[];
