import { useMemo } from 'react';
import { card, Empty, MONO } from './ui';
import { money } from './format';
import { useReports } from './ReportsContext';

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Asia/Almaty' });
const TYPE = {
  расход: { label: 'Расход', bg: '#fee2e2', fg: '#b91c1c' },
  приход: { label: 'Приход', bg: '#dcfce7', fg: '#15803d' },
  перевод: { label: 'Перевод', bg: '#e0e7ff', fg: '#4338ca' },
} as const;

export function Cash() {
  const { input, balances } = useReports();
  const ops = useMemo(() => (input ? [...input.cash].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 200) : []), [input]);
  if (!input || !balances) return null;
  if (!input.cash.length) return <Empty>В листе «Сделки» нет операций</Empty>;

  const wallets = [...balances.cash, ...balances.accountable].slice(0, 8);
  return (
    <div style={{ maxWidth: 1080 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {wallets.map(w => (
          <div key={w.name} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>{w.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700 }}>{money(w.amount)}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: '1px solid #eef2f7' }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-.2px' }}>Лента операций</div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>последние {ops.length} из {input.cash.length} · данные из листа «Сделки»</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
            <thead>
              <tr>
                {['Дата', 'Тип', 'Кошелёк', 'Сумма, ₸', 'Категория', 'Комментарий'].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 3 ? 'right' : 'left', padding: '9px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#64748b', background: '#f8fafc' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ops.map((o, i) => {
                const t = TYPE[o.type as keyof typeof TYPE] ?? TYPE.расход;
                const wallet = o.type === 'перевод' ? `${o.walletFrom} → ${o.walletTo}` : o.type === 'приход' ? o.walletTo : o.walletFrom;
                return (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>{dateFmt.format(o.date)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: t.bg, color: t.fg }}>{t.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{wallet}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: MONO, fontWeight: 700, color: o.type === 'расход' ? '#b91c1c' : o.type === 'приход' ? '#15803d' : '#475569', whiteSpace: 'nowrap' }}>
                      {o.type === 'расход' ? '−' : o.type === 'приход' ? '+' : ''}{money(o.amount)}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: '#475569', whiteSpace: 'nowrap' }}>{o.category}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: '#64748b' }}>{o.comment}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
