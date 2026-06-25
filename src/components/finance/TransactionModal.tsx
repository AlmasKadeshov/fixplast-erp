// @ts-nocheck — требует адаптации partners/projects service API под FixPlast
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Save, Plus, Check, ChevronDown, Search } from 'lucide-react';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { TransactionType } from '../../models/finance';
import { Project, Partner } from '../../models';
import { CostItem } from '../../models/costItems';
import { buildProjectSelectTree } from '../../utils/projectTree';
import { SearchableSelect } from '../ui';
import { useAccounts } from '../../hooks/useAccounts';
import { useCategories } from '../../hooks/useCategories';
import { useTags } from '../../hooks/useTags';
import { financeService } from '../../services/finance.service';
import { useToast } from '../ui/Toast';

// ============================================
// TYPES
// ============================================

interface TransactionModalProps {
    /** Начальная вкладка */
    initialTab?: TransactionType;
    /** Закрыть модал */
    onClose: () => void;
    /** Колбэк после успешного сохранения */
    onSaved?: () => void;
    // --- Legacy props (для обратной совместимости с TransactionsPage) ---
    onSave?: (data: any) => Promise<void>;
    isSaving?: boolean;
    projects?: Project[];
    partners?: Partner[];
    costItems?: CostItem[];
}

interface SplitPart {
    categoryId: string;
    projectId: string;
    amount: string;
}

interface FormData {
    type: TransactionType;
    amount: string;
    accountId: string;
    accountToId: string;
    categoryId: string;
    partnerId: string;
    projectId: string;
    tagIds: string[];
    paymentDate: string;
    accrualDateFrom: string;
    accrualDateTo: string;
    description: string;
    sourceType: 'bank' | '1c' | 'manual';
    transferCommission: string;
}

const INITIAL_FORM: FormData = {
    type: 'expense',
    amount: '',
    accountId: '',
    accountToId: '',
    categoryId: '',
    partnerId: '',
    projectId: '',
    tagIds: [],
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    accrualDateFrom: '',
    accrualDateTo: '',
    description: '',
    sourceType: 'manual',
    transferCommission: '',
};

// ============================================
// TAG MULTI-SELECT COMPONENT
// ============================================

