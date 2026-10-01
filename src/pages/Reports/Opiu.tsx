import { useMemo, useState } from 'react';
import { drillOperations, topProducts, type ReportRow } from '../../services/reports';
import { Donut } from './charts';
import { DrillPanel } from './DrillPanel';
import { card, CardTitle, Empty, MONO, num, th } from './ui';
import { mln, monthFull, money, pct, sum } from './format';
import { opiuRow, useReports } from './ReportsContext';
import { latestRevenueMonth } from '../../services/reports';

const td = { ...num, padding: '8px 12px' } as const;

export function Opiu() {
  const { opiu, input } = useReports();
  const [drill, setDrill] = useState<{ row: ReportRow; mi: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [slice, setSlice] = useState<string | null>(null);

  const li = opiu ? latestRevenueMonth(opiu) : 0;
  const slices = useMemo(() => {
    if (!opiu) return [];
    const g = (k: string) => Math.abs(opiuRow(opiu, k)[li] || 0);
    return [
      { key: 'costRaw', label: 'Сырьё (полимеры)', value: g('costRaw'), color: '#2563eb' },
      { key: 'zpProd', label: 'ЗП производства', value: g('zpProd'), color: '#1e293b' },
      { key: 'kommun', label: 'Коммунальные', value: g('kommun'), color: '#60a5fa' },
      { key: 'costPerekup', label: 'Перекуп', value: g('costPerekup'), color: '#94a3b8' },
    ].filter(s => s.value > 0);
  }, [opiu, li]);

  if (!opiu || !input) return null;
  if (!opiu.months.length) return <Empty>Нет данных для ОПиУ</Empty>;

  const month = opiu.months[li];
  const totalCogs = sum(slices.map(s => s.value)) || 1;
  const centerSlice = slices.find(s => s.key === (hover ?? slice));

  const drillOps = drill && drill.row.key.startsWith('opex:')
    ? drillOperations(input, drill.row.key.slice(5), opiu.months[drill.mi], 'opiu') : [];

  const openCell = (row: ReportRow, mi: number) => { setSlice(null); setDrill({ row, mi }); };

  const sliceOps = (() => {
    if (!slice) return null;
    if (slice === 'costPerekup') return drillOperations(input, 'Себестоимость (Перекуп)', month, 'dds');
    return [];
  })();
  const sliceRow = slices.find(s => s.key === slice);

  const Row = ({ r, style, label, cellColor, bold, indent }: { r: ReportRow; style?: React.CSSProperties; label?: string; cellColor?: string; bold?: boolean; indent?: boolean }) => {
    const clickable = r.key.startsWith('opex:');
    return (
      <tr style={{ borderTop: '1px solid #eef2f7', ...style }}>
        <td style={{ padding: bold ? '9px 20px' : '8px 20px 8px 32px', fontWeight: bold ? 700 : 500, color: bold ? '#0f172a' : '#334155', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: style?.background || '#fff', paddingLeft: indent ? 32 : undefined }}>{label ?? r.label}</td>
        {r.values.map((v, i) => (
          <td key={i} onClick={clickable && v !== 0 ? () => openCell(r, i) : undefined}
            style={{ ...td, fontWeight: bold ? 700 : 500, color: cellColor || (bold ? '#0f172a' : '#475569'), cursor: clickable && v !== 0 ? 'pointer' : 'default',
              textDecoration: clickable && v !== 0 ? 'underline dotted #cbd5e1' : 'none', textUnderlineOffset: 3 }}>{mln(v)}</td>
        ))}
        <td style={{ ...td, padding: '8px 20px 8px 12px', fontWeight: 700, color: cellColor || '#0f172a', background: '#f8fafc' }}>{mln(r.total)}</td>
      </tr>
    );
  };

  const R = (key: string) => opiu.rows.find(r => r.key === key)!;
  const opexRows = opiu.rows.filter(r => r.key.startsWith('opex:') || r.key === 'zpOffice' || r.key === 'bonuses');
  const pctRow = (key: string, color: string, bold = false) => {
    const r = R(key);
    return (
      <tr style={{ borderTop: '1px solid #f1f5f9' }}>
        <td style={{ padding: '9px 20px', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}>{r.label.replace(' (%)', '')}</td>
        {r.values.map((v, i) => <td key={i} style={{ ...td, padding: '9px 12px', fontWeight: bold ? 700 : 600, color }}>{pct(v)}</td>)}
        <td style={{ ...td, padding: '9px 20px 9px 12px', fontWeight: 700, color, background: '#f8fafc' }}>{pct(r.total)}</td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.6fr) minmax(268px,1fr)', gap: 14, alignItems: 'start' }} className="fp-grid-2">
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '17px 20px 14px', borderBottom: '1px solid #eef2f7' }}>
          <CardTitle title="Отчёт о прибылях и убытках" sub={`млн ₸ · ${opiu.labels[0]} — ${opiu.labels[opiu.labels.length - 1]} · клик по цифре расходов — операции`} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', padding: '10px 20px', position: 'sticky', left: 0, zIndex: 1 }}>Статья</th>
                {opiu.labels.map(m => <th key={m} style={th}>{m}</th>)}
                <th style={{ ...th, padding: '10px 20px 10px 12px', color: '#1e293b', background: '#f1f5f9' }}>Итого</th>
              </tr>
            </thead>
            <tbody>
              <Row r={R('revenue')} bold />
              <Row r={R('nds')} label="НДС" cellColor="#64748b" />
              <Row r={R('revenueNet')} bold style={{ background: '#f8fafc' }} cellColor="#2563eb" />
              <Row r={R('costRaw')} />
              <Row r={R('costPerekup')} />
              <Row r={R('zpProd')} />
              <Row r={R('kommun')} />
              <Row r={R('grossProfit')} bold style={{ background: '#f8fafc' }} />
              <tr style={{ borderTop: '1px solid #eef2f7' }}>
                <td colSpan={opiu.months.length + 2} style={{ padding: '11px 20px 6px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#64748b' }}>Операционные расходы</td>
              </tr>
              {opexRows.map(r => <Row key={r.key} r={r} />)}
              <Row r={R('opexTotal')} bold style={{ background: '#f8fafc' }} />
              {opiu.rows.find(r => r.key === 'amort') && <Row r={R('amort')} />}
              <tr style={{ borderTop: '2px solid #0f172a', background: '#eff6ff' }}>
                <td style={{ padding: '12px 20px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#eff6ff' }}>Операционная прибыль</td>
                {R('operatingProfit').values.map((v, i) => <td key={i} style={{ ...td, padding: '12px', fontWeight: 700, fontSize: 13, color: '#1d4ed8' }}>{mln(v)}</td>)}
                <td style={{ ...td, padding: '12px 20px 12px 12px', fontWeight: 700, fontSize: 13, color: '#1d4ed8' }}>{mln(R('operatingProfit').total)}</td>
              </tr>
              {pctRow('grossMargin', '#64748b')}
              {pctRow('operatingMargin', '#16a34a', true)}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <div style={{ ...card, padding: '18px 20px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-.2px' }}>Структура себестоимости</div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>{monthFull(month)} · клик по сегменту — расшифровка</div>
          <div style={{ position: 'relative', width: '100%', maxWidth: 230, margin: '6px auto 2px' }}>
            <Donut slices={slices} active={hover ?? slice} onHover={setHover} onPick={k => { setDrill(null); setSlice(k === slice ? null : k); }} />
            <div style={{ position: 'absolute', inset: '24% 22%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, pointerEvents: 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 21, fontWeight: 700, lineHeight: 1 }}>{centerSlice ? pct((centerSlice.value / totalCogs) * 100) : `${mln(totalCogs)}`}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', lineHeight: 1.25 }}>{centerSlice ? centerSlice.label : 'млн ₸ всего'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
            {slices.map(d => (
              <div key={d.key} onClick={() => { setDrill(null); setSlice(d.key === slice ? null : d.key); }}
                onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', padding: '5px 7px', borderRadius: 8, background: hover === d.key || slice === d.key ? '#f8fafc' : 'transparent' }}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{d.label}</span>
                <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{pct((d.value / totalCogs) * 100)}</span>
              </div>
            ))}
          </div>
        </div>

        {drill && (
          <DrillPanel
            title={`${drill.row.label} · ${monthFull(opiu.months[drill.mi])}`}
            amountLabel={`${money(drill.row.values[drill.mi])} ₸`} ops={drillOps} onClose={() => setDrill(null)}
          />
        )}
        {sliceRow && sliceOps && (
          <DrillPanel
            title={`${sliceRow.label} · ${monthFull(month)}`} amountLabel={`${money(-sliceRow.value)} ₸`} ops={sliceOps}
            note={slice === 'costRaw' ? 'Сырьё считается по составу изделий и ценам сырья за месяц, а не по отдельным платежам.' : undefined}
            onClose={() => setSlice(null)}
          />
        )}
        {slice === 'costRaw' && <SaleCostHint month={month} />}
      </div>
    </div>
  );
}

function SaleCostHint({ month }: { month: string }) {
  const { input } = useReports();
  if (!input) return null;
  const top = topProducts(input.sales, month, 5);
  return (
    <div style={{ ...card, padding: '14px 18px', fontSize: 12, color: '#475569', fontWeight: 600 }}>
      Крупнейшие продажи месяца: {top.map(t => t.name).join(' · ')}
    </div>
  );
}
