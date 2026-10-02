// Общие блоки дизайна FixPlast (inline-стили 1-в-1 из макета FixPlast.dc.html).
import type { CSSProperties, ReactNode } from 'react';

// Century Gothic — основной шрифт; если его нет на устройстве, подставляется Jost (похож, есть кириллица и жирные начертания)
export const FONT = "'Century Gothic', 'Jost', 'Didact Gothic', system-ui, sans-serif";
export const MONO = FONT; // цифры тем же шрифтом, выравнивание — через tabular-nums

export const card: CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
  boxShadow: '0 1px 2px rgba(15,23,42,.05),0 10px 24px -18px rgba(15,23,42,.2)', minWidth: 0,
};

export const th: CSSProperties = {
  textAlign: 'right', padding: '10px 12px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.5px', color: '#64748b', background: '#f8fafc', whiteSpace: 'nowrap',
};

export const num: CSSProperties = {
  textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
};

export function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.2px' }}>{title}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>{sub}</div>}
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}

export function Delta({ text, up }: { text: string; up: boolean }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 11.5, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
      background: up ? '#dcfce7' : '#fee2e2', color: up ? '#15803d' : '#b91c1c',
    }}>{text}</span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ ...card, padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13.5, fontWeight: 600 }}>{children}</div>;
}
