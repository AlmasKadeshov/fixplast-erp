
import { useState, useCallback } from 'react';
import { parseBankStatement } from '../utils/bankParser';
import { parseOneCFile } from '../utils/oneCParser';
import { partnersService } from '../services/partners.service';
import { projectsService } from '../services/projects.service';
import { AUP_PROJECT_KEYWORD } from '../utils/costItemMatcher';
import { applyAutoRules } from '../utils/autoRuleMatcher';
import { autoRulesService } from '../services/autoRules.service';
import { ImportRow } from '../components/finance/TransactionImportTable';
import { useToast } from '../components/ui/Toast';
import { financeService, ReconciliationResult } from '../services/finance.service';
import { Timestamp } from 'firebase/firestore';

const WALLETS = ['Основной (KZT)', 'Наличные', 'Kaspi'];

export interface PartnerPreview {
    name: string;
    bin: string;
    type: 'SUPPLIER' | 'CLIENT';
}

/** Результат предварительной проверки файла (до показа таблицы) */
export interface FileCheckResult {
    totalInFile: number;
    alreadyInDb: number;
    newCount: number;
    /** Детальный результат сверки для отображения в модале */
    reconciliation?: ReconciliationResult;
    /** Исходные транзакции для передачи в reconciliation modal */
    rawTransactions?: any[];
    /** Хеши которые уже есть в БД — для фильтрации дублей при импорте */
    dbHashes?: Set<string>;
}

