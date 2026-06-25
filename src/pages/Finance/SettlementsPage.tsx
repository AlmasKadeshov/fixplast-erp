import { useState, useEffect, useMemo } from 'react';
import { financeService } from '../../services/finance.service';
import { partnersService } from '../../services/partners.service';
import { projectsService } from '../../services/projects.service';
import { Transaction, TransactionType } from '../../models/finance';
import { Partner, Project } from '../../models';
import { useToast } from '../../components/ui/Toast';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import {
    TrendingUp,
    TrendingDown,
    X,
    Search,
    ChevronRight,
    AlertCircle,
    CheckCircle2,
    Clock,
    Building2,
} from 'lucide-react';

// ===========================
// ТИПЫ
// ===========================

interface PartnerBalance {
    partnerId: string;
    partnerName: string;
    partnerType: string;
    totalIncome: number;      // Поступления в логике взаиморасчетов (оплаты + начисления)
    totalExpense: number;     // Выплаты в логике взаиморасчетов (оплаты + начисления)
    balance: number;          // Сальдо взаиморасчетов: income - expense
    transactions: Transaction[];
    projectBreakdown: {
        projectId: string;
        projectName: string;
        income: number;
        expense: number;
        balance: number;
    }[];
    lastTransaction?: Date;
    has1C: boolean;
    hasBank: boolean;
    daysSinceLast: number;
    needsReview: boolean;
    severity: 'high' | 'medium' | 'low';
}

interface DetailModalProps {
    item: PartnerBalance;
    projects: Project[];
    onClose: () => void;
}

type QuickFilter = 'all' | 'supplier' | 'client' | 'large' | 'stale' | 'review';
type HistoryFilter = 'all' | 'accrual' | 'payment';

// ===========================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ===========================

const fmtAbsMoney = (val: number) =>
    new Intl.NumberFormat('ru-RU').format(Math.round(Math.abs(val)));

const formatDate = (date: Date) =>
    date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

const DAY_MS = 24 * 60 * 60 * 1000;
const LARGE_BALANCE_THRESHOLD = 1_000_000;
const REVIEW_BALANCE_THRESHOLD = 100_000;
const STALE_DAYS_THRESHOLD = 30;

// Для взаиморасчетов 1С-документы учитываются как начисления, т.е. в обратном
// направлении относительно cash-flow знака type.
const getSettlementType = (tx: Transaction): TransactionType => {
    if (tx.sourceType === '1c') {
        return tx.type === 'income' ? 'expense' : 'income';
    }
    return tx.type;
};

const getDaysSince = (date?: Date): number => {
    if (!date) return Number.POSITIVE_INFINITY;
    return Math.floor((Date.now() - date.getTime()) / DAY_MS);
};

const getSeverity = (balanceAbs: number, daysSinceLast: number, needsReview: boolean): 'high' | 'medium' | 'low' => {
    if (balanceAbs >= LARGE_BALANCE_THRESHOLD || daysSinceLast > STALE_DAYS_THRESHOLD) return 'high';
    if (balanceAbs >= 300_000 || needsReview) return 'medium';
    return 'low';
};

const getPriorityScore = (item: PartnerBalance): number => {
    const balanceAbs = Math.abs(item.balance);
    let score = balanceAbs;
    if (item.severity === 'high') score += 3_000_000;
    if (item.severity === 'medium') score += 1_000_000;
    if (item.needsReview) score += 500_000;
    return score;
};

const getHistoryKind = (tx: Transaction): 'accrual' | 'payment' => {
    return tx.sourceType === '1c' ? 'accrual' : 'payment';
};

// ===========================
// МОДАЛЬНОЕ ОКНО ДЕТАЛИЗАЦИИ
// ===========================

