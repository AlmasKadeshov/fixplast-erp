import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts';
import { ReportsProvider, useReports } from './ReportsContext';
import { Empty, FONT, MONO } from './ui';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

const CSS = `
.fp-root{min-height:100vh;display:flex;align-items:stretch;background:#eef2f7;color:#0f172a;font-family:${FONT};-webkit-font-smoothing:antialiased}
.fp-root *{box-sizing:border-box}
.fp-nav a{display:flex;align-items:center;gap:10px;width:100%;border-radius:10px;padding:9px 10px;font-size:12.5px;font-weight:600;color:#94a3b8;text-decoration:none}
.fp-nav a:hover{background:#1e293b;color:#fff}
.fp-nav a.active{background:#1e293b;color:#fff;font-weight:700;box-shadow:inset 3px 0 0 #3b82f6}
@keyframes fp-slide{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
@media (max-width:900px){
  .fp-root{flex-direction:column}
  .fp-aside{width:100%!important;flex-direction:row!important;align-items:center;padding:10px 14px!important;gap:12px;overflow-x:auto}
  .fp-aside .fp-brand{padding:0!important}
  .fp-aside .fp-nav{flex-direction:row!important;padding:0!important}
  .fp-aside .fp-nav a{width:auto;white-space:nowrap}
  .fp-aside .fp-sec{display:none!important}
  .fp-grid-2{grid-template-columns:minmax(0,1fr)!important}
  .fp-main-pad{padding:16px 14px 40px!important}
}
`;

const TITLES: Record<string, { title: string; sub: string }> = {
  '/reports': { title: 'Монитор', sub: 'Главные показатели компании' },
  '/reports/pnl': { title: 'ОПиУ', sub: 'Выручка и себестоимость по начислению, опер. расходы по факту оплаты' },
  '/reports/dds': { title: 'ДДС', sub: 'Движение денег: банк + касса' },
  '/reports/cash': { title: 'Касса', sub: 'Операции по кошелькам' },
  '/reports/import': { title: 'Импорт данных', sub: 'Загрузка таблицы из Google Sheets' },
};

function Body() {
  const { loading, error, empty } = useReports();
  const { appUser } = useAuth();
  const isOwner = appUser?.role === 'owner';
  const { pathname } = useLocation();
  if (pathname.endsWith('/import')) return <Outlet />;
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
