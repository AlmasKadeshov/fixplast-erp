import { buildCashCycle, buildCollections, moneySeries } from '../../services/reports';
import { card, CardTitle, Empty, MONO, num, th } from './ui';
import { MINUS, mln, pct } from './format';
import { useReports } from './ReportsContext';
import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const td = { ...num, padding: '9px 12px' } as const;
const BLUE = '#2563eb', GREEN = '#16a34a';

const AMBER = '#d97706';
const fm = (v: number) => v.toFixed(1).replace('.', ',');

interface Pt { label: string; accrued: number; received: number; spent: number; gap: number }

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: Pt }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const row = (c: string, name: string, v: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
      <i style={{ width: 9, height: 9, borderRadius: 3, background: c, display: 'inline-block' }} />{name}
      <span style={{ marginLeft: 'auto', paddingLeft: 18, fontFamily: MONO, fontWeight: 700, color: '#0f172a' }}>{fm(v)} млн</span>
    </div>
  );
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '11px 14px', boxShadow: '0 12px 30px -12px rgba(15,23,42,.35)', minWidth: 210, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>{p.label}</div>
      {row(BLUE, 'Начислено', p.accrued)}
      {row(GREEN, 'Получено', p.received)}
      {row(AMBER, 'Расходы (ДДС)', p.spent)}
      <div style={{ borderTop: '1px solid #eef2f7', marginTop: 2, paddingTop: 6, fontSize: 12, fontWeight: 700, color: p.gap > 0 ? '#b91c1c' : '#15803d' }}>
        {p.gap > 0 ? `Не оплачено: ${fm(p.gap)} млн` : `Оплачено больше начисленного: ${fm(-p.gap)} млн`}
      </div>
    </div>
  );
}

