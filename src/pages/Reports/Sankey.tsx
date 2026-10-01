import { useState } from 'react';
import type { FlowResult } from '../../services/reports';
import { MONO } from './ui';
import { mln } from './format';

const VW = 900, VH = 470, H = 372, TOP = 56, NW = 13;
const XS = [150, 420, 626];
const GAPS = [30, 62, 40];
const FILLS = ['#2563eb', '#475569', '#94a3b8'];

export function Sankey({ flow }: { flow: FlowResult }) {
  const [hover, setHover] = useState<number | null>(null);
  const px = (v: number) => `${((v / VW) * 100).toFixed(2)}%`;
  const py = (v: number) => `${((v / VH) * 100).toFixed(2)}%`;

  interface N { id: string; label: string; value: number; col: number; x: number; y: number; h: number; k: number; outCur: number; inCur: number }
  const nodes: N[] = [];
  flow.columns.forEach((nodesCol, ci) => {
    const total = nodesCol.reduce((s, n) => s + n.value, 0) || 1;
    const gap = GAPS[ci];
    const k = (H - gap * (nodesCol.length - 1)) / total;
    let y = TOP;
    nodesCol.forEach(n => {
      const h = n.value * k;
      nodes.push({ ...n, col: ci, x: XS[ci], y, h, k, outCur: y, inCur: y });
      y += h + gap;
    });
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = flow.links.map(l => {
    const s = byId.get(l.from)!, t = byId.get(l.to)!;
    const h0 = l.value * s.k, h1 = l.value * t.k;
    const x0 = s.x + NW, x1 = t.x, y0 = s.outCur, y1 = t.inCur;
    s.outCur += h0; t.inCur += h1;
    const m = (x0 + x1) / 2;
    const d = `M${x0},${y0.toFixed(1)}C${m},${y0.toFixed(1)} ${m},${y1.toFixed(1)} ${x1},${y1.toFixed(1)}L${x1},${(y1 + h1).toFixed(1)}C${m},${(y1 + h1).toFixed(1)} ${m},${(y0 + h0).toFixed(1)} ${x0},${(y0 + h0).toFixed(1)}Z`;
    return { d, stage: s.col, label: `${s.label} → ${t.label}`, v: l.value };
  });

  const labelStyle = (n: N): React.CSSProperties => {
    if (n.col === 0) return { position: 'absolute', left: 0, width: px(n.x - 12), textAlign: 'right', top: py(n.y + n.h / 2), transform: 'translateY(-50%)' };
    if (n.col === 2) return { position: 'absolute', left: px(n.x + NW + 12), width: px(VW - n.x - NW - 14), textAlign: 'left', top: py(n.y + n.h / 2), transform: 'translateY(-50%)' };
    return { position: 'absolute', left: px(n.x + NW / 2), width: px(196), marginLeft: px(-98), textAlign: 'center', top: py(n.y - 54) };
  };

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-.2px' }}>Куда уходят деньги: источники → деятельность → статьи</div>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>только расходы · толщина линии — сумма</div>
        <div style={{ marginLeft: 'auto', minHeight: 22, fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: '#1d4ed8' }}>
          {hover !== null ? `${links[hover].label} · ${mln(links[hover].v)} млн ₸` : ''}
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '900 / 470' }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="fpFlow" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#1d4ed8" /><stop offset="100%" stopColor="#60a5fa" /></linearGradient>
            <linearGradient id="fpFlow2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#64748b" /><stop offset="100%" stopColor="#cbd5e1" /></linearGradient>
          </defs>
          {links.map((l, i) => (
            <path key={i} d={l.d} fill={l.stage === 0 ? 'url(#fpFlow)' : 'url(#fpFlow2)'}
              opacity={hover === null ? 0.4 : hover === i ? 1 : 0.13} style={{ cursor: 'pointer', transition: 'opacity .15s ease' }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
          {nodes.map(n => <rect key={n.id} x={n.x} y={n.y} width={NW} height={Math.max(2, n.h)} rx="3" fill={FILLS[n.col]} />)}
        </svg>
        {nodes.map(n => (
          <div key={n.id} style={labelStyle(n)}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{n.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>{mln(n.value)} млн ₸</div>
          </div>
        ))}
      </div>
    </div>
  );
}
