// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
    Wallet,
    Plus,
    Trash2,
    ArrowUpRight,
    Banknote,
    Building2,
    User,
    CalendarDays,
    Receipt,
    ShieldCheck,
    Lock,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { founderExpensesService } from '../../services/founderExpenses.service';
import { projectsService } from '../../services/projects.service';
import { FounderExpense, FOUNDER_EXPENSE_CATEGORIES } from '../../models/founderExpense';
import { Project } from '../../models';
import { buildProjectSelectTree } from '../../utils/projectTree';
import { formatMoney as fmt } from '../../utils/formatters';

// ============================================
// PIN SCREEN
// ============================================

function PinScreen({ onSuccess }: { onSuccess: () => void }) {
    const { token } = useParams<{ token: string }>();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        // Если токен в URL валидный, сразу пускаем
        if (token && founderExpensesService.validateToken(token)) {
            onSuccess();
        }
    }, [token, onSuccess]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (founderExpensesService.validateToken(pin)) {
            onSuccess();
        } else {
            setError('Неверный код доступа');
            setPin('');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 w-full max-w-sm border border-white/20 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Подотчёт</h1>
                    <p className="text-slate-400 text-sm">Введите код доступа для входа</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="password"
                        value={pin}
                        onChange={(e) => { setPin(e.target.value); setError(''); }}
                        placeholder="Код доступа"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
                        autoFocus
                    />
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <button
                        type="submit"
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg"
                    >
                        Войти
                    </button>
                </form>
            </div>
        </div>
    );
}

// ============================================
// ADD EXPENSE MODAL
// ============================================

