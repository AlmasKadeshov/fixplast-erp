// SVG-графики из макета: спарклайн, площадной график выручки, спидометр маржи, «бублик».
import { MONO } from './ui';
import { mln } from './format';

export function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const mn = Math.min(...values), mx = Math.max(...values), span = mx - mn || 1;
  const pts = values.map((v, i) => ({ x: 3 + (i * 64) / (values.length - 1), y: 21 - ((v - mn) / span) * 17 }));
  const last = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 70 24" width="70" height="24" style={{ marginLeft: 'auto', flex: 'none', overflow: 'visible' }}>
      <polyline points={pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke={color}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={last.x} cy={last.y} r="2.4" fill={color} />
    </svg>
  );
}

export function AreaChart({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 1000, L = 28, R = 976, T = 44, B = 246;
  const hi = Math.max(...values), lo = Math.min(...values);
  const mx = Math.ceil(hi / 1e7) * 1e7 + 1e7, mn = Math.max(0, Math.floor(lo / 1e7) * 1e7 - 3e7);
  const pts = values.map((v, i) => ({
    x: L + (i * (R - L)) / Math.max(1, values.length - 1),
    y: B - ((v - mn) / (mx - mn)) * (B - T), v,
  }));
  let line = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    line += `C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const fill = `${line}L${R},262 L${L},262 Z`;
  const HPX = 264, CH = 288;
  const px = (x: number) => `${((x / W) * 100).toFixed(2)}%`;
  const py = (y: number) => `${((((y / 300) * HPX) / CH) * 100).toFixed(2)}%`;
  const grid = [0, 1, 2, 3, 4].map(i => B - (i * (B - T)) / 4);
  return (
    <div style={{ position: 'relative', width: '100%', height: 288 }}>
      <svg viewBox="0 0 1000 300" width="100%" preserveAspectRatio="none" style={{ display: 'block', height: 264 }}>
        <defs>
          <linearGradient id="fpArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((y, i) => <line key={i} x1="0" y1={y} x2="1000" y2={y} stroke="#eef2f7" strokeWidth="1" />)}
        <path d={fill} fill="url(#fpArea)" />
        <path d={line} fill="none" stroke="#2563eb" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4.6" fill="#fff" stroke="#2563eb" strokeWidth="3" />)}
      </svg>
      {pts.map((p, i) => (
        <div key={`v${i}`} style={{
          position: 'absolute', left: px(p.x), top: py(p.y + (p.y < 70 ? 24 : -22)), transform: 'translate(-50%,-50%)',
          fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap',
        }}>{mln(p.v)}</div>
      ))}
      {pts.map((p, i) => (
        <div key={`m${i}`} style={{
          position: 'absolute', left: px(p.x), bottom: 0, transform: 'translateX(-50%)',
          fontSize: 11.5, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap',
        }}>{labels[i]}</div>
      ))}
    </div>
  );
}

export function Gauge({ value }: { value: number }) {
  const cx = 150, cy = 150, r = 116;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => {
      const rad = (Math.PI * (180 - a)) / 180;
      return [(cx + r * Math.cos(rad)).toFixed(1), (cy - r * Math.sin(rad)).toFixed(1)];
    };
    const s = p(a0), e = p(a1);
    return `M${s[0]},${s[1]} A${r},${r} 0 0 1 ${e[0]},${e[1]}`;
  };
  const deg = (v: number) => (Math.min(Math.max(v, 0), 45) / 45) * 180;
  const nrad = (Math.PI * (180 - deg(value))) / 180;
  const nx = cx + 96 * Math.cos(nrad), ny = cy - 96 * Math.sin(nrad);
  return (
    <svg viewBox="0 0 300 172" width="100%" style={{ display: 'block', marginTop: 6 }}>
      <path d={arc(0, deg(25))} fill="none" stroke="#dc2626" strokeWidth="17" opacity="0.85" />
      <path d={arc(deg(25), deg(32))} fill="none" stroke="#d97706" strokeWidth="17" opacity="0.85" />
      <path d={arc(deg(32), 180)} fill="none" stroke="#16a34a" strokeWidth="17" opacity="0.9" />
      <line x1="150" y1="150" x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <circle cx="150" cy="150" r="7.5" fill="#0f172a" />
      <text x="16" y="168" fill="#94a3b8" fontSize="12" fontWeight="700" fontFamily={MONO}>0%</text>
      <text x="262" y="168" fill="#94a3b8" fontSize="12" fontWeight="700" fontFamily={MONO}>45%</text>
    </svg>
  );
}

export interface DonutSlice { key: string; label: string; value: number; color: string }

export function Donut({ slices, active, onHover, onPick }: {
  slices: DonutSlice[]; active: string | null; onHover: (k: string | null) => void; onPick: (k: string) => void;
}) {
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const C = 2 * Math.PI * 70;
  let acc = 0;
  return (
    <svg viewBox="0 0 200 200" width="100%" style={{ display: 'block' }}>
      {slices.map(d => {
        const len = (d.value / total) * C;
        const el = (
          <circle key={d.key} cx="100" cy="100" r="70" fill="none" stroke={d.color}
            strokeWidth={active === d.key ? 30 : 24} strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-acc}
            transform="rotate(-90 100 100)" style={{ cursor: 'pointer', transition: 'stroke-width .15s' }}
            onMouseEnter={() => onHover(d.key)} onMouseLeave={() => onHover(null)} onClick={() => onPick(d.key)} />
        );
        acc += len;
        return el;
      })}
    </svg>
  );
}
