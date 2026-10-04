import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts';
import { ReportsProvider, useReports } from './ReportsContext';
import { Empty, FONT, MONO } from './ui';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Didact+Gothic&family=Jost:wght@400;500;600;700&display=swap';

const CSS = `
.fp-root{min-height:100vh;display:flex;align-items:stretch;background:#eef2f7;color:#0f172a;font-family:${FONT};font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.fp-root *{box-sizing:border-box}
.fp-nav a{display:flex;align-items:center;gap:10px;width:100%;border-radius:10px;padding:9px 10px;font-size:12.5px;font-weight:600;color:#94a3b8;text-decoration:none}
.fp-nav a:hover{background:#1e293b;color:#fff}
.fp-nav a.active{background:#1e293b;color:#fff;font-weight:700;box-shadow:inset 3px 0 0 #3b82f6}
@keyframes fp-fade{from{opacity:0}to{opacity:1}}
@keyframes fp-slide{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
@media (max-width:900px){
  .fp-root{flex-direction:column}
  .fp-aside{width:100%!important;flex-direction:row!important;align-items:center;padding:10px 14px!important;gap:12px;overflow-x:auto}
  .fp-aside .fp-brand{padding:0!important}
  .fp-aside .fp-nav{flex-direction:row!important;padding:0!important}
  .fp-aside .fp-nav a{width:auto;white-space:nowrap}
  .fp-aside .fp-sec{display:none!important}
  .fp-grid-2{grid-template-columns:minmax(0,1fr)!important}
  .fp-main-pad{padding:14px 12px 40px!important}
  .fp-aside{position:sticky;top:0;z-index:20;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .fp-aside::-webkit-scrollbar{display:none}
  .fp-aside .fp-nav a{padding:10px 12px;font-size:13px}
  .fp-aside .fp-brand div div:last-child{display:none}
  .fp-root header{padding:10px 14px!important;gap:8px!important}
  .fp-root header > div:last-child{margin-left:0!important;width:100%;justify-content:space-between}
  .fp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
  .fp-kpis > div{padding:13px 13px!important}
  .fp-root input,.fp-root select{font-size:16px!important;min-width:0!important}
  .fp-root table{font-size:12px!important}
  .fp-root td,.fp-root th{padding:8px 9px!important}
  .fp-root tr > :first-child:not([colspan]){position:sticky;left:0;z-index:1;background-color:#fff;white-space:normal!important;min-width:112px;max-width:150px;box-shadow:1px 0 0 #e2e8f0}
  .fp-root thead tr > :first-child{background-color:#f8fafc;z-index:2}
  .fp-mrow{grid-template-columns:minmax(0,1fr) auto auto!important;gap:8px 12px!important;padding:12px 14px!important}
  .fp-mrow > :nth-child(2){grid-column:1/-1;grid-row:2}
  .fp-mrow > :nth-child(5){display:none}
  .fp-modal-wrap{align-items:flex-end!important;padding:0!important}
  .fp-modal-wrap > div{max-width:none!important;border-radius:16px 16px 0 0!important;animation:fp-up .22s ease}
  .fp-modal-wrap > div > div{border-radius:16px 16px 0 0!important;padding-bottom:max(18px,env(safe-area-inset-bottom))!important}
}
@keyframes fp-up{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
`;

const TITLES: Record<string, { title: string; sub: string }> = {
  '/reports': { title: 'Монитор', sub: 'Главные показатели компании' },
  '/reports/pnl': { title: 'ОПиУ', sub: 'Выручка и себестоимость по начислению, опер. расходы по факту оплаты' },
  '/reports/dds': { title: 'ДДС', sub: 'Движение денег: банк + касса' },
  '/reports/receivables': { title: 'Дебиторка', sub: 'Кто должен компании и как растёт долг' },
  '/reports/collections': { title: 'Реализация — Поступления — ДДС', sub: 'Продали → получили от клиентов → потратили → осталось денег' },
  '/reports/margins': { title: 'Маржинальность', sub: 'Какие продукты выгодно продавать' },
  '/reports/payroll': { title: 'Зарплата', sub: 'Табель офиса и производства: начислено, выплачено, осталось' },
  '/reports/cash': { title: 'Касса', sub: 'Операции по кошелькам' },
  '/reports/import': { title: 'Импорт данных', sub: 'Загрузка таблицы из Google Sheets' },
};