export function useTransactionImport() {
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [importType, setImportType] = useState<'bank' | '1c'>('bank');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newPartnersPreview, setNewPartnersPreview] = useState<PartnerPreview[]>([]);
    const [fileCheckResult, setFileCheckResult] = useState<FileCheckResult | null>(null);
    const { showToast } = useToast();

    // Validation logic
    const validateRow = useCallback((row: ImportRow): boolean => {
        // For ESF/1C import, Project/Category are key.
        // BUT we might want to allow bulk edit.
        return !!(row.selectedProjectId && row.selectedCategoryId);
    }, []);

    /**
     * Быстрая проверка файла: сколько уже есть в БД
     * Возвращает статистику без полного парсинга UI
     */
    const checkFileAgainstDb = useCallback(async (file: File, type: 'bank' | '1c' = 'bank'): Promise<FileCheckResult | null> => {
        try {
            let transactions: any[] = [];
            if (type === '1c') {
                transactions = await parseOneCFile(file);
            } else {
                transactions = await parseBankStatement(file);
            }

            if (transactions.length === 0) return null;

            // Определяем диапазон дат файла
            const dates = transactions.map((t: any) => t.date).filter(Boolean) as Date[];
            if (dates.length === 0) return null;

            const dateFrom = new Date(Math.min(...dates.map(d => d.getTime())));
            const dateTo = new Date(Math.max(...dates.map(d => d.getTime())));

            // Загружаем хеши из БД за этот период
            const dbHashes = await financeService.getHashesForPeriod(dateFrom, dateTo, type);

            const alreadyInDb = transactions.filter((t: any) => t.hash && dbHashes.has(t.hash)).length;
            const newCount = transactions.length - alreadyInDb;

            // Полная сверка для детального отчёта
            const reconciliation = await financeService.reconcileWithFile(
                transactions.map((t: any) => ({
                    hash: t.hash || '',
                    date: t.date || new Date(),
                    amount: t.amount,
                    type: t.type,
                    description: t.purpose || '',
                    partner: t.partner || '',
                })),
                dateFrom,
                dateTo,
                type
            );

            return {
                totalInFile: transactions.length,
                alreadyInDb,
                newCount,
                reconciliation,
                rawTransactions: transactions,
                dbHashes,
            };
        } catch (e) {
            console.error('File check failed', e);
            return null;
        }
    }, []);

    const processFile = useCallback(async (file: File, type: 'bank' | '1c' = 'bank', knownHashes?: Set<string>) => {
        setIsProcessing(true);
        setImportType(type);
        setRows([]);
        setNewPartnersPreview([]);

        try {
            let transactions: any[] = [];

            if (type === '1c') {
                transactions = await parseOneCFile(file);
            } else {
                transactions = await parseBankStatement(file);
            }

            // Фильтруем дубли — оставляем только те которых нет в БД
            if (knownHashes && knownHashes.size > 0) {
                const before = transactions.length;
                transactions = transactions.filter(t => !t.hash || !knownHashes.has(t.hash));
                const skipped = before - transactions.length;
                if (skipped > 0) {
                    console.debug(`[Import] Пропущено дублей: ${skipped}, новых к импорту: ${transactions.length}`);
                }
            }

            // 1. Gather Unique Partners from File
            const partnersToResolve = transactions
                .filter(t => t.partnerBin && t.partner)
                .map(t => ({
                    name: t.partner,
                    bin: t.partnerBin,
                    // Determine type: ESF-In (Expenses) -> Supplier, ESF-Out (Revenue) -> Client
                    type: (t.type === 'expense' ? 'SUPPLIER' : 'CLIENT') as 'SUPPLIER' | 'CLIENT',
                }));

            // 2. Batch Resolve: Find existing ID or mark as NEW
            let partnerIdsByBin = new Map<string, string>();


            if (partnersToResolve.length > 0) {
                // First, find exact matches
                // We use a custom service method or existing one
                // batchFindOrCreateByBin creates them automatically. 
                // The requirement is "Preview new partners".
                // So we shouldn't create them YET?
                // Actually the service `batchFindOrCreateByBin` creates them.
                // If we want preview, we need `batchCheckExistence`.
                // Let's modify behavior: We'll create them on SAVE or show them now.
                // "Нужно добавить в интерфейс импорта предпросмотр новых контрагентов"
                // So we should identify missing ones first.

                // Let's do a fetch rather than fetch-or-create if we want preview
                // But efficient way is to just assume we will create them.
                // Let's detect which ones are missing.

                // We'll rely on `batchFindOrCreateByBin` to just return IDs for now,
                // BUT we want to see WHO was created.
                // Since `batchFindOrCreateByBin` in the service creates missing ones, 
                // we might want to capture "New" ones.
                // For now, let's just proceed with standard flow functionality 
                // and maybe show "New Partners Found" as a toast or list AFTER parsing.

                // Hack: We can query again? 
                // Or: Parse -> Show Unique Bins -> Resolve IDs -> If ID missing, it's new.

                // For MVP, lets just call the service which auto-creates, 
                // then we can say "Partners Synced".
                // The user says "Preview ... to see who system IS GOING TO create".
                // That implies we should NOT create them immediately in `processFile`.
                // But `useTransactionImport` calls `partnersService.batchFindOrCreateByBin` inside `saveTransactions` usually?
                // In the current code (lines 50-53 above), it calls it inside `processFile`!
                // This means partners are created immediately upon file drop!
                // To support "Preview", we should change this to valid read-only check.

                // We will SKIP creation here. We will just check existence.
                // We'll reimplement a check logic here:

                // Filter unique
                const uniqueBins = Array.from(new Set(partnersToResolve.map(p => p.bin)));
                const existingMap = new Map<string, string>();
                // We need a method to find by Bins without creating
                // We can assume user will click "Load" to verify?

                // Let's revert to "Safe Mode": 
                // 1. Try to find existing.
                // 2. Any not found -> Add to "New Partners Preview" list.
                // 3. Do not create yet.

                // We need to implement `batchFindByBin` in service? 
                // Or just iterate (slow)? We have `findByBin`.
                // Let's iterate for now or assume service update.
                // I'll call `findByBin` in parallel for all unique bins.

                const checkPromises = uniqueBins.map(async bin => {
                    const p = await partnersService.findByBin(bin);
                    return { bin, partner: p };
                });

                const results = await Promise.all(checkPromises);
                const newPartners: any[] = [];
                const partnerDefaults = new Map<string, { projectId?: string, categoryId?: string }>();

                results.forEach(r => {
                    if (r.partner) {
                        existingMap.set(r.bin, r.partner.id);
                        // Save defaults from existing partner
                        if (r.partner.defaultProjectId) {
                            partnerDefaults.set(r.bin, {
                                projectId: r.partner.defaultProjectId,
                                // TODO: Add defaultCategoryId to Partner model later. 
                                // For now we rely on history or hardcode logic below.
                            });
                        }
                    } else {
                        const original = partnersToResolve.find(p => p.bin === r.bin);
                        if (original) newPartners.push(original);
                    }
                });

                partnerIdsByBin = existingMap;
                setNewPartnersPreview(newPartners);
            }

            // 3. Find AUP project for auto-assignment
            let aupProjectId = '';
            try {
                const projects = await projectsService.getActive();
                const aupProject = projects.find(p =>
                    p.name.toLowerCase().includes(AUP_PROJECT_KEYWORD)
                );
                if (aupProject) {
                    aupProjectId = aupProject.id;
                }
            } catch (e) {
                console.error('Failed to load projects for AUP matching', e);
            }

            // 3b. Load user auto-rules
            let userRules: Awaited<ReturnType<typeof autoRulesService.getActiveRules>> = [];
            try {
                userRules = await autoRulesService.getActiveRules();
            } catch (e) {
                console.error('Failed to load auto-rules', e);
            }

            // 4. Enrich Rows using cascade: user rules → system rules → default
            const enrichedRows: ImportRow[] = transactions.map((t) => {
                const matchResult = applyAutoRules(
                    userRules,
                    t.purpose,
                    t.partner || '',
                    t.type,
                    t.amount,
                    type
                );

                // Partner resolution
                const resolvedPartnerId = matchResult.partnerId
                    || (t.partnerBin ? (partnerIdsByBin.get(t.partnerBin) || '') : '');

                // Auto-assign project: user rule > autoAup fallback
                const resolvedProjectId = matchResult.projectId
                    || (matchResult.autoAup && aupProjectId ? aupProjectId : '');

                // Increment match count for user rules
                if (matchResult.source === 'user-rule' && matchResult.matchedRuleId) {
                    autoRulesService.incrementMatchCount(matchResult.matchedRuleId).catch(() => {});
                }

                return {
                    ...t,
                    selectedProjectId: resolvedProjectId,
                    selectedCategoryId: matchResult.categoryId || '',
                    selectedWalletId: WALLETS[0],
                    resolvedPartnerId,
                    resolvedTagIds: matchResult.tagId ? [matchResult.tagId] : [],
                    partnerBin: t.partnerBin,
                    isValid: false,
                    hash: t.hash,
                    sourceType: type === '1c' ? '1c' : 'bank'
                };
            });

            const validatedRows = enrichedRows.map(row => ({
                ...row,
                isValid: validateRow(row),
            }));

            setRows(validatedRows);


            showToast(
                `Загружено ${transactions.length}. Новых контрагентов: ${newPartnersPreview.length}`,
                'success'
            );
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Ошибка парсинга', 'error');
        } finally {
            setIsProcessing(false);
        }
    }, [showToast, validateRow, newPartnersPreview]);

    const updateRow = useCallback((index: number, key: keyof ImportRow, value: string) => {
        setRows(prev => {
            const newRows = [...prev];
            // @ts-ignore
            newRows[index] = { ...newRows[index], [key]: value };
            newRows[index].isValid = validateRow(newRows[index]);
            return newRows;
        });
    }, [validateRow]);

    const deleteRow = useCallback((index: number) => {
        setRows(prev => prev.filter((_, i) => i !== index));
    }, []);

    const saveTransactions = useCallback(async () => {
        const validRows = rows.filter(r => r.isValid);
        if (validRows.length === 0) {
            showToast('Нет валидных строк', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            // Create NEW PARTNERS first (from preview)
            // We re-gather just to be safe or use state
            const partnersToCreate = validRows
                .filter(r => !r.resolvedPartnerId && r.partnerBin && r.partner)
                .map(r => ({
                    name: r.partner,
                    bin: r.partnerBin,
                    type: (r.type === 'expense' ? 'SUPPLIER' : 'CLIENT') as 'SUPPLIER' | 'CLIENT',
                }));

            if (partnersToCreate.length > 0) {
                // Now we ACTUALLY create them
                const newPartnerIds = await partnersService.batchFindOrCreateByBin(partnersToCreate);

                // Update rows with new IDs
                for (const row of validRows) {
                    if (!row.resolvedPartnerId && row.partnerBin) {
                        row.resolvedPartnerId = newPartnerIds.get(row.partnerBin) || '';
                    }
                }
            }

            // Proceed to save transactions...
            const transactionsToSave = validRows.map(r => ({
                date: r.date ? Timestamp.fromDate(r.date) : Timestamp.now(),
                amount: r.amount,
                type: r.type,
                status: 'fact' as const,
                walletId: r.selectedWalletId || '',
                partnerId: r.resolvedPartnerId || '',
                partnerBin: r.partnerBin || '', // Save BIN
                categoryId: r.selectedCategoryId,
                projectId: r.selectedProjectId,
                description: r.purpose,
                sourceDoc: importType === '1c' ? '1C Import' : 'Bank Import',
                sourceType: (importType === '1c' ? '1c' : 'bank') as 'bank' | '1c',
                tagIds: r.resolvedTagIds || [],
                hash: r.hash || '',
                accountingPeriod: r.date ? r.date.toISOString().substring(0, 7) : '',
                vatAmount: r.vatAmount || 0,
            }));

            // ... (rest of save logic)
            // Need to copy rest of filtering logic from original
            let resultMsg = '';

            if (importType === '1c') {
                const withHash = transactionsToSave.filter(t => t.hash) as any[];
                const res = await financeService.save1CTransactions(withHash);
                resultMsg = `Импортировано (ОПиУ): ${res.imported}. Дубликатов: ${res.skipped}.`;
            } else {
                const res = await financeService.batchImportTransactions(transactionsToSave);
                resultMsg = `Импортировано (Банк): ${res.imported}. Дубликатов: ${res.skipped}.`;
            }

            showToast(resultMsg, 'success');
            setRows([]);
            setNewPartnersPreview([]); // Clear preview
        } catch (e) {
            console.error(e);
            showToast('Ошибка сохранения', 'error');
        } finally {
            setIsSaving(false);
        }

    }, [rows, showToast, importType]);

    return {
        rows,
        setRows,
        processFile,
        updateRow,
        saveTransactions,
        isProcessing,
        setIsProcessing,
        isSaving,
        validateRow,
        importType,
        newPartnersPreview, // Expose for UI
        deleteRow,
        checkFileAgainstDb,
        fileCheckResult,
        setFileCheckResult,
    };
};
