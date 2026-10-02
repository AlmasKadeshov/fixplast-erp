import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { Transaction, TransactionType, getAccountId } from '../../models/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useAccounts } from '../../hooks/useAccounts';
import { useCategories } from '../../hooks/useCategories';
import { financeService } from '../../services/finance.service';
import { SearchableSelect } from '../ui';
import { useToast } from '../ui/Toast';
import { toDate } from '../../utils/dateUtils';
import { cn } from '../../utils/cn';

// ============================================
// TYPES
// ============================================

interface CashOperationModalProps {
    /** Редактируемая операция; null/undefined — создание новой */
    operation?: Transaction | null;
    /** Тип операции при открытии (только для новой) */
    initialType?: TransactionType;
    /** Закрыть модал */
    onClose: () => void;
    /** Колбэк после успешного сохранения */
    onSaved?: () => void;
}

interface CashForm {
    /** Дата в формате yyyy-MM-dd */
    date: string;
    /** Сумма как строка (только цифры и пробелы) */
    amount: string;
    /** Счёт списания (расход / перевод) */
    fromAccountId: string;
    /** Счёт зачисления (приход / перевод) */
    toAccountId: string;
    categoryId: string;
    comment: string;
}

// ============================================
// КОНСТАНТЫ
// ============================================

const TABS: { type: TransactionType; label: string }[] = [
    { type: 'expense', label: 'Расход' },
    { type: 'income', label: 'Приход' },
    { type: 'transfer', label: 'Перевод' },
];

const EMPTY_FORM: CashForm = {
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    fromAccountId: '',
    toAccountId: '',
    categoryId: '',
    comment: '',
};

/** Разбор суммы из строки: "1 200 000" → 1200000 */
function parseAmount(raw: string): number {
    return Number(raw.replace(/[^\d]/g, '')) || 0;
}

