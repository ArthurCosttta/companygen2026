export type HumanErrorVariant = 'warning' | 'error' | 'offline';

export interface HumanErrorInfo {
  status: number;
  title: string;
  message: string;
  actionLabel: string;
  variant: HumanErrorVariant;
}

export function resolveHumanError(input: {
  status?: number;
  code?: string;
  isOffline?: boolean;
  fallbackMessage?: string;
}): HumanErrorInfo {
  if (input.isOffline || input.status === 0 || input.code === 'OFFLINE') {
    return {
      status: 0,
      title: 'Sem conexão no momento',
      message: 'Sua conexão oscilou. Seus dados continuam salvos aqui — tente novamente quando o sinal voltar.',
      actionLabel: 'Tentar novamente',
      variant: 'offline',
    };
  }

  switch (input.status) {
    case 402:
      return {
        status: 402,
        title: 'Saldo de créditos insuficiente',
        message: 'Seus créditos de IA terminaram para esta ação. Faça uma recarga rápida para continuar sem pausas.',
        actionLabel: 'Recarregar Créditos',
        variant: 'warning',
      };
    case 409:
      return {
        status: 409,
        title: 'Alteração mais recente detectada',
        message: 'Outra janela ou dispositivo salvou mudanças há poucos segundos. Atualize para evitar sobrescrever seus dados.',
        actionLabel: 'Atualizar Dados',
        variant: 'warning',
      };
    case 422:
      return {
        status: 422,
        title: 'Revise os campos antes de salvar',
        message: 'Encontramos informações obrigatórias incompletas ou inválidas. Confira os campos destacados e tente novamente.',
        actionLabel: 'Revisar Campos',
        variant: 'warning',
      };
    case 429:
      return {
        status: 429,
        title: 'Muitas tentativas em sequência',
        message: 'Aguarde alguns segundos antes de repetir essa ação para proteger sua conta.',
        actionLabel: 'Aguardar e Tentar',
        variant: 'warning',
      };
    case 503:
      return {
        status: 503,
        title: 'Serviço em manutenção temporária',
        message: 'Nossos servidores de IA estão ocupados no momento. Tente novamente em instantes.',
        actionLabel: 'Tentar novamente',
        variant: 'error',
      };
    default:
      return {
        status: input.status ?? 500,
        title: 'Não foi possível concluir agora',
        message:
          input.fallbackMessage ||
          'Algo inesperado interrompeu essa ação. Seus dados estão seguros — tente novamente.',
        actionLabel: 'Tentar novamente',
        variant: 'error',
      };
  }
}
