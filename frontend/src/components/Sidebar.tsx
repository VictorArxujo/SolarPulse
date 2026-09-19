import type { CSSProperties, ReactElement } from 'react';
import type { Tema } from '../hooks/useTema';

export type Visao = 'frota' | 'log';

const ITENS: { key: Visao; label: string; icone: (cor: string) => ReactElement }[] = [
  {
    key: 'frota',
    label: 'Visão geral',
    icone: (cor) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </svg>
    ),
  },
  {
    key: 'log',
    label: 'Log de comandos',
    icone: (cor) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <line x1="8" y1="12" x2="16" y2="12" />
        <line x1="8" y1="16" x2="13" y2="16" />
      </svg>
    ),
  },
];

export default function Sidebar({
  visao,
  onVisao,
  horaAtual,
  onLogout,
  tema,
  onAlternarTema,
}: {
  visao: Visao;
  onVisao: (v: Visao) => void;
  horaAtual: string;
  onLogout: () => void;
  tema: Tema;
  onAlternarTema: () => void;
}) {
  return (
    <div
      className="sidebar"
      style={{
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 18px 16px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" />
          </svg>
        </div>
        <div className="sidebar-texto" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)' }}>Religamento Remoto</div>
          <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 1 }}>Supervisão via Modbus TCP</div>
        </div>
      </div>

      <nav style={{ padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ITENS.map((item) => {
          const ativo = visao === item.key;
          return (
            <button
              key={item.key}
              className="nav-item"
              title={item.label}
              onClick={() => onVisao(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 36,
                padding: '0 10px 0 12px',
                border: 'none',
                borderLeft: `2px solid ${ativo ? 'var(--accent)' : 'transparent'}`,
                borderRadius: 5,
                background: ativo ? 'var(--accent-soft)' : undefined,
                color: ativo ? 'var(--text)' : 'var(--text-2)',
                fontSize: 12.5,
                fontWeight: ativo ? 600 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              {item.icone(ativo ? 'var(--accent)' : 'var(--text-3)')}
              <span className="rotulo-item">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', padding: '14px 18px', borderTop: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="nav-item" onClick={onAlternarTema} style={temaBtnStyle} title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}>
          {tema === 'dark' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
            </svg>
          )}
          <span className="rotulo-item">{tema === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
        </button>
        <span className="sidebar-relogio" style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: "'IBM Plex Mono', monospace" }}>{horaAtual}</span>
        <button onClick={onLogout} style={sairBtnStyle}>
          Sair
        </button>
      </div>
    </div>
  );
}

const temaBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  height: 30,
  padding: '0 8px',
  marginLeft: -8,
  border: 'none',
  borderRadius: 5,
  color: 'var(--text-2)',
  fontSize: 11.5,
  fontWeight: 500,
  cursor: 'pointer',
};

const sairBtnStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-2)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
};
