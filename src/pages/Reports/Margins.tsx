import { useMemo, useState } from 'react';
import { buildProductMargins, type ProductMargin } from '../../services/reports';
import { card, CardTitle, Empty, num, th } from './ui';
import { mln, money, pct, monthFull } from './format';
import { useReports } from './ReportsContext';

const GOOD = 60, MID = 40;
type Level = 'good' | 'mid' | 'low' | 'check' | 'none';
const LEVEL: Record<Level, { t: string; c: string; bg: string }> = {
  good: { t: 'Выгодно', c: '#15803d', bg: '#dcfce7' },
  mid: { t: 'Средне', c: '#b45309', bg: '#fef3c7' },
  low: { t: 'Слабо', c: '#b91c1c', bg: '#fee2e2' },
  check: { t: 'Проверить себестоимость', c: '#6d28d9', bg: '#ede9fe' },
  none: { t: 'Нет себестоимости', c: '#64748b', bg: '#f1f5f9' },
};
const level = (p: number | null, margin: number): Level => (p === null ? 'none' : margin < 0 ? 'check' : p >= GOOD ? 'good' : p >= MID ? 'mid' : 'low');
const td = { ...num, padding: '9px 12px' } as const;
const noEmoji = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '');

function Chip({ l }: { l: Level }) {
  const x = LEVEL[l];
  return <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 7, background: x.bg, color: x.c, whiteSpace: 'nowrap' }}>{x.t}</span>;
}

interface Group { name: string; rows: ProductMargin[]; revenue: number; costed: number; cost: number; margin: number; pct: number | null }