function AddExpenseModal({
    isOpen,
    onClose,
    onSave,
    projects,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Omit<FounderExpense, 'id' | 'createdAt'>) => Promise<void>;
    projects: Project[];
}) {
    const [expenseType, setExpenseType] = useState<'company_expense' | 'personal'>('company_expense');
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    // Дерево проектов для группированного select
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const projectTree = buildProjectSelectTree(projects, true);

    const handleSave = async () => {
        if (!amount || Number(amount) <= 0) return;
        if (expenseType === 'company_expense' && !categoryId) return;

        setSaving(true);
        try {
            const category = FOUNDER_EXPENSE_CATEGORIES.find(c => c.id === categoryId);
            const project = projects.find(p => p.id === projectId);

            await onSave({
                date: Timestamp.fromDate(new Date(date + 'T12:00:00')),
                amount: Number(amount),
                type: expenseType,
                categoryId: expenseType === 'personal' ? 'FOUNDERS_OUT' : categoryId,
                categoryName: expenseType === 'personal' ? 'Личный вывод' : (category?.name || ''),
                description,
                projectId: projectId || undefined,
                projectName: project?.name || undefined,
            });

            // Сброс формы
            setAmount('');
            setCategoryId('');
            setProjectId('');
            setDescription('');
            setDate(new Date().toISOString().slice(0, 10));
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
                    <h3 className="text-lg font-bold text-gray-900">Новый расход</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Тип */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setExpenseType('company_expense')}
                            className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${expenseType === 'company_expense'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            <Building2 className="w-4 h-4 mx-auto mb-1" />
                            Расход компании
                        </button>
                        <button
                            onClick={() => setExpenseType('personal')}
                            className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${expenseType === 'personal'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            <User className="w-4 h-4 mx-auto mb-1" />
                            Личный вывод
                        </button>
                    </div>

                    {/* Дата */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Дата</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Сумма */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Сумма (₸)</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold"
                            autoFocus
                        />
                    </div>

                    {/* Статья (только для расхода компании) */}
                    {expenseType === 'company_expense' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Статья расхода</label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Выберите статью...</option>
                                {FOUNDER_EXPENSE_CATEGORIES.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Проект */}
                    {expenseType === 'company_expense' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Проект (необязательно)</label>
                            <select
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Без проекта</option>
                                {projectTree.map(g => g.children.length > 0 ? (
                                    <optgroup key={g.id} label={g.name}>
                                        {g.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </optgroup>
                                ) : (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Описание */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Комментарий</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={expenseType === 'personal' ? 'Например: на личные нужды' : 'Что купили / за что оплатили'}
                            rows={2}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100">
                    <button
                        onClick={handleSave}
                        disabled={saving || !amount || Number(amount) <= 0 || (expenseType === 'company_expense' && !categoryId)}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                    >
                        {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================
// MAIN PAGE
// ============================================

export function FounderExpensesPage() {
    const [authenticated, setAuthenticated] = useState(false);
    const [expenses, setExpenses] = useState<FounderExpense[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [totalWithdrawn, setTotalWithdrawn] = useState(0);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (authenticated) loadData();
    }, [authenticated]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [expList, prjs, withdrawn] = await Promise.all([
                founderExpensesService.getAll(),
                projectsService.getAll(),
                founderExpensesService.getTotalWithdrawn(),
            ]);
            setExpenses(expList);
            setProjects(prjs);
            setTotalWithdrawn(withdrawn);
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddExpense = async (data: Omit<FounderExpense, 'id' | 'createdAt'>) => {
        await founderExpensesService.addExpense(data);
        await loadData();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Удалить эту запись?')) return;
        setDeletingId(id);
        try {
            await founderExpensesService.deleteExpense(id);
            await loadData();
        } finally {
            setDeletingId(null);
        }
    };

    const summary = useMemo(() => {
        let companyExpenses = 0;
        let personalTotal = 0;

        expenses.forEach(e => {
            if (e.type === 'company_expense') companyExpenses += e.amount;
            else personalTotal += e.amount;
        });

        return {
            companyExpenses,
            personalTotal,
            balance: totalWithdrawn - companyExpenses - personalTotal,
        };
    }, [expenses, totalWithdrawn]);

    // Группировка по месяцам
    const groupedExpenses = useMemo(() => {
        const groups: Record<string, FounderExpense[]> = {};
        expenses.forEach(e => {
            const d = e.date.toDate();
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(e);
        });
        return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
    }, [expenses]);

    const formatMonthLabel = (key: string) => {
        const [y, m] = key.split('-');
        const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        return `${months[parseInt(m) - 1]} ${y}`;
    };

    // PIN screen
    if (!authenticated) {
        return <PinScreen onSuccess={() => setAuthenticated(true)} />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white">
                <div className="max-w-2xl mx-auto px-4 py-6">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Подотчёт учредителя</h1>
                            <p className="text-slate-400 text-xs">AMREGroup • Управление наличными</p>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Снято из банка */}
                        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm col-span-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Снято из банка</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalWithdrawn)} ₸</p>
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-200">
                                    <Banknote className="w-6 h-6 text-white" />
                                </div>
                            </div>
                        </div>

                        {/* Расходы компании */}
                        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <Building2 className="w-4 h-4 text-blue-600" />
                                </div>
                                <p className="text-xs text-gray-500 font-medium">На компанию</p>
                            </div>
                            <p className="text-lg font-bold text-blue-700">{fmt(summary.companyExpenses)} ₸</p>
                        </div>

                        {/* Личные */}
                        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
                                    <User className="w-4 h-4 text-purple-600" />
                                </div>
                                <p className="text-xs text-gray-500 font-medium">Личные</p>
                            </div>
                            <p className="text-lg font-bold text-purple-700">{fmt(summary.personalTotal)} ₸</p>
                        </div>

                        {/* Остаток */}
                        <div className={`rounded-2xl p-4 border shadow-sm col-span-2 ${summary.balance >= 0
                            ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200'
                            : 'bg-gradient-to-r from-red-50 to-red-100 border-red-200'
                            }`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Остаток на подотчёте</p>
                                    <p className={`text-3xl font-extrabold mt-1 ${summary.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {fmt(summary.balance)} ₸
                                    </p>
                                </div>
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${summary.balance >= 0
                                    ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-200'
                                    : 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-200'
                                    }`}>
                                    <Wallet className="w-7 h-7 text-white" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Add button */}
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-2xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 text-base"
                    >
                        <Plus className="w-5 h-5" />
                        Добавить расход
                    </button>

                    {/* Expense list */}
                    {groupedExpenses.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-sm">
                            <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 font-medium">Пока нет записей</p>
                            <p className="text-gray-400 text-sm mt-1">Нажмите «Добавить расход» чтобы начать</p>
                        </div>
                    ) : (
                        groupedExpenses.map(([monthKey, items]) => (
                            <div key={monthKey} className="space-y-2">
                                <div className="flex items-center gap-2 px-1">
                                    <CalendarDays className="w-4 h-4 text-gray-400" />
                                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                        {formatMonthLabel(monthKey)}
                                    </h3>
                                    <span className="text-xs text-gray-400">
                                        ({fmt(items.reduce((s, e) => s + e.amount, 0))} ₸)
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {items.map(expense => {
                                        const d = expense.date.toDate();
                                        const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
                                        const isPersonal = expense.type === 'personal';

                                        return (
                                            <div
                                                key={expense.id}
                                                className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex items-start gap-3 min-w-0">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isPersonal
                                                            ? 'bg-purple-100'
                                                            : 'bg-blue-100'
                                                            }`}>
                                                            {isPersonal
                                                                ? <User className="w-5 h-5 text-purple-600" />
                                                                : <ArrowUpRight className="w-5 h-5 text-blue-600" />
                                                            }
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                                {isPersonal ? 'Личный вывод' : expense.categoryName}
                                                            </p>
                                                            {expense.description && (
                                                                <p className="text-xs text-gray-500 mt-0.5 truncate">{expense.description}</p>
                                                            )}
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] text-gray-400">{dateStr}</span>
                                                                {expense.projectName && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                                                                        {expense.projectName}
                                                                    </span>
                                                                )}
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isPersonal
                                                                    ? 'bg-purple-100 text-purple-600'
                                                                    : 'bg-blue-100 text-blue-600'
                                                                    }`}>
                                                                    {isPersonal ? 'Личные' : 'Компания'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                                        <p className="text-sm font-bold text-red-600 whitespace-nowrap">
                                                            −{fmt(expense.amount)} ₸
                                                        </p>
                                                        <button
                                                            onClick={() => handleDelete(expense.id)}
                                                            disabled={deletingId === expense.id}
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}

                    {/* Footer stats */}
                    <div className="bg-white/50 rounded-xl p-4 text-center text-xs text-gray-400 mt-8">
                        <p>Всего записей: {expenses.length} • Расходы компании: {expenses.filter(e => e.type === 'company_expense').length} • Личные: {expenses.filter(e => e.type === 'personal').length}</p>
                    </div>
                </div>
            )}

            {/* Add Modal */}
            <AddExpenseModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSave={handleAddExpense}
                projects={projects}
            />
        </div>
    );
}
