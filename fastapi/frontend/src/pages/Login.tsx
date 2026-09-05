import { useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      await login(email, senha);
      navigate('/', { replace: true });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível conectar à API.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#0d1017',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1f2b" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <form
        onSubmit={handleSubmit}
        style={{
          position: 'relative',
          width: 380,
          maxWidth: 'calc(100vw - 48px)',
          background: '#161a23',
          border: '1px solid #262c3a',
          borderRadius: 10,
          padding: '40px 36px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 10,
              background: 'rgba(76,141,255,0.12)',
              border: '1px solid rgba(76,141,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4c8dff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 19, fontWeight: 600, color: '#e7e9ee', letterSpacing: '-0.01em' }}>Religamento Remoto</div>
            <div style={{ fontSize: 13, color: '#8b93a3', marginTop: 4 }}>
              Supervisão e comando de relés de proteção via Modbus TCP
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#8b93a3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              E-mail
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#8b93a3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Senha
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {erro && (
            <div style={{ fontSize: 12.5, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, padding: '8px 12px' }}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            style={{
              width: '100%',
              height: 44,
              background: '#4c8dff',
              border: 'none',
              borderRadius: 7,
              color: '#0d1017',
              fontSize: 14.5,
              fontWeight: 600,
              cursor: carregando ? 'default' : 'pointer',
              opacity: carregando ? 0.7 : 1,
              marginTop: 6,
            }}
          >
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #21262f', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5b6373" strokeWidth="2">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span style={{ fontSize: 11.5, color: '#5b6373', fontFamily: "'IBM Plex Mono', monospace" }}>acesso restrito</span>
        </div>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: 42,
  background: '#10131a',
  border: '1px solid #2a3142',
  borderRadius: 7,
  color: '#e7e9ee',
  fontSize: 14,
  padding: '0 14px',
};