function DetailModal({ item, projects, onClose }: DetailModalProps) {
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
    const projectsMap = useMemo(
        () => new Map(projects.map((p) => [p.id, p])),
        [projects]
    );

    const sortedTxs = [...item.transactions].sort(
        (a, b) => b.date.toDate().getTime() - a.date.toDate().getTime()
    );
    const filteredTxs = useMemo(() => {
        return sortedTxs.filter((tx) => {
            if (historyFilter === 'all') return true;
            return getHistoryKind(tx) === historyFilter;
        });
    }, [sortedTxs, historyFilter]);
    const isDebtor = item.balance < 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-gray-100">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-5 h-5 text-gray-400" />
                            <h3 className="text-lg font-semibold text-gray-900">{item.partnerName}</h3>
                        </div>
                        <p className="text-sm text-gray-500">
                            {item.partnerType === 'CLIENT'
                                ? 'Заказчик'
                                : item.partnerType === 'SUPPLIER'
                                    ? 'Поставщик'
                                    : item.partnerType === 'SUBCONTRACTOR'
                                        ? 'Субподрядчик'
                                        : 'Контрагент'}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-sm text-gray-500">Итоговый баланс</div>
                            <div
                                className={`text-xl font-bold ${item.balance > 0 ? 'text-emerald-600' : item.balance < 0 ? 'text-red-600' : 'text-gray-500'
                                    }`}
                            >
                                {item.balance > 0 ? '+' : ''}
                                {fmtAbsMoney(item.balance)} ₸
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-6 space-y-6">
                    {/* Сводка */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-emerald-50 rounded-xl p-4 text-center">
                            <div className="text-xs text-emerald-600 font-medium mb-1">Поступления</div>
                            <div className="text-lg font-bold text-emerald-700">
                                {fmtAbsMoney(item.totalIncome)} ₸
                            </div>
                        </div>
                        <div className="bg-red-50 rounded-xl p-4 text-center">
                            <div className="text-xs text-red-600 font-medium mb-1">Выплаты</div>
                            <div className="text-lg font-bold text-red-700">
                                {fmtAbsMoney(item.totalExpense)} ₸
                            </div>
                        </div>
                        <div
                            className={`rounded-xl p-4 text-center ${isDebtor ? 'bg-blue-50' : 'bg-orange-50'
                                }`}
                        >
                            <div
                                className={`text-xs font-medium mb-1 ${isDebtor ? 'text-blue-600' : 'text-orange-600'
                                    }`}
                            >
                                {isDebtor ? 'Нам должны' : 'Мы должны'}
                            </div>
                            <div
                                className={`text-lg font-bold ${isDebtor ? 'text-blue-700' : 'text-orange-700'
                                    }`}
                            >
                                {fmtAbsMoney(item.balance)} ₸
                            </div>
                        </div>
                    </div>

                    {/* Разбивка по проектам */}
                    {item.projectBreakdown.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">По проектам</h4>
                            <div className="space-y-2">
                                {item.projectBreakdown.map((pb) => {
                                    const proj = projectsMap.get(pb.projectId);
                                    return (
                                        <div
                                            key={pb.projectId}
                                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                        >
                                            <div className="flex items-center gap-2">
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                                <span className="text-sm text-gray-700">
                                                    {proj?.name || pb.projectId || 'Не указан'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-6 text-sm">
                                                <span className="text-emerald-600">
                                                    +{fmtAbsMoney(pb.income)} ₸
                                                </span>
                                                <span className="text-red-500">
                                                    -{fmtAbsMoney(pb.expense)} ₸
                                                </span>
                                                <span
                                                    className={`font-semibold min-w-[100px] text-right ${pb.balance >= 0 ? 'text-blue-600' : 'text-orange-600'
                                                        }`}
                                                >
                                                    {pb.balance >= 0 ? '+' : ''}
                                                    {fmtAbsMoney(pb.balance)} ₸
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* История транзакций */}
                    <div>
                        <div className="flex items-center justify-between mb-3 gap-3">
                            <h4 className="text-sm font-semibold text-gray-700">
                                История операций ({filteredTxs.length})
                            </h4>
                            <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                <button
                                    onClick={() => setHistoryFilter('all')}
                                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${historyFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Все
                                </button>
                                <button
                                    onClick={() => setHistoryFilter('accrual')}
                                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${historyFilter === 'accrual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    1С начисления
                                </button>
                                <button
                                    onClick={() => setHistoryFilter('payment')}
                                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${historyFilter === 'payment' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Банк оплаты
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            {filteredTxs.slice(0, 30).map((tx) => {
                                const settlementType = getSettlementType(tx);
                                const historyKind = getHistoryKind(tx);
                                return (
                                    <div
                                        key={tx.id}
                                        className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-lg transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-gray-400 w-20 shrink-0">
                                                {formatDate(tx.date.toDate())}
                                            </span>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                                                {historyKind === 'accrual' ? '1С начисление' : 'Банк оплата'}
                                            </span>
                                            <span className="text-sm text-gray-600 truncate max-w-[220px]">
                                                {tx.description || tx.sourceDoc || '—'}
                                            </span>
                                        </div>
                                        <span
                                            className={`text-sm font-medium shrink-0 ${settlementType === 'income' ? 'text-emerald-600' : 'text-red-500'
                                                }`}
                                        >
                                            {settlementType === 'income' ? '+' : '-'}
                                            {fmtAbsMoney(tx.amount)} ₸
                                        </span>
                                    </div>
                                );
                            })}
                            {filteredTxs.length > 30 && (
                                <p className="text-xs text-gray-400 text-center pt-2">
                                    Показаны 30 из {filteredTxs.length} операций
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ===========================
// КАРТОЧКА КОНТРАГЕНТА
// ===========================

function PartnerCard({
    item,
    mode,
    onClick,
}: {
    item: PartnerBalance;
    mode: 'debtors' | 'creditors';
    onClick: () => void;
}) {
    const balanceAbs = Math.abs(item.balance);
    const totalFlow = item.totalIncome + item.totalExpense;
    const incomeWidth = totalFlow > 0 ? (item.totalIncome / totalFlow) * 100 : 0;
    const expenseWidth = totalFlow > 0 ? (item.totalExpense / totalFlow) * 100 : 0;

    const statusIcon =
        balanceAbs === 0 ? (
            <CheckCircle2 className="w-4 h-4 text-gray-400" />
        ) : mode === 'debtors' ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
        ) : (
            <AlertCircle className="w-4 h-4 text-orange-500" />
        );

    const severityBadge =
        item.severity === 'high'
            ? 'bg-red-50 text-red-700 border-red-200'
            : item.severity === 'medium'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-gray-50 text-gray-600 border-gray-200';

    const severityLabel =
        item.severity === 'high' ? 'Критично' : item.severity === 'medium' ? 'Средний' : 'Низкий';

    return (
        <div
            onClick={onClick}
            className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {statusIcon}
                    <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate text-sm">{item.partnerName}</p>
                        <p className="text-xs text-gray-400">
                            {item.transactions.length} операций
                            {item.lastTransaction && (
                                <> · последняя {formatDate(item.lastTransaction)}</>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${severityBadge}`}>
                        {severityLabel}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
                </div>
            </div>

            <div className="flex items-end justify-between mb-3">
                <div className="space-y-1 text-xs text-gray-500">
                    <div>
                        {mode === 'debtors' ? 'Нам должны' : 'Мы должны'}
                    </div>
                    <div>
                        {item.daysSinceLast > STALE_DAYS_THRESHOLD
                            ? `Без движения ${item.daysSinceLast} дн.`
                            : `Движение ${item.daysSinceLast} дн. назад`}
                    </div>
                </div>

                <div className="text-right">
                    <div
                        className={`text-lg font-bold ${mode === 'debtors' ? 'text-emerald-600' : 'text-red-600'
                            }`}
                    >
                        {fmtAbsMoney(balanceAbs)} ₸
                    </div>
                </div>
            </div>

            {/* Мини-бар: поступления vs выплаты */}
            {totalFlow > 0 ? (
                <div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                        <div
                            className="h-full bg-emerald-400 transition-all"
                            style={{ width: `${incomeWidth}%` }}
                        />
                        <div
                            className="h-full bg-red-400 transition-all"
                            style={{ width: `${expenseWidth}%` }}
                        />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-emerald-600">Поступления {fmtAbsMoney(item.totalIncome)} ₸</span>
                        <span className="text-red-500">Выплаты {fmtAbsMoney(item.totalExpense)} ₸</span>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

// ===========================
// ГЛАВНЫЙ КОМПОНЕНТ
// ===========================

export function SettlementsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'debtors' | 'creditors'>('debtors');
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
    const [search, setSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState<PartnerBalance | null>(null);
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [txs, pts, prjs] = await Promise.all([
                financeService.getTransactions({ status: 'fact' }),
                partnersService.getAll(),
                projectsService.getAll(),
            ]);
            setTransactions(txs);
            setPartners(pts);
            setProjects(prjs);
        } catch (err) {
            console.error(err);
            showToast('Ошибка загрузки данных', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Карта партнёров для быстрого поиска
    const partnersMap = useMemo(
        () => new Map(partners.map((p) => [p.id, p])),
        [partners]
    );

    // Карта проектов
    const projectsMap = useMemo(
        () => new Map(projects.map((p) => [p.id, p])),
        [projects]
    );

    // Вычисляем балансы по каждому контрагенту
    const allBalances = useMemo((): PartnerBalance[] => {
        const map = new Map<string, PartnerBalance>();

        for (const tx of transactions) {
            const pid = tx.partnerId || '__unknown__';
            const partner = partnersMap.get(pid);
            const partnerName = partner?.name || tx.partnerId || 'Неизвестный контрагент';
            const partnerType = partner?.type || 'SUPPLIER';

            if (!map.has(pid)) {
                map.set(pid, {
                    partnerId: pid,
                    partnerName,
                    partnerType,
                    totalIncome: 0,
                    totalExpense: 0,
                    balance: 0,
                    transactions: [],
                    projectBreakdown: [],
                    lastTransaction: undefined,
                    has1C: false,
                    hasBank: false,
                    daysSinceLast: 0,
                    needsReview: false,
                    severity: 'low',
                });
            }

            const entry = map.get(pid)!;
            const amount = Math.abs(tx.amount);
            const settlementType = getSettlementType(tx);

            if (settlementType === 'income') {
                entry.totalIncome += amount;
            } else {
                entry.totalExpense += amount;
            }

            entry.transactions.push(tx);
            if (tx.sourceType === '1c') entry.has1C = true;
            if (tx.sourceType === 'bank') entry.hasBank = true;

            const txDate = tx.date.toDate();
            if (!entry.lastTransaction || txDate > entry.lastTransaction) {
                entry.lastTransaction = txDate;
            }

            // Разбивка по проектам
            const projId = tx.projectId || '__no_project__';
            let projEntry = entry.projectBreakdown.find((pb) => pb.projectId === projId);
            if (!projEntry) {
                const proj = projectsMap.get(projId);
                projEntry = {
                    projectId: projId,
                    projectName: proj?.name || 'Без проекта',
                    income: 0,
                    expense: 0,
                    balance: 0,
                };
                entry.projectBreakdown.push(projEntry);
            }
            if (settlementType === 'income') {
                projEntry.income += amount;
            } else {
                projEntry.expense += amount;
            }
        }

        // Считаем финальный баланс
        for (const entry of map.values()) {
            entry.balance = entry.totalIncome - entry.totalExpense;
            entry.daysSinceLast = getDaysSince(entry.lastTransaction);
            entry.needsReview = entry.has1C && entry.hasBank && Math.abs(entry.balance) > REVIEW_BALANCE_THRESHOLD;
            entry.severity = getSeverity(Math.abs(entry.balance), entry.daysSinceLast, entry.needsReview);
            for (const pb of entry.projectBreakdown) {
                pb.balance = pb.income - pb.expense;
            }
            // Сортируем разбивку по абсолютному значению
            entry.projectBreakdown.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
        }

        return Array.from(map.values());
    }, [transactions, partnersMap, projectsMap]);

    // Для сальдо взаиморасчетов:
    // balance = income - expense
    // Для 1С направление операции инвертируется (документ vs оплата).
    // Если balance < 0 -> нам должны (дебиторка)
    // Если balance > 0 -> мы должны (кредиторка)

    const debtors = useMemo(() => {
        return allBalances
            .filter((b) => b.balance < -100 && b.partnerId !== '__unknown__') // нам должны
            .sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
    }, [allBalances]);

    const creditors = useMemo(() => {
        return allBalances
            .filter((b) => b.balance > 100 && b.partnerId !== '__unknown__') // мы должны
            .sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
    }, [allBalances]);

    const displayed = activeTab === 'debtors' ? debtors : creditors;

    const searched = useMemo(() => {
        if (!search.trim()) return displayed;
        const q = search.toLowerCase();
        return displayed.filter((item) => item.partnerName.toLowerCase().includes(q));
    }, [displayed, search]);

    const filtered = useMemo(() => {
        return searched.filter((item) => {
            if (quickFilter === 'all') return true;
            if (quickFilter === 'supplier') return item.partnerType === 'SUPPLIER';
            if (quickFilter === 'client') return item.partnerType === 'CLIENT';
            if (quickFilter === 'large') return Math.abs(item.balance) >= LARGE_BALANCE_THRESHOLD;
            if (quickFilter === 'stale') return item.daysSinceLast > STALE_DAYS_THRESHOLD;
            if (quickFilter === 'review') return item.needsReview;
            return true;
        });
    }, [searched, quickFilter]);

    const totalDebtors = useMemo(
        () => debtors.reduce((sum, b) => sum + Math.abs(b.balance), 0),
        [debtors]
    );
    const totalCreditors = useMemo(
        () => creditors.reduce((sum, b) => sum + b.balance, 0),
        [creditors]
    );
    const netPosition = totalDebtors - totalCreditors;
    const quickFilters = useMemo(() => {
        const count = (fn: (b: PartnerBalance) => boolean) => displayed.filter(fn).length;
        return [
            { id: 'all' as QuickFilter, label: 'Все', count: displayed.length },
            { id: 'supplier' as QuickFilter, label: 'Поставщики', count: count((b) => b.partnerType === 'SUPPLIER') },
            { id: 'client' as QuickFilter, label: 'Клиенты', count: count((b) => b.partnerType === 'CLIENT') },
            { id: 'large' as QuickFilter, label: '> 1 млн', count: count((b) => Math.abs(b.balance) >= LARGE_BALANCE_THRESHOLD) },
            { id: 'stale' as QuickFilter, label: 'Без движения 30+ дней', count: count((b) => b.daysSinceLast > STALE_DAYS_THRESHOLD) },
            { id: 'review' as QuickFilter, label: 'Требуют сверки', count: count((b) => b.needsReview) },
        ];
    }, [displayed]);

    return (
        <div className="space-y-6">
            {/* Заголовок */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">Взаиморасчёты</h2>
                    <ReportInfoPopover
                        title="Как читать взаиморасчёты"
                        items={[
                            {
                                label: 'Дебиторы',
                                text: 'Контрагенты, которые должны нам по взаиморасчетам (документы/начисления больше оплат).',
                            },
                            {
                                label: 'Кредиторы',
                                text: 'Контрагенты, которым должны мы (документы/начисления больше оплат).',
                            },
                            {
                                label: 'Источник данных',
                                text: 'Данные рассчитываются автоматически из проведённых транзакций. Для точности необходимо, чтобы все операции были привязаны к контрагентам.',
                            },
                        ]}
                    />
                </div>
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                    <Clock className="w-4 h-4" />
                    Обновить
                </button>
            </div>

            {/* Сводные КПИ */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-600">Нам должны</span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-600">
                        {fmtAbsMoney(totalDebtors)} ₸
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{debtors.length} контрагентов</div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                            <TrendingDown className="w-4 h-4 text-red-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-600">Мы должны</span>
                    </div>
                    <div className="text-2xl font-bold text-red-600">
                        {fmtAbsMoney(totalCreditors)} ₸
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{creditors.length} контрагентов</div>
                </div>

                <div
                    className={`border rounded-xl p-5 ${netPosition >= 0
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-orange-50 border-orange-200'
                        }`}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${netPosition >= 0 ? 'bg-blue-100' : 'bg-orange-100'
                                }`}
                        >
                            {netPosition >= 0 ? (
                                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            ) : (
                                <AlertCircle className="w-4 h-4 text-orange-600" />
                            )}
                        </div>
                        <span className="text-sm font-medium text-gray-600">Чистая позиция</span>
                    </div>
                    <div
                        className={`text-2xl font-bold ${netPosition >= 0 ? 'text-blue-700' : 'text-orange-700'
                            }`}
                    >
                        {netPosition >= 0 ? '+' : ''}
                        {fmtAbsMoney(netPosition)} ₸
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        {netPosition >= 0 ? 'Нам должны больше' : 'Мы должны больше'}
                    </div>
                </div>
            </div>

            {/* Вкладки + поиск */}
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                <div className="flex bg-gray-100 rounded-xl p-1 gap-1 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('debtors')}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'debtors'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <span className="flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            Дебиторы (нам должны)
                            <span className="ml-1 bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                                {debtors.length}
                            </span>
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('creditors')}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'creditors'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <span className="flex items-center gap-1.5">
                            <TrendingDown className="w-4 h-4 text-red-500" />
                            Кредиторы (мы должны)
                            <span className="ml-1 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                                {creditors.length}
                            </span>
                        </span>
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Поиск по контрагенту..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-64"
                    />
                </div>
            </div>

            {/* Быстрые фильтры */}
            <div className="flex flex-wrap gap-2">
                {quickFilters.map((filter) => (
                    <button
                        key={filter.id}
                        onClick={() => setQuickFilter(filter.id)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${quickFilter === filter.id
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        {filter.label} <span className="font-semibold">{filter.count}</span>
                    </button>
                ))}
            </div>

            {/* Контент */}
            {loading ? (
                <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-400 text-sm">Загрузка данных...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">
                        {search
                            ? 'Контрагент не найден'
                            : quickFilter !== 'all'
                                ? 'По выбранному фильтру записей нет'
                            : activeTab === 'debtors'
                                ? 'Нет дебиторской задолженности'
                                : 'Нет кредиторской задолженности'}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                        {!search && 'Все взаиморасчёты сбалансированы'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filtered.map((item) => (
                        <PartnerCard
                            key={item.partnerId}
                            item={item}
                            mode={activeTab}
                            onClick={() => setSelectedItem(item)}
                        />
                    ))}
                </div>
            )}

            {/* Детальное модальное окно */}
            {selectedItem && (
                <DetailModal
                    item={selectedItem}
                    projects={projects}
                    onClose={() => setSelectedItem(null)}
                />
            )}
        </div>
    );
}
