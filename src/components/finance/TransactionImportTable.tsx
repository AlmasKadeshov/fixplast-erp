// @ts-nocheck — требует адаптации под FixPlast структуру данных
import { useState, useMemo } from 'react';
import { TransactionDTO } from '../../utils/bankParser';
import { Project } from '../../models';
import { CostItem } from '../../models/costItems';
import { Check, AlertCircle, Trash2, Filter, X, Zap } from 'lucide-react';
import { buildProjectSelectTree } from '../../utils/projectTree';

export interface ImportRow extends Omit<TransactionDTO, 'hash'> {
    selectedProjectId: string;
    selectedCategoryId: string;
    selectedWalletId: string;
    resolvedPartnerId: string;
    resolvedTagIds?: string[];
    isValid: boolean;
    hash?: string;
    sourceType?: 'bank' | '1c';
    vatAmount?: number;
}

interface TransactionImportTableProps {
    rows: ImportRow[];
    projects: Project[];
    costItems: CostItem[];
    onUpdateRow: (index: number, key: keyof ImportRow, value: string) => void;
    onDeleteRow: (index: number) => void;
    onCreateRule?: (row: ImportRow) => void;
}

export function TransactionImportTable({
    rows,
    projects,
    costItems,
    onUpdateRow,
    onDeleteRow,
    onCreateRule,
}: TransactionImportTableProps) {
    // Filter states
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
    const [filterPartner, setFilterPartner] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'invalid'>('all');
    const [showFilters, setShowFilters] = useState(false);

    // Build project tree for grouped dropdown (filters out AUP)
    const projectTree = useMemo(() => buildProjectSelectTree(projects), [projects]);

    // Unique partners for dropdown
    const uniquePartners = useMemo(() => {
        const partners = [...new Set(rows.map(r => r.partner).filter(Boolean))];
        return partners.sort();
    }, [rows]);

    // Apply filters
    const filteredRows = useMemo(() => {
        return rows.filter((row) => {
            // Type filter
            if (filterType !== 'all' && row.type !== filterType) return false;

            // Partner filter
            if (filterPartner && row.partner !== filterPartner) return false;

            // Status filter
            if (filterStatus === 'valid' && !row.isValid) return false;
            if (filterStatus === 'invalid' && row.isValid) return false;

            return true;
        }).map((row) => ({
            row,
            originalIndex: rows.indexOf(row) // Keep track of original index for updates
        }));
    }, [rows, filterType, filterPartner, filterStatus]);

    const clearFilters = () => {
        setFilterType('all');
        setFilterPartner('');
        setFilterStatus('all');
    };

    const hasActiveFilters = filterType !== 'all' || filterPartner !== '' || filterStatus !== 'all';

    // Stats
    const stats = useMemo(() => ({
        total: rows.length,
        valid: rows.filter(r => r.isValid).length,
        income: rows.filter(r => r.type === 'income').length,
        expense: rows.filter(r => r.type === 'expense').length,
        totalAmount: rows.reduce((sum, r) => sum + (r.type === 'income' ? r.amount : -r.amount), 0)
    }), [rows]);

    if (rows.length === 0) {
        return null;
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Stats & Filters Header */}
            <div className="p-4 bg-gray-50 border-b flex flex-wrap items-center justify-between gap-4">
                {/* Stats */}
                <div className="flex gap-4 text-sm">
                    <span className="text-gray-600">
                        Всего: <strong>{stats.total}</strong>
                    </span>
                    <span className="text-green-600">
                        Приход: <strong>{stats.income}</strong>
                    </span>
                    <span className="text-red-600">
                        Расход: <strong>{stats.expense}</strong>
                    </span>
                    <span className={stats.totalAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        Баланс: <strong>{new Intl.NumberFormat('ru-RU').format(stats.totalAmount)} ₸</strong>
                    </span>
                    <span className="text-blue-600">
                        Готово: <strong>{stats.valid}/{stats.total}</strong>
                    </span>
                </div>

                {/* Filter Toggle */}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${hasActiveFilters
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                >
                    <Filter className="w-4 h-4" />
                    Фильтры
                    {hasActiveFilters && (
                        <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {(filterType !== 'all' ? 1 : 0) + (filterPartner ? 1 : 0) + (filterStatus !== 'all' ? 1 : 0)}
                        </span>
                    )}
                </button>
            </div>

            {/* Filters Panel */}
            {showFilters && (
                <div className="p-4 bg-blue-50/50 border-b flex flex-wrap items-center gap-4">
                    {/* Type Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Тип:</label>
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as any)}
                            className="rounded-md border-gray-300 text-sm py-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">Все</option>
                            <option value="income">Приход</option>
                            <option value="expense">Расход</option>
                        </select>
                    </div>

                    {/* Partner Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Контрагент:</label>
                        <select
                            value={filterPartner}
                            onChange={(e) => setFilterPartner(e.target.value)}
                            className="rounded-md border-gray-300 text-sm py-1 focus:ring-blue-500 focus:border-blue-500 max-w-[200px]"
                        >
                            <option value="">Все</option>
                            {uniquePartners.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Статус:</label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as any)}
                            className="rounded-md border-gray-300 text-sm py-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">Все</option>
                            <option value="valid">✓ Готово</option>
                            <option value="invalid">⚠ Не заполнено</option>
                        </select>
                    </div>

                    {/* Clear Filters */}
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                        >
                            <X className="w-4 h-4" />
                            Сбросить
                        </button>
                    )}

                    {/* Showing count */}
                    <span className="ml-auto text-sm text-gray-500">
                        Показано: {filteredRows.length} из {rows.length}
                    </span>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                            <th className="px-4 py-3">Дата</th>
                            <th className="px-4 py-3">Тип</th>
                            <th className="px-4 py-3 text-right">Сумма</th>
                            <th className="px-4 py-3">Партнер</th>
                            <th className="px-4 py-3">БИН</th>
                            <th className="px-4 py-3 w-64">Проект</th>
                            <th className="px-4 py-3 w-48">Статья</th>
                            <th className="px-4 py-3">Назначение</th>
                            <th className="px-4 py-3 w-10">Статус</th>
                            <th className="px-4 py-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredRows.map(({ row, originalIndex }) => (
                            <tr key={originalIndex} className={`group ${row.isValid ? 'bg-green-50/30' : 'bg-yellow-50/30 hover:bg-yellow-50/50'}`}>
                                <td className="px-4 py-3 whitespace-nowrap">{row.dateStr}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                        {row.type === 'income' ? 'Приход' : 'Расход'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right font-medium">
                                    {new Intl.NumberFormat('ru-RU').format(row.amount)}
                                </td>
                                <td className="px-4 py-3 max-w-[220px]">
                                    <span className="text-sm whitespace-normal leading-tight" title={row.partner}>
                                        {row.partner}
                                    </span>
                                    {row.resolvedPartnerId && (
                                        <span className="ml-1 text-green-500 text-xs">✓</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">
                                    {row.partnerBin || '-'}
                                </td>
                                <td className="px-4 py-3">
                                    <select
                                        value={row.selectedProjectId}
                                        onChange={(e) => onUpdateRow(originalIndex, 'selectedProjectId', e.target.value)}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs py-1"
                                    >
                                        <option value="">Выберите проект...</option>
                                        {projectTree.map(group => (
                                            <optgroup key={group.id} label={group.name}>
                                                {group.children.length > 0 ? (
                                                    group.children.map(child => (
                                                        <option key={child.id} value={child.id}>
                                                            {child.name}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option value={group.id}>{group.name}</option>
                                                )}
                                            </optgroup>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1">
                                        <select
                                            value={row.selectedCategoryId}
                                            onChange={(e) => onUpdateRow(originalIndex, 'selectedCategoryId', e.target.value)}
                                            className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs py-1 ${row.selectedCategoryId ? 'ring-1 ring-green-300' : ''
                                                }`}
                                        >
                                            <option value="">Выберите статью...</option>
                                            {costItems.map(cat => (
                                                <option key={cat.itemId} value={cat.itemId}>{cat.itemName}</option>
                                            ))}
                                        </select>
                                        {onCreateRule && row.selectedCategoryId && (
                                            <button
                                                onClick={() => onCreateRule(row)}
                                                className="p-1 text-gray-400 hover:text-amber-600 flex-shrink-0"
                                                title="Создать авто-правило из этой строки"
                                            >
                                                <Zap className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 max-w-[200px] truncate text-gray-500" title={row.purpose}>
                                    {row.purpose}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {row.isValid
                                        ? <Check className="w-5 h-5 text-green-500" />
                                        : <AlertCircle className="w-5 h-5 text-yellow-500" />
                                    }
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => onDeleteRow(originalIndex)}
                                        className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all p-1"
                                        title="Удалить строку"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Empty state when filtered */}
            {filteredRows.length === 0 && rows.length > 0 && (
                <div className="p-8 text-center text-gray-500">
                    <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Нет записей по выбранным фильтрам</p>
                    <button
                        onClick={clearFilters}
                        className="mt-2 text-blue-600 hover:underline text-sm"
                    >
                        Сбросить фильтры
                    </button>
                </div>
            )}
        </div>
    );
}
