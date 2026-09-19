import { useEffect, useRef, useState } from 'react';

interface AnelProntidaoProps {
  valor: number; // 0..1
  cor: string;
  trilho: string;
  tamanho?: number;
  espessura?: number;
  children?: React.ReactNode;
}

/* Anel de progresso circular — mesma leitura de um medidor analógico de
   painel elétrico. Anima uma única vez, do zero até o valor real, quando
   entra na tela; depois só a cor muda (sem retransição), pra não virar
   um efeito repetido em todo lugar. */
export default function AnelProntidao({ valor, cor, trilho, tamanho = 96, espessura = 8, children }: AnelProntidaoProps) {
  const raio = (tamanho - espessura) / 2;
  const perimetro = 2 * Math.PI * raio;
  const [animado, setAnimado] = useState(false);

  const jaAnimou = useRef(false);
  useEffect(() => {
    if (jaAnimou.current) return;
    jaAnimou.current = true;
    const id = requestAnimationFrame(() => setAnimado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const offset = perimetro * (1 - (animado ? valor : 0));

  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho, flexShrink: 0 }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke={trilho} strokeWidth={espessura} />
        <circle
          className="anel-progresso"
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={perimetro}
          strokeDashoffset={offset}
        />
      </svg>
      {children && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </div>
      )}
    </div>
  );
}
