/**
 * Страница сверки: банковская выписка vs акты 1С vs БД
 *
 * Алгоритм:
 * 1. Загружаешь банковскую выписку за период
 * 2. Загружаешь журнал 1С за тот же период (опционально)
 *    — можно загрузить оба: выданные и полученные счета-фактуры
 * 3. Система сопоставляет с тем что уже есть в БД
 * 4. Показывает что есть в файле но нет в БД, и наоборот
 *
 * Период: любой — месяц, квартал, год, произвольный диапазон.
 */

import { useState, useMemo } from 'react';
import {
    Upload, CheckCircle2, AlertCircle, AlertTriangle,
    ChevronDown, ChevronUp, X, Search, RefreshCw, Plus, Trash2
} from 'lucide-react';
import { parseBankStatement } from '../../utils/bankParser';
import { parseOneCFile } from '../../utils/oneCParser';
import { financeService } from '../../services/finance.service';
import { TransactionType } from '../../models/finance';
import { partnersService } from '../../services/partners.service';
import { Partner } from '../../models';
import { formatFullMoney as formatMoney } from '../../utils/formatters';

type RowStatus = 'matched' | 'missing_in_db' | 'extra_in_db';

interface ReconcileRow {
    date: string;
    partner: string;
    amount: number;
    type: TransactionType;
    description: string;
    source: 'bank' | '1c';
    status: RowStatus;
    hash?: string;
    dbId?: string;        // ID документа в Firestore (только для extra_in_db)
    sourceDoc?: string;   // Номер документа из 1С / банка
    partnerBin?: string;  // БИН контрагента
    categoryId?: string;  // Статья затрат
    projectId?: string;   // Проект
}

interface Summary {
    totalFile: number;
    matchedCount: number;
    missingInDb: number;
    extraInDb: number;
    missingAmount: number;
    extraAmount: number;
}

