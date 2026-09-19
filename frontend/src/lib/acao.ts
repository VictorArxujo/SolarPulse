import type { AcaoComando } from '../api/client';

export const ROTULO_ACAO: Record<AcaoComando, string> = { religar: 'Ligar', abrir: 'Desligar', reset: 'Reset' };

// Mesma cor semântica dos botões de comando (cmdBtnStyle): ligar = ok,
// desligar = perigo, reset = accent. O log usa a cor pra reconhecer a ação
// tão rápido quanto o operador reconhece o botão que apertou.
export const COR_ACAO: Record<AcaoComando, string> = {
  religar: 'var(--ok)',
  abrir: 'var(--danger)',
  reset: 'var(--accent)',
};
