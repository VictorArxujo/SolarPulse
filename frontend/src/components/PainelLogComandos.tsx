import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError, type ComandoLog, type Usina } from '../api/client';
import { COR_ACAO, ROTULO_ACAO } from '../lib/acao';

function formatarHorario(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDay = data.toDateString() === hoje.toDateString();
  const hora = data.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (mesmoDay) return hora;
  return `${data.toLocaleDateString('pt-BR')} ${hora}`;
}

export default function PainelLogComandos({ usinas, gatilhoAtualizacao }: { usinas: Usina[]; gatilhoAtualizacao: number }) {
  const [logs, setLogs] = useState<ComandoLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroUsina, setFiltroUsina] = useState<number | 'todas'>('todas');
  const [atualizadoAs, setAtualizadoAs] = useState('');

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const dados = await api.listarComandos({ usinaId: filtroUsina === 'todas' ? undefined : filtroUsina, limit: 150 });
      setLogs(dados);
      setAtualizadoAs(new Date().toLocaleTimeString('pt-BR', { hour12: false }));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao carregar o log de comandos.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroUsina, gatilhoAtualizacao]);

  const total = logs.length;
  const falhas = useMemo(() => logs.filter((l) => !l.sucesso).length, [logs]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Log de comandos</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>
            Auditoria de todo pulso enviado ao DigiRail — inclusive os bloqueados.
          </div>
        </div>

        <select
          value={filtroUsina}
          onChange={(e) => setFiltroUsina(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
          style={selectStyle}
        >
          <option value="todas">Todas as usinas</option>
          {usinas.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>

        <button onClick={carregar} disabled={carregando} style={refreshBtnStyle}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-3)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {falhas > 0 && <span style={{ color: 'var(--danger)' }}>{falhas} falha(s)</span>}
          <span>{total} registro(s)</span>
          {atualizadoAs && <span>atualizado {atualizadoAs}</span>}
        </div>
      </div>

      {erro && (
        <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 6, padding: '10px 14px' }}>
          {erro}
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '108px 1fr 1fr 84px 1fr 68px 1.6fr', gap: 0, padding: '9px 16px 9px 20px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.02em', borderBottom: '1px solid var(--divider)' }}>
          <span>Horário</span>
          <span>Usina</span>
          <span>Equipamento</span>
          <span>Ação</span>
          <span>Usuário</span>
          <span>Resultado</span>
          <span>Detalhe</span>
        </div>

        {!carregando && logs.length === 0 && !erro && (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
            Nenhum comando registrado ainda.
          </div>
        )}

        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          {logs.map((log) => (
            <div
              key={log.id}
              className="log-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '108px 1fr 1fr 84px 1fr 68px 1.6fr',
                gap: 0,
                alignItems: 'center',
                padding: '9px 16px 9px 20px',
                borderBottom: '1px solid var(--divider)',
                borderLeft: `2px solid ${log.sucesso ? 'var(--ok)' : 'var(--danger)'}`,
                fontSize: 12,
              }}
            >
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>
                {formatarHorario(log.criado_em)}
              </span>
              <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {log.usina_nome}
              </span>
              <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {log.equipamento_nome}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: COR_ACAO[log.acao], fontWeight: 600, fontSize: 11 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: COR_ACAO[log.acao], flexShrink: 0 }} />
                {ROTULO_ACAO[log.acao]}
              </span>
              <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {log.usuario_nome}
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 7px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    background: log.sucesso ? 'var(--ok-soft)' : 'var(--danger-soft)',
                    color: log.sucesso ? 'var(--ok)' : 'var(--danger)',
                  }}
                >
                  {log.sucesso ? 'ok' : 'falha'}
                </span>
              </span>
              <span title={log.detalhe} style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.detalhe || '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const selectStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--text)',
  background: 'var(--surface-3)',
};

const refreshBtnStyle: CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 6,
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 11.5,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
};
