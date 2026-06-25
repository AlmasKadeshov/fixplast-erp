import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    Plus,
    Minus,
    ArrowLeftRight,
    LayoutDashboard,
    FileText,
    Calendar,
    BarChart3,
    Upload,
    Zap,
    AlertTriangle,
    Landmark,
    Banknote,
    CreditCard,
    Shield,
    Menu,
    X,
    Clock,
} from 'lucide-react';
import { collection, onSnapshot, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAccountBalances } from '../../hooks/useAccountBalances';
import { financeService } from '../../services/finance.service';
import { AccountType } from '../../models/account';
import { TransactionType } from '../../models/finance';
import { TransactionModal } from '../../components/finance/TransactionModal';
import { cn } from '../../utils/cn';
import { formatMoney } from '../../utils/formatters';

// Иконка типа счёта
const ACCOUNT_TYPE_ICONS: Record<AccountType, typeof Landmark> = {
    bank: Landmark,
    cash: Banknote,
    card: CreditCard,
    safe: Shield,
    crypto: BarChart3,
};

// Навигационные вкладки
const navTabs = [
    { label: 'Дашборд', path: '/finance', icon: LayoutDashboard, exact: true },
    { label: 'Журнал', path: '/finance/transactions', icon: FileText },
    { label: 'Календарь', path: '/finance/calendar', icon: Calendar },
    { label: 'Аналитика', path: '/finance/analytics', icon: BarChart3 },
    { label: 'Импорт', path: '/finance/import', icon: Upload },
    { label: 'Сверка', path: '/finance/reconcile', icon: AlertTriangle },
    { label: 'Авто-правила', path: '/finance/auto-rules', icon: Zap },
];

function isTabActive(tab: typeof navTabs[0], pathname: string): boolean {
    if (tab.exact) return pathname === tab.path;
    return pathname.startsWith(tab.path);
}