function TagMultiSelect({
    selectedIds,
    onChange,
    tags,
}: {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    tags: { id: string; name: string }[];
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return tags;
        return tags.filter(t => t.name.toLowerCase().includes(q));
    }, [tags, search]);

    const toggle = (id: string) => {
        onChange(
            selectedIds.includes(id)
                ? selectedIds.filter(x => x !== id)
                : [...selectedIds, id]
        );
    };

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-left text-sm flex items-center justify-between gap-2"
            >
                <span className={selectedIds.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedIds.length > 0
                        ? `${selectedIds.length} тег(ов)`
                        : 'Выберите теги'}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Selected tags chips */}
            {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedIds.map(id => {
                        const tag = tags.find(t => t.id === id);
                        if (!tag) return null;
                        return (
                            <span
                                key={id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                            >
                                {tag.name}
                                <button
                                    type="button"
                                    onClick={() => toggle(id)}
                                    className="hover:text-blue-900"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}

            {open && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Найти тег..."
                                className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">Нет тегов</div>
                        ) : (
                            filtered.map(tag => (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => toggle(tag.id)}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
                                >
                                    <span>{tag.name}</span>
                                    {selectedIds.includes(tag.id) && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function TransactionModal({
    initialTab,
    onClose,
    onSaved,
    // Legacy props
    onSave: legacyOnSave,
    isSaving: legacyIsSaving,
    projects: legacyProjects,
    partners: legacyPartners,
    costItems: legacyCostItems,
}: TransactionModalProps) {
    const isLegacyMode = !!legacyOnSave;

    // Hooks (только в новом режиме, но вызываем всегда для rules of hooks)
    const { activeAccounts } = useAccounts();
    const { incomeCategories, expenseCategories } = useCategories();
    const { tags } = useTags();
    const { showToast } = useToast();

    // Local data loading (partners, projects) for non-legacy mode
    const [partners, setPartners] = useState<Partner[]>(legacyPartners || []);
    const [projects, setProjects] = useState<Project[]>(legacyProjects || []);
    const [saving, setSaving] = useState(false);
    const [showSplit, setShowSplit] = useState(false);
    const [splitParts, setSplitParts] = useState<SplitPart[]>([
        { categoryId: '', projectId: '', amount: '' },
        { categoryId: '', projectId: '', amount: '' },
    ]);

    const isSaving = legacyIsSaving ?? saving;

    // Form state
    const [formData, setFormData] = useState<FormData>({
        ...INITIAL_FORM,
        type: initialTab || 'expense',
        accountId: activeAccounts[0]?.id || '',
    });

    // Set default account when accounts load
    useEffect(() => {
        if (activeAccounts.length > 0 && !formData.accountId) {
            setFormData(prev => ({ ...prev, accountId: activeAccounts[0].id }));
        }
    }, [activeAccounts, formData.accountId]);

    // Load partners & projects if not in legacy mode
    useEffect(() => {
        if (isLegacyMode) return;
        import('../../services/partners.service').then(({ partnersService }) =>
            partnersService.getAll().then(setPartners)
        );
        import('../../services/projects.service').then(({ projectsService }) =>
            projectsService.getActive().then(setProjects)
        );
    }, [isLegacyMode]);

    // Memoized options
    const projectTree = useMemo(() => buildProjectSelectTree(projects, true), [projects]);
    const projectOptions = useMemo(
        () => projectTree.flatMap(g =>
            g.children.length > 0
                ? g.children.map(c => ({ value: c.id, label: `${g.name} / ${c.name}`, keywords: `${g.name} ${c.name}` }))
                : [{ value: g.id, label: g.name, keywords: g.name }]
        ),
        [projectTree]
    );

    const partnerOptions = useMemo(
        () => partners
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
            .map(p => ({ value: p.id, label: p.name, keywords: `${p.name} ${p.bin || ''}` })),
        [partners]
    );

    // Category options: use categories hook (new) or legacy costItems
    const categoryOptions = useMemo(() => {
        if (isLegacyMode && legacyCostItems) {
            return legacyCostItems
                .slice()
                .sort((a, b) => a.itemName.localeCompare(b.itemName, 'ru'))
                .map(c => ({ value: c.itemId, label: c.itemName, keywords: `${c.itemName} ${c.itemId}` }));
        }
        // New mode: filter by type
        const cats = formData.type === 'income' ? incomeCategories : expenseCategories;
        return cats
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
            .map(c => ({ value: c.id, label: c.name, keywords: c.name }));
    }, [isLegacyMode, legacyCostItems, formData.type, incomeCategories, expenseCategories]);

    const accountOptions = useMemo(
        () => activeAccounts.map(a => ({ value: a.id, label: a.name, keywords: `${a.name} ${a.bankName || ''}` })),
        [activeAccounts]
    );

    const accountToOptions = useMemo(
        () => activeAccounts
            .filter(a => a.id !== formData.accountId)
            .map(a => ({ value: a.id, label: a.name, keywords: `${a.name} ${a.bankName || ''}` })),
        [activeAccounts, formData.accountId]
    );

    const update = useCallback(
        (patch: Partial<FormData>) => setFormData(prev => ({ ...prev, ...patch })),
        []
    );

    const switchTab = (type: TransactionType) => {
        update({ type, categoryId: '', accountToId: '' });
        setShowSplit(false);
    };

    // Auto-determine status from date
    const autoStatus = useMemo(() => {
        if (!formData.paymentDate) return 'fact';
        const payDate = new Date(formData.paymentDate);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return payDate > today ? 'plan' : 'fact';
    }, [formData.paymentDate]);

    // Split amount validation
    const splitTotal = useMemo(
        () => splitParts.reduce((s, p) => s + (Number(p.amount) || 0), 0),
        [splitParts]
    );

    const addSplitPart = () => {
        setSplitParts(prev => [...prev, { categoryId: '', projectId: '', amount: '' }]);
    };

    const updateSplitPart = (index: number, patch: Partial<SplitPart>) => {
        setSplitParts(prev => prev.map((p, i) => i === index ? { ...p, ...patch } : p));
    };

    const removeSplitPart = (index: number) => {
        if (splitParts.length <= 2) return;
        setSplitParts(prev => prev.filter((_, i) => i !== index));
    };

    // Submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const amount = Number(formData.amount.replace(/\s/g, ''));
        if (!amount || amount <= 0) {
            window.alert('Введите сумму');
            return;
        }
        if (!formData.paymentDate) {
            window.alert('Выберите дату');
            return;
        }

        // Transfer validations
        if (formData.type === 'transfer') {
            if (!formData.accountId || !formData.accountToId) {
                window.alert('Выберите оба счёта для перевода');
                return;
            }
            if (formData.accountId === formData.accountToId) {
                window.alert('Счёт отправления и получения не могут совпадать');
                return;
            }
        }

        // Split validation
        if (showSplit && formData.type === 'expense') {
            if (Math.abs(splitTotal - amount) > 0.01) {
                window.alert(`Сумма частей (${splitTotal.toFixed(0)}) не совпадает с общей суммой (${amount.toFixed(0)})`);
                return;
            }
        }

        // Legacy mode: call parent's onSave
        if (isLegacyMode && legacyOnSave) {
            const dataToSave = {
                ...formData,
                date: new Date(formData.paymentDate),
                amount,
                status: autoStatus,
                sourceDoc: 'Ручной ввод',
                walletId: formData.accountId || 'Основной (KZT)',
            };
            await legacyOnSave(dataToSave);
            return;
        }

        // New mode: save directly
        setSaving(true);
        try {
            const paymentDate = Timestamp.fromDate(new Date(formData.paymentDate));
            const baseData = {
                date: paymentDate,
                paymentDate,
                amount,
                type: formData.type,
                status: autoStatus as 'plan' | 'fact',
                accountId: formData.accountId,
                walletId: activeAccounts.find(a => a.id === formData.accountId)?.name || '',
                partnerId: formData.partnerId,
                projectId: formData.projectId,
                categoryId: formData.categoryId,
                tagIds: formData.tagIds,
                description: formData.description,
                sourceDoc: 'Ручной ввод',
                sourceType: formData.sourceType as 'bank' | '1c' | 'manual',
                currency: 'KZT',
                exchangeRate: 1,
                accrualDateFrom: formData.accrualDateFrom
                    ? Timestamp.fromDate(new Date(formData.accrualDateFrom))
                    : null,
                accrualDateTo: formData.accrualDateTo
                    ? Timestamp.fromDate(new Date(formData.accrualDateTo))
                    : null,
                accountToId: formData.type === 'transfer' ? formData.accountToId : null,
                transferCommission: formData.type === 'transfer' && formData.transferCommission
                    ? Number(formData.transferCommission)
                    : null,
            };

            await financeService.addTransaction(baseData);

            // If transfer has commission, create separate expense transaction
            if (formData.type === 'transfer' && formData.transferCommission) {
                const commission = Number(formData.transferCommission);
                if (commission > 0) {
                    await financeService.addTransaction({
                        ...baseData,
                        type: 'expense',
                        amount: commission,
                        description: `Комиссия за перевод: ${formData.description || ''}`.trim(),
                        accountToId: null,
                        transferCommission: null,
                    });
                }
            }

            showToast('Транзакция создана', 'success');
            onSaved?.();
            onClose();
        } catch (err) {
            console.error('Error saving transaction:', err);
            showToast('Ошибка сохранения', 'error');
        } finally {
            setSaving(false);
        }
    };

    const isTransfer = formData.type === 'transfer';

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
                {/* Header with tabs */}
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold text-gray-900">
                            Новая операция
                        </h2>
                        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                    {/* Tab buttons */}
                    <div className="flex p-1 bg-gray-200 rounded-lg gap-1">
                        <button
                            type="button"
                            onClick={() => switchTab('income')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                formData.type === 'income'
                                    ? 'bg-green-500 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                            }`}
                        >
                            + Доход
                        </button>
                        <button
                            type="button"
                            onClick={() => switchTab('expense')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                formData.type === 'expense'
                                    ? 'bg-red-500 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                            }`}
                        >
                            − Расход
                        </button>
                        <button
                            type="button"
                            onClick={() => switchTab('transfer')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                formData.type === 'transfer'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                            }`}
                        >
                            ↔ Перевод
                        </button>
                    </div>
                </div>

                {/* Form body */}
                <div className="overflow-y-auto p-6">
                    <form id="transaction-form-v2" onSubmit={handleSubmit} className="space-y-4">
                        {/* Amount & Date */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Сумма (KZT) *</label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    step="0.01"
                                    value={formData.amount}
                                    onChange={e => update({ amount: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-lg"
                                    placeholder="0"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    {isTransfer ? 'Дата перевода *' : 'Дата *'}
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={formData.paymentDate}
                                    onChange={e => update({ paymentDate: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                                {autoStatus === 'plan' && (
                                    <p className="text-xs text-amber-600 mt-0.5">Плановая операция</p>
                                )}
                            </div>
                        </div>

                        {/* Account(s) */}
                        {isTransfer ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Со счёта *</label>
                                    <SearchableSelect
                                        value={formData.accountId}
                                        onChange={value => update({ accountId: value })}
                                        options={accountOptions}
                                        placeholder="Откуда"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">На счёт *</label>
                                    <SearchableSelect
                                        value={formData.accountToId}
                                        onChange={value => update({ accountToId: value })}
                                        options={accountToOptions}
                                        placeholder="Куда"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    {formData.type === 'income' ? 'На счёт' : 'Со счёта'}
                                </label>
                                <SearchableSelect
                                    value={formData.accountId}
                                    onChange={value => update({ accountId: value })}
                                    options={accountOptions}
                                    placeholder="Выберите счёт"
                                />
                            </div>
                        )}

                        {/* Transfer commission */}
                        {isTransfer && (
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Комиссия</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.transferCommission}
                                    onChange={e => update({ transferCommission: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="0"
                                />
                            </div>
                        )}

                        {/* Category (not for transfer) */}
                        {!isTransfer && (
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Категория
                                </label>
                                <SearchableSelect
                                    value={formData.categoryId}
                                    onChange={value => update({ categoryId: value })}
                                    options={categoryOptions}
                                    placeholder="Выберите категорию"
                                    searchPlaceholder="Найти категорию..."
                                    clearLabel="Без категории"
                                />
                            </div>
                        )}

                        {/* Split payment (expense only) */}
                        {!isTransfer && formData.type === 'expense' && !showSplit && (
                            <button
                                type="button"
                                onClick={() => setShowSplit(true)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                                + Разделить платёж
                            </button>
                        )}
                        {showSplit && formData.type === 'expense' && (
                            <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-gray-700">Разделение по категориям</p>
                                    <button
                                        type="button"
                                        onClick={() => setShowSplit(false)}
                                        className="text-xs text-gray-400 hover:text-gray-600"
                                    >
                                        Отменить
                                    </button>
                                </div>
                                {splitParts.map((part, idx) => (
                                    <div key={idx} className="grid grid-cols-[1fr_1fr_80px_28px] gap-2 items-end">
                                        <div>
                                            {idx === 0 && <label className="block text-[10px] text-gray-500 mb-0.5">Категория</label>}
                                            <SearchableSelect
                                                value={part.categoryId}
                                                onChange={value => updateSplitPart(idx, { categoryId: value })}
                                                options={categoryOptions}
                                                placeholder="Категория"
                                            />
                                        </div>
                                        <div>
                                            {idx === 0 && <label className="block text-[10px] text-gray-500 mb-0.5">Проект</label>}
                                            <SearchableSelect
                                                value={part.projectId}
                                                onChange={value => updateSplitPart(idx, { projectId: value })}
                                                options={projectOptions}
                                                placeholder="Проект"
                                                clearLabel="—"
                                            />
                                        </div>
                                        <div>
                                            {idx === 0 && <label className="block text-[10px] text-gray-500 mb-0.5">Сумма</label>}
                                            <input
                                                type="number"
                                                min="0"
                                                value={part.amount}
                                                onChange={e => updateSplitPart(idx, { amount: e.target.value })}
                                                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"
                                                placeholder="0"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeSplitPart(idx)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30"
                                            disabled={splitParts.length <= 2}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <div className="flex items-center justify-between pt-1">
                                    <button
                                        type="button"
                                        onClick={addSplitPart}
                                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                        <Plus className="w-3 h-3" /> Добавить часть
                                    </button>
                                    <span className={`text-xs font-medium ${
                                        Math.abs(splitTotal - Number(formData.amount || 0)) < 0.01
                                            ? 'text-green-600'
                                            : 'text-red-500'
                                    }`}>
                                        Итого: {splitTotal.toLocaleString('ru-RU')} ₸
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Partner */}
                        {!isTransfer && (
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Контрагент</label>
                                <SearchableSelect
                                    value={formData.partnerId}
                                    onChange={value => update({ partnerId: value })}
                                    options={partnerOptions}
                                    placeholder="Выберите контрагента"
                                    searchPlaceholder="Найти контрагента..."
                                    clearLabel="Без контрагента"
                                />
                            </div>
                        )}

                        {/* Project */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Проект</label>
                            <SearchableSelect
                                value={formData.projectId}
                                onChange={value => update({ projectId: value })}
                                options={projectOptions}
                                placeholder="Без проекта"
                                clearLabel="Без проекта"
                                searchPlaceholder="Найти проект..."
                            />
                        </div>

                        {/* Tags */}
                        {tags.length > 0 && (
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Теги</label>
                                <TagMultiSelect
                                    selectedIds={formData.tagIds}
                                    onChange={ids => update({ tagIds: ids })}
                                    tags={tags}
                                />
                            </div>
                        )}

                        {/* Description */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Комментарий</label>
                            <textarea
                                value={formData.description}
                                onChange={e => update({ description: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[60px] text-sm"
                                placeholder="Опишите детали операции..."
                            />
                        </div>

                        {/* Advanced: accrual dates */}
                        {!isTransfer && (
                            <details className="text-xs border-t border-gray-100 pt-3">
                                <summary className="text-gray-400 cursor-pointer hover:text-gray-600 font-medium">
                                    Дополнительные параметры
                                </summary>
                                <div className="mt-3 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] text-gray-500 mb-0.5">Дата начисления (от)</label>
                                            <input
                                                type="date"
                                                value={formData.accrualDateFrom}
                                                onChange={e => update({ accrualDateFrom: e.target.value })}
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-gray-500 mb-0.5">Дата начисления (до)</label>
                                            <input
                                                type="date"
                                                value={formData.accrualDateTo}
                                                onChange={e => update({ accrualDateTo: e.target.value })}
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-0.5">Тип источника</label>
                                        <select
                                            value={formData.sourceType}
                                            onChange={e => update({ sourceType: e.target.value as FormData['sourceType'] })}
                                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                                        >
                                            <option value="manual">Ручной ввод</option>
                                            <option value="bank">Банк / Касса (ДДС)</option>
                                            <option value="1c">1С (ОПиУ - Акт)</option>
                                        </select>
                                    </div>
                                </div>
                            </details>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-between">
                    <div>
                        {autoStatus === 'plan' && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
                                Плановая
                            </span>
                        )}
                        {autoStatus === 'fact' && (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">
                                Проведённая
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                        >
                            Отмена
                        </button>
                        <button
                            form="transaction-form-v2"
                            type="submit"
                            disabled={isSaving}
                            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center shadow-sm text-sm"
                        >
                            {isSaving ? (
                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                            ) : (
                                <Save className="w-4 h-4 mr-2" />
                            )}
                            Создать
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
