import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Transaction, TransactionType, getAccountId } from '../../models/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useAccounts } from '../../hooks/useAccounts';
import { useAccountBalances } from '../../hooks/useAccountBalances';
import { useCategories } from '../../hooks/useCategories';
import { CashOperationModal } from '../../components/finance/CashOperationModal';
import { formatMoney, formatMoneyCompact } from '../../utils/formatters';
import { toDate } from '../../utils/dateUtils';
import { cn } from '../../utils/cn';

// ============================================
// КОНСТАНТЫ
// ============================================

/** Сколько последних операций держим в ленте */
const FEED_LIMIT = 100;

/**
 * Firestore не умеет "contains" по строке и не даёт OR по разным полям
 * в одном запросе — поэтому берём буфер побольше по дате и фильтруем
 * на клиенте (см. isCashFeedOperation), а затем обрезаем до FEED_LIMIT.
 * Буфер должен быть заметно больше FEED_LIMIT, т.к. после массового
 * импорта продаж (sourceType: '1c') и банковской выписки в той же
 * коллекции transactions большая часть последних по дате документов
 * может не относиться к кассе.
 */
const FEED_QUERY_LIMIT = FEED_LIMIT * 5;

const TYPE_LABELS: Record<TransactionType, string> = {
    income: 'приход',
    expense: 'расход',
    transfer: 'перевод',
};

/** Бейдж типа операции */
const TYPE_BADGE: Record<TransactionType, string> = {
    income: 'bg-green-50 border-green-200 text-green-700',
    expense: 'bg-red-50 border-red-200 text-red-700',
    transfer: 'bg-blue-50 border-blue-200 text-blue-700',
};

/** Цвет суммы */
const TYPE_AMOUNT: Record<TransactionType, string> = {
    income: 'text-green-700',
    expense: 'text-red-700',
    transfer: 'text-blue-700',
};

/** Сумма со знаком: расход — со знаком минус */
function signedAmount(t: Transaction): string {
    const amount = Math.abs(t.amount || 0);
    return (t.type === 'expense' ? '−' : '') + formatMoney(amount);
}

/**
 * Операция относится к ленте «Касса», а не к массовому импорту
 * (продажи 1С, банковская выписка). Реальные кассовые операции —
 * ручной ввод через CashOperationModal и перенесённая история кассы —
 * всегда sourceType: 'manual'; sourceDoc содержит "Касса" оставлен
 * как доп. условие на случай другого источника с тем же назначением.
 */
function isCashFeedOperation(t: Transaction): boolean {
    return t.sourceType === 'manual' || (t.sourceDoc || '').includes('Касса');
}

function isToday(date: Date): boolean {
    const now = new Date();
    return (
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
    );
}

// ============================================
// ЭКРАН «КАССА»
// ============================================

/**
 * Личный модуль владельца: балансы кошельков, лента операций
 * и быстрый ввод расхода / прихода / перевода.
 */
