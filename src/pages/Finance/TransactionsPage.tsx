// @ts-nocheck — адаптируется под FixPlast
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
    Search, Trash2, Edit2, CheckSquare, Square,
    Save, X, Filter, Plus, Scissors,
    ArrowRightLeft, CheckCircle, Clock, Wallet, Lock,
} from 'lucide-react';
import { Timestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { financeService } from '../../services/finance.service';
import { projectsService } from '../../services/projects.service';
import { costItemsService } from '../../services/costItems.service';
import { partnersService } from '../../services/partners.service';
import { Transaction, TransactionType, getPaymentDate, getAccountId } from '../../models/finance';
import { Project, Partner } from '../../models';
import { CostItem } from '../../models/costItems';
import { useAccounts } from '../../hooks/useAccounts';
import { useFinanceSettings } from '../../hooks/useFinanceSettings';
import { useToast } from '../../components/ui/Toast';
import { SearchableSelect } from '../../components/ui';
import { buildProjectSelectTree } from '../../utils/projectTree';
import { TransactionModal } from '../../components/finance/TransactionModal';

export function TransactionsPage() {
    const location = useLocation();
    const locationState = location.state as {
        filterProjectId?: string;
        sourceType?: 'all' | 'bank' | '1c';
        filterYear?: number | 'all';
    } | null;

    // Data State
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);

    // Accounts
    const { activeAccounts } = useAccounts();
    const accountMap = useMemo(() => {
        const map = new Map<string, string>();
        activeAccounts.forEach(a => {
            map.set(a.id, a.name);
            map.set(a.name, a.name); // for legacy walletId matching
        });
        return map;
    }, [activeAccounts]);

    // Plan transactions (future payments panel)
    const [planTransactions, setPlanTransactions] = useState<Transaction[]>([]);
    const [showFuturePanel, setShowFuturePanel] = useState(true);

    // Project tree for grouped select dropdowns
    const projectTree = useMemo(() => buildProjectSelectTree(projects, true), [projects]);

    // Filter State (инициализируем из location.state если переход из ОПиУ)
    const [selectedYear, setSelectedYear] = useState<number | 'all'>(locationState?.filterYear ?? new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
    const [sourceType, setSourceType] = useState<'all' | 'bank' | '1c'>(locationState?.sourceType || 'all');
    const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPartnerIds, setFilterPartnerIds] = useState<string[]>([]); // мульти-выбор контрагентов
    const [filterPartnerId, setFilterPartnerId] = useState('');             // одиночный (для совместимости фильтра)
    const [filterProjectId, setFilterProjectId] = useState(locationState?.filterProjectId || '');
    const [filterCategoryId, setFilterCategoryId] = useState('');
    const [filterAccountId, setFilterAccountId] = useState('');
    const [partnerFilterQuery, setPartnerFilterQuery] = useState('');
    const [showFilters, setShowFilters] = useState(!!locationState?.filterProjectId);

    // Finance settings (lock period)
    const { isLocked, settings: financeSettings, updateClosedDate } = useFinanceSettings();

    // Split transaction state
    const [splitTx, setSplitTx] = useState<Transaction | null>(null);
    interface SplitPart { amount: string; categoryId: string; projectId: string; description: string; type: TransactionType }
    const [splitParts, setSplitParts] = useState<SplitPart[]>([
        { amount: '', categoryId: '', projectId: '', description: '', type: 'expense' },
        { amount: '', categoryId: '', projectId: '', description: '', type: 'expense' },
    ]);

    // Selection & Edit State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ projectId: string; categoryId: string }>({ projectId: '', categoryId: '' });

    // Bulk Edit State
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [bulkProject, setBulkProject] = useState('');       // '' = без изменений, 'CLEAR' = очистить, иначе id
    const [bulkCategory, setBulkCategory] = useState('');     // '' = без изменений, иначе id

    const { showToast } = useToast();

    // Partner lookup map for quick access
    const partnerMap = useMemo(() => {
        const map = new Map<string, Partner>();
        partners.forEach(p => map.set(p.id, p));
        return map;
    }, [partners]);

    const sortedPartners = useMemo(
        () => partners.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')),
        [partners]
    );
    const filteredPartnerOptions = useMemo(() => {
        const query = partnerFilterQuery.trim().toLowerCase();
        if (!query) return sortedPartners;
        return sortedPartners.filter(p => `${p.name} ${p.bin || ''}`.toLowerCase().includes(query));
    }, [sortedPartners, partnerFilterQuery]);
    const projectFilterOptions = useMemo(
        () => [
            { value: 'NO_PROJECT', label: '— Без проекта', keywords: 'без проекта' },
            ...projectTree.flatMap(g => g.children.length > 0
                ? g.children.map(c => ({ value: c.id, label: `${g.name} / ${c.name}`, keywords: `${g.name} ${c.name}` }))
                : [{ value: g.id, label: g.name, keywords: g.name }]
            ),
        ],
        [projectTree]
    );
    const categoryFilterOptions = useMemo(
        () => costItems
            .slice()
            .sort((a, b) => a.itemName.localeCompare(b.itemName, 'ru'))
            .map(c => ({ value: c.itemId, label: c.itemName, keywords: `${c.itemName} ${c.itemId}` })),
        [costItems]
    );

    // Load Initial Data
    useEffect(() => {
        Promise.all([
            projectsService.getAll(),
            costItemsService.getAll(),
            partnersService.getAll()
        ]).then(([p, c, pr]) => {
            setProjects(p);
            setCostItems(c);
            setPartners(pr);
        }).catch(console.error);
    }, []);

    // Load Transactions
    useEffect(() => {
        loadTransactions();
    }, [selectedYear, selectedMonth]);

    const loadTransactions = async () => {
        setLoading(true);
        try {
            let startDate: Date;
            let endDate: Date;

            if (selectedYear === 'all') {
                startDate = new Date(2020, 0, 1);
                endDate = new Date(new Date().getFullYear() + 5, 11, 31, 23, 59, 59);
            } else if (selectedMonth === 'all') {
                startDate = new Date(selectedYear, 0, 1);
                endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
            } else {
                startDate = new Date(selectedYear, selectedMonth, 1);
                endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
            }

            const data = await financeService.getTransactions({ startDate, endDate });
            setTransactions(data);
            setSelectedIds(new Set()); // Clear selection on reload
        } catch (error) {
            console.error(error);
            showToast('Ошибка загрузки транзакций', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Subscribe to plan transactions (future payments)
    useEffect(() => {
        const q = query(
            collection(db, 'transactions'),
            where('status', '==', 'plan'),
        );
        const unsub = onSnapshot(q, (snap) => {
            const txns: Transaction[] = [];
            snap.forEach(doc => txns.push({ id: doc.id, ...doc.data() } as Transaction));
            txns.sort((a, b) => getPaymentDate(a).toDate().getTime() - getPaymentDate(b).toDate().getTime());
            setPlanTransactions(txns);
        });
        return unsub;
    }, []);

    // Confirm plan → fact
    const confirmPlanTransaction = async (txId: string) => {
        try {
            await financeService.updateTransaction(txId, { status: 'fact' });
            showToast('Транзакция подтверждена', 'success');
        } catch {
            showToast('Ошибка подтверждения', 'error');
        }
    };

    // Active filter count
    const activeFilterCount = [
        filterPartnerIds.length > 0 ? 'multi' : filterPartnerId,
        filterProjectId,
        filterCategoryId,
        filterAccountId,
        filterType !== 'all' ? filterType : '',
    ].filter(Boolean).length;

    // Переключить контрагента в мульти-фильтре
    const togglePartnerFilter = (id: string) => {
        setFilterPartnerIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Разбивка транзакции
    const handleSplitSave = async () => {
        if (!splitTx) return;
        const parts = splitParts.filter(p => p.amount && Number(p.amount) > 0);
        if (parts.length < 2) {
            showToast('Заполните хотя бы две части', 'error');
            return;
        }
        // Проверяем что у каждой части выбрана статья
        const missingCatIdx = parts.findIndex(p => !p.categoryId);
        if (missingCatIdx !== -1) {
            showToast(`Выберите статью для части ${missingCatIdx + 1}`, 'error');
            return;
        }
        const total = parts.reduce((s, p) => s + Number(p.amount), 0);
        if (Math.abs(total - splitTx.amount) > 1) {
            showToast(`Сумма частей (${total.toLocaleString()}) не равна исходной (${splitTx.amount.toLocaleString()})`, 'error');
            return;
        }
        setLoading(true);
        try {
            // Создаём части СНАЧАЛА (до удаления оригинала)
            for (const p of parts) {
                const txData = {
                    date: Timestamp.fromDate(splitTx.date.toDate()),
                    type: p.type,
                    amount: Number(p.amount),
                    categoryId: p.categoryId,
                    projectId: p.projectId || '',
                    partnerId: splitTx.partnerId || '',
                    partnerBin: splitTx.partnerBin || '',
                    description: p.description || splitTx.description || '',
                    sourceType: splitTx.sourceType || 'bank' as const,
                    sourceDoc: splitTx.sourceDoc ? `[Разбивка] ${splitTx.sourceDoc}` : '[Разбивка]',
                    walletId: splitTx.walletId || 'Основной (KZT)',
                    status: 'fact' as const,
                };
                await financeService.addTransaction(txData);
            }
            // Удаляем оригинал только после успешного создания всех частей
            await financeService.deleteTransactions([splitTx.id]);
            showToast('Транзакция разбита успешно', 'success');
            setSplitTx(null);
            loadTransactions();
        } catch (e: any) {
            console.error('Split error:', e);
            // Показываем детальную ошибку
            const msg = e?.errors
                ? e.errors.map((err: any) => `${err.path?.join('.')}: ${err.message}`).join(', ')
                : e?.message || 'Неизвестная ошибка';
            showToast(`Ошибка: ${msg}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (sourceType !== 'all' && t.sourceType !== sourceType) return false;
            if (filterType !== 'all' && t.type !== filterType) return false;
            // Мульти-фильтр контрагентов (если выбраны — показываем только их)
            if (filterPartnerIds.length > 0 && !filterPartnerIds.includes(t.partnerId)) return false;
            // Одиночный фильтр (старый, из панели фильтров)
            if (filterPartnerIds.length === 0 && filterPartnerId && t.partnerId !== filterPartnerId) return false;
            if (filterProjectId === 'NO_PROJECT' && t.projectId) return false;
            if (filterProjectId && filterProjectId !== 'NO_PROJECT' && t.projectId !== filterProjectId) return false;
            if (filterCategoryId && t.categoryId !== filterCategoryId) return false;
            // Account filter
            if (filterAccountId) {
                const accId = getAccountId(t);
                if (accId !== filterAccountId && t.accountToId !== filterAccountId) return false;
            }

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const desc = t.description?.toLowerCase() || '';
                const partnerName = partnerMap.get(t.partnerId)?.name?.toLowerCase() || '';
                return desc.includes(q) || t.amount.toString().includes(q) || partnerName.includes(q);
            }
            return true;
        });
    }, [transactions, sourceType, filterType, searchQuery, filterPartnerIds, filterPartnerId, filterProjectId, filterCategoryId, filterAccountId, partnerMap]);

    // Handlers
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredTransactions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredTransactions.map(t => t.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleBulkDelete = async () => {
        // Filter out locked transactions
        const unlocked = Array.from(selectedIds).filter(id => {
            const tx = transactions.find(t => t.id === id);
            return tx && !isLocked(getPaymentDate(tx).toDate());
        });
        if (unlocked.length === 0) {
            showToast('Все выбранные транзакции в закрытом периоде', 'warning');
            return;
        }
        if (!confirm(`Вы уверены, что хотите удалить ${unlocked.length} записей?`)) return;

        setLoading(true);
        try {
            await financeService.deleteTransactions(unlocked);
            showToast(`Удалено ${unlocked.length} записей`, 'success');
            loadTransactions(); // Reload
        } catch (error) {
            showToast('Ошибка удаления', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkEdit = async () => {
        if (!bulkProject && !bulkCategory) {
            showToast('Выберите проект или статью для изменения', 'warning');
            return;
        }
        // bulkProject может быть 'CLEAR' — это тоже валидное изменение

        if (!confirm(`Вы уверены, что хотите обновить ${selectedIds.size} записей?`)) return;

        setLoading(true);
        try {
            const updates: any = {};
            if (bulkProject === 'CLEAR') updates.projectId = '';           // очистить проект
            else if (bulkProject) updates.projectId = bulkProject;         // установить проект
            if (bulkCategory) updates.categoryId = bulkCategory;

            const ids = Array.from(selectedIds);
            const BATCH_SIZE = 50;

            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                const chunk = ids.slice(i, i + BATCH_SIZE);
                await Promise.all(chunk.map(id => financeService.updateTransaction(id, updates)));
            }

            showToast(`Обновлено ${selectedIds.size} записей`, 'success');
            loadTransactions();
            setShowBulkEdit(false);
            setBulkProject('');
            setBulkCategory('');
        } catch (error) {
            showToast('Ошибка обновления', 'error');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (t: Transaction) => {
        setEditingId(t.id);
        setEditForm({ projectId: t.projectId, categoryId: t.categoryId });
    };

    const saveEdit = async (id: string) => {
        try {
            await financeService.updateTransaction(id, editForm);
            showToast('Сохранено', 'success');
            setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...editForm } : t));
            setEditingId(null);
        } catch (error) {
            showToast('Ошибка сохранения', 'error');
        }
    };

    const handleCreateTransaction = async (data: any) => {
        setLoading(true);
        try {
            await financeService.addTransaction(data);
            showToast('Транзакция создана', 'success');
            setShowAddModal(false);
            loadTransactions();
        } catch (error) {
            console.error(error);
            showToast('Ошибка создания', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Журнал транзакций</h1>

                <div className="flex flex-wrap gap-2">
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                        className="bg-white border rounded-lg px-3 py-2"
                    >
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>

                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="bg-white border rounded-lg px-3 py-2"
                    >
                        <option value="all">Весь год</option>
                        {Array.from({ length: 12 }).map((_, i) => (
                            <option key={i} value={i}>{format(new Date(2024, i, 1), 'LLLL', { locale: ru })}</option>
                        ))}
                    </select>

                    <div className="flex border rounded-lg overflow-hidden bg-white">
                        <button
                            onClick={() => setSourceType('all')}
                            className={`px-3 py-2 text-sm ${sourceType === 'all' ? 'bg-gray-100 font-bold' : ''}`}
                        >Все</button>
                        <button
                            onClick={() => setSourceType('bank')}
                            className={`px-3 py-2 text-sm border-l ${sourceType === 'bank' ? 'bg-blue-50 text-blue-600 font-bold' : ''}`}
                        >Банк</button>
                        <button
                            onClick={() => setSourceType('1c')}
                            className={`px-3 py-2 text-sm border-l ${sourceType === '1c' ? 'bg-orange-50 text-orange-600 font-bold' : ''}`}
                        >1С</button>
                    </div>

                    <div className="flex border rounded-lg overflow-hidden bg-white">
                        <button
                            onClick={() => setFilterType('all')}
                            className={`px-3 py-2 text-sm ${filterType === 'all' ? 'bg-gray-100 font-bold' : ''}`}
                        >Все</button>
                        <button
                            onClick={() => setFilterType('income')}
                            className={`px-3 py-2 text-sm border-l ${filterType === 'income' ? 'bg-green-50 text-green-600 font-bold' : ''}`}
                        >Приход</button>
                        <button
                            onClick={() => setFilterType('expense')}
                            className={`px-3 py-2 text-sm border-l ${filterType === 'expense' ? 'bg-red-50 text-red-600 font-bold' : ''}`}
                        >Расход</button>
                        <button
                            onClick={() => setFilterType('transfer')}
                            className={`px-3 py-2 text-sm border-l ${filterType === 'transfer' ? 'bg-purple-50 text-purple-600 font-bold' : ''}`}
                        ><ArrowRightLeft className="w-4 h-4 inline-block" /></button>
                    </div>

                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${showFilters || activeFilterCount > 0 ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white hover:bg-gray-50'}`}
                    >
                        <Filter className="w-4 h-4" />
                        Фильтры
                        {activeFilterCount > 0 && (
                            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => {
                            const dateStr = prompt('Закрыть период до (ГГГГ-ММ-ДД):', financeSettings.closedDate || format(new Date(), 'yyyy-MM-dd'));
                            if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                                updateClosedDate(dateStr);
                                showToast(`Период закрыт до ${dateStr}`, 'success');
                            }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50"
                    >
                        <Lock className="w-4 h-4" />
                    </button>

                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 shadow-sm transition-all active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        Создать
                    </button>
                </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-wrap gap-4 items-start animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-col gap-1 min-w-[240px]">
                        <label className="text-xs font-medium text-gray-500">Контрагенты (можно выбрать несколько)</label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                value={partnerFilterQuery}
                                onChange={e => setPartnerFilterQuery(e.target.value)}
                                placeholder="Найти контрагента..."
                                className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div className="border rounded-lg bg-white max-h-48 overflow-y-auto divide-y divide-gray-50">
                            {filteredPartnerOptions.map(p => (
                                <label key={p.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-gray-50 ${filterPartnerIds.includes(p.id) ? 'bg-blue-50' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={filterPartnerIds.includes(p.id)}
                                        onChange={() => togglePartnerFilter(p.id)}
                                        className="accent-blue-600"
                                    />
                                    <span className={`truncate ${filterPartnerIds.includes(p.id) ? 'font-medium text-blue-700' : 'text-gray-700'}`}>{p.name}</span>
                                </label>
                            ))}
                        </div>
                        {filterPartnerIds.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {filterPartnerIds.map(id => (
                                    <span key={id} className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                                        {partners.find(p => p.id === id)?.name || id}
                                        <button onClick={() => togglePartnerFilter(id)}><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-[200px]">
                        <label className="text-xs font-medium text-gray-500">Проект</label>
                        <SearchableSelect
                            value={filterProjectId}
                            onChange={(value) => setFilterProjectId(value)}
                            options={projectFilterOptions}
                            placeholder="Все проекты"
                            clearLabel="Все проекты"
                            searchPlaceholder="Найти проект..."
                        />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[200px]">
                        <label className="text-xs font-medium text-gray-500">Статья</label>
                        <SearchableSelect
                            value={filterCategoryId}
                            onChange={(value) => setFilterCategoryId(value)}
                            options={categoryFilterOptions}
                            placeholder="Все статьи"
                            clearLabel="Все статьи"
                            searchPlaceholder="Найти статью..."
                        />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[200px]">
                        <label className="text-xs font-medium text-gray-500">Счёт</label>
                        <select
                            value={filterAccountId}
                            onChange={e => setFilterAccountId(e.target.value)}
                            className="border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">Все счета</option>
                            {activeAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>
                    {activeFilterCount > 0 && (
                        <button
                            onClick={() => { setFilterPartnerId(''); setFilterPartnerIds([]); setFilterProjectId(''); setFilterCategoryId(''); setFilterAccountId(''); setFilterType('all'); }}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" /> Сбросить
                        </button>
                    )}
                </div>
            )}

            {/* Lock Period Indicator */}
            {financeSettings.closedDate && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm">
                    <Lock className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600">
                        Период закрыт до: <strong>{format(new Date(financeSettings.closedDate), 'dd.MM.yyyy')}</strong>
                    </span>
                    <button
                        onClick={() => {
                            if (confirm('Снять блокировку периода?')) {
                                updateClosedDate(null);
                            }
                        }}
                        className="ml-2 text-xs text-red-500 hover:text-red-700"
                    >
                        Снять
                    </button>
                </div>
            )}

            {/* Search & Bulk Actions */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl border shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Поиск по описанию, сумме или контрагенту..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>

                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                        <span className="text-sm font-medium text-gray-600 mr-2">
                            Выбрано: {selectedIds.size}
                        </span>

                        {showBulkEdit ? (
                            <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg">
                                <select
                                    className="text-sm border rounded px-2 py-1"
                                    value={bulkProject}
                                    onChange={e => setBulkProject(e.target.value)}
                                >
                                    <option value="">Без изменений</option>
                                    <option value="CLEAR">— Очистить проект</option>
                                    {projectTree.map(g => g.children.length > 0 ? (
                                        <optgroup key={g.id} label={g.name}>
                                            {g.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </optgroup>
                                    ) : (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                                <select
                                    className="text-sm border rounded px-2 py-1"
                                    value={bulkCategory}
                                    onChange={e => setBulkCategory(e.target.value)}
                                >
                                    <option value="">Без изменений</option>
                                    {costItems.map(c => <option key={c.itemId} value={c.itemId}>{c.itemName}</option>)}
                                </select>
                                <button onClick={handleBulkEdit} className="p-1 bg-green-500 text-white rounded hover:bg-green-600">
                                    <CheckSquare className="w-5 h-5" />
                                </button>
                                <button onClick={() => setShowBulkEdit(false)} className="p-1 bg-gray-300 rounded hover:bg-gray-400">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowBulkEdit(true)}
                                className="flex items-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                            >
                                <Edit2 className="w-4 h-4 mr-2" /> Изменить
                            </button>
                        )}

                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                        >
                            <Trash2 className="w-4 h-4 mr-2" /> Удалить
                        </button>
                    </div>
                )}
            </div>

            {/* Future Payments Panel */}
            {planTransactions.length > 0 && showFuturePanel && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <span className="text-sm font-semibold text-amber-800">
                                Будущие платежи ({planTransactions.length})
                            </span>
                        </div>
                        <button
                            onClick={() => setShowFuturePanel(false)}
                            className="text-amber-400 hover:text-amber-600 p-1"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {planTransactions.slice(0, 20).map(pt => (
                            <div key={pt.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-sm">
                                <span className="text-xs text-gray-500 tabular-nums w-20 shrink-0">
                                    {format(getPaymentDate(pt).toDate(), 'dd.MM.yy')}
                                </span>
                                <span className={`font-medium tabular-nums w-28 shrink-0 text-right ${
                                    pt.type === 'income' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                    {pt.type === 'income' ? '+' : '−'}{pt.amount.toLocaleString()} ₸
                                </span>
                                <span className="text-gray-700 truncate flex-1">{pt.description || '—'}</span>
                                <span className="text-xs text-gray-400 truncate max-w-[100px]">
                                    {accountMap.get(getAccountId(pt)) || ''}
                                </span>
                                <button
                                    onClick={() => confirmPlanTransaction(pt.id)}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-xs font-medium shrink-0"
                                >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Факт
                                </button>
                            </div>
                        ))}
                        {planTransactions.length > 20 && (
                            <p className="text-xs text-amber-600 text-center pt-1">
                                ...ещё {planTransactions.length - 20} платежей
                            </p>
                        )}
                    </div>
                </div>
            )}
            {planTransactions.length > 0 && !showFuturePanel && (
                <button
                    onClick={() => setShowFuturePanel(true)}
                    className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700"
                >
                    <Clock className="w-4 h-4" />
                    Показать будущие платежи ({planTransactions.length})
                </button>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden relative min-h-[400px]">
                {loading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20 backdrop-blur-sm transition-all duration-300">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-medium text-gray-500">Загрузка...</span>
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 w-10">
                                    <button onClick={toggleSelectAll}>
                                        {selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0
                                            ? <CheckSquare className="w-5 h-5 text-blue-600" />
                                            : <Square className="w-5 h-5 text-gray-300" />
                                        }
                                    </button>
                                </th>
                                <th className="px-4 py-3">Дата</th>
                                <th className="px-4 py-3">Сумма</th>
                                <th className="px-4 py-3 max-w-xs">Описание</th>
                                <th className="px-4 py-3">Контрагент</th>
                                <th className="px-4 py-3">Счёт</th>
                                <th className="px-4 py-3">Проект</th>
                                <th className="px-4 py-3">Статья</th>
                                <th className="px-4 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredTransactions.map(t => {
                                const txLocked = isLocked(getPaymentDate(t).toDate());
                                return (
                                <tr key={t.id} className={`hover:bg-gray-50 group transition-colors ${selectedIds.has(t.id) ? 'bg-blue-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        {txLocked ? (
                                            <span title="Период закрыт"><Lock className="w-4 h-4 text-gray-300" /></span>
                                        ) : (
                                            <button onClick={() => toggleSelect(t.id)}>
                                                {selectedIds.has(t.id)
                                                    ? <CheckSquare className="w-5 h-5 text-blue-600" />
                                                    : <Square className="w-5 h-5 text-gray-300" />
                                                }
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                        {format(getPaymentDate(t).toDate(), 'dd.MM.yyyy')}
                                    </td>
                                    <td className={`px-4 py-3 whitespace-nowrap font-medium ${
                                        t.type === 'income' ? 'text-green-600'
                                        : t.type === 'transfer' ? 'text-purple-600'
                                        : 'text-red-600'
                                    }`}>
                                        {t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '−'}{t.amount.toLocaleString()} ₸
                                        {t.type === 'transfer' && <ArrowRightLeft className="w-3 h-3 inline ml-1" />}
                                    </td>
                                    <td className="px-4 py-3 max-w-xs truncate" title={t.description}>
                                        <div className="flex flex-col">
                                            <span className="truncate">{t.description}</span>
                                            {t.sourceDoc && <span className="text-xs text-gray-400 truncate">{t.sourceDoc}</span>}
                                        </div>
                                    </td>

                                    {/* Partner */}
                                    <td className="px-4 py-3 max-w-[220px]">
                                        <span
                                            className="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs whitespace-normal leading-tight"
                                            title={partnerMap.get(t.partnerId)?.name || ''}
                                        >
                                            {partnerMap.get(t.partnerId)?.name || '—'}
                                        </span>
                                    </td>

                                    {/* Account */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <Wallet className="w-3 h-3 text-gray-400 shrink-0" />
                                            <span className="text-xs text-gray-600 truncate max-w-[120px]">
                                                {accountMap.get(getAccountId(t)) || t.walletId || '—'}
                                            </span>
                                        </div>
                                        {t.type === 'transfer' && t.accountToId && (
                                            <div className="flex items-center gap-1 mt-0.5 text-purple-500">
                                                <span className="text-[10px]">→</span>
                                                <span className="text-xs truncate max-w-[120px]">
                                                    {accountMap.get(t.accountToId) || t.accountToId}
                                                </span>
                                            </div>
                                        )}
                                    </td>

                                    {/* Editable Project */}
                                    <td className="px-4 py-3">
                                        {editingId === t.id ? (
                                            <select
                                                className="w-full border rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={editForm.projectId}
                                                onChange={e => setEditForm(prev => ({ ...prev, projectId: e.target.value }))}
                                            >
                                                <option value="">Не выбран</option>
                                                {projectTree.map(g => g.children.length > 0 ? (
                                                    <optgroup key={g.id} label={g.name}>
                                                        {g.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </optgroup>
                                                ) : (
                                                    <option key={g.id} value={g.id}>{g.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span
                                                className="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs cursor-pointer hover:bg-gray-200 transition-colors"
                                                onClick={() => startEdit(t)}
                                                title="Нажмите для редактирования"
                                            >
                                                {projects.find(p => p.id === t.projectId)?.name || 'Не выбран'}
                                            </span>
                                        )}
                                    </td>

                                    {/* Editable Category */}
                                    <td className="px-4 py-3">
                                        {editingId === t.id ? (
                                            <select
                                                className="w-full border rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={editForm.categoryId}
                                                onChange={e => setEditForm(prev => ({ ...prev, categoryId: e.target.value }))}
                                            >
                                                <option value="">Не выбрана</option>
                                                {costItems.map(c => <option key={c.itemId} value={c.itemId}>{c.itemName}</option>)}
                                            </select>
                                        ) : (
                                            <span
                                                className="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs truncate max-w-[150px] cursor-pointer hover:bg-gray-200 transition-colors"
                                                onClick={() => startEdit(t)}
                                                title={costItems.find(c => c.itemId === t.categoryId)?.itemName || 'Нажмите для редактирования'}
                                            >
                                                {costItems.find(c => c.itemId === t.categoryId)?.itemName || 'Не выбрана'}
                                            </span>
                                        )}
                                    </td>

                                    {/* Actions */}
                                    <td className="px-4 py-3">
                                        {txLocked ? (
                                            <span className="text-xs text-gray-300" title="Период закрыт — редактирование заблокировано">
                                                <Lock className="w-4 h-4" />
                                            </span>
                                        ) : editingId === t.id ? (
                                            <div className="flex gap-2">
                                                <button onClick={() => saveEdit(t.id)} className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50">
                                                    <Save className="w-5 h-5" />
                                                </button>
                                                <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                                                    <X className="w-5 h-5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => startEdit(t)} title="Редактировать" className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSplitTx(t);
                                                        setSplitParts([
                                                            { amount: '', categoryId: t.categoryId || '', projectId: t.projectId || '', description: '', type: t.type },
                                                            { amount: '', categoryId: '', projectId: '', description: '', type: t.type },
                                                        ]);
                                                    }}
                                                    title="Разбить на части"
                                                    className="text-orange-400 hover:text-orange-600 p-1 rounded hover:bg-orange-50"
                                                >
                                                    <Scissors className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                                );
                            })}
                            {filteredTransactions.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500 flex flex-col items-center justify-center">
                                        <Search className="w-8 h-8 text-gray-300 mb-2" />
                                        <p>Нет транзакций за выбранный период</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showAddModal && (
                <TransactionModal
                    onClose={() => setShowAddModal(false)}
                    onSave={handleCreateTransaction}
                    isSaving={loading}
                    projects={projects}
                    partners={partners}
                    costItems={costItems}
                />
            )}

            {/* Модальное окно разбивки транзакции */}
            {splitTx && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <Scissors className="w-5 h-5 text-orange-500" />
                                    Разбить транзакцию на части
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Исходная сумма: <strong>{splitTx.amount.toLocaleString()} ₸</strong> ·
                                    {format(splitTx.date.toDate(), ' dd.MM.yyyy')} ·
                                    {partnerMap.get(splitTx.partnerId)?.name || '—'}
                                </p>
                            </div>
                            <button onClick={() => setSplitTx(null)} className="p-1.5 hover:bg-gray-200 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* Parts */}
                        <div className="overflow-y-auto p-6 space-y-4">
                            {splitParts.map((part, idx) => (
                                <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3 relative">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-700">Часть {idx + 1}</span>
                                        {splitParts.length > 2 && (
                                            <button onClick={() => setSplitParts(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500 p-1 rounded">
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Тип */}
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Тип</label>
                                            <div className="flex rounded-lg overflow-hidden border border-gray-200">
                                                <button
                                                    type="button"
                                                    onClick={() => setSplitParts(prev => prev.map((p, i) => i === idx ? { ...p, type: 'income' } : p))}
                                                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${part.type === 'income' ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                                                >Приход</button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSplitParts(prev => prev.map((p, i) => i === idx ? { ...p, type: 'expense' } : p))}
                                                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${part.type === 'expense' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                                                >Расход</button>
                                            </div>
                                        </div>
                                        {/* Сумма */}
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Сумма ₸ *</label>
                                            <input
                                                type="number"
                                                value={part.amount}
                                                onChange={e => setSplitParts(prev => prev.map((p, i) => i === idx ? { ...p, amount: e.target.value } : p))}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-orange-400 outline-none"
                                                placeholder="0"
                                            />
                                        </div>
                                        {/* Статья */}
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Статья *</label>
                                            <select
                                                value={part.categoryId}
                                                onChange={e => setSplitParts(prev => prev.map((p, i) => i === idx ? { ...p, categoryId: e.target.value } : p))}
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-orange-400 outline-none"
                                            >
                                                <option value="">Выберите статью</option>
                                                {costItems.map(c => <option key={c.itemId} value={c.itemId}>{c.itemName}</option>)}
                                            </select>
                                        </div>
                                        {/* Проект */}
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Проект</label>
                                            <select
                                                value={part.projectId}
                                                onChange={e => setSplitParts(prev => prev.map((p, i) => i === idx ? { ...p, projectId: e.target.value } : p))}
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-orange-400 outline-none"
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
                                    </div>
                                    {/* Описание */}
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Комментарий</label>
                                        <input
                                            type="text"
                                            value={part.description}
                                            onChange={e => setSplitParts(prev => prev.map((p, i) => i === idx ? { ...p, description: e.target.value } : p))}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                                            placeholder="Например: транзит на Aitore"
                                        />
                                    </div>
                                </div>
                            ))}

                            {/* Остаток */}
                            {(() => {
                                const filled = splitParts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                                const rest = splitTx.amount - filled;
                                return (
                                    <div className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${Math.abs(rest) < 1 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                                        <span>{Math.abs(rest) < 1 ? '✅ Сумма распределена полностью' : `⚠️ Осталось распределить: ${rest.toLocaleString()} ₸`}</span>
                                        <span className="font-mono">{filled.toLocaleString()} / {splitTx.amount.toLocaleString()} ₸</span>
                                    </div>
                                );
                            })()}

                            <button
                                onClick={() => setSplitParts(prev => [...prev, { amount: '', categoryId: '', projectId: '', description: '', type: splitTx.type }])}
                                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 px-2"
                            >
                                <Plus className="w-4 h-4" /> Добавить часть
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                            <button onClick={() => setSplitTx(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">
                                Отмена
                            </button>
                            <button
                                onClick={handleSplitSave}
                                disabled={loading}
                                className="px-6 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
                            >
                                <Scissors className="w-4 h-4" />
                                Разбить и сохранить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
