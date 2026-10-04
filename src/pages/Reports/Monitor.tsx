import { latestRevenueMonth, topProducts } from '../../services/reports';
import { AreaChart, Gauge, Spark } from './charts';
import { card, CardTitle, Delta, MONO } from './ui';
import { delta, mln, monthFull, monthGen, monthShort, pct, sum, MINUS } from './format';
import { opiuRow, useReports } from './ReportsContext';

function zone(m: number) {
  if (m >= 32) return { label: 'зелёная зона', color: '#16a34a' };
  if (m >= 25) return { label: 'жёлтая зона', color: '#d97706' };
  return { label: 'красная зона', color: '#dc2626' };
}

export function Monitor() {
  const { opiu, dds, balances, input } = useReports();
  if (!opiu || !dds || !balances || !input) return null;

  const li = latestRevenueMonth(opiu);
  const month = opiu.months[li];
  const rev = opiuRow(opiu, 'revenue');
  const revNet = opiuRow(opiu, 'revenueNet');
  const oper = opiuRow(opiu, 'operatingProfit');
  const margin = opiuRow(opiu, 'operatingMargin');
  const operMargin = revNet.map((r, i) => (r > 0 ? (oper[i] / r) * 100 : 0));

  const di = dds.months.indexOf(month);
  const netFlow = dds.netFlow.values;
  const top = topProducts(input.sales, month, 5);
  const topMax = top[0]?.amount || 1;
  const z = zone(operMargin[li]);
  void margin;

  const kpis = [
    {
      label: 'Деньги сейчас', value: mln(balances.total), unit: 'млн ₸', d: null,
      note: 'банк + касса + подотчёт', spark: [] as number[], color: '#2563eb',
    },
    {
      label: 'Выручка за месяц', value: mln(rev[li]), unit: 'млн ₸', d: li > 0 ? delta(rev[li], rev[li - 1]) : null,
      note: 'к пред. месяцу', spark: rev, color: '#2563eb',
    },
    {
      label: 'Операционная прибыль', value: mln(oper[li]), unit: 'млн ₸', d: li > 0 ? delta(oper[li], oper[li - 1]) : null,
      note: 'к пред. месяцу', spark: oper, color: '#1e293b',
    },
    {
      label: 'Сальдо ДДС', value: (netFlow[di] >= 0 ? '+' : '') + mln(netFlow[di]), unit: 'млн ₸',
      d: di > 0 ? delta(netFlow[di], netFlow[di - 1]) : null, note: monthFull(month).split(' ')[0], spark: netFlow, color: '#60a5fa',
    },
    {
      label: 'Операционная маржа', value: pct(operMargin[li]), unit: 'опер.', d: null, note: 'норма 32%+',
      extra: <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: z.color }}>{z.label}</span>,
      spark: operMargin, color: '#16a34a',
    },
  ];

  const monthsLabel = `${monthFull(opiu.months[0]).split(' ')[0]} — ${monthFull(month).split(' ')[0]} ${month.slice(0, 4)}`;
  const revSeries = rev.slice(0, li + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="fp-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(196px,1fr))', gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, borderRadius: 14, padding: '16px 17px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.3px', textTransform: 'uppercase', lineHeight: 1.35 }}>{k.label}</div>
              <Spark values={k.spark} color={k.color} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{k.unit}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {k.d && <Delta text={k.d.text} up={k.d.up} />}
              {'extra' in k && k.extra}
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{k.note}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) minmax(260px,1fr)', gap: 14, alignItems: 'stretch' }} className="fp-grid-2">
        <div style={{ ...card, padding: '20px 22px 12px' }}>
          <CardTitle title="Выручка по месяцам" sub={`${monthsLabel} · млн ₸ с НДС`}
            right={<span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: '#2563eb' }}>Σ {mln(sum(revSeries))} млн ₸</span>} />
          <AreaChart values={revSeries} labels={opiu.months.slice(0, li + 1).map(monthShort)} />
        </div>

        <div style={{ ...card, padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.2px' }}>Операционная маржа</div>
          <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{monthFull(month)} · норма 32%+</div>
          <Gauge value={operMargin[li]} />
          <div style={{ textAlign: 'center', marginTop: -6 }}>
            <div style={{ fontFamily: MONO, fontSize: 38, fontWeight: 700, letterSpacing: '-1.6px', color: z.color, lineHeight: 1 }}>{pct(operMargin[li])}</div>
            <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginTop: 4 }}>Опер. прибыль {mln(oper[li])} млн ₸</div>
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
            {[['#dc2626', '0–25'], ['#d97706', '25–32'], ['#16a34a', '32+']].map(([c, t]) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
        <div style={{ ...card, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-.2px' }}>Топ-5 продаж</div>
            <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#64748b' }}>{monthFull(month)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top.map((s, i) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#94a3b8', width: 16, flex: 'none' }}>{i + 1}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{mln(s.amount)} млн</div>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: '#eef2f7', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(s.amount / topMax) * 100}%`, background: i === 0 ? '#2563eb' : '#60a5fa', borderRadius: 4 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...card, padding: '18px 20px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-.2px', marginBottom: 14 }}>Деньги по контурам</div>
          {[
            { icon: '🏦', label: 'Банк', v: balances.totalBank, c: '#3b82f6' },
            { icon: '💵', label: 'Касса', v: balances.totalCash, c: '#60a5fa' },
            { icon: '👤', label: 'Подотчётники', v: balances.totalAccountable, c: '#93c5fd' },
          ].map(c => (
            <div key={c.label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14 }}>{c.icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{c.label}</span>
                <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{mln(c.v)} млн ₸</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: '#eef2f7', marginTop: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(2, (c.v / (balances.total || 1)) * 100)}%`, background: c.c, borderRadius: 4 }} />
              </div>
            </div>
          ))}
          {balances.totalTransit < 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 6 }}>
              В итог не входит транзит (минусовые кошельки): {MINUS}{mln(Math.abs(balances.totalTransit))} млн ₸
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