export function CashPage() {
    const { appUser } = useAuth();
    const isOwner = appUser?.role === 'owner';

    const { accounts } = useAccounts();
    const { balances, loading: balancesLoading } = useAccountBalances();
    const { categories } = useCategories();

    const [operations, setOperations] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Transaction | null>(null);

    // Лента последних операций (realtime)
    useEffect(() => {
        if (!isOwner) return;

        const q = query(
            collection(db, 'transactions'),
            orderBy('date', 'desc'),
            limit(FEED_QUERY_LIMIT)
        );

        const unsub = onSnapshot(q, (snap) => {
            const ops = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as Transaction))
                .filter(isCashFeedOperation)
                .slice(0, FEED_LIMIT);
            setOperations(ops);
            setLoading(false);
        }, () => setLoading(false));

        return unsub;
    }, [isOwner]);

    // Имя счёта по id (или по legacy walletId — там хранится название)
    const accountNameById = useMemo(() => {
        const map = new Map<string, string>();
        accounts.forEach(a => {
            map.set(a.id, a.name);
            map.set(a.name, a.name);
        });
        return map;
    }, [accounts]);

    // Название категории по id (или по legacyItemId для до-миграционных записей)
    const categoryNameById = useMemo(() => {
        const map = new Map<string, string>();
        categories.forEach(c => {
            map.set(c.id, c.name);
            if (c.legacyItemId) map.set(c.legacyItemId, c.name);
        });
        return map;
    }, [categories]);

    const walletLabel = (t: Transaction): string => {
        const from = accountNameById.get(getAccountId(t)) || getAccountId(t) || '—';
        if (t.type !== 'transfer') return from;
        const to = t.accountToId ? accountNameById.get(t.accountToId) || t.accountToId : '—';
        return `${from} → ${to}`;
    };

    const categoryLabel = (t: Transaction): string => {
        if (t.type === 'transfer') return 'Внутренний перевод';
        return categoryNameById.get(t.categoryId) || t.categoryId || '—';
    };

    // Оборот за день: приход минус расход по фактическим операциям (без переводов)
    const dayTurnover = useMemo(
        () => operations.reduce((sum, t) => {
            if (t.type === 'transfer' || t.status !== 'fact') return sum;
            if (!isToday(toDate(t.paymentDate || t.date))) return sum;
            return t.type === 'income' ? sum + Math.abs(t.amount) : sum - Math.abs(t.amount);
        }, 0),
        [operations]
    );

    const openNew = () => {
        setEditing(null);
        setModalOpen(true);
    };

    const openEdit = (t: Transaction) => {
        setEditing(t);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
    };

    // Доступ только владельцу
    if (!isOwner) {
        return (
            <div className="max-w-md mx-auto mt-16 bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-gray-400" />
                </div>
                <h2 className="text-base font-bold text-slate-900 mb-1">Раздел недоступен</h2>
                <p className="text-sm text-gray-500">
                    Касса — личный модуль владельца.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-[1080px] pb-24">
            {/* ===== БАЛАНСЫ КОШЕЛЬКОВ + ОБОРОТ ЗА ДЕНЬ ===== */}
            <div className="flex items-center gap-3 flex-wrap mb-4">
                <div className="flex gap-2 flex-wrap">
                    {balancesLoading && balances.length === 0 && (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="w-32 h-14 bg-white border border-gray-200 rounded-xl animate-pulse" />
                        ))
                    )}
                    {balances.map(acc => (
                        <div
                            key={acc.accountId}
                            className="bg-white border border-gray-200 rounded-xl px-3 py-2 min-w-0"
                        >
                            <p className="text-[10.5px] font-bold text-gray-500 whitespace-nowrap">
                                {acc.accountName}
                            </p>
                            <p className={cn(
                                'text-sm font-mono font-bold tabular-nums',
                                acc.balance >= 0 ? 'text-slate-900' : 'text-red-600'
                            )}>
                                {formatMoneyCompact(acc.balance)}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="ml-auto bg-slate-900 text-white rounded-xl px-4 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Оборот за день
                    </p>
                    <p className="text-lg font-mono font-bold tabular-nums">
                        {dayTurnover < 0 ? '−' : ''}{formatMoney(Math.abs(dayTurnover))} ₸
                    </p>
                </div>
            </div>

            {/* ===== ЛЕНТА ОПЕРАЦИЙ ===== */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
                    <h2 className="text-[13px] font-extrabold tracking-tight text-slate-900">
                        Лента операций
                    </h2>
                    <p className="text-[11px] font-semibold text-gray-400">
                        клик по строке — редактирование
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[12.5px] min-w-[760px]">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Дата</th>
                                <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Тип</th>
                                <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Кошелёк</th>
                                <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Сумма, ₸</th>
                                <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Категория</th>
                                <th className="text-left px-3 py-2.5 pr-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Комментарий</th>
                            </tr>
                        </thead>
                        <tbody>
                            {operations.map(op => (
                                <tr
                                    key={op.id}
                                    onClick={() => openEdit(op)}
                                    className="border-t border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-500 whitespace-nowrap">
                                        {toDate(op.paymentDate || op.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={cn(
                                            'inline-block px-2 py-0.5 rounded-md border text-[10.5px] font-bold',
                                            TYPE_BADGE[op.type]
                                        )}>
                                            {TYPE_LABELS[op.type]}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">
                                        {walletLabel(op)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                        <span className={cn('font-mono font-bold tabular-nums', TYPE_AMOUNT[op.type])}>
                                            {signedAmount(op)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 font-medium text-slate-600 whitespace-nowrap">
                                        {categoryLabel(op)}
                                    </td>
                                    <td className="px-3 py-2.5 pr-4 font-medium text-gray-500">
                                        {op.description || '—'}
                                    </td>
                                </tr>
                            ))}

                            {loading && operations.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                                        Загрузка операций…
                                    </td>
                                </tr>
                            )}
                            {!loading && operations.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                                        Операций пока нет — добавьте первую
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ===== FAB: НОВАЯ ОПЕРАЦИЯ ===== */}
            <button
                type="button"
                onClick={openNew}
                className="fixed right-8 bottom-8 z-40 inline-flex items-center gap-2 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl shadow-lg shadow-blue-600/40 transition-colors"
            >
                <Plus className="w-4 h-4" />
                Новая операция
            </button>

            {modalOpen && (
                <CashOperationModal
                    operation={editing}
                    onClose={closeModal}
                />
            )}
        </div>
    );
}
