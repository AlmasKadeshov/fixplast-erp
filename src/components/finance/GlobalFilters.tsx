import { useState, useMemo, useCallback, useEffect } from 'react';
import {
    Calendar,
    Filter,
    ChevronDown,
    Save,
    RotateCcw,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths } from 'date-fns';
import { useAccounts } from '../../hooks/useAccounts';
import { useCategories } from '../../hooks/useCategories';
import { useTags } from '../../hooks/useTags';

// ============================================
// TYPES
// ============================================

export interface FilterValues {
    dateFrom: string;       // yyyy-MM-dd
    dateTo: string;         // yyyy-MM-dd
    categoryIds: string[];
    partnerIds: string[];
    projectIds: string[];
    tagIds: string[];
    accountIds: string[];
    includePlan: boolean;
}

interface GlobalFiltersProps {
    value: FilterValues;
    onChange: (filters: FilterValues) => void;
    /** Ключ для сохранения в localStorage */
    storageKey?: string;
    /** Скрыть определённые фильтры */
    hiddenFilters?: ('categories' | 'partners' | 'projects' | 'tags' | 'accounts' | 'plan')[];
    /** Опции партнёров (передаются извне, т.к. нет хука) */
    partnerOptions?: { value: string; label: string; keywords?: string }[];
    /** Опции проектов (передаются извне) */
    projectOptions?: { value: string; label: string; keywords?: string }[];
}

// ============================================
// HELPERS
// ============================================

const today = new Date();

type PresetKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'last_year' | 'custom';

const PERIOD_PRESETS: { key: PresetKey; label: string; getRange: () => [Date, Date] }[] = [
    {
        key: 'this_month',
        label: 'Текущий месяц',
        getRange: () => [startOfMonth(today), endOfMonth(today)],
    },
    {
        key: 'last_month',
        label: 'Прошлый месяц',
        getRange: () => {
            const d = subMonths(today, 1);
            return [startOfMonth(d), endOfMonth(d)];
        },
    },
    {
        key: 'this_quarter',
        label: 'Текущий квартал',
        getRange: () => [startOfQuarter(today), endOfQuarter(today)],
    },
    {
        key: 'this_year',
        label: 'Текущий год',
        getRange: () => [startOfYear(today), endOfYear(today)],
    },
    {
        key: 'last_year',
        label: 'Прошлый год',
        getRange: () => {
            const d = new Date(today.getFullYear() - 1, 0, 1);
            return [startOfYear(d), endOfYear(d)];
        },
    },
];

export function getDefaultFilters(): FilterValues {
    const [from, to] = PERIOD_PRESETS[0].getRange();
    return {
        dateFrom: format(from, 'yyyy-MM-dd'),
        dateTo: format(to, 'yyyy-MM-dd'),
        categoryIds: [],
        partnerIds: [],
        projectIds: [],
        tagIds: [],
        accountIds: [],
        includePlan: false,
    };
}

// ============================================
// COMPONENT
// ============================================