function CycleChart({ c }: { c: { labels: string[]; accrued: number[]; received: number[]; spent: number[]; gap: number[] } }) {
  const data: Pt[] = c.labels.map((label, i) => ({
    label, accrued: c.accrued[i] / 1e6, received: c.received[i] / 1e6, spent: c.spent[i] / 1e6, gap: c.gap[i] / 1e6,
  }));
  const short = (l: string) => l.split(' ')[0].replace('.', '');
  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 14, right: 10, bottom: 0, left: 0 }} barGap={3} barCategoryGap="22%">
          <defs>
            <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#2563eb" /></linearGradient>
            <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4ade80" /><stop offset="100%" stopColor="#16a34a" /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#eef2f7" strokeDasharray="3 4" />
          <XAxis dataKey="label" tickFormatter={short} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => String(Math.round(v))}
            tick={{ fontSize: 11.5, fontWeight: 600, fill: '#94a3b8' }} label={{ value: 'млн ₸', position: 'insideTopLeft', offset: -2, dy: -14, fontSize: 11, fontWeight: 700, fill: '#94a3b8' }} />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(37,99,235,.06)' }} />
          <Bar dataKey="accrued" name="Начислено" fill="url(#gBlue)" radius={[6, 6, 0, 0]} maxBarSize={30} />
          <Bar dataKey="received" name="Получено" fill="url(#gGreen)" radius={[6, 6, 0, 0]} maxBarSize={30} />
          <Line dataKey="spent" name="Расходы (ДДС)" type="monotone" stroke={AMBER} strokeWidth={2.4} strokeDasharray="6 4"
            dot={{ r: 3.5, fill: '#fff', stroke: AMBER, strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Collections() {
  const { input, dds, balances } = useReports();
  const c = useMemo(() => (input && dds && balances ? buildCashCycle(buildCollections(input), dds, moneySeries(dds, balances.total)) : null), [input, dds, balances]);
  if (!c) return null;
  if (!c.months.length) return <Empty>Нет данных по продажам и оплатам</Empty>;
  const t = c.totals;
  const gapColor = (v: number) => (v > 0 ? '#b91c1c' : '#15803d');

  const kpis = [
    { label: 'Начислено (продажи)', value: mln(t.accrued), color: BLUE, note: 'с НДС, по отгрузке' },
    { label: 'Получено от клиентов', value: mln(t.received), color: GREEN, note: 'банк + касса, с учётом возвратов' },
    { label: t.gap >= 0 ? 'Не оплачено (рост долга)' : 'Оплачено больше начисленного', value: (t.gap < 0 ? MINUS : '') + mln(Math.abs(t.gap)), color: gapColor(t.gap), note: 'начислено − получено' },
    { label: 'Собираемость', value: pct(t.rate), color: '#1e293b', note: 'получено ÷ начислено' },
    { label: 'Расходы (ДДС)', value: mln(c.totalsCycle.spent), color: '#b45309', note: 'все платежи из банка и кассы' },
    { label: 'Чистый денежный поток', value: (c.totalsCycle.net < 0 ? '' : '+') + mln(c.totalsCycle.net), color: gapColor(-c.totalsCycle.net), note: 'все поступления − все платежи' },
  ];
  const last = c.closing.length ? c.closing[c.closing.length - 1] : NaN;
  const gapMonths = c.months.filter((_, i) => c.shortfall[i]).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="fp-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, borderRadius: 14, padding: '16px 17px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.3px', lineHeight: 1.35 }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, letterSpacing: '-1px', color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{k.label === 'Собираемость' ? '' : 'млн ₸'}</div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{k.note}</div>
          </div>
        ))}
      </div>

      {gapMonths > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 12, padding: '11px 16px', fontSize: 12.5, fontWeight: 700 }}>
          Кассовый разрыв: в {gapMonths} мес. от клиентов получено меньше, чем потрачено (помечены красным в таблице ниже).
          {Number.isFinite(last) && <span style={{ fontWeight: 600 }}> Остаток денег сейчас: {mln(last)} млн ₸.</span>}
        </div>
      )}

      <div style={{ ...card, padding: '20px 22px 14px' }}>
        <CardTitle title="Начислено, получено и расходы по месяцам" sub="млн ₸ · наведите на месяц — все цифры"
          right={<span style={{ display: 'inline-flex', gap: 12, fontSize: 11, fontWeight: 700, color: '#64748b' }}>
            <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: BLUE, marginRight: 5 }} />Начислено</span>
            <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: GREEN, marginRight: 5 }} />Получено</span>
            <span><i style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2.5px dashed ${AMBER}`, marginRight: 5, verticalAlign: 'middle' }} />Расходы (ДДС)</span>
          </span>} />
        <CycleChart c={c} />
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '17px 20px 14px', borderBottom: '1px solid #eef2f7' }}>
          <CardTitle title="Денежный цикл по месяцам" sub="млн ₸ · разрыв = на сколько вырос долг клиентов; красная ячейка расходов = кассовый разрыв" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1020 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', padding: '10px 20px' }}>Месяц</th>
                <th style={th}>Начислено</th><th style={th}>Получено</th><th style={th}>Разрыв за месяц</th>
                <th style={th}>Накопл. разрыв</th><th style={th}>Собираемость</th>
                <th style={th}>Расходы (ДДС)</th><th style={th}>Чистый поток</th><th style={th}>Остаток на конец</th>
              </tr>
            </thead>
            <tbody>
              {c.months.map((m, i) => (
                <tr key={m} style={{ borderTop: '1px solid #eef2f7' }}>
                  <td style={{ padding: '9px 20px', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.labels[i]}</td>
                  <td style={{ ...td, color: BLUE, fontWeight: 600 }}>{mln(c.accrued[i])}</td>
                  <td style={{ ...td, color: GREEN, fontWeight: 600 }}>{mln(c.received[i])}</td>
                  <td style={{ ...td, color: gapColor(c.gap[i]), fontWeight: 700 }}>{mln(c.gap[i])}</td>
                  <td style={{ ...td, color: '#475569' }}>{mln(c.cumGap[i])}</td>
                  <td style={{ ...td, fontWeight: 700, color: c.rate[i] >= 95 ? GREEN : c.rate[i] >= 80 ? '#d97706' : '#dc2626' }}>{c.accrued[i] ? pct(c.rate[i]) : '—'}</td>
                  <td style={{ ...td, color: '#b45309', fontWeight: 600, background: c.shortfall[i] ? '#fee2e2' : undefined }} title={c.shortfall[i] ? 'Кассовый разрыв: получено от клиентов меньше расходов' : undefined}>{mln(c.spent[i])}</td>
                  <td style={{ ...td, fontWeight: 700, color: c.net[i] < 0 ? '#b91c1c' : '#15803d' }}>{mln(c.net[i])}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{Number.isFinite(c.closing[i]) ? mln(c.closing[i]) : '—'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #0f172a', background: '#eff6ff' }}>
                <td style={{ padding: '11px 20px', fontWeight: 800 }}>Итого</td>
                <td style={{ ...td, fontWeight: 800, color: BLUE }}>{mln(t.accrued)}</td>
                <td style={{ ...td, fontWeight: 800, color: GREEN }}>{mln(t.received)}</td>
                <td style={{ ...td, fontWeight: 800, color: gapColor(t.gap) }}>{mln(t.gap)}</td>
                <td style={td} />
                <td style={{ ...td, fontWeight: 800 }}>{pct(t.rate)}</td>
                <td style={{ ...td, fontWeight: 800, color: '#b45309' }}>{mln(c.totalsCycle.spent)}</td>
                <td style={{ ...td, fontWeight: 800, color: c.totalsCycle.net < 0 ? '#b91c1c' : '#15803d' }}>{mln(c.totalsCycle.net)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{Number.isFinite(last) ? mln(last) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>
        Получено — статьи «Оплата клиента» и «Возврат оплаты клиенту» (банк и касса, со знаком по направлению операции, как в ДДС); переводы между счетами и прочие приходы не учитываются. Расходы и чистый поток — из ДДС (все платежи и поступления, включая займы и взносы учредителя). Остаток на конец месяца восстановлен от текущих остатков назад по чистому потоку, это приближение.
      </div>
    </div>
  );
}
