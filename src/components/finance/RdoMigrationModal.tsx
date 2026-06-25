// @ts-nocheck — компонент миграции из старой системы, требует рефактора под FixPlast
import { useRef, useState, useCallback } from 'react';
import { X, History, Upload, Check, Database, FolderTree, Receipt, Users } from 'lucide-react';
import { parseUchetAmre, MigrationPreview as FullMigrationPreview, RdoRow } from '../../utils/excelMigrationParser';
import { projectsService } from '../../services/projects.service';
import { costItemsService } from '../../services/costItems.service';
import { financeService } from '../../services/finance.service';
import { Timestamp } from 'firebase/firestore';
import { useToast } from '../../components/ui/Toast';

interface RdoMigrationModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

type MigrationStep = 'upload' | 'preview' | 'migrating' | 'done';

interface MigrationProgress {
    step: string;
    current: number;
    total: number;
}

interface MigrationResult {
    projects: { deleted: number; created: number };
    costItems: { deleted: number; created: number };
    partners: { deleted: number; created: number };
    transactions: { deleted: number; created: number };
    errors: string[];
}

export function RdoMigrationModal({ onClose, onSuccess }: RdoMigrationModalProps) {
    const [step, setStep] = useState<MigrationStep>('upload');
    const [preview, setPreview] = useState<FullMigrationPreview | null>(null);
    const [progress, setProgress] = useState<MigrationProgress | null>(null);
    const [result, setResult] = useState<MigrationResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    // Обработка загрузки файла
    const handleFileUpload = useCallback(async (file: File) => {
        try {
            const data = await parseUchetAmre(file);
            setPreview(data);
            setStep('preview');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Ошибка парсинга файла', 'error');
        }
    }, [showToast]);

    // Запуск миграции
    const runMigration = useCallback(async () => {
        if (!preview) return;

        setStep('migrating');
        const errors: string[] = [];
        const migrationResult: MigrationResult = {
            projects: { deleted: 0, created: 0 },
            costItems: { deleted: 0, created: 0 },
            partners: { deleted: 0, created: 0 },
            transactions: { deleted: 0, created: 0 },
            errors: [],
        };

        try {
            // Шаг 1: Получение справочника проектов
            setProgress({ step: 'Загрузка справочников...', current: 0, total: 3 });
            const existingProjects = await projectsService.getAll();
            const existingItems = await costItemsService.getAll();

            // Build Maps for Matching
            const projectNameToId = new Map<string, string>();
            existingProjects.forEach(p => {
                projectNameToId.set(p.name.toLowerCase().trim(), p.id);
                if (p.code) projectNameToId.set(p.code.toLowerCase().trim(), p.id);
            });

            // Helper: Normalize project name for matching
            // "Блок Б - ОВК (СМР)" -> "блок б овк"
            // "Блок Б - ОВК (Материалы)" -> "блок б овк"
            // "Блок Б (ОВК)" -> "блок б овк"
            const normalizeProjectName = (name: string): string => {
                return name
                    .toLowerCase()
                    .replace(/\(смр\)/gi, '')
                    .replace(/\(cmp\)/gi, '')
                    .replace(/\(материалы\)/gi, '')
                    .replace(/\(материал\)/gi, '')
                    .replace(/[()-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            // Build normalized project map
            const normalizedProjectMap = new Map<string, string>();
            existingProjects.forEach(p => {
                const normalizedName = normalizeProjectName(p.name);
                normalizedProjectMap.set(normalizedName, p.id);
                // Also add code-based normalization
                if (p.code) {
                    normalizedProjectMap.set(normalizeProjectName(p.code), p.id);
                }
            });

            // Find "Общие расходы компании (АУП)" project for fallback
            const aupProject = existingProjects.find(p =>
                p.name.toLowerCase().includes('общие расходы') ||
                p.name.toLowerCase().includes('ауп')
            );
            const aupProjectId = aupProject?.id || '';


            const costItemNameToId = new Map<string, string>();
            const costItemMap = new Map<string, any>();
            existingItems.forEach(i => {
                costItemNameToId.set(i.itemName.toLowerCase().trim(), i.itemId);
                costItemMap.set(i.itemId, i);
            });

            // Шаг 2: Очистка старых RDO транзакций
            setProgress({ step: 'Очистка старых RDO транзакций...', current: 1, total: 3 });
            try {
                // Only clear RDO transactions, preserve invoices/acts
                const deletedTx = await financeService.clearRdoTransactions();
                migrationResult.transactions.deleted = deletedTx;
            } catch (e) {
                errors.push(`Ошибка очистки RDO: ${e instanceof Error ? e.message : 'Unknown'}`);
            }

            // Шаг 3: Импорт RDO транзакций с умным маппингом
            setProgress({ step: 'Импорт транзакций RDO...', current: 2, total: 3 });
            try {
                let unmatchedProjects = new Set<string>();
                let unmatchedCostItems = new Set<string>();

                const transactions = preview.rdo.items
                    .filter((row: RdoRow) => row.date && row.amount > 0)
                    .map((row: RdoRow) => {
                        // 1. PROJECT MAPPING
                        const projectKey = row.project.toLowerCase().trim();
                        let projectId = projectNameToId.get(projectKey) || '';

                        // Try normalized matching if exact match failed
                        // "Блок Б - ОВК (СМР)" -> normalized "блок б овк" -> matches "Блок Б (ОВК)"
                        if (!projectId && row.project) {
                            const normalizedInput = normalizeProjectName(row.project);
                            projectId = normalizedProjectMap.get(normalizedInput) || '';
                        }

                        // Fallback: find project where all significant tokens match
                        if (!projectId && row.project) {
                            const inputTokens = normalizeProjectName(row.project).split(' ').filter(t => t.length > 1);

                            const bestMatch = existingProjects.find(p => {
                                const dbTokens = normalizeProjectName(p.name).split(' ').filter(t => t.length > 1);
                                // All tokens from DB project should be in input
                                return dbTokens.length > 0 && dbTokens.every(t => inputTokens.includes(t));
                            });

                            if (bestMatch) {
                                projectId = bestMatch.id;
                            }
                        }

                        // Check if this is a general expense (taxes, commissions, dividends, etc.)
                        const isGeneralExpense = !row.project ||
                            row.project.toLowerCase().includes('общие расходы') ||
                            row.costItem.toLowerCase().includes('банковские комиссии') ||
                            row.costItem.toLowerCase().includes('налог') ||
                            row.costItem.toLowerCase().includes('дивиденд') ||
                            row.costItem.toLowerCase().includes('вывод дивидендов');

                        // If no project found, use АУП for general expenses
                        if (!projectId && isGeneralExpense && aupProjectId) {
                            projectId = aupProjectId;
                        }

                        if (!projectId && row.project) {
                            unmatchedProjects.add(row.project);
                        }

                        // 2. COST ITEM MAPPING
                        const costItemKey = row.costItem.toLowerCase().trim();
                        let categoryId = costItemNameToId.get(costItemKey);

                        if (!categoryId && row.costItem) {
                            // Try exact match by itemId (e.g., "CMP (Оплата Субподрядчикам..." might match "CMP")
                            const bestMatch = existingItems.find(i => {
                                const dbName = i.itemName.toLowerCase().trim();
                                // Exact match
                                if (dbName === costItemKey) return true;
                                // Input contains DB name (e.g., input "Банковские комиссии" contains "Банковские комиссии")
                                if (costItemKey.includes(dbName) && dbName.length > 3) return true;
                                // DB name contains input
                                if (dbName.includes(costItemKey) && costItemKey.length > 3) return true;
                                // Match by itemId prefix
                                if (i.itemId && costItemKey.startsWith(i.itemId.toLowerCase())) return true;
                                return false;
                            });
                            if (bestMatch) categoryId = bestMatch.itemId;
                        }

                        if (!categoryId && row.costItem) {
                            unmatchedCostItems.add(row.costItem);
                        }

                        // 3. TYPE & WALLET LOGIC
                        let isIncome = false;

                        if (row.ddsDirection) {
                            isIncome = row.ddsDirection === 'income';
                        } else {
                            // HEURISTIC FALLBACK
                            let isRevenue = false;
                            if (categoryId) {
                                const costItem = costItemMap.get(categoryId);
                                if (costItem) {
                                    isRevenue = costItem.opiuCategory === 'Revenue' ||
                                        costItem.itemName.toLowerCase().includes('выручка') ||
                                        costItem.itemName.toLowerCase().includes('поступление');
                                }
                            }

                            if (!isRevenue && row.costItem) {
                                const lowerItem = row.costItem.toLowerCase();
                                isRevenue = lowerItem.includes('выручка') ||
                                    lowerItem.includes('поступление от заказчика');
                            }
                            isIncome = isRevenue || (!!row.walletTo && !row.walletFrom);
                        }

                        let walletId = 'Основной (KZT)';
                        if (isIncome) {
                            walletId = row.walletTo || row.walletFrom || 'Основной (KZT)';
                        } else {
                            walletId = row.walletFrom || 'Основной (KZT)';
                        }

                        // Clean defaults
                        if (walletId.includes('BANK_AMRE')) walletId = 'Основной (KZT)';

                        return {
                            date: Timestamp.fromDate(row.date!),
                            amount: row.amount,
                            type: isIncome ? 'income' as const : 'expense' as const,
                            status: 'fact' as const,
                            walletId: walletId,
                            partnerId: row.partnerId || '', // We don't map partners yet, assume empty or text
                            categoryId: categoryId || '',
                            projectId: projectId || '',
                            description: row.comment || '',
                            sourceDoc: 'RDO Migration',
                            sourceType: 'bank' as const,
                        };
                    });


                if (unmatchedProjects.size > 0) {
                    const missingProjs = Array.from(unmatchedProjects);
                    console.warn('⚠️ Проекты не найдены в справочнике:', missingProjs);
                    errors.push(`Не найдено проектов (${missingProjs.length}): ${missingProjs.slice(0, 5).join(', ')}...`);
                }
                if (unmatchedCostItems.size > 0) {
                    const missingItems = Array.from(unmatchedCostItems);
                    console.warn('⚠️ Статьи затрат не найдены в справочнике:', missingItems);
                    errors.push(`Не найдено статей (${missingItems.length}): ${missingItems.slice(0, 5).join(', ')}...`);
                }

                // For transactions without project, assign to АУП
                const transactionsWithProject = transactions.map(t => {
                    if (!t.projectId && aupProjectId) {
                        return { ...t, projectId: aupProjectId };
                    }
                    return t;
                });

                const validTransactions = transactionsWithProject.filter(t => t.projectId);
                const invalidCount = transactionsWithProject.length - validTransactions.length;

                if (invalidCount > 0) {
                    console.warn(`⚠️ Пропущено транзакций без projectId: ${invalidCount}`);
                    errors.push(`Пропущено ${invalidCount} транзакций (нет маппинга проекта)`);
                }


                if (validTransactions.length > 0) {
                    const txResult = await financeService.batchImportTransactions(validTransactions);
                    migrationResult.transactions.created = txResult.imported;
                }
            } catch (e) {
                errors.push(`Ошибка импорта транзакций: ${e instanceof Error ? e.message : 'Unknown'}`);
            }

            migrationResult.errors = errors;
            setResult(migrationResult);
            setStep('done');

            if (errors.length === 0) {
                showToast('Миграция успешно завершена!', 'success');
            } else {
                showToast(`Миграция завершена с ${errors.length} ошибками`, 'warning');
            }
        } catch (error) {
            showToast('Критическая ошибка миграции', 'error');
            setStep('preview');
        }
    }, [preview, showToast]);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-orange-500 to-amber-500">
                    <h2 className="text-lg font-semibold text-white flex items-center">
                        <Database className="w-5 h-5 mr-2" />
                        Полная миграция из uchet_amre
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {/* Step: Upload */}
                    {step === 'upload' && (
                        <>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                                <div className="flex items-start">
                                    <Database className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-blue-800">Импорт RDO транзакций</p>
                                        <p className="text-sm text-blue-700 mt-1">
                                            Эта операция <strong>заменит только RDO транзакции</strong>. Существующие проекты и статьи затрат останутся без изменений.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-gray-600 mb-4">
                                Загрузите файл uchet_amre.xlsx. Будет использоваться лист RDO:
                            </p>

                            <ul className="text-sm text-gray-500 mb-6 space-y-1">
                                <li className="flex items-center"><History className="w-4 h-4 mr-2 text-orange-500" /> RDO — Транзакции (будут импортированы)</li>
                                <li className="flex items-center text-gray-400"><FolderTree className="w-4 h-4 mr-2" /> ref_projects — для маппинга проектов</li>
                                <li className="flex items-center text-gray-400"><Receipt className="w-4 h-4 mr-2" /> ref_cost_items — для маппинга статей</li>
                            </ul>

                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file);
                                }}
                                accept=".xlsx,.xls"
                                className="hidden"
                            />

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors flex flex-col items-center"
                            >
                                <Upload className="w-10 h-10 text-orange-500 mb-2" />
                                <span className="text-gray-700 font-medium">Выбрать файл uchet_amre.xlsx</span>
                            </button>
                        </>
                    )}

                    {/* Step: Preview */}
                    {step === 'preview' && preview && (
                        <>
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-blue-50 p-4 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <FolderTree className="w-6 h-6 text-blue-500" />
                                        <span className="text-2xl font-bold text-blue-600">{preview.projects.count}</span>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">Проектов</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <Receipt className="w-6 h-6 text-green-500" />
                                        <span className="text-2xl font-bold text-green-600">{preview.costItems.count}</span>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">Статей затрат</div>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <Users className="w-6 h-6 text-purple-500" />
                                        <span className="text-2xl font-bold text-purple-600">{preview.partners.count}</span>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">Контрагентов</div>
                                </div>
                                <div className="bg-orange-50 p-4 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <History className="w-6 h-6 text-orange-500" />
                                        <span className="text-2xl font-bold text-orange-600">{preview.rdo.count}</span>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">Транзакций RDO</div>
                                </div>
                            </div>

                            {preview.errors.length > 0 && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                                    <div className="font-medium text-yellow-800 mb-2">⚠️ Предупреждения:</div>
                                    <ul className="text-sm text-yellow-700">
                                        {preview.errors.map((err, i) => (
                                            <li key={i}>• {err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                <div className="flex items-center text-orange-800">
                                    <Database className="w-5 h-5 mr-2" />
                                    <span className="font-medium">Будут обновлены только RDO транзакции.</span>
                                </div>
                                <p className="text-sm text-orange-700 mt-1 ml-7">
                                    Существующие проекты и статьи не будут удалены. Будет произведен поиск соответствий.
                                </p>
                            </div>
                        </>
                    )}

                    {/* Step: Migrating */}
                    {step === 'migrating' && progress && (
                        <div className="text-center py-8">
                            <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
                            <p className="text-lg font-medium text-gray-900">{progress.step}</p>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
                                <div
                                    className="bg-orange-500 h-2 rounded-full transition-all"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                />
                            </div>
                            <p className="text-sm text-gray-500 mt-2">
                                Шаг {progress.current + 1} из {progress.total + 1}
                            </p>
                        </div>
                    )}

                    {/* Step: Done */}
                    {step === 'done' && result && (
                        <>
                            <div className="text-center py-4 mb-4">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-8 h-8 text-green-600" />
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900">Миграция завершена!</h3>
                            </div>

                            <div className="bg-orange-50 p-4 rounded-lg">
                                <div className="font-medium text-orange-800 mb-2">RDO Транзакции</div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Удалено старых:</span>
                                    <span className="font-medium text-red-600">{result.transactions.deleted}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm mt-1">
                                    <span className="text-gray-600">Импортировано новых:</span>
                                    <span className="font-medium text-green-600">{result.transactions.created}</span>
                                </div>
                            </div>

                            {result.errors.length > 0 && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4 max-h-32 overflow-y-auto">
                                    <div className="font-medium text-yellow-800 text-sm mb-1">Ошибки ({result.errors.length}):</div>
                                    <ul className="text-xs text-yellow-700">
                                        {result.errors.slice(0, 10).map((err, i) => (
                                            <li key={i}>• {err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        {step === 'done' ? 'Закрыть' : 'Отмена'}
                    </button>

                    {step === 'preview' && (
                        <button
                            onClick={runMigration}
                            className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center"
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Импортировать RDO
                        </button>
                    )}

                    {step === 'done' && (
                        <button
                            onClick={onSuccess}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                        >
                            <Check className="w-4 h-4 mr-2" />
                            Готово
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
