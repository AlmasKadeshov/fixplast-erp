import { useMemo, useState } from 'react';
import { buildFlows, drillOperations, type ReportRow } from '../../services/reports';
import { Sankey } from './Sankey';
import { DrillPanel } from './DrillPanel';
import { card, CardTitle, Empty, MONO, num, th } from './ui';
import { mln, monthFull, money } from './format';
import { useReports } from './ReportsContext';

const td = { ...num, padding: '8px 12px' } as const;

export function Dds() {
  const { dds, balances, input } = useReports();
  const [drill, setDrill] = useState<{ row: ReportRow; mi: number } | null>(null);
  const [view, setView] = useState<'table' | 'flow'>('table');
  const flow = useMemo(() => (input ? buildFlows(input) : null), [input]);
  if (!dds || !balances || !input) return null;
  if (!dds.months.length) return <Empty>Нет операций для ДДС</Empty>;

  const total = balances.total || 1;
  const contours = [
    { icon: '🏦', label: 'Банк', v: balances.totalBank, note: `${balances.bank.length} счёта`, c: '#3b82f6' },
    { icon: '💵', label: 'Касса', v: balances.totalCash, note: balances.cash.map(c => c.name).join(', ') || '—', c: '#60a5fa' },
    { icon: '👤', label: 'Подотчётники', v: balances.totalAccountable, note: `${balances.accountable.length} держателей`, c: '#93c5fd' },
  ];
  const drillOps = drill ? drillOperations(input, drill.row.key, dds.months[drill.mi], 'dds') : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: '#0f172a', borderRadius: 18, padding: '24px 26px', color: '#e2e8f0', display: 'grid',
        gridTemplateColumns: 'minmax(200px,1fr) minmax(0,1.9fr)', gap: 24, alignItems: 'center',
        boxShadow: '0 18px 40px -28px rgba(15,23,42,.9)',
      }} className="fp-grid-2">
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#7f8ea6' }}>Общий остаток на сегодня</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 44, fontWeight: 700, letterSpacing: '-2px', color: '#fff', lineHeight: 1 }}>{mln(balances.total)}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8' }}>млн ₸</div>
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600, marginTop: 6 }}>три параллельных контура</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
          {contours.map(c => (
            <div key={c.label} style={{ background: '#1e293b', border: '1px solid #29384f', borderRadius: 12, padding: '13px 15px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15 }}>{c.icon}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#cbd5e1' }}>{c.label}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 7 }}>{mln(c.v)}</div>
              <div style={{ height: 5, borderRadius: 3, background: '#0f172a', marginTop: 9, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(2, (c.v / total) * 100)}%`, background: c.c }} />
              </div>
              <div style={{ fontSize: 10.5, color: '#7f8ea6', fontWeight: 600, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.note}</div>
            </div>
          ))}
        </div>
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
      <div style={{ display: 'grid', gridTemplateColumns: drill ? 'minmax(0,2.6fr) minmax(280px,1fr)' : 'minmax(0,1fr)', gap: 14, alignItems: 'start' }} className="fp-grid-2">
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
                  <SectionRows key={sec.name} sec={sec} onPick={(row, mi) => setDrill({ row, mi })} />
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
          <DrillPanel title={`${drill.row.label} · ${monthFull(dds.months[drill.mi])}`} amountLabel={`${money(drill.row.values[drill.mi])} ₸`} ops={drillOps} onClose={() => setDrill(null)} />
        )}
      </div>
      )}
    </div>
  );
}

function SectionRows({ sec, onPick }: { sec: { name: string; number: string; rows: ReportRow[]; total: ReportRow }; onPick: (r: ReportRow, mi: number) => void }) {
  return (
    <>
      <tr style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <td colSpan={sec.total.values.length + 2} style={{ padding: '10px 20px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#1e293b' }}>
          {sec.number}. {sec.name} деятельность
        </td>
      </tr>
      {sec.rows.map(r => (
        <tr key={r.key} style={{ borderTop: '1px solid #f8fafc' }}>
          <td style={{ padding: '8px 20px 8px 32px', fontWeight: 500, color: '#334155', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}>{r.label}</td>
          {r.values.map((v, i) => (
            <td key={i} onClick={v !== 0 ? () => onPick(r, i) : undefined}
              style={{ ...td, fontWeight: 500, color: v < 0 ? '#475569' : '#15803d', cursor: v !== 0 ? 'pointer' : 'default' }}>{mln(v)}</td>
          ))}
          <td style={{ ...td, padding: '8px 20px 8px 12px', fontWeight: 700, background: '#f8fafc' }}>{mln(r.total)}</td>
        </tr>
      ))}
      <tr style={{ borderTop: '1px solid #e2e8f0' }}>
        <td style={{ padding: '9px 20px', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}>{sec.total.label}</td>
        {sec.total.values.map((v, i) => <td key={i} style={{ ...td, padding: '9px 12px', fontWeight: 700, color: v < 0 ? '#1e293b' : '#15803d' }}>{mln(v)}</td>)}
        <td style={{ ...td, padding: '9px 20px 9px 12px', fontWeight: 700, background: '#f8fafc' }}>{mln(sec.total.total)}</td>
      </tr>
    </>
  );
}
