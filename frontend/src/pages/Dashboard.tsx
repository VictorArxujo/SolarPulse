import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  api,
  ApiError,
  type AcaoComando,
  type Equipamento,
  type EquipamentoConfig,
  type EquipamentoStatus,
  type ModeloRele,
  type TunelStatus,
  type Usina,
  type UsinaConfig,
} from '../api/client';
import AnelProntidao from '../components/AnelProntidao';
import PainelLogComandos from '../components/PainelLogComandos';
import Sidebar, { type Visao } from '../components/Sidebar';
import { useTema } from '../hooks/useTema';
import { ROTULO_ACAO } from '../lib/acao';

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

// Símbolo de disjuntor em estilo diagrama unifilar: terminais fixos, lâmina
// reta quando fechado (circuito contínuo) e afastada quando aberto — o
// mesmo traço que aparece nas telas de sala de controle e nos catálogos
// dos próprios relés Pextron, em vez de um texto colorido genérico.
function GlifoDisjuntor({ fechado }: { fechado: boolean | null }) {
  const cor = fechado == null ? 'var(--text-3)' : fechado ? 'var(--ok)' : 'var(--danger)';
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
      <circle cx="3" cy="7" r="2" fill={cor} />
      <circle cx="19" cy="7" r="2" fill={cor} />
      {fechado === false ? (
        <line x1="5" y1="7" x2="14" y2="2" stroke={cor} strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <line x1="5" y1="7" x2="17" y2="7" stroke={cor} strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function Dashboard() {
  const { logout } = useAuth();

  const [visao, setVisao] = useState<Visao>('frota');
  const [logGatilho, setLogGatilho] = useState(0);
  const { tema, alternar: alternarTema } = useTema();

  const [horaAtual, setHoraAtual] = useState(() => agora());
  useEffect(() => {
    const id = setInterval(() => setHoraAtual(agora()), 1000);
    return () => clearInterval(id);
  }, []);

  const [usinas, setUsinas] = useState<Usina[]>([]);
  const [modelos, setModelos] = useState<ModeloRele[]>([]);
  const [tunnelByUsina, setTunnelByUsina] = useState<Record<number, TunelStatus>>({});
  const [equipByUsina, setEquipByUsina] = useState<Record<number, Equipamento[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [expandidaId, setExpandidaId] = useState<number | null>(null);

  const [releByEquip, setReleByEquip] = useState<Record<number, RelePingState>>({});
  const [digirailByEquip, setDigirailByEquip] = useState<Record<number, DigirailTesteState>>({});
  const [icmpByChave, setIcmpByChave] = useState<Record<string, { loading: boolean; linhas: string[] }>>({});
  const [resultadoByEquip, setResultadoByEquip] = useState<Record<number, AcaoResultado>>({});
  const [pendente, setPendente] = useState<{ equipamentoId: number; acao: AcaoComando; label: string } | null>(null);
  const [verificandoFrota, setVerificandoFrota] = useState(false);
  const [frotaVerificadaAs, setFrotaVerificadaAs] = useState<string | null>(null);
  const [editando, setEditando] = useState<Equipamento | null>(null);
  const [criandoEquipEmUsina, setCriandoEquipEmUsina] = useState<number | null>(null);
  const [criandoUsina, setCriandoUsina] = useState(false);

  async function carregarTudo() {
    setCarregando(true);
    setErro('');
    try {
      const listaUsinas = await api.listarUsinas();
      setUsinas(listaUsinas);
      setModelos(await api.listarModelosRele());

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

  // "Operável" no cadastro só significa "tem endereço de DigiRail e está
  // ativo" — isso não prova que o DigiRail responde agora. Esta função é a
  // única forma de saber de verdade: testa o DigiRail de cada equipamento em
  // paralelo, um por um (o mesmo teste que o botão "Testar" já faz), e só
  // então a prontidão da frota passa a refletir status real em vez de
  // cadastro. Não roda sozinha — dispara tráfego Modbus de verdade pras
  // usinas, inclusive as em produção.
  async function verificarFrota() {
    const alvo = todosEquipamentos.filter((e) => e.ativo && e.ip_digirail);
    if (alvo.length === 0) {
      setFrotaVerificadaAs(agora());
      return;
    }
    setVerificandoFrota(true);
    setDigirailByEquip((prev) => {
      const next = { ...prev };
      for (const e of alvo) next[e.id] = { loading: true };
      return next;
    });
    const resultados = await Promise.allSettled(alvo.map((e) => api.testarDigirail(e.id)));
    setDigirailByEquip((prev) => {
      const next = { ...prev };
      resultados.forEach((resultado, i) => {
        const equipId = alvo[i].id;
        next[equipId] =
          resultado.status === 'fulfilled'
            ? { loading: false, ok: resultado.value.ok, detalhe: resultado.value.detalhe, verificadoAs: agora() }
            : { loading: false, ok: false, detalhe: 'falha de comunicação com a API.', verificadoAs: agora() };
      });
      return next;
    });
    setFrotaVerificadaAs(agora());
    setVerificandoFrota(false);
  }

  // Antes da primeira verificação, "pronto" é só o que está cadastrado
  // (ativo + endereço de DigiRail); depois, passa a ser quem respondeu.
  function contarOperaveis(equipamentos: Equipamento[]) {
    const configurados = equipamentos.filter((e) => e.ativo && e.ip_digirail);
    if (!frotaVerificadaAs) return configurados.length;
    return configurados.filter((e) => digirailByEquip[e.id]?.ok).length;
  }

  function pingIcmp(equipamentoId: number, alvo: 'rele' | 'digirail') {
    const chave = `${equipamentoId}:${alvo}`;
    setIcmpByChave((prev) => ({ ...prev, [chave]: { loading: true, linhas: [] } }));
    api
      .pingIcmp(equipamentoId, alvo, (linha) => {
        setIcmpByChave((prev) => ({ ...prev, [chave]: { loading: true, linhas: [...prev[chave].linhas, linha] } }));
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : 'falha ao executar o ping.';
        setIcmpByChave((prev) => ({ ...prev, [chave]: { loading: false, linhas: [...(prev[chave]?.linhas ?? []), `erro: ${msg}`] } }));
      })
      .finally(() => {
        setIcmpByChave((prev) => ({ ...prev, [chave]: { ...prev[chave], loading: false } }));
      });
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
    } finally {
      setLogGatilho((n) => n + 1);
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

  async function criarEquipamento(usinaId: number, dados: EquipamentoConfig) {
    const criado = await api.criarEquipamento(usinaId, dados);
    setEquipByUsina((prev) => ({ ...prev, [usinaId]: [...(prev[usinaId] ?? []), criado] }));
    setCriandoEquipEmUsina(null);
  }

  async function criarUsina(dados: UsinaConfig) {
    const criada = await api.criarUsina(dados);
    setUsinas((prev) => [...prev, criada]);
    setTunnelByUsina((prev) => ({ ...prev, [criada.id]: { wg_interface: '', up: false, ultimo_handshake_segundos: null, detalhe: 'ainda não consultado' } }));
    setEquipByUsina((prev) => ({ ...prev, [criada.id]: [] }));
    setCriandoUsina(false);
  }

  async function criarModelo(nome: string): Promise<ModeloRele> {
    const criado = await api.criarModeloRele({ nome, fabricante: 'Pextron' });
    setModelos((prev) => [...prev, criado]);
    return criado;
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

  const usinaAberta = usinas.find((u) => u.id === expandidaId) ?? null;
  const equipamentosAbertos = usinaAberta ? equipByUsina[usinaAberta.id] ?? [] : [];

  const todosEquipamentos = usinas.flatMap((u) => equipByUsina[u.id] ?? []);
  const operaveisTotal = contarOperaveis(todosEquipamentos);

  const resumo = [
    { rotulo: 'Usinas', valor: String(usinas.length) },
    { rotulo: 'Túneis online', valor: String(onlineCount), sufixo: `de ${usinas.length}` },
    { rotulo: 'Equipamentos', valor: String(todosEquipamentos.length) },
  ];

  const prontidaoGeral = todosEquipamentos.length ? operaveisTotal / todosEquipamentos.length : 0;
  const tomGeral =
    todosEquipamentos.length === 0
      ? 'var(--text-3)'
      : prontidaoGeral === 1
        ? 'var(--ok)'
        : prontidaoGeral > 0
          ? 'var(--warn)'
          : 'var(--danger)';
  const trilhoGeral =
    todosEquipamentos.length === 0
      ? 'var(--divider)'
      : prontidaoGeral === 1
        ? 'var(--ok-soft)'
        : prontidaoGeral > 0
          ? 'var(--warn-soft)'
          : 'var(--danger-soft)';

  const tabs: { key: Filtro; label: string }[] = [
    { key: 'all', label: `Todas (${usinas.length})` },
    { key: 'online', label: `Online (${onlineCount})` },
    { key: 'offline', label: `Offline (${offlineCount})` },
  ];

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: 'var(--bg)', color: 'var(--text)', display: 'flex' }}>
      <svg width="100%" height="100%" style={{ position: 'fixed', inset: 0, opacity: 0.06, pointerEvents: 'none' }} preserveAspectRatio="none">
        <defs>
          <pattern id="grid-dash" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--grid)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-dash)" />
      </svg>

      <Sidebar visao={visao} onVisao={setVisao} horaAtual={horaAtual} onLogout={logout} tema={tema} onAlternarTema={alternarTema} />

      <div className="conteudo-principal" style={{ flex: 1, minWidth: 0, maxWidth: 1240, margin: '0 auto', position: 'relative' }}>
        {erro && (
          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 6, padding: '10px 14px' }}>
            {erro}
          </div>
        )}

        {visao === 'log' && <PainelLogComandos usinas={usinas} gatilhoAtualizacao={logGatilho} />}

        {visao === 'frota' && (
        <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar usina ou localização"
            style={{ height: 34, width: 'min(260px, 100%)', padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface-3)' }}
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {carregando ? 'carregando…' : `${usinasFiltradas.length} usina(s)`}
          </div>
          <button onClick={() => setCriandoUsina(true)} style={{ ...editBtnStyle, marginLeft: 'auto' }}>
            + Nova usina
          </button>
        </div>

        {/* Hero: um único elemento com peso visual de verdade — o anel de
            prontidão da frota — ladeado pelos números de apoio, em vez de
            quatro números idênticos competindo pela mesma atenção. */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '18px 26px 18px 22px',
            }}
          >
            <AnelProntidao valor={prontidaoGeral} cor={tomGeral} trilho={trilhoGeral} tamanho={92} espessura={8}>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {Math.round(prontidaoGeral * 100)}%
              </span>
            </AnelProntidao>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Prontidão da frota</div>
              <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, marginTop: 4 }}>
                {operaveisTotal} de {todosEquipamentos.length} {frotaVerificadaAs ? 'respondendo agora' : 'com DigiRail cadastrado'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {frotaVerificadaAs ? `verificado às ${frotaVerificadaAs}` : 'cadastro, não testado — clique em verificar'}
              </div>
              <button onClick={verificarFrota} disabled={verificandoFrota || todosEquipamentos.length === 0} style={{ ...editBtnStyle, marginTop: 8 }}>
                {verificandoFrota ? `Testando ${todosEquipamentos.filter((e) => e.ativo && e.ip_digirail).length} DigiRail…` : 'Verificar frota'}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 240, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--divider)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {resumo.map((item) => (
              <div key={item.rotulo} style={{ background: 'var(--surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{item.rotulo}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 25, fontWeight: 600, lineHeight: 1 }}>{item.valor}</span>
                  {item.sufixo && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{item.sufixo}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 22, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
          {tabs.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setFiltro(tab.key)}
              style={{
                cursor: 'pointer',
                padding: '10px 2px',
                fontSize: 13,
                fontWeight: 500,
                color: filtro === tab.key ? 'var(--text)' : 'var(--text-2)',
                borderBottom: `2px solid ${filtro === tab.key ? 'var(--text)' : 'transparent'}`,
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {!carregando && usinasFiltradas.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            Nenhuma usina encontrada.
          </div>
        )}

        <div className="grade-usinas" style={{ display: 'grid', gap: 14, alignItems: 'start' }}>
          {usinasFiltradas.map((usina) => {
            const tunnel = tunnelByUsina[usina.id];
            const equipamentos = equipByUsina[usina.id] ?? [];
            const operaveis = contarOperaveis(equipamentos);
            const prontidao = equipamentos.length ? operaveis / equipamentos.length : 0;
            const selecionada = expandidaId === usina.id;

            // O medidor carrega severidade: tudo pronto, parcial ou nada.
            const tom =
              equipamentos.length === 0
                ? 'var(--text-3)'
                : prontidao === 1
                  ? 'var(--ok)'
                  : prontidao > 0
                    ? 'var(--warn)'
                    : 'var(--danger)';
            // Trilho = passo claro do mesmo tom, nunca cinza neutro.
            const trilho =
              equipamentos.length === 0
                ? 'var(--divider)'
                : prontidao === 1
                  ? 'var(--ok-soft)'
                  : prontidao > 0
                    ? 'var(--warn-soft)'
                    : 'var(--danger-soft)';

            const metricas = [
              { rotulo: 'Equipamentos', valor: String(equipamentos.length) },
              { rotulo: 'Operáveis', valor: String(operaveis) },
              {
                rotulo: 'Handshake',
                valor: tunnel?.ultimo_handshake_segundos != null ? `${tunnel.ultimo_handshake_segundos}s` : '—',
              },
            ];

            return (
              <button
                key={usina.id}
                type="button"
                className="card-usina"
                aria-pressed={selecionada}
                onClick={() => setExpandidaId(selecionada ? null : usina.id)}
              >
                {/* trilho de estado do túnel — lê como a coluna de LED de um
                    painel de relé de campo, não uma faixa decorativa */}
                <span
                  className={`rail${tunnel?.up ? ' led-on' : ''}`}
                  style={{ background: tunnel?.up ? 'var(--ok)' : 'var(--danger)', boxShadow: tunnel?.up ? '0 0 8px var(--ok)' : 'none' }}
                />

                <div style={{ flex: 1, minWidth: 0, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" />
                      </svg>
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {usina.nome}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {usina.localizacao || 'Localização não informada'}
                      </div>
                    </div>
                    {/* estado nunca sai só na cor: LED + rótulo */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 4, flexShrink: 0, background: tunnel?.up ? 'var(--ok-soft)' : 'var(--danger-soft)' }}>
                      <span
                        className={tunnel?.up ? 'led-on' : undefined}
                        style={{ width: 5, height: 5, borderRadius: 999, background: tunnel?.up ? 'var(--ok)' : 'var(--danger)', boxShadow: tunnel?.up ? '0 0 5px var(--ok)' : 'none' }}
                      />
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: tunnel?.up ? 'var(--ok)' : 'var(--danger)' }}>
                        {tunnel?.up ? 'Online' : 'Offline'}
                      </span>
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--divider)', borderRadius: 6, overflow: 'hidden' }}>
                    {metricas.map((m) => (
                      <div key={m.rotulo} style={{ background: 'var(--surface)', padding: '9px 10px' }}>
                        <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.1 }}>{m.valor}</div>
                        <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 3 }}>
                          {m.rotulo}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 10.5, color: 'var(--text-3)', marginBottom: 5 }}>
                      <span>{frotaVerificadaAs ? 'Prontidão verificada' : 'Prontidão (cadastro, não testado)'}</span>
                      <span style={{ color: tom, fontWeight: 600 }}>{Math.round(prontidao * 100)}%</span>
                    </div>
                    <div className="medidor" style={{ background: trilho }}>
                      <i style={{ width: `${prontidao * 100}%`, background: tom }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 11, borderTop: '1px solid var(--divider)' }}>
                    <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: "'IBM Plex Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {usina.subnet_cidr || 'sem sub-rede'}
                    </span>
                    {/* seta em SVG: glifo de texto vira tofu quando a fonte não carrega */}
                    <span className="card-seta" style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                      {selecionada ? 'Fechar' : 'Abrir'}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {usinaAberta && (
          <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--accent-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{usinaAberta.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {equipamentosAbertos.length} equipamento(s) · {usinaAberta.subnet_cidr || 'sem sub-rede'} ·{' '}
                  {usinaAberta.wg_public_key ? 'peer por chave pública' : 'peer pela sub-rede'}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => setCriandoEquipEmUsina(usinaAberta.id)} style={editBtnStyle}>
                  + Novo equipamento
                </button>
                <button onClick={() => setExpandidaId(null)} style={pingBtnStyle}>
                  Fechar
                </button>
              </div>
            </div>

            {equipamentosAbertos.length === 0 && (
              <div style={{ padding: '16px 18px', fontSize: 12.5, color: 'var(--text-2)' }}>Nenhum equipamento cadastrado.</div>
            )}
          {equipamentosAbertos.map((equip) => {
            const rele = releByEquip[equip.id];
            const digirail = digirailByEquip[equip.id];
            const resultado = resultadoByEquip[equip.id];
            const releOnline = rele?.status?.online ?? false;
            const fechado = rele?.status?.fechado ?? null;
            const digirailOk = digirail?.ok ?? false;
            const comandosLiberados = digirailOk;

            return (
              <div key={equip.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{equip.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'capitalize' }}>
                      {equip.tipo}
                    </div>
                  </div>
                  <button onClick={() => setEditando(equip)} style={editBtnStyle}>
                    Editar parâmetros
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <fieldset style={deviceBoxStyle}>
                    <legend style={legendStyle}>Relé de proteção · {equip.modelo_rele.nome}</legend>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
                      {equip.ip_rele || '—'}:{equip.porta_rele}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => pingRele(equip.id)} disabled={rele?.loading} style={pingBtnStyle}>
                        {rele?.loading ? 'Consultando…' : 'Status'}
                      </button>
                      <span style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {!rele && <span style={{ color: 'var(--text-3)' }}>ainda não consultado</span>}
                        {rele?.erro && <span style={{ color: 'var(--danger)' }}>{rele.erro}</span>}
                        {rele?.status && (
                          <>
                            {releOnline && fechado !== null && <GlifoDisjuntor fechado={fechado} />}
                            <span style={{ color: releOnline ? 'var(--ok)' : 'var(--danger)' }}>
                              {releOnline ? (fechado === true ? 'fechado' : fechado === false ? 'aberto' : 'online') : 'sem resposta'}
                              {rele.verificadoAs ? ` · ${rele.verificadoAs}` : ''}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--warn)', marginTop: 6 }}>Tensão: não implementado</div>
                    <PingIcmpBox
                      estado={icmpByChave[`${equip.id}:rele`]}
                      onPing={() => pingIcmp(equip.id, 'rele')}
                    />
                  </fieldset>

                  <fieldset style={deviceBoxStyle}>
                    <legend style={legendStyle}>DigiRail</legend>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
                      {equip.ip_digirail || '—'}:{equip.porta_digirail}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => testarDigirail(equip.id)} disabled={digirail?.loading} style={pingBtnStyle}>
                        {digirail?.loading ? 'Testando…' : 'Testar'}
                      </button>
                      <span style={{ fontSize: 11.5 }}>
                        {!digirail && <span style={{ color: 'var(--text-3)' }}>ainda não testado</span>}
                        {digirail && (
                          <span style={{ color: digirail.ok ? 'var(--ok)' : 'var(--danger)' }}>
                            {digirail.ok ? 'ok' : digirail.detalhe}
                            {digirail.verificadoAs ? ` · ${digirail.verificadoAs}` : ''}
                          </span>
                        )}
                      </span>
                    </div>
                    <PingIcmpBox
                      estado={icmpByChave[`${equip.id}:digirail`]}
                      onPing={() => pingIcmp(equip.id, 'digirail')}
                    />
                  </fieldset>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    disabled={!comandosLiberados || fechado === true}
                    onClick={() => pedirConfirmacao(equip.id, 'religar', equip.nome)}
                    style={cmdBtnStyle('var(--btn-ok)', !comandosLiberados || fechado === true)}
                  >
                    Ligar
                  </button>
                  <button
                    disabled={!comandosLiberados || fechado === false}
                    onClick={() => pedirConfirmacao(equip.id, 'abrir', equip.nome)}
                    style={cmdBtnStyle('var(--btn-danger)', !comandosLiberados || fechado === false)}
                  >
                    Desligar
                  </button>
                  <button
                    disabled={!comandosLiberados}
                    onClick={() => pedirConfirmacao(equip.id, 'reset', equip.nome)}
                    style={cmdBtnStyle('var(--btn-accent)', !comandosLiberados)}
                  >
                    Reset
                  </button>
                  {!comandosLiberados && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>teste o DigiRail antes de comandar</span>
                  )}
                </div>

                {resultado && (
                  <div style={{ fontSize: 11.5, color: resultado.sucesso ? 'var(--ok)' : 'var(--danger)' }}>{resultado.texto}</div>
                )}
              </div>
            );
          })}
          </div>
        )}
        </>
        )}
      </div>

      {pendente && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <div className="modal-caixa" style={{ width: 360, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '22px 24px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Confirmação de segurança</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 20 }}>
              Você vai atuar fisicamente no equipamento. Confirmar o comando "{pendente.label}"?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPendente(null)} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: 'var(--surface-2)', border: 'none', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmar} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: 'var(--btn-accent)', border: 'none', color: 'var(--btn-text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <EditarEquipamentoModal
          equipamento={editando}
          modelos={modelos}
          onCriarModelo={criarModelo}
          onCancelar={() => setEditando(null)}
          onSalvar={(dados) => salvarEdicao(editando.id, dados)}
        />
      )}

      {criandoEquipEmUsina !== null && (
        <EditarEquipamentoModal
          modelos={modelos}
          onCriarModelo={criarModelo}
          onCancelar={() => setCriandoEquipEmUsina(null)}
          onSalvar={(dados) => criarEquipamento(criandoEquipEmUsina, dados)}
        />
      )}

      {criandoUsina && <NovaUsinaModal onCancelar={() => setCriandoUsina(false)} onSalvar={criarUsina} />}
    </div>
  );
}

function NovaUsinaModal({
  onCancelar,
  onSalvar,
}: {
  onCancelar: () => void;
  onSalvar: (dados: UsinaConfig) => Promise<void>;
}) {
  const [form, setForm] = useState<UsinaConfig>({ nome: '', localizacao: '', subnet_cidr: '', wg_public_key: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  function campo<K extends keyof UsinaConfig>(chave: K, valor: UsinaConfig[K]) {
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
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
      <div className="modal-caixa" style={{ width: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '22px 24px', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Nova usina</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 18 }}>
          Depois de criar, adicione o peer correspondente no WireGuard e reinicie o container pra ela ficar acessível.
        </div>

        <Campo label="Nome">
          <input value={form.nome} onChange={(e) => campo('nome', e.target.value)} style={inputStyle} />
        </Campo>
        <Campo label="Localização">
          <input value={form.localizacao} onChange={(e) => campo('localizacao', e.target.value)} style={inputStyle} />
        </Campo>
        <Campo label="Chave pública do peer (opcional)">
          <input
            value={form.wg_public_key}
            onChange={(e) => campo('wg_public_key', e.target.value)}
            placeholder="base64 de 44 caracteres"
            style={inputStyle}
          />
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>
            Identifica o peer direto. Em branco, o túnel é localizado pela sub-rede.
          </div>
        </Campo>

        <Campo label="Sub-rede (CIDR)">
          <input value={form.subnet_cidr} onChange={(e) => campo('subnet_cidr', e.target.value)} placeholder="10.10.5.0/24" style={inputStyle} />
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>
            É o AllowedIPs do peer desta usina no túnel.
          </div>
        </Campo>

        {erro && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{erro}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onCancelar} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: 'var(--surface-2)', border: 'none', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: 'var(--btn-accent)', border: 'none', color: 'var(--btn-text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', opacity: salvando ? 0.7 : 1 }}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PingIcmpBox({
  estado,
  onPing,
}: {
  estado?: { loading: boolean; linhas: string[] };
  onPing: () => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={onPing} disabled={estado?.loading} style={{ ...pingBtnStyle, background: 'var(--accent)', color: 'var(--btn-text)' }}>
        {estado?.loading ? 'Pingando…' : 'Ping'}
      </button>
      {estado && estado.linhas.length > 0 && (
        <pre
          style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--surface-3)',
            color: 'var(--text-2)',
            borderRadius: 5,
            fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace",
            maxHeight: 140,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {estado.linhas.join('\n')}
        </pre>
      )}
    </div>
  );
}

function equipamentoPadrao(modelos: ModeloRele[]): EquipamentoConfig {
  return {
    nome: '',
    tipo: 'disjuntor',
    ip_rele: '',
    porta_rele: 502,
    unit_id_rele: 1,
    modelo_rele_id: modelos[0]?.id ?? 0,
    registrador_status: 0,
    ip_digirail: '',
    porta_digirail: 502,
    unit_id_digirail: 1,
    addr_ligar: 0,
    addr_desligar: 0,
    addr_reset: 0,
  };
}

const NOVO_MODELO = '__novo__';

function EditarEquipamentoModal({
  equipamento,
  modelos,
  onCriarModelo,
  onCancelar,
  onSalvar,
}: {
  equipamento?: Equipamento;
  modelos: ModeloRele[];
  onCriarModelo: (nome: string) => Promise<ModeloRele>;
  onCancelar: () => void;
  onSalvar: (dados: EquipamentoConfig) => Promise<void>;
}) {
  const [form, setForm] = useState<EquipamentoConfig>(
    equipamento
      ? {
          nome: equipamento.nome,
          tipo: equipamento.tipo,
          ip_rele: equipamento.ip_rele,
          porta_rele: equipamento.porta_rele,
          unit_id_rele: equipamento.unit_id_rele,
          modelo_rele_id: equipamento.modelo_rele_id,
          registrador_status: equipamento.registrador_status,
          ip_digirail: equipamento.ip_digirail,
          porta_digirail: equipamento.porta_digirail,
          unit_id_digirail: equipamento.unit_id_digirail,
          addr_ligar: equipamento.addr_ligar,
          addr_desligar: equipamento.addr_desligar,
          addr_reset: equipamento.addr_reset,
        }
      : equipamentoPadrao(modelos),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [novoModeloNome, setNovoModeloNome] = useState<string | null>(null);

  function campo<K extends keyof EquipamentoConfig>(chave: K, valor: EquipamentoConfig[K]) {
    setForm((prev) => ({ ...prev, [chave]: valor }));
  }

  function selecionarModelo(valor: string) {
    if (valor === NOVO_MODELO) {
      setNovoModeloNome('');
      return;
    }
    campo('modelo_rele_id', Number(valor));
  }

  async function confirmarNovoModelo() {
    if (!novoModeloNome || !novoModeloNome.trim()) return;
    const criado = await onCriarModelo(novoModeloNome.trim());
    campo('modelo_rele_id', criado.id);
    setNovoModeloNome(null);
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
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
      <div className="modal-caixa" style={{ width: 480, maxHeight: '85vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '22px 24px', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          {equipamento ? `Editar ${equipamento.nome}` : 'Novo equipamento'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 18 }}>
          {equipamento
            ? 'Use quando trocar um relé/DigiRail em campo — endereço IP, porta e registradores mudam.'
            : 'Cadastre o relé de proteção e o DigiRail desse equipamento.'}
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
          {novoModeloNome === null ? (
            <select value={form.modelo_rele_id} onChange={(e) => selecionarModelo(e.target.value)} style={inputStyle}>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
              <option value={NOVO_MODELO}>+ novo modelo…</option>
            </select>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={novoModeloNome}
                onChange={(e) => setNovoModeloNome(e.target.value)}
                placeholder="Ex: URP 3000"
                style={inputStyle}
              />
              <button type="button" onClick={confirmarNovoModelo} style={{ ...pingBtnStyle, background: 'var(--accent)', color: 'var(--btn-text)' }}>
                Adicionar
              </button>
              <button type="button" onClick={() => setNovoModeloNome(null)} style={pingBtnStyle}>
                Cancelar
              </button>
            </div>
          )}
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

        {erro && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{erro}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onCancelar} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: 'var(--surface-2)', border: 'none', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} style={{ height: 34, padding: '0 14px', borderRadius: 6, background: 'var(--btn-accent)', border: 'none', color: 'var(--btn-text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', opacity: salvando ? 0.7 : 1 }}>
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
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function LinhaDupla({ children }: { children: ReactNode }) {
  return <div className="linha-dupla">{children}</div>;
}

function SecaoTitulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '16px 0 8px' }}>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 5,
  fontSize: 12.5,
  color: 'var(--text)',
  background: 'var(--surface-3)',
};

const pingBtnStyle: CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 5,
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 11,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
};

const editBtnStyle: CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 5,
  background: 'transparent',
  color: 'var(--accent)',
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid var(--accent-border)',
  cursor: 'pointer',
};

const deviceBoxStyle: CSSProperties = {
  flex: '1 1 220px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '10px 12px 12px',
  margin: 0,
};

const legendStyle: CSSProperties = {
  padding: '0 4px',
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--text-2)',
  letterSpacing: '0.02em',
};

function cmdBtnStyle(bg: string, disabled: boolean): CSSProperties {
  return {
    height: 30,
    padding: '0 12px',
    borderRadius: 5,
    background: bg,
    color: 'var(--btn-text)',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
  };
}