function Body() {
  const { loading, error, empty } = useReports();
  const { appUser } = useAuth();
  const isOwner = appUser?.role === 'owner';
  const { pathname } = useLocation();
  if (pathname.endsWith('/import') || pathname.endsWith('/receivables')) return <Outlet />;
  if (loading) return <Empty>Загружаем данные…</Empty>;
  if (error) {
    const denied = /permission|insufficient/i.test(error);
    return <Empty>{denied ? 'Нет доступа к отчётам. Попросите владельца добавить вашу почту в список просмотра.' : error}</Empty>;
  }
  if (empty) {
    return (
      <Empty>
        Данные ещё не загружены.{' '}
        {isOwner ? <Link to="/reports/import" style={{ color: '#2563eb', fontWeight: 700 }}>Загрузить таблицу →</Link> : 'Обратитесь к владельцу.'}
      </Empty>
    );
  }
  return <Outlet />;
}

function Shell() {
  const { appUser } = useAuth();
  const { pathname } = useLocation();
  const { meta, reload } = useReports();
  const isOwner = appUser?.role === 'owner';
  const t = TITLES[pathname.replace(/\/$/, '')] ?? TITLES['/reports'];

  useEffect(() => {
    if (document.getElementById('fp-fonts')) return;
    const l = document.createElement('link');
    l.id = 'fp-fonts'; l.rel = 'stylesheet'; l.href = FONT_HREF;
    document.head.appendChild(l);
  }, []);

  const updated = meta ? new Date(meta.importedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' }) : '';

  return (
    <div className="fp-root">
      <style>{CSS}</style>
      <aside className="fp-aside" style={{ width: 236, flex: 'none', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', padding: '22px 0' }}>
        <div className="fp-brand" style={{ padding: '0 22px 26px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: '#fff' }}>F</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.2px' }}>FixPlast</div>
            <div style={{ fontSize: 10.5, color: '#7f8ea6', fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase' }}>Упр. учёт</div>
          </div>
        </div>
        <nav className="fp-nav" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div className="fp-sec" style={{ padding: '6px 8px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: '#64748b' }}>Отчёты</div>
          <NavLink to="/reports" end><span style={{ width: 18, textAlign: 'center' }}>◧</span>Монитор</NavLink>
          <NavLink to="/reports/pnl"><span style={{ width: 18, textAlign: 'center' }}>▤</span>ОПиУ</NavLink>
          <NavLink to="/reports/dds"><span style={{ width: 18, textAlign: 'center' }}>⇄</span>ДДС</NavLink>
          <NavLink to="/reports/receivables"><span style={{ width: 18, textAlign: 'center' }}>◔</span>Дебиторка</NavLink>
          <NavLink to="/reports/collections"><span style={{ width: 18, textAlign: 'center' }}>⇅</span>Реализация / поступления</NavLink>
          <NavLink to="/reports/margins"><span style={{ width: 18, textAlign: 'center' }}>%</span>Маржинальность</NavLink>
          <NavLink to="/reports/payroll"><span style={{ width: 18, textAlign: 'center' }}>☷</span>Зарплата</NavLink>
          {isOwner && (
            <>
              <div className="fp-sec" style={{ padding: '18px 8px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: '#64748b', borderTop: '1px solid #1e293b', marginTop: 10 }}>Личное</div>
              <NavLink to="/reports/cash"><span style={{ width: 18, textAlign: 'center' }}>₸</span>Касса</NavLink>
              <NavLink to="/reports/import"><span style={{ width: 18, textAlign: 'center' }}>↥</span>Импорт данных</NavLink>
            </>
          )}
        </nav>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '13px 26px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.3px' }}>{t.title}</div>
            <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 500 }}>{t.sub}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
            {updated && <span>Данные на {updated}</span>}
            <button type="button" onClick={reload} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: '#475569' }}>Обновить</button>
          </div>
        </header>
        <div className="fp-main-pad" style={{ flex: 1, minWidth: 0, padding: '22px 26px 40px' }}>
          <Body />
        </div>
      </main>
    </div>
  );
}

export function ReportsShell({ initialData }: { initialData?: Parameters<typeof ReportsProvider>[0]['initialData'] }) {
  return (
    <ReportsProvider initialData={initialData}>
      <Shell />
    </ReportsProvider>
  );
}