export function GlobalFilters({
    value,
    onChange,
    storageKey,
    hiddenFilters = [],
    partnerOptions = [],
    projectOptions = [],
}: GlobalFiltersProps) {
    const [expanded, setExpanded] = useState(false);
    const { activeAccounts } = useAccounts();
    const { incomeCategories, expenseCategories } = useCategories();
    const { tags } = useTags();

    const isHidden = (f: string) => hiddenFilters.includes(f as any);

    // Load saved filters
    useEffect(() => {
        if (!storageKey) return;
        try {
            const saved = localStorage.getItem(`filters_${storageKey}`);
            if (saved) {
                const parsed = JSON.parse(saved) as FilterValues;
                onChange(parsed);
            }
        } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    const update = useCallback(
        (patch: Partial<FilterValues>) => onChange({ ...value, ...patch }),
        [value, onChange]
    );

    const applyPreset = (preset: typeof PERIOD_PRESETS[0]) => {
        const [from, to] = preset.getRange();
        update({
            dateFrom: format(from, 'yyyy-MM-dd'),
            dateTo: format(to, 'yyyy-MM-dd'),
        });
    };

    const saveFilters = () => {
        if (!storageKey) return;
        localStorage.setItem(`filters_${storageKey}`, JSON.stringify(value));
    };

    const resetFilters = () => {
        onChange(getDefaultFilters());
        if (storageKey) localStorage.removeItem(`filters_${storageKey}`);
    };

    // Detect active preset
    const activePreset = useMemo(() => {
        for (const p of PERIOD_PRESETS) {
            const [from, to] = p.getRange();
            if (
                value.dateFrom === format(from, 'yyyy-MM-dd') &&
                value.dateTo === format(to, 'yyyy-MM-dd')
            ) return p.key;
        }
        return 'custom' as PresetKey;
    }, [value.dateFrom, value.dateTo]);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (value.categoryIds.length > 0) count++;
        if (value.partnerIds.length > 0) count++;
        if (value.projectIds.length > 0) count++;
        if (value.tagIds.length > 0) count++;
        if (value.accountIds.length > 0) count++;
        if (value.includePlan) count++;
        return count;
    }, [value]);

    // Options
    const allCategories = useMemo(
        () => [...incomeCategories, ...expenseCategories]
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
            .map(c => ({ value: c.id, label: `${c.type === 'income' ? '↑' : '↓'} ${c.name}` })),
        [incomeCategories, expenseCategories]
    );

    const accountOpts = useMemo(
        () => activeAccounts.map(a => ({ value: a.id, label: a.name })),
        [activeAccounts]
    );

    const tagOpts = useMemo(
        () => tags.map(t => ({ value: t.id, label: t.name })),
        [tags]
    );

    // periodLabel — can be used by consumers via activePreset
    // Currently used in the compact bar implicitly via preset buttons

    return (
        <div className="bg-white border border-gray-200 rounded-lg mb-4">
            {/* Compact bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
                {/* Period presets */}
                <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {PERIOD_PRESETS.map(p => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => applyPreset(p)}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                                activePreset === p.key
                                    ? 'bg-blue-100 text-blue-700 font-medium'
                                    : 'text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Custom date range */}
                <div className="flex items-center gap-1 text-xs">
                    <input
                        type="date"
                        value={value.dateFrom}
                        onChange={e => update({ dateFrom: e.target.value })}
                        className="px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                    <span className="text-gray-400">—</span>
                    <input
                        type="date"
                        value={value.dateTo}
                        onChange={e => update({ dateTo: e.target.value })}
                        className="px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                </div>

                <div className="flex-1" />

                {/* Expand filters button */}
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        expanded || activeFilterCount > 0
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-500 hover:bg-gray-100'
                    }`}
                >
                    <Filter className="w-3.5 h-3.5" />
                    Фильтры
                    {activeFilterCount > 0 && (
                        <span className="w-4 h-4 bg-blue-600 text-white rounded-full text-[10px] flex items-center justify-center">
                            {activeFilterCount}
                        </span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Expanded filters */}
            {expanded && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {/* Categories */}
                    {!isHidden('categories') && allCategories.length > 0 && (
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Категории</label>
                            <MultiFilterSelect
                                options={allCategories}
                                selectedIds={value.categoryIds}
                                onChange={ids => update({ categoryIds: ids })}
                                placeholder="Все категории"
                            />
                        </div>
                    )}

                    {/* Partners */}
                    {!isHidden('partners') && partnerOptions.length > 0 && (
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Контрагенты</label>
                            <MultiFilterSelect
                                options={partnerOptions}
                                selectedIds={value.partnerIds}
                                onChange={ids => update({ partnerIds: ids })}
                                placeholder="Все контрагенты"
                            />
                        </div>
                    )}

                    {/* Projects */}
                    {!isHidden('projects') && projectOptions.length > 0 && (
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Проекты</label>
                            <MultiFilterSelect
                                options={projectOptions}
                                selectedIds={value.projectIds}
                                onChange={ids => update({ projectIds: ids })}
                                placeholder="Все проекты"
                            />
                        </div>
                    )}

                    {/* Tags */}
                    {!isHidden('tags') && tagOpts.length > 0 && (
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Теги</label>
                            <MultiFilterSelect
                                options={tagOpts}
                                selectedIds={value.tagIds}
                                onChange={ids => update({ tagIds: ids })}
                                placeholder="Все теги"
                            />
                        </div>
                    )}

                    {/* Accounts */}
                    {!isHidden('accounts') && accountOpts.length > 0 && (
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Счета</label>
                            <MultiFilterSelect
                                options={accountOpts}
                                selectedIds={value.accountIds}
                                onChange={ids => update({ accountIds: ids })}
                                placeholder="Все счета"
                            />
                        </div>
                    )}

                    {/* Include plan toggle */}
                    {!isHidden('plan') && (
                        <div className="flex items-end">
                            <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 text-sm w-full">
                                <input
                                    type="checkbox"
                                    checked={value.includePlan}
                                    onChange={e => update({ includePlan: e.target.checked })}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-700">Плановые</span>
                            </label>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-end gap-2 col-span-full">
                        {storageKey && (
                            <button
                                type="button"
                                onClick={saveFilters}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg"
                            >
                                <Save className="w-3.5 h-3.5" /> Сохранить
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg"
                        >
                            <RotateCcw className="w-3.5 h-3.5" /> Сбросить
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// MULTI-SELECT for filters (lightweight)
// ============================================

function MultiFilterSelect({
    options,
    selectedIds,
    onChange,
    placeholder,
}: {
    options: { value: string; label: string }[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

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
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-left text-xs flex items-center justify-between gap-1"
            >
                <span className={selectedIds.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedIds.length > 0 ? `Выбрано: ${selectedIds.length}` : placeholder}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto py-1">
                    {selectedIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 border-b border-gray-100"
                        >
                            Очистить все
                        </button>
                    )}
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggle(opt.value)}
                            className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2"
                        >
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                                selectedIds.includes(opt.value)
                                    ? 'bg-blue-600 border-blue-600'
                                    : 'border-gray-300'
                            }`}>
                                {selectedIds.includes(opt.value) && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                            <span className="truncate">{opt.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Need React import for useRef/useEffect in MultiFilterSelect
import React from 'react';
