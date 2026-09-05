const BASE = '/api/v1';

let authToken: string | null = localStorage.getItem('token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export function getToken() {
  return authToken;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // resposta sem corpo JSON, mantém statusText
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Usina {
  id: number;
  nome: string;
  localizacao: string;
  wg_interface: string;
  subnet_cidr: string;
  ativo: boolean;
}

export interface TunelStatus {
  wg_interface: string;
  up: boolean;
  ultimo_handshake_segundos: number | null;
  detalhe: string;
}

export type TipoEquipamento = 'religador' | 'disjuntor' | 'outro';

export interface EquipamentoConfig {
  nome: string;
  tipo: TipoEquipamento;

  ip_rele: string;
  porta_rele: number;
  unit_id_rele: number;
  modelo_rele: string;
  registrador_status: number;

  ip_digirail: string;
  porta_digirail: number;
  unit_id_digirail: number;
  addr_ligar: number;
  addr_desligar: number;
  addr_reset: number;
}

export interface Equipamento extends EquipamentoConfig {
  id: number;
  usina_id: number;
  ativo: boolean;
}

export interface EquipamentoStatus {
  equipamento_id: number;
  online: boolean;
  fechado: boolean | null;
  detalhe: string;
}

export interface DigirailTeste {
  equipamento_id: number;
  ok: boolean;
  detalhe: string;
}

export type AcaoComando = 'religar' | 'abrir' | 'reset';

export interface ComandoResultado {
  equipamento_id: number;
  acao: AcaoComando;
  sucesso: boolean;
  detalhe: string;
}

export const api = {
  async login(email: string, senha: string): Promise<string> {
    const body = new URLSearchParams({ username: email, password: senha });
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      let detail = 'Email ou senha incorretos';
      try {
        detail = (await res.json()).detail ?? detail;
      } catch {
        // ignora corpo inválido
      }
      throw new ApiError(res.status, detail);
    }
    const data = await res.json();
    return data.access_token as string;
  },

  listarUsinas: () => request<Usina[]>('/usinas'),
  statusTunel: (usinaId: number) => request<TunelStatus>(`/usinas/${usinaId}/tunnel/status`),
  listarEquipamentos: (usinaId: number) => request<Equipamento[]>(`/usinas/${usinaId}/equipamentos`),
  statusEquipamento: (equipamentoId: number) =>
    request<EquipamentoStatus>(`/equipamentos/${equipamentoId}/status`),
  testarDigirail: (equipamentoId: number) =>
    request<DigirailTeste>(`/equipamentos/${equipamentoId}/digirail/teste`, { method: 'POST' }),
  editarEquipamento: (equipamentoId: number, dados: EquipamentoConfig & { ativo: boolean }) =>
    request<Equipamento>(`/equipamentos/${equipamentoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    }),
  enviarComando: (equipamentoId: number, acao: AcaoComando) =>
    request<ComandoResultado>(`/equipamentos/${equipamentoId}/comando`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao }),
    }),
};

export { ApiError };