/** Зона загрузки одного файла */
function DropZone({
    file,
    onFile,
    onClear,
    isDragging,
    onDragOver,
    onDragLeave,
    onDrop,
    inputId,
    label,
    hint,
    color,
}: {
    file: File | null;
    onFile: (f: File) => void;
    onClear: () => void;
    isDragging: boolean;
    onDragOver: () => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    inputId: string;
    label: string;
    hint: string;
    color: 'blue' | 'purple' | 'violet';
}) {
    const colors = {
        blue: { drag: 'border-blue-400 bg-blue-50', icon: 'text-blue-300', filled: '' },
        purple: { drag: 'border-purple-400 bg-purple-50', icon: 'text-purple-300', filled: '' },
        violet: { drag: 'border-violet-400 bg-violet-50', icon: 'text-violet-300', filled: '' },
    }[color];

    return (
        <div
            onDragOver={e => { e.preventDefault(); onDragOver(); }}
            onDragLeave={onDragLeave}
            onDrop={e => { e.preventDefault(); onDrop(e); }}
            className={`relative border-2 border-dashed rounded-2xl p-5 text-center transition-colors cursor-pointer
                ${isDragging ? colors.drag : file ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
            onClick={() => document.getElementById(inputId)?.click()}
        >
            <input
                id={inputId}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            {file ? (
                <>
                    <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-sm font-medium text-emerald-700 truncate px-4">{file.name}</p>
                    <p className="text-xs text-emerald-400 mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
                    <button
                        onClick={e => { e.stopPropagation(); onClear(); }}
                        className="absolute top-2 right-2 p-1 rounded hover:bg-emerald-100"
                    >
                        <X className="w-3.5 h-3.5 text-emerald-500" />
                    </button>
                </>
            ) : (
                <>
                    <Upload className={`w-7 h-7 mx-auto mb-1.5 ${colors.icon}`} />
                    <p className="text-sm font-medium text-gray-600">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
                </>
            )}
        </div>
    );
}

export function ReconcilePage() {
    const [bankFile, setBankFile] = useState<File | null>(null);
    const [c1File1, setC1File1] = useState<File | null>(null);   // журнал 1 (напр. полученные)
    const [c1File2, setC1File2] = useState<File | null>(null);   // журнал 2 (напр. выданные)
    const [showSecond1c, setShowSecond1c] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [rows, setRows] = useState<ReconcileRow[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [filterStatus, setFilterStatus] = useState<'all' | 'missing_in_db' | 'extra_in_db' | 'matched'>('all');
    const [filterSource, setFilterSource] = useState<'all' | 'bank' | '1c'>('all');
    const [searchText, setSearchText] = useState('');
    const [expandedSection, setExpandedSection] = useState<string | null>('missing_in_db');

    const [deletingId, setDeletingId] = useState<string | null>(null);   // id строки ожидающей подтверждения
    const [isDeletingDb, setIsDeletingDb] = useState(false);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null); // раскрытая строка

    const [isDraggingBank, setIsDraggingBank] = useState(false);
    const [isDragging1c1, setIsDragging1c1] = useState(false);
    const [isDragging1c2, setIsDragging1c2] = useState(false);

    const [error, setError] = useState('');

    const getPartnerName = (bin: string): string => {
        if (!bin) return '—';
        const p = partners.find(p => p.bin === bin);
        return p ? p.name : bin;
    };

    const deleteFromDb = async (row: ReconcileRow) => {
        if (!row.dbId) return;
        setIsDeletingDb(true);
        try {
            await financeService.deleteTransactions([row.dbId]);
            setRows(prev => prev.filter(r => r.dbId !== row.dbId));
            setDeletingId(null);
        } catch (e: any) {
            setError(e.message || 'Ошибка при удалении');
        } finally {
            setIsDeletingDb(false);
        }
    };

    const runReconcile = async () => {
        if (!bankFile && !c1File1 && !c1File2) {
            setError('Загрузите хотя бы один файл');
            return;
        }
        setError('');
        setIsLoading(true);
        setRows([]);

        try {
            // 1. Парсим все файлы параллельно
            const [bankTxs, c1Txs1, c1Txs2] = await Promise.all([
                bankFile ? parseBankStatement(bankFile) : Promise.resolve([]),
                c1File1 ? parseOneCFile(c1File1) : Promise.resolve([]),
                c1File2 ? parseOneCFile(c1File2) : Promise.resolve([]),
            ]);

            const allFileTxs = [
                ...bankTxs.map(t => ({ ...t, source: 'bank' as const })),
                ...c1Txs1.map(t => ({ ...t, source: '1c' as const })),
                ...c1Txs2.map(t => ({ ...t, source: '1c' as const })),
            ];

            if (allFileTxs.length === 0) {
                setError('В файлах не найдено транзакций');
                setIsLoading(false);
                return;
            }

            // 2. Определяем диапазон дат (по всем загруженным файлам)
            const dates = allFileTxs.map(t => t.date).filter(Boolean) as Date[];
            const dateFrom = new Date(Math.min(...dates.map(d => d.getTime())));
            const dateTo = new Date(Math.max(...dates.map(d => d.getTime())));

            // 3. Загружаем хеши из БД за этот период + список партнёров
            const [bankHashes, c1Hashes, partnersData] = await Promise.all([
                financeService.getHashesForPeriod(dateFrom, dateTo, 'bank'),
                financeService.getHashesForPeriod(dateFrom, dateTo, '1c'),
                partnersService.getAll(),
            ]);
            setPartners(partnersData);

            // 4. Загружаем транзакции из БД за этот период (для "лишних в БД")
            const dbTxs = await financeService.getTransactions({
                startDate: dateFrom,
                endDate: dateTo,
                status: 'fact',
            });
            const fileHashSet = new Set(allFileTxs.map(t => t.hash).filter(Boolean));

            // 5. Строим результат
            const result: ReconcileRow[] = [];

            // Из файлов — что есть/чего нет в БД
            for (const t of allFileTxs) {
                const inDb = t.hash
                    ? (t.source === 'bank' ? bankHashes.has(t.hash) : c1Hashes.has(t.hash))
                    : false;

                result.push({
                    date: t.date ? t.date.toLocaleDateString('ru-RU') : '—',
                    partner: t.partner || getPartnerName(t.partnerBin) || '—',
                    amount: t.amount,
                    type: t.type,
                    description: t.purpose || (('description' in t && typeof (t as any).description === 'string') ? (t as any).description : '') || '—',
                    source: t.source,
                    status: inDb ? 'matched' : 'missing_in_db',
                    hash: t.hash,
                });
            }

            // Из БД — что есть в БД но нет в файлах (только за тот же период)
            for (const t of dbTxs) {
                if (!t.hash) continue;
                if (fileHashSet.has(t.hash)) continue;
                // Показываем только если загружен соответствующий тип файла
                if (t.sourceType === 'bank' && !bankFile) continue;
                if (t.sourceType === '1c' && !c1File1 && !c1File2) continue;

                result.push({
                    date: t.date ? t.date.toDate().toLocaleDateString('ru-RU') : '—',
                    partner: t.description || '—',
                    amount: t.amount,
                    type: t.type,
                    description: t.sourceDoc || t.description || '—',
                    source: t.sourceType as 'bank' | '1c',
                    status: 'extra_in_db',
                    hash: t.hash,
                    dbId: t.id,
                    sourceDoc: t.sourceDoc,
                    partnerBin: t.partnerBin,
                    categoryId: t.categoryId,
                    projectId: t.projectId,
                });
            }

            setRows(result);
        } catch (e: any) {
            setError(e.message || 'Ошибка при сверке');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const summary = useMemo((): Summary => {
        const missing = rows.filter(r => r.status === 'missing_in_db');
        const extra = rows.filter(r => r.status === 'extra_in_db');
        return {
            totalFile: rows.filter(r => r.status !== 'extra_in_db').length,
            matchedCount: rows.filter(r => r.status === 'matched').length,
            missingInDb: missing.length,
            extraInDb: extra.length,
            missingAmount: missing.reduce((s, r) => s + r.amount, 0),
            extraAmount: extra.reduce((s, r) => s + r.amount, 0),
        };
    }, [rows]);

    const filteredRows = useMemo(() => {
        return rows.filter(r => {
            if (filterStatus !== 'all' && r.status !== filterStatus) return false;
            if (filterSource !== 'all' && r.source !== filterSource) return false;
            if (searchText) {
                const q = searchText.toLowerCase();
                if (!r.partner.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [rows, filterStatus, filterSource, searchText]);

    const handleFileDrop = (e: React.DragEvent, slot: 'bank' | '1c1' | '1c2') => {
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (slot === 'bank') { setIsDraggingBank(false); setBankFile(file); }
        else if (slot === '1c1') { setIsDragging1c1(false); setC1File1(file); }
        else { setIsDragging1c2(false); setC1File2(file); }
    };

    const statusLabel: Record<RowStatus, string> = {
        matched: 'В БД',
        missing_in_db: 'Нет в БД',
        extra_in_db: 'Только в БД',
    };
    const statusColor: Record<RowStatus, string> = {
        matched: 'bg-emerald-100 text-emerald-700',
        missing_in_db: 'bg-red-100 text-red-700',
        extra_in_db: 'bg-amber-100 text-amber-700',
    };

    // Группировка для итогов по контрагентам (только расхождения)
    const partnerSummary = useMemo(() => {
        const map = new Map<string, { name: string; missing: number; extra: number }>();
        rows.forEach(r => {
            if (r.status === 'matched') return;
            const entry = map.get(r.partner) || { name: r.partner, missing: 0, extra: 0 };
            if (r.status === 'missing_in_db') entry.missing += r.amount;
            if (r.status === 'extra_in_db') entry.extra += r.amount;
            map.set(r.partner, entry);
        });
        return Array.from(map.values())
            .filter(p => p.missing + p.extra > 0)
            .sort((a, b) => (b.missing + b.extra) - (a.missing + a.extra));
    }, [rows]);

    const hasAnyFile = bankFile || c1File1 || c1File2;

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Сверка периода</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Загрузите банковскую выписку и/или журналы 1С (можно оба: выданные и полученные) — система сравнит с базой данных и покажет расхождения.
                    Работает за любой период: месяц, квартал, год.
                </p>
            </div>

            {/* Загрузка файлов */}
            <div className="space-y-3">
                {/* Банк */}
                <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Банковская выписка</p>
                    <DropZone
                        file={bankFile}
                        onFile={setBankFile}
                        onClear={() => setBankFile(null)}
                        isDragging={isDraggingBank}
                        onDragOver={() => setIsDraggingBank(true)}
                        onDragLeave={() => setIsDraggingBank(false)}
                        onDrop={e => handleFileDrop(e, 'bank')}
                        inputId="bank-input"
                        label="Банковская выписка"
                        hint="Перетащите или нажмите · .xlsx .xls .csv"
                        color="blue"
                    />
                </div>

                {/* 1С: один или два файла */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Журнал 1С (счета-фактуры)</p>
                        {!showSecond1c && (
                            <button
                                onClick={() => setShowSecond1c(true)}
                                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
                            >
                                <Plus className="w-3 h-3" />
                                Добавить второй журнал
                            </button>
                        )}
                    </div>

                    {!showSecond1c ? (
                        // Один журнал — на всю ширину
                        <DropZone
                            file={c1File1}
                            onFile={setC1File1}
                            onClear={() => setC1File1(null)}
                            isDragging={isDragging1c1}
                            onDragOver={() => setIsDragging1c1(true)}
                            onDragLeave={() => setIsDragging1c1(false)}
                            onDrop={e => handleFileDrop(e, '1c1')}
                            inputId="c1-input-1"
                            label="Журнал счетов-фактур 1С"
                            hint="Перетащите или нажмите · .xlsx .xls"
                            color="purple"
                        />
                    ) : (
                        // Два журнала рядом
                        <div className="grid grid-cols-2 gap-3">
                            <DropZone
                                file={c1File1}
                                onFile={setC1File1}
                                onClear={() => setC1File1(null)}
                                isDragging={isDragging1c1}
                                onDragOver={() => setIsDragging1c1(true)}
                                onDragLeave={() => setIsDragging1c1(false)}
                                onDrop={e => handleFileDrop(e, '1c1')}
                                inputId="c1-input-1"
                                label="Журнал 1 (напр. полученные)"
                                hint="Перетащите или нажмите · .xlsx .xls"
                                color="purple"
                            />
                            <div className="relative">
                                <DropZone
                                    file={c1File2}
                                    onFile={setC1File2}
                                    onClear={() => { setC1File2(null); setShowSecond1c(false); }}
                                    isDragging={isDragging1c2}
                                    onDragOver={() => setIsDragging1c2(true)}
                                    onDragLeave={() => setIsDragging1c2(false)}
                                    onDrop={e => handleFileDrop(e, '1c2')}
                                    inputId="c1-input-2"
                                    label="Журнал 2 (напр. выданные)"
                                    hint="Перетащите или нажмите · .xlsx .xls"
                                    color="violet"
                                />
                                {!c1File2 && (
                                    <button
                                        onClick={() => setShowSecond1c(false)}
                                        className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100"
                                        title="Убрать второй журнал"
                                    >
                                        <X className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            <button
                onClick={runReconcile}
                disabled={isLoading || !hasAnyFile}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
                {isLoading
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Сверяю...</>
                    : <><Search className="w-4 h-4" /> Запустить сверку</>
                }
            </button>

            {/* Результаты */}
            {rows.length > 0 && (
                <>
                    {/* Итоговые карточки */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="bg-gray-50 rounded-xl px-4 py-3">
                            <p className="text-xs text-gray-400">Всего в файлах</p>
                            <p className="text-xl font-bold text-gray-800 mt-0.5">{summary.totalFile}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl px-4 py-3">
                            <p className="text-xs text-emerald-600">Найдено в БД</p>
                            <p className="text-xl font-bold text-emerald-700 mt-0.5">{summary.matchedCount}</p>
                        </div>
                        <div className="bg-red-50 rounded-xl px-4 py-3">
                            <p className="text-xs text-red-500">Нет в БД</p>
                            <p className="text-xl font-bold text-red-700 mt-0.5">{summary.missingInDb}</p>
                            <p className="text-xs text-red-400">{formatMoney(summary.missingAmount)}</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl px-4 py-3">
                            <p className="text-xs text-amber-600">Только в БД</p>
                            <p className="text-xl font-bold text-amber-700 mt-0.5">{summary.extraInDb}</p>
                            <p className="text-xs text-amber-400">{formatMoney(summary.extraAmount)}</p>
                        </div>
                    </div>

                    {/* Вывод о расхождении */}
                    {summary.missingInDb > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
                            <p className="font-semibold text-red-800 text-sm mb-1">
                                📋 Вероятная причина расхождения баланса
                            </p>
                            <p className="text-sm text-red-700">
                                В файлах {summary.missingInDb} транзакций на сумму <strong>{formatMoney(summary.missingAmount)}</strong> которых нет в БД.
                                Импортируйте их через страницу <strong>Импорт</strong> — баланс сойдётся.
                            </p>
                        </div>
                    )}

                    {/* Итоги по контрагентам */}
                    {partnerSummary.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <button
                                className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50"
                                onClick={() => setExpandedSection(expandedSection === 'partners' ? null : 'partners')}
                            >
                                <span className="font-semibold text-gray-800 text-sm">Расхождения по контрагентам</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{partnerSummary.length} контрагентов</span>
                                    {expandedSection === 'partners' ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                </div>
                            </button>
                            {expandedSection === 'partners' && (
                                <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
                                    {partnerSummary.map((p, i) => (
                                        <div key={i} className="px-6 py-3 flex items-center gap-4 text-sm">
                                            <span className="flex-1 truncate text-gray-700">{p.name}</span>
                                            {p.missing > 0 && (
                                                <span className="text-red-600 text-xs whitespace-nowrap">
                                                    −{formatMoney(p.missing)} нет в БД
                                                </span>
                                            )}
                                            {p.extra > 0 && (
                                                <span className="text-amber-600 text-xs whitespace-nowrap">
                                                    +{formatMoney(p.extra)} только в БД
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Таблица с фильтрами */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {/* Фильтры */}
                        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                                {(['all', 'missing_in_db', 'extra_in_db', 'matched'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterStatus(s)}
                                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterStatus === s ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {s === 'all' ? 'Все' : s === 'missing_in_db' ? `Нет в БД (${summary.missingInDb})` : s === 'extra_in_db' ? `Только в БД (${summary.extraInDb})` : `В БД (${summary.matchedCount})`}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                                {(['all', 'bank', '1c'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterSource(s)}
                                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterSource === s ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {s === 'all' ? 'Все источники' : s === 'bank' ? 'Банк' : '1С'}
                                    </button>
                                ))}
                            </div>
                            <div className="flex-1 min-w-32">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Поиск по контрагенту..."
                                        value={searchText}
                                        onChange={e => setSearchText(e.target.value)}
                                        className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                            <span className="text-xs text-gray-400">{filteredRows.length} строк</span>
                        </div>

                        {/* Строки */}
                        <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
                            {filteredRows.length === 0 && (
                                <div className="px-6 py-8 text-center text-sm text-gray-400">Нет строк по выбранному фильтру</div>
                            )}
                            {filteredRows.map((r, i) => {
                                const rowKey = r.dbId || r.hash || String(i);
                                const isExpanded = expandedRowId === rowKey;
                                return (
                                <div key={i} className={`border-b border-gray-50 last:border-0 ${r.status === 'missing_in_db' ? 'bg-red-50/20' : r.status === 'extra_in_db' ? 'bg-amber-50/20' : ''}`}>
                                    {/* Основная строка */}
                                    <div
                                        className="px-6 py-3 flex items-center gap-3 text-sm hover:bg-gray-50/50 cursor-pointer"
                                        onClick={() => setExpandedRowId(isExpanded ? null : rowKey)}
                                    >
                                    {/* Статус */}
                                    <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[r.status]}`}>
                                        {statusLabel[r.status]}
                                    </span>

                                    {/* Источник */}
                                    <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-mono ${r.source === 'bank' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                        {r.source === 'bank' ? 'БАНК' : '1С'}
                                    </span>

                                    {/* Дата */}
                                    <span className="text-gray-400 text-xs w-20 flex-shrink-0">{r.date}</span>

                                    {/* Контрагент + описание */}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-gray-800 truncate block">{r.partner}</span>
                                        <span className="text-gray-400 text-xs truncate block">{r.description}</span>
                                    </div>

                                    {/* Сумма */}
                                    <span className={`whitespace-nowrap font-semibold text-sm ${r.type === 'income' ? 'text-emerald-600' : 'text-gray-700'}`}>
                                        {r.type === 'income' ? '+' : '−'}{formatMoney(r.amount)}
                                    </span>

                                    {/* Иконка статуса / кнопка удаления */}
                                    <div className="flex-shrink-0 flex items-center gap-1">
                                        {r.status === 'matched' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                                        {r.status === 'missing_in_db' && <AlertCircle className="w-4 h-4 text-red-400" />}
                                        {r.status === 'extra_in_db' && (
                                            <>
                                                <AlertTriangle className="w-4 h-4 text-amber-400" />
                                                {r.dbId && (
                                                    deletingId === r.dbId ? (
                                                        // Подтверждение удаления
                                                        <span className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-0.5">
                                                            <span className="text-xs text-red-700 whitespace-nowrap">Удалить из БД?</span>
                                                            <button
                                                                onClick={() => deleteFromDb(r)}
                                                                disabled={isDeletingDb}
                                                                className="text-xs font-bold text-red-600 hover:text-red-800 px-1 disabled:opacity-50"
                                                            >
                                                                {isDeletingDb ? '...' : 'Да'}
                                                            </button>
                                                            <button
                                                                onClick={() => setDeletingId(null)}
                                                                className="text-xs text-gray-400 hover:text-gray-600 px-1"
                                                            >
                                                                Нет
                                                            </button>
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => setDeletingId(r.dbId!)}
                                                            title="Удалить из БД"
                                                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )
                                                )}
                                            </>
                                        )}
                                    </div>
                                    </div>{/* конец основной строки */}

                                    {/* Детальная карточка (раскрывается по клику) */}
                                    {isExpanded && (
                                        <div className="px-6 pb-4 pt-1 bg-gray-50/60 border-t border-gray-100">
                                            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                                                {r.sourceDoc && (
                                                    <>
                                                        <span className="text-gray-400">Документ 1С</span>
                                                        <span className="text-gray-800 font-mono">{r.sourceDoc}</span>
                                                    </>
                                                )}
                                                {r.partnerBin && (
                                                    <>
                                                        <span className="text-gray-400">БИН контрагента</span>
                                                        <span className="text-gray-800 font-mono">{r.partnerBin}</span>
                                                    </>
                                                )}
                                                {r.hash && (
                                                    <>
                                                        <span className="text-gray-400">Хеш</span>
                                                        <span className="text-gray-500 font-mono break-all">{r.hash}</span>
                                                    </>
                                                )}
                                                {r.dbId && (
                                                    <>
                                                        <span className="text-gray-400">ID в БД</span>
                                                        <span className="text-gray-500 font-mono">{r.dbId}</span>
                                                    </>
                                                )}
                                                {r.categoryId && (
                                                    <>
                                                        <span className="text-gray-400">Статья</span>
                                                        <span className="text-gray-800">{r.categoryId}</span>
                                                    </>
                                                )}
                                                {r.status === 'extra_in_db' && (
                                                    <>
                                                        <span className="text-gray-400 col-span-2 mt-1 pt-1 border-t border-gray-200">
                                                            💡 <strong>Как проверить:</strong> откройте в 1С журнал выданных счетов-фактур и найдите документ <strong>{r.sourceDoc || r.description}</strong> от <strong>{r.date}</strong>. Если он там есть — значит файл был за другой период. Если нет — это дубликат, можно удалить.
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