export function Margins() {
  const { input } = useReports();
  const [period, setPeriod] = useState('');
  const [sort, setSort] = useState<'margin' | 'pct'>('margin');
  const [open, setOpen] = useState<string | null>(null);

  const periods = useMemo(() => (input ? [...new Set(input.sales.map(s => s.period))].filter(Boolean).sort() : []), [input]);
  const cur = period || periods[periods.length - 1] || 'all';
  const res = useMemo(() => (input ? buildProductMargins(input, cur) : null), [input, cur]);

  const groups = useMemo<Group[]>(() => {
    if (!res) return [];
    const map = new Map<string, ProductMargin[]>();
    for (const r of res.rows) (map.get(r.group) ?? map.set(r.group, []).get(r.group)!).push(r);
    const list = [...map].map(([name, rows]) => {
      const revenue = rows.reduce((s, r) => s + r.revenue, 0), costed = rows.reduce((s, r) => s + r.costed, 0);
      const cost = rows.reduce((s, r) => s + r.cost, 0), margin = costed - cost;
      return { name, rows, revenue, costed, cost, margin, pct: costed > 0 && costed / revenue >= 0.5 ? (margin / costed) * 100 : null };
    });
    return list.sort((a, b) => (sort === 'margin' ? b.margin - a.margin : (b.pct ?? -1) - (a.pct ?? -1)));
  }, [res, sort]);

  if (!input || !res) return null;
  if (!res.rows.length) return <Empty>Нет продаж за выбранный период</Empty>;

  const t = res.totals;
  const sortable = groups.filter(g => g.pct !== null && g.revenue >= t.revenue * 0.03);
  const best = [...sortable].sort((a, b) => (b.pct as number) - (a.pct as number))[0];
  const worst = [...sortable].sort((a, b) => (a.pct as number) - (b.pct as number))[0];
  const maxMargin = Math.max(...groups.map(g => Math.abs(g.margin)), 1);

  const kpis = [
    { label: 'Маржа по сырью', value: pct(t.marginPct, 0), unit: '', note: 'после стоимости материалов', color: LEVEL[level(t.marginPct, 1)].c },
    { label: 'Прибыль по сырью', value: mln(t.margin), unit: 'млн ₸', note: `из ${mln(t.costed)} млн выручки без НДС`, color: '#0f172a' },
    { label: 'Самая выгодная группа', value: best ? noEmoji(best.name) : '—', unit: '', note: best ? `маржа ${pct(best.pct as number, 0)}` : '', color: '#15803d', small: true },
    { label: 'Самая слабая группа', value: worst ? noEmoji(worst.name) : '—', unit: '', note: worst ? `маржа ${pct(worst.pct as number, 0)} · ${pct((worst.revenue / t.revenue) * 100, 0)} выручки` : '', color: '#b91c1c', small: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', background: '#e2e8f0', borderRadius: 10, padding: 3, gap: 2 }}>
          {[...periods.slice(-4), 'all'].map(p => (
            <button key={p} type="button" onClick={() => { setPeriod(p); setOpen(null); }}
              style={{ border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: cur === p ? '#fff' : 'transparent', color: cur === p ? '#0f172a' : '#64748b', boxShadow: cur === p ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>
              {p === 'all' ? 'Весь год' : monthFull(p).split(' ')[0]}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', background: '#e2e8f0', borderRadius: 10, padding: 3, gap: 2 }}>
          {([['margin', 'По прибыли'], ['pct', 'По марже %']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSort(k)}
              style={{ border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: sort === k ? '#fff' : 'transparent', color: sort === k ? '#0f172a' : '#64748b' }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="fp-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, borderRadius: 14, padding: '16px 17px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.3px', textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: k.small ? 19 : 26, fontWeight: 700, letterSpacing: k.small ? '-.3px' : '-1px', color: k.color, lineHeight: 1.2 }}>{k.value}</div>
              {k.unit && <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{k.unit}</div>}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 6 }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '17px 20px 12px', borderBottom: '1px solid #eef2f7' }}>
          <CardTitle title="Что выгодно продавать" sub="по группам товаров · нажмите на группу — увидите продукты" />
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>
            {(['good', 'mid', 'low'] as const).map(l => <span key={l}><b style={{ color: LEVEL[l].c }}>●</b> {LEVEL[l].t}: {l === 'good' ? `от ${GOOD}%` : l === 'mid' ? `${MID}–${GOOD}%` : `меньше ${MID}%`}</span>)}
          </div>
        </div>
        {groups.map(g => {
          const l = level(g.pct, g.margin), isOpen = open === g.name;
          const rows = [...g.rows].sort((a, b) => (sort === 'margin' ? b.margin - a.margin : (b.marginPct ?? -999) - (a.marginPct ?? -999)));
          return (
            <div key={g.name} style={{ borderTop: '1px solid #eef2f7' }}>
              <div onClick={() => setOpen(isOpen ? null : g.name)} className="fp-mrow" style={{ display: 'grid', gridTemplateColumns: 'minmax(210px,1.4fr) minmax(160px,1.6fr) 120px 90px 140px', gap: 14, alignItems: 'center', padding: '14px 20px', cursor: 'pointer', background: isOpen ? '#f8fafc' : undefined }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, color: '#0f172a' }}><span style={{ color: '#94a3b8', marginRight: 6 }}>{isOpen ? '▾' : '▸'}</span>{noEmoji(g.name)}
                  <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600, marginLeft: 18 }}>{g.rows.length} позиций · {pct((g.revenue / t.revenue) * 100, 0)} выручки</div>
                </div>
                <div style={{ height: 14, borderRadius: 7, background: '#f1f5f9', overflow: 'hidden' }} title={`Прибыль ${money(g.margin)} ₸`}>
                  <div style={{ width: `${Math.max(2, (Math.max(g.margin, 0) / maxMargin) * 100)}%`, height: '100%', background: LEVEL[l].c, borderRadius: 7 }} />
                </div>
                <div style={{ ...num, fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{mln(g.margin)} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>млн</span></div>
                <div style={{ ...num, fontWeight: 800, fontSize: 15, color: LEVEL[l].c }}>{g.pct === null ? '—' : pct(g.pct, 0)}</div>
                <div style={{ textAlign: 'right' }}><Chip l={l} /></div>
              </div>
              {isOpen && (
                <div style={{ overflowX: 'auto', background: '#fcfdff', borderTop: '1px solid #eef2f7' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 760 }}>
                    <thead><tr>
                      <th style={{ ...th, textAlign: 'left', padding: '9px 20px 9px 38px' }}>Продукт</th>
                      <th style={th}>Продано, шт</th><th style={th}>Цена за шт</th><th style={th}>Себестоимость за шт</th>
                      <th style={th}>Прибыль, ₸</th><th style={th}>Маржа</th><th style={{ ...th, paddingRight: 20 }} />
                    </tr></thead>
                    <tbody>
                      {rows.map(r => {
                        const rl = level(r.marginPct, r.margin);
                        return (
                          <tr key={r.key} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '9px 20px 9px 38px', fontWeight: 600, color: '#334155' }}>{r.name}</td>
                            <td style={{ ...td, color: '#64748b' }}>{money(r.qty)}</td>
                            <td style={{ ...td, color: '#334155' }}>{r.unitPrice.toFixed(r.unitPrice < 100 ? 2 : 0).replace('.', ',')}</td>
                            <td style={{ ...td, color: '#64748b' }}>{r.unitCost === null ? '—' : r.unitCost.toFixed(r.unitCost < 100 ? 2 : 0).replace('.', ',')}</td>
                            <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{r.marginPct === null ? '—' : money(r.margin)}</td>
                            <td style={{ ...td, fontWeight: 800, color: LEVEL[rl].c }}>{r.marginPct === null ? '—' : pct(r.marginPct, 0)}</td>
                            <td style={{ ...td, paddingRight: 20, textAlign: 'right' }}><Chip l={rl} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
        Маржа по сырью: выручка без НДС минус стоимость материалов по граммовкам и ценам сырья. Зарплаты производства, коммунальные и перекуп сюда пока не входят, поэтому она выше валовой маржи в ОПиУ.
        {t.uncosted > 1 ? ` Без себестоимости: ${money(t.uncosted)} ₸ выручки (в расчёт не вошли).` : ''}
      </div>
    </div>
  );
}
