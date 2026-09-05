import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  api,
  ApiError,
  type AcaoComando,
  type Equipamento,
  type EquipamentoConfig,
  type EquipamentoStatus,
  type TunelStatus,
  type Usina,
} from '../api/client';

interface RelePingState {
  loading: boolean;
  status?: EquipamentoStatus;
  erro?: string;
  verificadoAs?: string;
}

interface DigirailTesteState {
  loading: boolean;
  ok?: boolean;
  detalhe?: string;
  verificadoAs?: string;
}

interface AcaoResultado {
  sucesso: boolean;
  texto: string;
}

type Filtro = 'all' | 'online' | 'offline';

function agora() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

const ROTULO_ACAO: Record<AcaoComando, string> = { religar: 'Ligar', abrir: 'Desligar', reset: 'Reset' };

export default function Dashboard() {
  const { logout } = useAuth();

  const [usinas, setUsinas] = useState<Usina[]>([]);
  const [tunnelByUsina, setTunnelByUsina] = useState<Record<number, TunelStatus>>({});
  const [equipByUsina, setEquipByUsina] = useState<Record<number, Equipamento[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [expandidaId, setExpandidaId] = useState<number | null>(null);

  const [releByEquip, setReleByEquip] = useState<Record<number, RelePingState>>({});
  const [digirailByEquip, setDigirailByEquip] = useState<Record<number, DigirailTesteState>>({});
  const [resultadoByEquip, setResultadoByEquip] = useState<Record<number, AcaoResultado>>({});
  const [pendente, setPendente] = useState<{ equipamentoId: number; acao: AcaoComando; label: string } | null>(null);
  const [editando, setEditando] = useState<Equipamento | null>(null);

  async function carregarTudo() {
    setCarregando(true);
    setErro('');
    try {
      const listaUsinas = await api.listarUsinas();
      setUsinas(listaUsinas);

      const tunnelEntries = await Promise.all(
        listaUsinas.map(async (u) => [u.id, await api.statusTunel(u.id)] as const),
      );
      setTunnelByUsina(Object.fromEntries(tunnelEntries));

      const equipEntries = await Promise.all(
        listaUsinas.map(async (u) => [u.id, await api.listarEquipamentos(u.id)] as const),
      );
      setEquipByUsina(Object.fromEntries(equipEntries));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao carregar dados da API.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pingRele(equipamentoId: number) {
    setReleByEquip((prev) => ({ ...prev, [equipamentoId]: { loading: true } }));
    try {
      const status = await api.statusEquipamento(equipamentoId);
      setReleByEquip((prev) => ({ ...prev, [equipamentoId]: { loading: false, status, verificadoAs: agora() } }));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'falha de comunicação com a API.';
      setReleByEquip((prev) => ({ ...prev, [equipamentoId]: { loading: false, erro: msg, verificadoAs: agora() } }));
    }
  }

  async function testarDigirail(equipamentoId: number) {
    setDigirailByEquip((prev) => ({ ...prev, [equipamentoId]: { loading: true } }));
    try {
      const resultado = await api.testarDigirail(equipamentoId);
      setDigirailByEquip((prev) => ({
        ...prev,
        [equipamentoId]: { loading: false, ok: resultado.ok, detalhe: resultado.detalhe, verificadoAs: agora() },
      }));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'falha de comunicação com a API.';
      setDigirailByEquip((prev) => ({ ...prev, [equipamentoId]: { loading: false, ok: false, detalhe: msg, verificadoAs: agora() } }));
    }
  }

  function pedirConfirmacao(equipamentoId: number, acao: AcaoComando, equipNome: string) {
    setPendente({ equipamentoId, acao, label: `${ROTULO_ACAO[acao]} ${equipNome}` });
  }

  async function confirmar() {
    if (!pendente) return;
    const { equipamentoId, acao, label } = pendente;
    setPendente(null);
    try {
      const resultado = await api.enviarComando(equipamentoId, acao);
      if (resultado.sucesso) {
        setReleByEquip((prev) => ({
          ...prev,
          [equipamentoId]: {
            loading: false,
            verificadoAs: agora(),
            status: { equipamento_id: equipamentoId, online: true, fechado: acao === 'religar', detalhe: resultado.detalhe },
          },
        }));
      }
      setResultadoByEquip((prev) => ({
        ...prev,
        [equipamentoId]: {
          sucesso: resultado.sucesso,
          texto: resultado.sucesso ? `${label}: comando executado com sucesso.` : `${label}: falha — ${resultado.detalhe}`,
        },
      }));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'falha de comunicação com a API.';
      setResultadoByEquip((prev) => ({ ...prev, [equipamentoId]: { sucesso: false, texto: `${label}: falha — ${msg}` } }));
    }
  }

  async function salvarEdicao(equipamentoId: number, dados: EquipamentoConfig) {
    const atualizado = await api.editarEquipamento(equipamentoId, { ...dados, ativo: true });
    setEquipByUsina((prev) => ({
      ...prev,
      [atualizado.usina_id]: (prev[atualizado.usina_id] ?? []).map((e) => (e.id === atualizado.id ? atualizado : e)),
    }));
    setEditando(null);
  }

  const usinasFiltradas = useMemo(() => {
    return usinas.filter((u) => {
      const tunnel = tunnelByUsina[u.id];
      if (filtro === 'online' && !tunnel?.up) return false;
      if (filtro === 'offline' && tunnel?.up) return false;
      if (busca) {
        const alvo = `${u.nome} ${u.localizacao}`.toLowerCase();
        if (!alvo.includes(busca.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [usinas, tunnelByUsina, filtro, busca]);

  const onlineCount = usinas.filter((u) => tunnelByUsina[u.id]?.up).length;
  const offlineCount = usinas.length - onlineCount;

  const tabs: { key: Filtro; label: string }[] = [
    { key: 'all', label: `Todas (${usinas.length})` },
    { key: 'online', label: `Online (${onlineCount})` },
    { key: 'offline', label: `Offline (${offlineCount})` },
  ];

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#f5f6f8', color: '#1c2126' }}>
      <div
        style={{
          height: 56,
          borderBottom: '1px solid #e4e7ec',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          background: '#ffffff',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: '#eaf1ff', border: '1px solid #cfe0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2f6fe4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Religamento Remoto</div>
            <div style={{ fontSize: 10.5, color: '#7a8494', marginTop: 1 }}>Supervisão e comando via Modbus TCP</div>
          </div>
        </div>
        <button onClick={logout} style={{ fontSize: 12, color: '#57606f', background: 'none', border: 'none', cursor: 'pointer' }}>
          Sair
        </button>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '20px 24px 60px' }}>
        {erro && (
          <div style={{ marginBottom: 16, fontSize: 13, color: '#b3261e', background: '#fbeaea', border: '1px solid #f3caca', borderRadius: 6, padding: '10px 14px' }}>
            {erro}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar usina ou localização"
            style={{ height: 34, width: 260, padding: '0 12px', border: '1px solid #d7dbe3', borderRadius: 6, fontSize: 12.5, color: '#1c2126', background: '#fff' }}
          />
          <div style={{ marginLeft: 'auto', fontSize: 11.5, color: '#7a8494', fontFamily: "'IBM Plex Mono', monospace" }}>
            {carregando ? 'carregando…' : `${usinasFiltradas.length} usina(s)`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 22, borderBottom: '1px solid #e4e7ec', marginBottom: 14 }}>
          {tabs.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setFiltro(tab.key)}
              style={{
                cursor: 'pointer',
                padding: '10px 2px',
                fontSize: 13,
                fontWeight: 500,
                color: filtro === tab.key ? '#1c2126' : '#7a8494',
                borderBottom: `2px solid ${filtro === tab.key ? '#1c2126' : 'transparent'}`,
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {!carregando && usinasFiltradas.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: '#7a8494', background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8 }}>
            Nenhuma usina encontrada.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {usinasFiltradas.map((usina) => {
            const tunnel = tunnelByUsina[usina.id];
            const expandida = expandidaId === usina.id;
            const equipamentos = equipByUsina[usina.id] ?? [];

            return (
              <div key={usina.id} style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandidaId(expandida ? null : usina.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1c2126' }}>{usina.nome}</div>
                    <div style={{ fontSize: 11.5, color: '#7a8494', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {usina.localizacao || 'localização não informada'} · {equipamentos.length} equipamento(s)
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: tunnel?.up ? '#e9f7ef' : '#fbeaea' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: tunnel?.up ? '#1f8a57' : '#c23b3b' }} />
                      <span style={{ fontSize: 11, fontWeight: 500, color: tunnel?.up ? '#1f8a57' : '#b3261e' }}>
                        {tunnel?.up ? 'túnel ok' : 'túnel offline'}
                      </span>
                    </div>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#7a8494"
                      strokeWidth="2"
                      style={{ transition: 'transform .15s ease', transform: `rotate(${expandida ? 180 : 0}deg)` }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                {expandida && (
                  <div style={{ borderTop: '1px solid #eef0f3' }}>
                    {equipamentos.length === 0 && (
                      <div style={{ padding: '16px 18px', fontSize: 12.5, color: '#7a8494' }}>Nenhum equipamento cadastrado.</div>
                    )}
                    {equipamentos.map((equip) => {
                      const rele = releByEquip[equip.id];
                      const digirail = digirailByEquip[equip.id];
                      const resultado = resultadoByEquip[equip.id];
                      const releOnline = rele?.status?.online ?? false;
                      const fechado = rele?.status?.fechado ?? null;
                      const digirailOk = digirail?.ok ?? false;
                      const comandosLiberados = digirailOk;

                      return (
                        <div key={equip.id} style={{ padding: '14px 18px', borderBottom: '1px solid #f2f3f5', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1c2126' }}>{equip.nome}</div>
                              <div style={{ fontSize: 11, color: '#7a8494', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'capitalize' }}>
                                {equip.tipo}
                              </div>
                            </div>
                            <button onClick={() => setEditando(equip)} style={editBtnStyle}>
                              Editar parâmetros
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <fieldset style={deviceBoxStyle}>
                              <legend style={legendStyle}>Relé de proteção · {equip.modelo_rele}</legend>
                              <div style={{ fontSize: 11, color: '#7a8494', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
                                {equip.ip_rele || '—'}:{equip.porta_rele}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <button onClick={() => pingRele(equip.id)} disabled={rele?.loading} style={pingBtnStyle}>
                                  {rele?.loading ? 'Consultando…' : 'Ping'}
                                </button>
                                <span style={{ fontSize: 11.5 }}>
                                  {!rele && <span style={{ color: '#9aa2af' }}>ainda não consultado</span>}
                                  {rele?.erro && <span style={{ color: '#b3261e' }}>{rele.erro}</span>}
                                  {rele?.status && (
                                    <span style={{ color: releOnline ? '#1f8a57' : '#b3261e' }}>
                                      {releOnline ? (fechado === true ? 'fechado' : fechado === false ? 'aberto' : 'online') : 'sem resposta'}
                                      {rele.verificadoAs ? ` · ${rele.verificadoAs}` : ''}
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div style={{ fontSize: 10.5, color: '#b3812f', marginTop: 6 }}>Tensão: não implementado</div>
                            </fieldset>

                            <fieldset style={deviceBoxStyle}>
                              <legend style={legendStyle}>DigiRail</legend>
                              <div style={{ fontSize: 11, color: '#7a8494', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
                                {equip.ip_digirail || '—'}:{equip.porta_digirail}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <button onClick={() => testarDigirail(equip.id)} disabled={digirail?.loading} style={pingBtnStyle}>
                                  {digirail?.loading ? 'Testando…' : 'Testar'}
                                </button>
                                <span style={{ fontSize: 11.5 }}>
                                  {!digirail && <span style={{ color: '#9aa2af' }}>ainda não testado</span>}
                                  {digirail && (
                                    <span style={{ color: digirail.ok ? '#1f8a57' : '#b3261e' }}>
                                      {digirail.ok ? 'ok' : digirail.detalhe}
                                      {digirail.verificadoAs ? ` · ${digirail.verificadoAs}` : ''}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </fieldset>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              disabled={!comandosLiberados || fechado === true}
                              onClick={() => pedirConfirmacao(equip.id, 'religar', equip.nome)}
                              style={cmdBtnStyle('#1f8a57', !comandosLiberados || fechado === true)}
                            >
                              Ligar
                            </button>
                            <button
                              disabled={!comandosLiberados || fechado === false}
                              onClick={() => pedirConfirmacao(equip.id, 'abrir', equip.nome)}
                              style={cmdBtnStyle('#c23b3b', !comandosLiberados || fechado === false)}
                            >
                              Desligar
                            </button>
                            <button
                              disabled={!comandosLiberados}
                              onClick={() => pedirConfirmacao(equip.id, 'reset', equip.nome)}
                              style={cmdBtnStyle('#2f6fe4', !comandosLiberados)}
                            >
                              Reset
                            </button>
                            {!comandosLiberados && (
                              <span style={{ fontSize: 11, color: '#9aa2af' }}>teste o DigiRail antes de comandar</span>
                            )}
                          </div>

                          {resultado && (
                            <div style={{ fontSize: 11.5, color: resultado.sucesso ? '#1f8a57' : '#b3261e' }}>{resultado.texto}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {pendente && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,27,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <div style={{ width: 360, background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, padding: '22px 24px', boxShadow: '0 20px 48px rgba(20,22,27,0.18)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1c2126', marginBottom: 10 }}>Confirmação de segurança</div>
            <div style={{ fontSize: 13, color: '#57606f', lineHeight: 1.5, marginBottom: 20 }}>
              Você vai atuar fisicamente no equipamento. Confirmar o comando "{pendente.label}"?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPendente(null)} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: '#eef1f6', border: 'none', color: '#1c2126', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmar} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: '#2f6fe4', border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <EditarEquipamentoModal
          equipamento={editando}
          onCancelar={() => setEditando(null)}
          onSalvar={(dados) => salvarEdicao(editando.id, dados)}
        />
      )}
    </div>
  );
}

function EditarEquipamentoModal({
  equipamento,
  onCancelar,
  onSalvar,
}: {
  equipamento: Equipamento;
  onCancelar: () => void;
  onSalvar: (dados: EquipamentoConfig) => Promise<void>;
}) {
  const [form, setForm] = useState<EquipamentoConfig>({
    nome: equipamento.nome,
    tipo: equipamento.tipo,
    ip_rele: equipamento.ip_rele,
    porta_rele: equipamento.porta_rele,
    unit_id_rele: equipamento.unit_id_rele,
    modelo_rele: equipamento.modelo_rele,
    registrador_status: equipamento.registrador_status,
    ip_digirail: equipamento.ip_digirail,
    porta_digirail: equipamento.porta_digirail,
    unit_id_digirail: equipamento.unit_id_digirail,
    addr_ligar: equipamento.addr_ligar,
    addr_desligar: equipamento.addr_desligar,
    addr_reset: equipamento.addr_reset,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  function campo<K extends keyof EquipamentoConfig>(chave: K, valor: EquipamentoConfig[K]) {
    setForm((prev) => ({ ...prev, [chave]: valor }));
  }

  async function salvar() {
    setSalvando(true);
    setErro('');
    try {
      await onSalvar(form);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,27,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
      <div style={{ width: 480, maxHeight: '85vh', overflowY: 'auto', background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, padding: '22px 24px', boxShadow: '0 20px 48px rgba(20,22,27,0.18)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1c2126', marginBottom: 4 }}>Editar {equipamento.nome}</div>
        <div style={{ fontSize: 12, color: '#7a8494', marginBottom: 18 }}>
          Use quando trocar um relé/DigiRail em campo — endereço IP, porta e registradores mudam.
        </div>

        <Campo label="Nome">
          <input value={form.nome} onChange={(e) => campo('nome', e.target.value)} style={inputStyle} />
        </Campo>

        <Campo label="Tipo">
          <select value={form.tipo} onChange={(e) => campo('tipo', e.target.value as EquipamentoConfig['tipo'])} style={inputStyle}>
            <option value="disjuntor">Disjuntor</option>
            <option value="religador">Religador</option>
            <option value="outro">Outro</option>
          </select>
        </Campo>

        <SecaoTitulo>Relé de proteção</SecaoTitulo>
        <Campo label="Modelo">
          <select value={form.modelo_rele} onChange={(e) => campo('modelo_rele', e.target.value)} style={inputStyle}>
            <option value="URP 6100">URP 6100</option>
            <option value="URP 600X">URP 600X</option>
          </select>
        </Campo>
        <LinhaDupla>
          <Campo label="IP">
            <input value={form.ip_rele} onChange={(e) => campo('ip_rele', e.target.value)} style={inputStyle} />
          </Campo>
          <Campo label="Porta">
            <input type="number" value={form.porta_rele} onChange={(e) => campo('porta_rele', Number(e.target.value))} style={inputStyle} />
          </Campo>
        </LinhaDupla>
        <LinhaDupla>
          <Campo label="Unit ID">
            <input type="number" value={form.unit_id_rele} onChange={(e) => campo('unit_id_rele', Number(e.target.value))} style={inputStyle} />
          </Campo>
          <Campo label="Registrador status">
            <input type="number" value={form.registrador_status} onChange={(e) => campo('registrador_status', Number(e.target.value))} style={inputStyle} />
          </Campo>
        </LinhaDupla>

        <SecaoTitulo>DigiRail</SecaoTitulo>
        <LinhaDupla>
          <Campo label="IP">
            <input value={form.ip_digirail} onChange={(e) => campo('ip_digirail', e.target.value)} style={inputStyle} />
          </Campo>
          <Campo label="Porta">
            <input type="number" value={form.porta_digirail} onChange={(e) => campo('porta_digirail', Number(e.target.value))} style={inputStyle} />
          </Campo>
        </LinhaDupla>
        <Campo label="Unit ID">
          <input type="number" value={form.unit_id_digirail} onChange={(e) => campo('unit_id_digirail', Number(e.target.value))} style={inputStyle} />
        </Campo>
        <LinhaDupla>
          <Campo label="Endereço ligar">
            <input type="number" value={form.addr_ligar} onChange={(e) => campo('addr_ligar', Number(e.target.value))} style={inputStyle} />
          </Campo>
          <Campo label="Endereço desligar">
            <input type="number" value={form.addr_desligar} onChange={(e) => campo('addr_desligar', Number(e.target.value))} style={inputStyle} />
          </Campo>
        </LinhaDupla>
        <Campo label="Endereço reset">
          <input type="number" value={form.addr_reset} onChange={(e) => campo('addr_reset', Number(e.target.value))} style={inputStyle} />
        </Campo>

        {erro && <div style={{ fontSize: 12, color: '#b3261e', marginTop: 8 }}>{erro}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onCancelar} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: '#eef1f6', border: 'none', color: '#1c2126', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: '#2f6fe4', border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', opacity: salvando ? 0.7 : 1 }}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#7a8494', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function LinhaDupla({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}

function SecaoTitulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#57606f', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '16px 0 8px' }}>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid #d7dbe3',
  borderRadius: 5,
  fontSize: 12.5,
  color: '#1c2126',
  background: '#fff',
};

const pingBtnStyle: CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 5,
  background: '#eef1f6',
  color: '#1c2126',
  fontSize: 11,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
};

const editBtnStyle: CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 5,
  background: '#fff',
  color: '#2f6fe4',
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid #cfe0ff',
  cursor: 'pointer',
};

const deviceBoxStyle: CSSProperties = {
  flex: '1 1 220px',
  border: '1px solid #e4e7ec',
  borderRadius: 6,
  padding: '10px 12px 12px',
  margin: 0,
};

const legendStyle: CSSProperties = {
  padding: '0 4px',
  fontSize: 10.5,
  fontWeight: 600,
  color: '#57606f',
  letterSpacing: '0.02em',
};

function cmdBtnStyle(bg: string, disabled: boolean): CSSProperties {
  return {
    height: 30,
    padding: '0 12px',
    borderRadius: 5,
    background: bg,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
  };
}
