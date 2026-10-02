import { useMemo, useState } from 'react';
import { buildFlows, drillOperations, type ReportRow } from '../../services/reports';
import { Sankey } from './Sankey';
import { DrillModal } from './DrillPanel';
import { card, CardTitle, Empty, MONO, num, th } from './ui';
import { mln, monthFull, money } from './format';
import { useReports } from './ReportsContext';

const td = { ...num, padding: '8px 12px' } as const;

export function Dds() {
  const { dds, balances, input } = useReports();
  const [drill, setDrill] = useState<{ row: ReportRow; mi: number } | null>(null);
  const [view, setView] = useState<'table' | 'flow'>('table');
  const [openContour, setOpenContour] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (name: string) => setOpenSections(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const flow = useMemo(() => (input ? buildFlows(input) : null), [input]);
  if (!dds || !balances || !input) return null;
  if (!dds.months.length) return <Empty>Нет операций для ДДС</Empty>;

  const total = balances.total || 1;
  const shown = (a: { name: string; amount: number }[]) => a.filter(x => Math.abs(x.amount) >= 1);
  const contours = [
    { key: 'bank', icon: '🏦', label: 'Банк', v: balances.totalBank, items: shown(balances.bank), unit: 'счёта', c: '#3b82f6' },
    { key: 'cash', icon: '💵', label: 'Касса', v: balances.totalCash, items: shown(balances.cash), unit: 'кошелька', c: '#60a5fa' },
    { key: 'acc', icon: '👤', label: 'Подотчётники', v: balances.totalAccountable, items: shown(balances.accountable), unit: 'держателей', c: '#93c5fd' },
  ];
  const open = contours.find(c => c.key === openContour) ?? null;
  const drillOps = drill ? drillOperations(input, drill.row.key, dds.months[drill.mi], 'dds') : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: '#0f172a', borderRadius: 18, padding: '24px 26px', color: '#e2e8f0',
        boxShadow: '0 18px 40px -28px rgba(15,23,42,.9)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) minmax(0,2fr)', gap: 24, alignItems: 'center' }} className="fp-grid-2">
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#7f8ea6' }}>Общий остаток на сегодня</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: MONO, fontSize: 38, fontWeight: 700, letterSpacing: '-1.5px', color: '#fff', lineHeight: 1 }}>{money(balances.total)}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8' }}>₸</div>
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600, marginTop: 6 }}>нажмите на контур — увидите детали</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
            {contours.map(c => {
              const active = openContour === c.key;
              return (
                <button key={c.key} type="button" onClick={() => setOpenContour(active ? null : c.key)} style={{
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
                  background: active ? '#243449' : '#1e293b', border: `1px solid ${active ? '#3b82f6' : '#29384f'}`,
                  borderRadius: 12, padding: '13px 15px', minWidth: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15 }}>{c.icon}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#cbd5e1' }}>{c.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#7f8ea6' }}>{active ? '▲' : '▼'}</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: '#fff', marginTop: 7 }}>{money(c.v)}</div>
                  <div style={{ height: 5, borderRadius: 3, background: '#0f172a', marginTop: 9, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(2, (c.v / total) * 100)}%`, background: c.c }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: '#7f8ea6', fontWeight: 600, marginTop: 6 }}>{c.items.length} {c.unit}</div>
                </button>
              );
            })}
          </div>
        </div>

        {open && (
          <div style={{ marginTop: 18, borderTop: '1px solid #29384f', paddingTop: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#7f8ea6', marginBottom: 8 }}>
              {open.icon} {open.label} — у кого сколько
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '2px 28px' }}>
              {open.items.map(it => (
                <div key={it.name} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid #223047' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{money(it.amount)}</span>
                </div>
              ))}
              {open.items.length === 0 && <div style={{ fontSize: 12, color: '#7f8ea6' }}>Нет остатков</div>}
            </div>
            {open.key === 'acc' && balances.transit.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 11.5, color: '#7f8ea6', fontWeight: 600 }}>
                В итог не входит транзит (минус): {balances.transit.map(t => `${t.name} ${money(t.amount)}`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.2px' }}>Движение денежных средств</div>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', background: '#e2e8f0', borderRadius: 10, padding: 3, gap: 3 }}>
          {(['table', 'flow'] as const).map(v => (
            <button key={v} type="button" onClick={() => setView(v)} style={{
              border: 'none', borderRadius: 8, padding: '6px 14px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: view === v ? '#fff' : 'transparent', color: view === v ? '#0f172a' : '#64748b',
              boxShadow: view === v ? '0 1px 2px rgba(15,23,42,.12)' : 'none',
            }}>{v === 'table' ? 'Таблица' : 'Поток'}</button>
          ))}
        </div>
      </div>

      {view === 'flow' && flow && (
        <div style={{ ...card, padding: '20px 22px', overflowX: 'auto' }}><Sankey flow={flow} /></div>
      )}

      {view === 'table' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '17px 20px 14px', borderBottom: '1px solid #eef2f7' }}>
            <CardTitle title="Таблица ДДС" sub={`млн ₸ · ${dds.labels[0]} — ${dds.labels[dds.labels.length - 1]} · клик по цифре — операции`} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', padding: '11px 20px', position: 'sticky', left: 0, zIndex: 1 }}>Статья</th>
                  {dds.labels.map(m => <th key={m} style={th}>{m}</th>)}
                  <th style={{ ...th, padding: '11px 20px 11px 12px', color: '#1e293b', background: '#f1f5f9' }}>Итого</th>
                </tr>
              </thead>
              <tbody>
                {dds.sections.map(sec => (
                  <SectionRows key={sec.name} sec={sec} open={openSections.has(sec.name)} onToggle={() => toggleSection(sec.name)} onPick={(row, mi) => setDrill({ row, mi })} />
                ))}
                <tr style={{ borderTop: '2px solid #0f172a', background: '#eff6ff' }}>
                  <td style={{ padding: '12px 20px', fontWeight: 800, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#eff6ff' }}>Чистый денежный поток</td>
                  {dds.netFlow.values.map((v, i) => <td key={i} style={{ ...td, padding: '12px', fontWeight: 700, fontSize: 13, color: v < 0 ? '#b91c1c' : '#1d4ed8' }}>{mln(v)}</td>)}
                  <td style={{ ...td, padding: '12px 20px 12px 12px', fontWeight: 700, fontSize: 13, color: '#1d4ed8' }}>{mln(dds.netFlow.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {drill && (
          <DrillModal title={`${drill.row.label} · ${monthFull(dds.months[drill.mi])}`} amountLabel={`${money(drill.row.values[drill.mi])} ₸`} ops={drillOps} onClose={() => setDrill(null)} />
        )}
      </div>
      )}
    </div>
  );
}

function SectionRows({ sec, open, onToggle, onPick }: { sec: { name: string; number: string; rows: ReportRow[]; total: ReportRow }; open: boolean; onToggle: () => void; onPick: (r: ReportRow, mi: number) => void }) {
  return (
    <>
      <tr onClick={onToggle} style={{ borderTop: '1px solid #e2e8f0', background: open ? '#eef2f7' : '#f8fafc', cursor: 'pointer' }}>
        <td style={{ padding: '12px 20px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: '#1e293b', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: open ? '#eef2f7' : '#f8fafc' }}>
          <span style={{ display: 'inline-block', width: 16, color: '#64748b' }}>{open ? '▾' : '▸'}</span>
          {sec.number}. {sec.name} деятельность
          <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>{sec.rows.length} статей</span>
        </td>
        {sec.total.values.map((v, i) => <td key={i} style={{ ...td, padding: '12px', fontWeight: 800, color: v < 0 ? '#1e293b' : '#15803d' }}>{mln(v)}</td>)}
        <td style={{ ...td, padding: '12px 20px 12px 12px', fontWeight: 800, background: '#f1f5f9' }}>{mln(sec.total.total)}</td>
      </tr>
      {open && sec.rows.map(r => (
        <tr key={r.key} style={{ borderTop: '1px solid #f1f5f9' }}>
          <td style={{ padding: '9px 20px 9px 40px', fontWeight: 500, color: '#334155', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}>{r.label}</td>
          {r.values.map((v, i) => (
            <td key={i} onClick={v !== 0 ? () => onPick(r, i) : undefined}
              style={{ ...td, padding: '9px 12px', fontWeight: 500, color: v < 0 ? '#475569' : '#15803d', cursor: v !== 0 ? 'pointer' : 'default', textDecoration: v !== 0 ? 'underline dotted #cbd5e1' : 'none', textUnderlineOffset: 3 }}>{mln(v)}</td>
          ))}
          <td style={{ ...td, padding: '9px 20px 9px 12px', fontWeight: 700, background: '#f8fafc' }}>{mln(r.total)}</td>
        </tr>
      ))}
    </>
  );
}