/** Группировка разрядов при вводе: "1200000" → "1 200 000" */
function formatAmountInput(raw: string): string {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Статус определяется датой: будущая дата → плановая операция.
 * Та же логика, что в TransactionModal.
 */
function statusFromDate(date: string): 'plan' | 'fact' {
    const payDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return payDate > today ? 'plan' : 'fact';
}

// ============================================
// МОДАЛ ОПЕРАЦИИ КАССЫ
// ============================================

/**
 * Упрощённая форма операции для экрана «Касса»:
 * тип · дата · сумма · кошелёк(и) · категория · комментарий.
 *
 * Для полного ввода (контрагент, проект, теги, начисление, дробление)
 * используется TransactionModal.
 */
export function CashOperationModal({
    operation,
    initialType = 'expense',
    onClose,
    onSaved,
}: CashOperationModalProps) {
    const isEditing = !!operation;

    const { user } = useAuth();
    const { activeAccounts } = useAccounts();
    const { incomeCategories, expenseCategories } = useCategories();
    const { showToast } = useToast();

    const [type, setType] = useState<TransactionType>(operation?.type ?? initialType);
    const [form, setForm] = useState<CashForm>(() => {
        if (!operation) return EMPTY_FORM;
        const accId = getAccountId(operation);
        return {
            date: format(toDate(operation.paymentDate || operation.date), 'yyyy-MM-dd'),
            amount: formatAmountInput(String(Math.abs(operation.amount || 0))),
            fromAccountId: operation.type === 'income' ? '' : accId,
            toAccountId: operation.type === 'income' ? accId : (operation.accountToId || ''),
            categoryId: operation.categoryId || '',
            comment: operation.description || '',
        };
    });
    const [saving, setSaving] = useState(false);

    const update = (patch: Partial<CashForm>) => setForm(prev => ({ ...prev, ...patch }));

    // Счёт по умолчанию — первый активный (после загрузки счетов)
    useEffect(() => {
        if (activeAccounts.length === 0) return;
        setForm(prev => ({
            ...prev,
            fromAccountId: prev.fromAccountId || activeAccounts[0].id,
            toAccountId: prev.toAccountId || (activeAccounts[1] || activeAccounts[0]).id,
        }));
    }, [activeAccounts]);

    const isTransfer = type === 'transfer';
    const showFrom = type !== 'income';
    const showTo = type !== 'expense';

    const accountOptions = useMemo(
        () => activeAccounts.map(a => ({ value: a.id, label: a.name })),
        [activeAccounts]
    );

    const categoryOptions = useMemo(() => {
        const cats = type === 'income' ? incomeCategories : expenseCategories;
        return cats
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
            .map(c => ({ value: c.id, label: c.name }));
    }, [type, incomeCategories, expenseCategories]);

    // При смене типа сбрасываем категорию — списки доходов и расходов не пересекаются
    const switchType = (next: TransactionType) => {
        if (next === type) return;
        setType(next);
        update({ categoryId: '' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const amount = parseAmount(form.amount);
        if (!amount) {
            showToast('Укажите сумму операции', 'error');
            return;
        }
        if (!form.date) {
            showToast('Выберите дату операции', 'error');
            return;
        }

        // Счёт списания / зачисления в зависимости от типа
        const accountId = type === 'income' ? form.toAccountId : form.fromAccountId;
        if (!accountId) {
            showToast('Выберите кошелёк', 'error');
            return;
        }
        if (isTransfer) {
            if (!form.toAccountId) {
                showToast('Выберите кошелёк зачисления', 'error');
                return;
            }
            if (form.fromAccountId === form.toAccountId) {
                showToast('Кошельки списания и зачисления совпадают', 'error');
                return;
            }
        }
        if (!isTransfer && !form.categoryId) {
            showToast('Выберите категорию', 'error');
            return;
        }

        const paymentDate = Timestamp.fromDate(new Date(form.date));
        const payload = {
            date: paymentDate,
            paymentDate,
            accrualDateFrom: null,
            accrualDateTo: null,
            amount,
            type,
            status: statusFromDate(form.date),
            accountId,
            accountToId: isTransfer ? form.toAccountId : null,
            walletId: activeAccounts.find(a => a.id === accountId)?.name || '',
            partnerId: '',
            partnerBin: '',
            projectId: '',
            categoryId: isTransfer ? '' : form.categoryId,
            tagIds: [],
            description: form.comment,
            sourceDoc: 'Касса',
            sourceType: 'manual' as const,
            currency: 'KZT',
            exchangeRate: 1,
            transferCommission: null,
        };

        setSaving(true);
        try {
            if (isEditing && operation) {
                await financeService.updateTransaction(operation.id, payload);
                showToast('Операция обновлена', 'success');
            } else {
                await financeService.addTransaction({ ...payload, createdBy: user?.uid || '' });
                showToast('Операция добавлена в ленту', 'success');
            }
            onSaved?.();
            onClose();
        } catch (error) {
            console.error(error);
            showToast('Не удалось сохранить операцию', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-60 bg-slate-900/40 flex items-center justify-center p-6"
            onClick={onClose}
        >
            <form
                onSubmit={handleSubmit}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-[470px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
                {/* Заголовок */}
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
                    <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">
                        {isEditing ? 'Редактирование операции' : 'Новая операция'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-auto w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 py-5 flex flex-col gap-3.5">
                    {/* Тип операции */}
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                        {TABS.map(tab => (
                            <button
                                key={tab.type}
                                type="button"
                                onClick={() => switchType(tab.type)}
                                className={cn(
                                    'flex-1 py-2 px-2 rounded-lg text-xs transition-colors',
                                    type === tab.type
                                        ? 'bg-white text-slate-900 font-extrabold shadow-sm'
                                        : 'text-slate-600 font-bold hover:text-slate-900'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Дата и сумма */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                                Дата
                            </span>
                            <input
                                type="date"
                                value={form.date}
                                onChange={e => update({ date: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                                Сумма, ₸
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                value={form.amount}
                                onChange={e => update({ amount: formatAmountInput(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base font-mono font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                    </div>

                    {/* Кошелёк списания */}
                    {showFrom && (
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                                Кошелёк — откуда
                            </span>
                            <SearchableSelect
                                options={accountOptions}
                                value={form.fromAccountId}
                                onChange={v => update({ fromAccountId: v })}
                                placeholder="Выберите кошелёк"
                            />
                        </label>
                    )}

                    {/* Кошелёк зачисления */}
                    {showTo && (
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                                Кошелёк — куда
                            </span>
                            <SearchableSelect
                                options={
                                    isTransfer
                                        ? accountOptions.filter(o => o.value !== form.fromAccountId)
                                        : accountOptions
                                }
                                value={form.toAccountId}
                                onChange={v => update({ toAccountId: v })}
                                placeholder="Выберите кошелёк"
                            />
                        </label>
                    )}

                    {/* Категория */}
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                            Категория
                        </span>
                        {isTransfer ? (
                            <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-bold text-gray-500">
                                Внутренний перевод
                            </div>
                        ) : (
                            <SearchableSelect
                                options={categoryOptions}
                                value={form.categoryId}
                                onChange={v => update({ categoryId: v })}
                                placeholder="Выберите категорию"
                            />
                        )}
                    </label>

                    {/* Комментарий */}
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                            Комментарий
                        </span>
                        <input
                            type="text"
                            placeholder="например: аванс за ПВД, накладная 1420"
                            value={form.comment}
                            onChange={e => update({ comment: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </label>

                    {/* Действия */}
                    <div className="flex items-center gap-2.5 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-slate-700 hover:bg-gray-50 transition-colors"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="ml-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors"
                        >
                            {saving ? 'Сохранение…' : 'Сохранить'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