export function FinanceLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [modalTab, setModalTab] = useState<TransactionType | null>(null);
    const [overdueCount, setOverdueCount] = useState(0);
    const [overdueTotal, setOverdueTotal] = useState(0);

    const { balances, futurePayments, loading: balancesLoading } = useAccountBalances();
    const [cashFromDDS, setCashFromDDS] = useState(0);

    // Load DDS cash balance (all bank income - expense)
    useEffect(() => {
        financeService.getTransactions({ status: 'fact' }).then(txs => {
            let income = 0, expense = 0;
            for (const t of txs) {
                if (t.sourceType !== 'bank') continue;
                if (t.type === 'income') income += Math.abs(t.amount);
                else if (t.type === 'expense') expense += Math.abs(t.amount);
            }
            setCashFromDDS(income - expense);
        }).catch(() => {});
    }, []);

    // Подписка на просроченные плановые платежи
    useEffect(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const todayTs = Timestamp.fromDate(now);

        const q = query(
            collection(db, 'transactions'),
            where('status', '==', 'plan'),
            where('date', '<', todayTs),
            orderBy('date', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            setOverdueCount(snap.size);
            let total = 0;
            snap.forEach(doc => total += Math.abs(doc.data().amount || 0));
            setOverdueTotal(total);
        }, () => { /* ignore */ });

        return unsub;
    }, []);

    // Контент сайдбара (переиспользуется для desktop и mobile)
    const sidebarContent = (
        <div className="flex flex-col h-full">
            {/* Общий баланс */}
            <div className="p-4 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Итого на счетах
                </p>
                {balancesLoading ? (
                    <div className="h-8 w-32 bg-gray-100 rounded animate-pulse" />
                ) : (
                    <p className="text-2xl font-bold text-gray-900">
                        {formatMoney(cashFromDDS)} <span className="text-base font-normal text-gray-400">₸</span>
                    </p>
                )}
            </div>

            {/* Список счетов */}
            <div className="flex-1 overflow-y-auto py-2">
                {balances.length === 0 && !balancesLoading && (
                    <div className="px-4 py-6 text-center">
                        <p className="text-sm text-gray-400 mb-2">Нет счетов</p>
                        <p className="text-xs text-gray-400">
                            Создайте счета в настройках
                        </p>
                    </div>
                )}
                {balances.map((acc) => {
                    const Icon = ACCOUNT_TYPE_ICONS[acc.type] || Landmark;
                    return (
                        <div
                            key={acc.accountId}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                                <Icon className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700 truncate">
                                    {acc.accountName}
                                </p>
                            </div>
                            <p className={cn(
                                'text-sm font-semibold tabular-nums',
                                acc.balance >= 0 ? 'text-gray-900' : 'text-red-600'
                            )}>
                                {formatMoney(acc.balance)} ₸
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* Будущие платежи */}
            <div className="border-t border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Будущие платежи
                    </p>
                </div>
                {balancesLoading ? (
                    <div className="h-5 w-24 bg-gray-100 rounded animate-pulse" />
                ) : (
                    <div className="space-y-1">
                        {futurePayments.income > 0 && (
                            <p className="text-xs text-green-600">
                                +{formatMoney(futurePayments.income)} ₸ поступления
                            </p>
                        )}
                        {futurePayments.expense > 0 && (
                            <p className="text-xs text-red-500">
                                −{formatMoney(futurePayments.expense)} ₸ списания
                            </p>
                        )}
                        <p className={cn(
                            'text-sm font-semibold',
                            futurePayments.net >= 0 ? 'text-gray-700' : 'text-red-600'
                        )}>
                            {futurePayments.net >= 0 ? '+' : ''}{formatMoney(futurePayments.net)} ₸
                        </p>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="-m-6 flex h-[calc(100vh-4rem)]">
            {/* ===== MOBILE SIDEBAR OVERLAY ===== */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* ===== MOBILE SIDEBAR ===== */}
            <aside
                className={cn(
                    'fixed top-0 left-0 z-50 h-screen w-72 bg-white shadow-xl',
                    'transform transition-transform duration-300 ease-out lg:hidden',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-900">Счета</h2>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                {sidebarContent}
            </aside>

            {/* ===== DESKTOP SIDEBAR ===== */}
            <aside className="hidden lg:flex w-64 min-w-[256px] flex-col border-r border-gray-200 bg-white flex-shrink-0">
                {sidebarContent}
            </aside>

            {/* ===== MAIN AREA ===== */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Верхняя панель: кнопки действий */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                    {/* Mobile sidebar toggle */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-2 hover:bg-gray-100 rounded-lg mr-1"
                    >
                        <Menu className="w-5 h-5 text-gray-600" />
                    </button>

                    {/* Кнопки +Доход / -Расход / ↔Перевод */}
                    <button
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        onClick={() => setModalTab('income')}
                    >
                        <Plus className="w-4 h-4" />
                        Доход
                    </button>
                    <button
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        onClick={() => setModalTab('expense')}
                    >
                        <Minus className="w-4 h-4" />
                        Расход
                    </button>
                    <button
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        onClick={() => setModalTab('transfer')}
                    >
                        <ArrowLeftRight className="w-4 h-4" />
                        Перевод
                    </button>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Overdue badge */}
                    {overdueCount > 0 && (
                        <button
                            onClick={() => navigate('/finance/calendar')}
                            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-100 transition-colors"
                        >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {overdueCount} просрочено ({formatMoney(overdueTotal)} ₸)
                        </button>
                    )}
                </div>

                {/* Навигация (горизонтальные вкладки) */}
                <div className="border-b border-gray-200 bg-white px-4 flex-shrink-0">
                    <nav className="-mb-px flex items-center gap-1 overflow-x-auto" aria-label="Finance tabs">
                        {navTabs.map((tab) => {
                            const Icon = tab.icon;
                            const active = isTabActive(tab, location.pathname);

                            return (
                                <button
                                    key={tab.path}
                                    onClick={() => navigate(tab.path)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 border-b-2 py-3 px-3 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0',
                                        active
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                    )}
                                >
                                    <Icon className={cn(
                                        'w-4 h-4',
                                        active ? 'text-blue-500' : 'text-gray-400'
                                    )} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Mobile overdue banner */}
                {overdueCount > 0 && (
                    <div className="sm:hidden flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
                        <div className="flex items-center gap-1.5 text-amber-800 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span><strong>{overdueCount}</strong> просрочено — {formatMoney(overdueTotal)} ₸</span>
                        </div>
                        <button
                            onClick={() => navigate('/finance/calendar')}
                            className="text-xs text-amber-700 underline whitespace-nowrap"
                        >
                            Открыть
                        </button>
                    </div>
                )}

                {/* Основной контент */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    <Outlet />
                </div>
            </div>

            {/* TransactionModal */}
            {modalTab && (
                <TransactionModal
                    initialTab={modalTab}
                    onClose={() => setModalTab(null)}
                    onSaved={() => setModalTab(null)}
                />
            )}
        </div>
    );
}
