import { useCallback, useEffect, useState } from 'react';

export type Tema = 'light' | 'dark';

function temaDoSistema(): Tema {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function lerTemaSalvo(): Tema {
  try {
    const salvo = localStorage.getItem('tema');
    if (salvo === 'light' || salvo === 'dark') return salvo;
  } catch {
    // localStorage indisponível — segue o tema do sistema
  }
  return temaDoSistema();
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(() => lerTemaSalvo());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    try {
      localStorage.setItem('tema', tema);
    } catch {
      // localStorage indisponível — o tema só não persiste entre sessões
    }
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { tema, alternar };
}
