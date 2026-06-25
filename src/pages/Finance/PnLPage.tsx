import { useState, useEffect, useMemo } from 'react';
import {
    format,
    eachMonthOfInterval,
    differenceInDays,
    max as maxDate,
    min as minDate,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { financeService } from '../../services/finance.service';
import { costItemsService } from '../../services/costItems.service';
import { projectsService } from '../../services/projects.service';
import { Transaction, getPaymentDate } from '../../models/finance';
import { CostItem } from '../../models/costItems';
import { Project } from '../../models';
import { useCategories } from '../../hooks/useCategories';
import { useToast } from '../../components/ui/Toast';
import { Download, FileSpreadsheet } from 'lucide-react';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import { SlideOver } from '../../components/ui/SlideOver';
import { quickExport } from '../../utils/excelExport';
import { formatMoney } from '../../utils/formatters';
import { format as fmtDate } from 'date-fns';

// ============================================
// TYPES
// ============================================

type OpiuSection = 'revenue' | 'cogs' | 'opex' | 'ignore';

interface PnLLineItem {
    id: string;
    name: string;
    section: OpiuSection;
    values: Record<string, number>;
    total: number;
}

interface PnLRow {
    type: 'section-header' | 'line-item' | 'subtotal' | 'gross' | 'ebitda' | 'net';
    id: string;
    name: string;
    values: Record<string, number>;
    total: number;
    marginPercent?: number;
}

interface ProjectPnLRow {
    id: string;
    name: string;
    rowType: 'parent' | 'child' | 'standalone' | 'aup' | 'aup-detail' | 'total';
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    opexShare: number;          // proportional OPEX share based on revenue
    ebitda: number;
    marginPercent: number;
    contractAmount?: number;
    remaining?: number;
    isChild?: boolean;
}

// ============================================
// HELPERS
// ============================================

function normalizeOpiuCategory(raw?: string): OpiuSection {
    if (!raw) return 'ignore';
    const lower = raw.toLowerCase();
    if (lower === 'revenue') return 'revenue';
    if (lower === 'cogs') return 'cogs';
    if (lower === 'opex') return 'opex';
    return 'ignore';
}

// ============================================
// COMPONENT
// ============================================

export function PnLPage() {
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [includePlan, setIncludePlan] = useState(false);
    const [viewMode, setViewMode] = useState<'months' | 'projects'>('months');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(false);
    const [drilldownOpen, setDrilldownOpen] = useState(false);
    const [drilldownTitle, setDrilldownTitle] = useState('');
    const [drilldownTxs, setDrilldownTxs] = useState<Transaction[]>([]);
    const [drilldownTotal, setDrilldownTotal] = useState(0);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const { categories } = useCategories();
    const { showToast } = useToast();

    const toggleGroup = (id: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        loadData();
    }, [currentYear, viewMode]);

    const loadData = async () => {
        setLoading(true);
        try {
            // For "По проектам" — load ALL data; for "По месяцам" — wider range for accrual
            const startDate = viewMode === 'projects'
                ? new Date(2020, 0, 1)
                : new Date(currentYear - 1, 0, 1);
            const endDate = viewMode === 'projects'
                ? new Date(2099, 11, 31)
                : new Date(currentYear + 1, 11, 31);

            const [txs, items, prjs] = await Promise.all([
                financeService.getTransactions({ startDate, endDate }),
                costItemsService.getAll(),
                projectsService.getAll(),
            ]);

            setTransactions(txs);
            setCostItems(items);
            setProjects(prjs);
        } catch (error) {
            console.error(error);
            showToast('Ошибка загрузки данных', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Category lookup: categoryId/itemId -> { name, opiuCategory, isSystem, isSalary }
    const categoryLookup = useMemo(() => {
        const map = new Map<string, { name: string; opiuCategory: OpiuSection; isSystem: boolean; isSalary: boolean }>();

        // Build legacy costItems lookup first (for fallback opiuCategory)
        const legacyOpiuMap = new Map<string, string>();
        for (const item of costItems) {
            if (item.opiuCategory) legacyOpiuMap.set(item.itemId, item.opiuCategory);
        }

        // New categories (higher priority)
        for (const cat of categories) {
            const isSalary = !!(cat.legacyItemId?.startsWith('SALARY')) ||
                cat.name.toLowerCase().includes('зарплат');
            // If category has ignore/empty opiuCategory but legacy has a real value — use legacy
            let opiuNorm = normalizeOpiuCategory(cat.opiuCategory);
            if (opiuNorm === 'ignore' && cat.legacyItemId) {
                const legacyVal = legacyOpiuMap.get(cat.legacyItemId);
                if (legacyVal) {
                    const legacyNorm = normalizeOpiuCategory(legacyVal);
                    if (legacyNorm !== 'ignore') opiuNorm = legacyNorm;
                }
            }
            // Force salary categories to their correct OPIU sections
            if (isSalary && opiuNorm === 'ignore') {
                opiuNorm = cat.legacyItemId === 'SALARY_SMR' ? 'cogs' : 'opex';
            }
            const entry = {
                name: cat.name,
                opiuCategory: opiuNorm,
                isSystem: cat.isSystem,
                isSalary,
            };
            map.set(cat.id, entry);
            if (cat.legacyItemId) map.set(cat.legacyItemId, entry);
        }

        // Fallback to legacy costItems
        for (const item of costItems) {
            if (!map.has(item.itemId)) {
                const isSalary = item.itemId.startsWith('SALARY') || item.itemName.toLowerCase().includes('зарплат');
                let opiuCat = normalizeOpiuCategory(item.opiuCategory);
                // Force salary categories to their correct OPIU sections
                if (isSalary && opiuCat === 'ignore') {
                    opiuCat = item.itemId === 'SALARY_SMR' ? 'cogs' : 'opex';
                }
                map.set(item.itemId, {
                    name: item.itemName,
                    opiuCategory: opiuCat,
                    isSystem: false,
                    isSalary,
                });
            }
        }

        // Post-process: ensure ALL salary entries have correct opiuCategory
        for (const [key, entry] of map.entries()) {
            if (entry.isSalary && entry.opiuCategory === 'ignore') {
                entry.opiuCategory = key === 'SALARY_SMR' ? 'cogs' : 'opex';
            }
        }

        return map;
    }, [categories, costItems]);

    const months = useMemo(
        () => eachMonthOfInterval({
            start: new Date(currentYear, 0, 1),
            end: new Date(currentYear, 11, 1),
        }),
        [currentYear],
    );

    const initMonthValues = (): Record<string, number> => {
        const values: Record<string, number> = {};
        months.forEach(m => { values[format(m, 'yyyy-MM')] = 0; });
        return values;
    };

    /**
     * Proportional distribution of a transaction amount across report months.
     * If accrualDateFrom/To span multiple months, the amount is split proportionally.
     */
    const getMonthlyAmounts = (t: Transaction): Record<string, number> => {
        const result: Record<string, number> = {};

        const accrualFrom = t.accrualDateFrom
            ? t.accrualDateFrom.toDate()
            : getPaymentDate(t).toDate();

        const accrualTo = t.accrualDateTo
            ? t.accrualDateTo.toDate()
            : accrualFrom;

        const periodDays = differenceInDays(accrualTo, accrualFrom) + 1;
        if (periodDays <= 0) return result;

        for (const month of months) {
            const monthKey = format(month, 'yyyy-MM');
            const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
            const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

            const overlapStart = maxDate([accrualFrom, monthStart]);
            const overlapEnd = minDate([accrualTo, monthEnd]);

            if (overlapStart > overlapEnd) continue;

            const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;

            result[monthKey] = periodDays <= 1 || periodDays === overlapDays
                ? t.amount
                : (t.amount / periodDays) * overlapDays;
        }

        return result;
    };

    // ============================================
    // REPORT DATA — "По месяцам" view
    // ============================================

    const reportData = useMemo<PnLRow[]>(() => {
        const lineItems: Record<string, PnLLineItem> = {};

        for (const t of transactions) {
            if (t.type === 'transfer') continue;
            if (t.status === 'plan' && !includePlan) continue;
            if (t.status !== 'fact' && t.status !== 'plan') continue;

            const cat = categoryLookup.get(t.categoryId);
            const opiuCat = cat?.opiuCategory || 'ignore';

            if (opiuCat === 'ignore') continue;
            // System categories excluded, but NOT salary (salary is system but belongs in ОПиУ)
            if (cat?.isSystem && !cat?.isSalary) continue;

            // Source filtering:
            // Revenue → only 1C (accrual method, ЭСФ/акты)
            // COGS → 1C + bank (bank for salary and direct project payments)
            // OPEX → only bank (cash basis)
            if (opiuCat === 'revenue' && t.sourceType !== '1c') continue;
            if (opiuCat === 'cogs' && t.sourceType === 'manual') continue;
            if (opiuCat === 'opex' && t.sourceType !== 'bank') continue;

            // Section from opiuCategory
            const section: OpiuSection = opiuCat;

            const monthlyAmounts = getMonthlyAmounts(t);

            // Check if any amount falls within report year
            let hasAmount = false;
            for (const key of Object.keys(monthlyAmounts)) {
                if (key.startsWith(`${currentYear}-`)) { hasAmount = true; break; }
            }
            if (!hasAmount) continue;

            const catName = cat?.name || t.categoryId || 'Без категории';
            const lineKey = `${section}_${t.categoryId}`;

            if (!lineItems[lineKey]) {
                lineItems[lineKey] = {
                    id: lineKey,
                    name: catName,
                    section,
                    values: initMonthValues(),
                    total: 0,
                };
            }

            const item = lineItems[lineKey];
            for (const [monthKey, amount] of Object.entries(monthlyAmounts)) {
                if (monthKey.startsWith(`${currentYear}-`)) {
                    item.values[monthKey] = (item.values[monthKey] || 0) + amount;
                    item.total += amount;
                }
            }
        }

        // Group by section
        const revenueItems = Object.values(lineItems).filter(i => i.section === 'revenue').sort((a, b) => b.total - a.total);
        const cogsItems = Object.values(lineItems).filter(i => i.section === 'cogs').sort((a, b) => b.total - a.total);
        const opexItems = Object.values(lineItems).filter(i => i.section === 'opex').sort((a, b) => b.total - a.total);

        const sumValues = (items: PnLLineItem[]): Record<string, number> => {
            const result = initMonthValues();
            for (const item of items) {
                for (const [key, val] of Object.entries(item.values)) {
                    result[key] = (result[key] || 0) + val;
                }
            }
            return result;
        };

        const revenueTotal = revenueItems.reduce((s, i) => s + i.total, 0);
        const revenueValues = sumValues(revenueItems);

        const cogsTotal = cogsItems.reduce((s, i) => s + i.total, 0);
        const cogsValues = sumValues(cogsItems);

        const opexTotal = opexItems.reduce((s, i) => s + i.total, 0);
        const opexValues = sumValues(opexItems);

        // Gross Profit = Revenue - COGS
        const grossTotal = revenueTotal - cogsTotal;
        const grossValues = initMonthValues();
        for (const key of Object.keys(grossValues)) {
            grossValues[key] = (revenueValues[key] || 0) - (cogsValues[key] || 0);
        }
        const grossMargin = revenueTotal > 0 ? (grossTotal / revenueTotal) * 100 : 0;

        // EBITDA = Gross Profit - OPEX
        const ebitdaTotal = grossTotal - opexTotal;
        const ebitdaValues = initMonthValues();
        for (const key of Object.keys(ebitdaValues)) {
            ebitdaValues[key] = (grossValues[key] || 0) - (opexValues[key] || 0);
        }
        const ebitdaMargin = revenueTotal > 0 ? (ebitdaTotal / revenueTotal) * 100 : 0;

        // Net Profit = EBITDA (simplified)
        const netTotal = ebitdaTotal;
        const netValues = { ...ebitdaValues };
        const netMargin = revenueTotal > 0 ? (netTotal / revenueTotal) * 100 : 0;

        // Build rows
        const rows: PnLRow[] = [];

        // Revenue
        rows.push({ type: 'section-header', id: 'h_revenue', name: 'ВЫРУЧКА (Revenue)', values: initMonthValues(), total: 0 });
        for (const item of revenueItems) {
            rows.push({ type: 'line-item', id: item.id, name: item.name, values: item.values, total: item.total });
        }
        if (revenueItems.length > 0) {
            rows.push({ type: 'subtotal', id: 'total_revenue', name: 'Итого выручка', values: revenueValues, total: revenueTotal });
        }

        // COGS
        if (cogsItems.length > 0) {
            rows.push({ type: 'section-header', id: 'h_cogs', name: 'СЕБЕСТОИМОСТЬ (COGS)', values: initMonthValues(), total: 0 });
            for (const item of cogsItems) {
                rows.push({ type: 'line-item', id: item.id, name: item.name, values: item.values, total: item.total });
            }
            rows.push({ type: 'subtotal', id: 'total_cogs', name: 'Итого себестоимость', values: cogsValues, total: cogsTotal });
        }

        // Gross Profit
        rows.push({ type: 'gross', id: 'gross_profit', name: 'ВАЛОВАЯ ПРИБЫЛЬ', values: grossValues, total: grossTotal, marginPercent: parseFloat(grossMargin.toFixed(1)) });

        // OPEX
        if (opexItems.length > 0) {
            rows.push({ type: 'section-header', id: 'h_opex', name: 'ОБЩИЕ РАСХОДЫ КОМПАНИИ', values: initMonthValues(), total: 0 });
            for (const item of opexItems) {
                rows.push({ type: 'line-item', id: item.id, name: item.name, values: item.values, total: item.total });
            }
            rows.push({ type: 'subtotal', id: 'total_opex', name: 'Итого расходы', values: opexValues, total: opexTotal });
        }

        // EBITDA
        rows.push({ type: 'ebitda', id: 'ebitda', name: 'EBITDA', values: ebitdaValues, total: ebitdaTotal, marginPercent: parseFloat(ebitdaMargin.toFixed(1)) });

        // Net Profit
        rows.push({ type: 'net', id: 'net_profit', name: 'ЧИСТАЯ ПРИБЫЛЬ', values: netValues, total: netTotal, marginPercent: parseFloat(netMargin.toFixed(1)) });

        return rows;
    }, [transactions, categoryLookup, months, currentYear, includePlan]);

    // ============================================
    // REPORT DATA — "По проектам" view (vertical layout)
    // ============================================

    const { projectPnLRows } = useMemo<{ projectPnLRows: ProjectPnLRow[]; opexBreakdown: { catId: string; name: string; amount: number }[] }>(() => {
        if (viewMode !== 'projects') return { projectPnLRows: [], opexBreakdown: [] };

        // Per-project accumulators: revenue and cogs
        const projectRevenue: Record<string, number> = {};
        const projectCogs: Record<string, number> = {};

        // AUP: OPEX transactions + payroll (broken down by category)
        let aupOpex = 0;
        const opexByCategory: Record<string, { name: string; amount: number }> = {};

        for (const t of transactions) {
            if (t.type === 'transfer') continue;
            if (t.status === 'plan' && !includePlan) continue;
            if (t.status !== 'fact' && t.status !== 'plan') continue;

            const cat = categoryLookup.get(t.categoryId);
            const opiuCat = cat?.opiuCategory || 'ignore';
            if (opiuCat === 'ignore') continue;
            if (cat?.isSystem && !cat?.isSalary) continue;
            if (t.amount === 0) continue;

            // Source filtering:
            // COGS + Revenue → only 1C (accrual method)
            //   Exception: salary categories (SALARY_*) are paid via bank
            // OPEX → only bank (cash basis)
            if ((opiuCat === 'cogs' || opiuCat === 'revenue') && t.sourceType !== '1c' && !cat?.isSalary) continue;
            if (opiuCat === 'opex' && t.sourceType !== 'bank') continue;

            if (opiuCat === 'revenue') {
                const key = t.projectId || '__no_project';
                projectRevenue[key] = (projectRevenue[key] || 0) + t.amount;
            } else if (opiuCat === 'cogs') {
                const key = t.projectId || '__no_project';
                projectCogs[key] = (projectCogs[key] || 0) + t.amount;
            } else if (opiuCat === 'opex') {
                aupOpex += t.amount;
                const catName = cat?.name || t.categoryId || 'Прочее';
                const catKey = t.categoryId || '__other';
                if (!opexByCategory[catKey]) {
                    opexByCategory[catKey] = { name: catName, amount: 0 };
                }
                opexByCategory[catKey].amount += t.amount;
            }
        }

        // Identify AUP projects — exclude from project list, merge their COGS into AUP
        const isAupProject = (p: Project) =>
            p.isAUP || p.name.toLowerCase().includes('общие расходы') || p.name.toLowerCase().includes('ауп');

        const aupProjectIds = new Set(projects.filter(isAupProject).map(p => p.id));

        // Move AUP project COGS into aupOpex
        for (const aupId of aupProjectIds) {
            if (projectCogs[aupId]) {
                aupOpex += projectCogs[aupId];
                // Add to opexByCategory
                if (!opexByCategory['__aup_cogs']) {
                    opexByCategory['__aup_cogs'] = { name: 'Общие расходы (1С)', amount: 0 };
                }
                opexByCategory['__aup_cogs'].amount += projectCogs[aupId];
                delete projectCogs[aupId];
            }
            if (projectRevenue[aupId]) {
                delete projectRevenue[aupId];
            }
        }

        // Collect all project IDs that have any data (excluding AUP projects)
        const allProjectIds = new Set<string>([
            ...Object.keys(projectRevenue),
            ...Object.keys(projectCogs),
        ].filter(id => id !== '__no_project' && !aupProjectIds.has(id)));

        // Compute per-project metrics (opexShare filled later after total revenue is known)
        const makeRow = (id: string, name: string, rowType: ProjectPnLRow['rowType'], isChild?: boolean): ProjectPnLRow => {
            const revenue = projectRevenue[id] || 0;
            const cogs = projectCogs[id] || 0;
            const grossProfit = revenue - cogs;
            const contractAmount = contractMap.get(id);
            const remaining = contractAmount !== undefined ? contractAmount - revenue : undefined;
            return { id, name, rowType, revenue, cogs, grossProfit, opex: 0, opexShare: 0, ebitda: grossProfit, marginPercent: 0, contractAmount, remaining, isChild };
        };

        // Build contract amount map from projects
        const contractMap = new Map<string, number>();
        for (const p of projects) {
            if (p.contractAmount) contractMap.set(p.id, p.contractAmount);
        }

        // Group projects by parentId
        // Include root projects that either have direct transactions OR have children with transactions
        // Exclude AUP projects
        const rootProjects = projects.filter(p => !p.parentId && !aupProjectIds.has(p.id) && (
            allProjectIds.has(p.id) ||
            projects.some(child => child.parentId === p.id && allProjectIds.has(child.id))
        ));
        // Include ALL children of root projects (even without transactions) so hierarchy is complete
        const rootProjectIds = new Set(rootProjects.map(p => p.id));
        const childrenByParent = new Map<string, Project[]>();
        for (const p of projects) {
            if (p.parentId && !aupProjectIds.has(p.id) && (allProjectIds.has(p.id) || rootProjectIds.has(p.parentId))) {
                const arr = childrenByParent.get(p.parentId) || [];
                arr.push(p);
                childrenByParent.set(p.parentId, arr);
            }
        }

        // Projects that appear in data but are not in the projects list
        const knownProjectIds = new Set(projects.map(p => p.id));
        const unknownProjectIds = [...allProjectIds].filter(id => !knownProjectIds.has(id));

        const rows: ProjectPnLRow[] = [];

        // Helper: sum children values into parent row
        const makeParentRow = (parent: Project, children: Project[]): ProjectPnLRow => {
            let revenue = 0, cogs = 0;
            const parentContract = contractMap.get(parent.id);
            // Если у родителя нет контракта — суммируем все дочерние контракты
            let childContractSum = 0;
            let hasChildContracts = false;
            for (const child of children) {
                revenue += projectRevenue[child.id] || 0;
                cogs += projectCogs[child.id] || 0;
                if (contractMap.has(child.id)) {
                    childContractSum += contractMap.get(child.id) || 0;
                    hasChildContracts = true;
                }
            }
            const contractAmount = parentContract !== undefined ? parentContract : (hasChildContracts ? childContractSum : undefined);
            revenue += projectRevenue[parent.id] || 0;
            cogs += projectCogs[parent.id] || 0;
            const grossProfit = revenue - cogs;
            const remaining = contractAmount !== undefined ? contractAmount - revenue : undefined;
            return { id: parent.id, name: parent.name, rowType: 'parent', revenue, cogs, grossProfit, opex: 0, opexShare: 0, ebitda: grossProfit, marginPercent: 0, contractAmount, remaining };
        };

        // Add root projects (with children) and standalone projects
        for (const root of rootProjects) {
            const children = childrenByParent.get(root.id) || [];
            if (children.length > 0) {
                rows.push(makeParentRow(root, children));
                // Sort children by name to group blocks together (Блок А, Блок Б, НВК)
                const sortedChildren = [...children].sort((a, b) =>
                    a.name.localeCompare(b.name, 'ru')
                );
                for (const child of sortedChildren) {
                    rows.push(makeRow(child.id, child.name, 'child', true));
                }
            } else {
                rows.push(makeRow(root.id, root.name, 'standalone'));
            }
        }

        // Child projects whose parent is not in root list (orphaned children shown as standalone)
        const rootIds = new Set(rootProjects.map(p => p.id));
        for (const p of projects) {
            if (p.parentId && allProjectIds.has(p.id) && !rootIds.has(p.parentId)) {
                rows.push(makeRow(p.id, p.name, 'standalone'));
            }
        }

        // Unknown projects (in transactions but not in projects list)
        for (const id of unknownProjectIds) {
            rows.push(makeRow(id, id, 'standalone'));
        }

        // Sort: parents/standalones by their own revenue descending; children stay grouped after parent
        // We rebuild: collect parent+children groups then standalones, sort groups by parent revenue
        const groups: ProjectPnLRow[][] = [];
        let i = 0;
        while (i < rows.length) {
            const row = rows[i];
            if (row.rowType === 'parent') {
                const group: ProjectPnLRow[] = [row];
                i++;
                while (i < rows.length && rows[i].rowType === 'child') {
                    group.push(rows[i]);
                    i++;
                }
                groups.push(group);
            } else {
                groups.push([row]);
                i++;
            }
        }
        groups.sort((a, b) => b[0].revenue - a[0].revenue);
        const sortedRows: ProjectPnLRow[] = groups.flat();

        // Distribute OPEX proportionally by revenue across ALL rows (including children)
        const allRevenueRows = sortedRows.filter(r => r.rowType !== 'parent'); // children + standalones (avoid double-counting parent)
        const totalRevenueForDistribution = allRevenueRows.reduce((s, r) => s + r.revenue, 0);

        for (const row of sortedRows) {
            if (row.rowType === 'child' || row.rowType === 'standalone') {
                row.opexShare = totalRevenueForDistribution > 0
                    ? (row.revenue / totalRevenueForDistribution) * aupOpex
                    : 0;
                row.ebitda = row.grossProfit - row.opexShare;
                row.marginPercent = row.revenue !== 0
                    ? parseFloat(((row.ebitda / row.revenue) * 100).toFixed(1))
                    : 0;
            }
        }

        // Parent rows: sum opexShare from their children
        for (const row of sortedRows) {
            if (row.rowType === 'parent') {
                // Find children that belong to this parent (they follow immediately after)
                const parentIdx = sortedRows.indexOf(row);
                let parentOpex = 0;
                for (let j = parentIdx + 1; j < sortedRows.length && sortedRows[j].rowType === 'child'; j++) {
                    parentOpex += sortedRows[j].opexShare;
                }
                row.opexShare = parentOpex;
                row.ebitda = row.grossProfit - row.opexShare;
                row.marginPercent = row.revenue !== 0
                    ? parseFloat(((row.ebitda / row.revenue) * 100).toFixed(1))
                    : 0;
            }
        }

        // OPEX breakdown by category for drilldown
        const opexBreakdownList = Object.entries(opexByCategory)
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([catId, data]) => ({ catId, name: data.name, amount: data.amount }));

        // Total row (no separate АУП section — OPEX fully distributed)
        const totalRevenue = sortedRows.filter(r => r.rowType === 'parent' || r.rowType === 'standalone').reduce((s, r) => s + r.revenue, 0);
        const totalCogs = sortedRows.filter(r => r.rowType === 'parent' || r.rowType === 'standalone').reduce((s, r) => s + r.cogs, 0);
        const totalGross = totalRevenue - totalCogs;
        const totalOpex = aupOpex;
        const totalEbitda = totalGross - totalOpex;
        const totalMargin = totalRevenue !== 0 ? parseFloat(((totalEbitda / totalRevenue) * 100).toFixed(1)) : 0;

        sortedRows.push({
            id: '__total',
            name: 'ИТОГО',
            rowType: 'total',
            revenue: totalRevenue,
            cogs: totalCogs,
            grossProfit: totalGross,
            opex: totalOpex,
            opexShare: totalOpex,
            ebitda: totalEbitda,
            marginPercent: totalMargin,
        });

        return { projectPnLRows: sortedRows, opexBreakdown: opexBreakdownList };
    }, [viewMode, transactions, categoryLookup, includePlan, projects]);

    // ============================================
    // DRILL-DOWN HANDLER
    // ============================================

    const handleDrilldown = (projectId: string, column: 'revenue' | 'cogs' | 'opex', rowType: string) => {
        // Don't drill down on total row
        if (rowType === 'total') return;

        // Find all project IDs to include (for parent rows, include all children)
        const projectIds = new Set<string>();
        if (rowType === 'parent') {
            projectIds.add(projectId);
            for (const p of projects) {
                if (p.parentId === projectId) projectIds.add(p.id);
            }
        } else if (rowType === 'aup') {
            // AUP drills down on opex only — no projectId filter
        } else {
            projectIds.add(projectId);
        }

        // OPEX drilldown: show all OPEX transactions (global, not per-project)
        if (column === 'opex') {
            const filtered = transactions.filter(t => {
                if (t.type === 'transfer') return false;
                if (t.status !== 'fact' && !(includePlan && t.status === 'plan')) return false;
                const cat = categoryLookup.get(t.categoryId);
                const opiuCat = cat?.opiuCategory || 'ignore';
                if (opiuCat !== 'opex' || cat?.isSystem) return false;
                if (t.sourceType !== 'bank') return false;
                return true;
            }).sort((a, b) => getPaymentDate(b).toDate().getTime() - getPaymentDate(a).toDate().getTime());

            const total = filtered.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
            const projectName = projects.find(p => p.id === projectId)?.name || 'Все проекты';
            setDrilldownTitle(`${projectName} → Общие расходы`);
            setDrilldownTxs(filtered);
            setDrilldownTotal(total);
            setDrilldownOpen(true);
            return;
        }

        const filtered = transactions.filter(t => {
            if (t.type === 'transfer') return false;
            if (t.status !== 'fact' && !(includePlan && t.status === 'plan')) return false;

            const cat = categoryLookup.get(t.categoryId);
            const opiuCat = cat?.opiuCategory || 'ignore';
            if (opiuCat === 'ignore' || cat?.isSystem) return false;

            // Same source filtering as report:
            // COGS + Revenue → only 1C (exception: salary from bank)
            // OPEX → only bank
            if ((opiuCat === 'cogs' || opiuCat === 'revenue') && t.sourceType !== '1c' && !cat?.isSalary) return false;
            if (opiuCat === 'opex' && t.sourceType !== 'bank') return false;

            if (!projectIds.has(t.projectId)) return false;

            if (column === 'revenue') return opiuCat === 'revenue';
            if (column === 'cogs') return opiuCat === 'cogs';
            return false;
        });

        // Sort by date descending
        filtered.sort((a, b) => {
            const da = getPaymentDate(a).toDate().getTime();
            const db = getPaymentDate(b).toDate().getTime();
            return db - da;
        });

        const total = filtered.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);

        const projectName = projects.find(p => p.id === projectId)?.name || projectId;
        const columnName = column === 'revenue' ? 'Выручка' : column === 'cogs' ? 'Себестоимость' : 'Общие расходы';

        setDrilldownTitle(`${projectName} → ${columnName}`);
        setDrilldownTxs(filtered);
        setDrilldownTotal(total);
        setDrilldownOpen(true);
    };

    // ============================================
    // RENDERING
    // ============================================

    const getRowStyle = (row: PnLRow): string => {
        switch (row.type) {
            case 'section-header': return 'bg-slate-200 font-semibold';
            case 'line-item': return 'hover:bg-gray-50';

            case 'subtotal': return 'bg-gray-100 font-semibold border-t border-gray-200';
            case 'gross': return 'bg-blue-50 font-bold border-t-2 border-blue-200';
            case 'ebitda': return 'bg-emerald-50 font-bold border-t-2 border-emerald-200';
            case 'net': return 'bg-slate-800 text-white font-bold';
            default: return '';
        }
    };

    const stickyBg = (row: PnLRow): string => {
        switch (row.type) {
            case 'net': return 'bg-slate-800 text-white';
            case 'gross': return 'bg-blue-50';
            case 'ebitda': return 'bg-emerald-50';
            case 'subtotal': return 'bg-gray-100';

            default: return 'bg-white';
        }
    };

    const isTotal = (type: string) => ['subtotal', 'gross', 'ebitda', 'net'].includes(type);

    // Excel export helper
    const handleExcelExport = () => {
        if (viewMode === 'months') {
            const headers = ['Статья', ...months.map(m => format(m, 'LLL', { locale: ru })), 'Итого'];
            const rows = reportData.map(r => [
                r.name,
                ...months.map(m => r.values[format(m, 'yyyy-MM')] || ''),
                r.total,
            ]);
            quickExport(`ОПиУ_${currentYear}`, headers, rows, 'ОПиУ');
        } else {
            const headers = ['Проект', 'Контракт', 'Выручка', 'Осталось', 'Себестоимость', 'Вал.прибыль', 'Доля расходов', 'EBITDA', '%'];
            const rows = projectPnLRows.map(r => [
                r.isChild || r.rowType === 'aup-detail' ? `  └ ${r.name}` : r.name,
                r.contractAmount || '',
                r.revenue || '',
                r.remaining ?? '',
                r.cogs || '',
                r.grossProfit || '',
                r.rowType === 'total' ? (r.opex || '') : (r.opexShare || ''),
                r.ebitda || '',
                r.marginPercent !== 0 ? `${r.marginPercent}%` : '',
            ]);
            quickExport('ОПиУ_проекты', headers, rows, 'ОПиУ по проектам');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">Отчёт о прибылях и убытках (ОПиУ)</h2>
                    <ReportInfoPopover
                        title="Как устроен ОПиУ"
                        items={[
                            { label: 'Метод', text: 'Метод начислений — по дате начисления (accrualDate). Если не задана, используется дата платежа.' },
                            { label: 'Формула', text: 'Выручка − Себестоимость = Валовая прибыль − Общие расходы = EBITDA = Чистая прибыль.' },
                            { label: 'Зарплата', text: 'ЗП (АУП) — банковские выплаты, учитываются в OPEX кассовым методом. ЗП (СМР) — в себестоимости.' },
                            { label: 'Исключения', text: 'Системные категории (кредиты, инвестиции, дивиденды) и переводы между счетами не попадают в ОПиУ.' },
                        ]}
                    />
                </div>
                <div className="flex items-center gap-2">
                    {/* View mode toggle */}
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                        <button
                            onClick={() => setViewMode('months')}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'months' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            По месяцам
                        </button>
                        <button
                            onClick={() => setViewMode('projects')}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'projects' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            По проектам
                        </button>
                    </div>
                    <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includePlan}
                            onChange={e => setIncludePlan(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Плановые
                    </label>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors no-print"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        PDF
                    </button>
                    <button
                        onClick={handleExcelExport}
                        className="flex items-center px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors no-print"
                    >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Excel
                    </button>
                    {viewMode === 'months' && (
                        <select
                            value={currentYear}
                            onChange={(e) => setCurrentYear(Number(e.target.value))}
                            className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Загрузка...</div>
            ) : viewMode === 'months' ? (
                /* ========== "По месяцам" table ========== */
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium whitespace-nowrap">
                            <tr>
                                <th className="px-4 py-3 sticky left-0 bg-gray-50 z-10 min-w-[240px]">Статья</th>
                                {months.map(m => (
                                    <th key={m.toString()} className="px-3 py-3 text-right text-xs">
                                        {format(m, 'LLL', { locale: ru })}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-right font-bold bg-gray-100">Итого</th>
                                <th className="px-4 py-3 text-right font-bold bg-gray-100 min-w-[60px]">%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {reportData.map(row => {
                                if (row.type === 'section-header') {
                                    return (
                                        <tr key={row.id} className={getRowStyle(row)}>
                                            <td
                                                colSpan={months.length + 3}
                                                className="px-4 py-2 text-slate-700 text-xs uppercase tracking-wider"
                                            >
                                                {row.name}
                                            </td>
                                        </tr>
                                    );
                                }

                                const isNetRow = row.type === 'net';
                                const isTotalRow = isTotal(row.type);

                                return (
                                    <tr key={row.id} className={getRowStyle(row)}>
                                        <td className={`px-4 py-2.5 sticky left-0 z-[5] ${stickyBg(row)}`}>
                                            {row.type === 'line-item' ? (
                                                <span className="pl-4">{row.name}</span>
                                            ) : (
                                                row.name
                                            )}
                                        </td>

                                        {months.map(m => {
                                            const key = format(m, 'yyyy-MM');
                                            const val = row.values[key] || 0;
                                            return (
                                                <td
                                                    key={key}
                                                    className={`px-3 py-2.5 text-right tabular-nums text-xs ${
                                                        isNetRow
                                                            ? (val >= 0 ? 'text-emerald-300' : 'text-red-300')
                                                            : isTotalRow
                                                                ? (val > 0 ? 'text-gray-900' : val < 0 ? 'text-red-600' : 'text-gray-300')
                                                                : (val > 0 ? 'text-gray-700' : val < 0 ? 'text-red-500' : 'text-gray-300')
                                                    }`}
                                                >
                                                    {val !== 0 ? formatMoney(val) : '–'}
                                                </td>
                                            );
                                        })}

                                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                                            isNetRow
                                                ? (row.total >= 0 ? 'text-emerald-300' : 'text-red-300')
                                                : (row.total > 0 ? 'text-gray-900' : row.total < 0 ? 'text-red-600' : 'text-gray-400')
                                        }`}>
                                            {row.total !== 0 ? formatMoney(row.total) : '–'}
                                        </td>

                                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                                            isNetRow
                                                ? ((row.marginPercent ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300')
                                                : row.marginPercent !== undefined
                                                    ? (row.marginPercent >= 15 ? 'text-emerald-600' : row.marginPercent >= 0 ? 'text-amber-600' : 'text-red-600')
                                                    : 'text-gray-300'
                                        }`}>
                                            {row.marginPercent !== undefined ? `${row.marginPercent}%` : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500 flex gap-6 flex-wrap">
                        <span><span className="inline-block w-3 h-3 rounded bg-emerald-500 mr-1"></span> Маржа &ge;15%</span>
                        <span><span className="inline-block w-3 h-3 rounded bg-amber-500 mr-1"></span> Маржа 0-15%</span>
                        <span><span className="inline-block w-3 h-3 rounded bg-red-500 mr-1"></span> Убыток</span>
                        <span className="ml-auto text-gray-400">Выручка/Себестоимость: 1С | Расходы + ЗП: банк (кассовый метод)</span>
                    </div>
                </div>
            ) : (
                /* ========== "По проектам" vertical table ========== */
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium whitespace-nowrap">
                            <tr>
                                <th className="px-4 py-3 sticky left-0 bg-gray-50 z-10 min-w-[280px]">Проект</th>
                                <th className="px-4 py-3 text-right">Контракт</th>
                                <th className="px-4 py-3 text-right">Выручка</th>
                                <th className="px-4 py-3 text-right">Осталось</th>
                                <th className="px-4 py-3 text-right">Себестоимость</th>
                                <th className="px-4 py-3 text-right">Вал. прибыль</th>
                                <th className="px-4 py-3 text-right">Доля расходов</th>
                                <th className="px-4 py-3 text-right">EBITDA</th>
                                <th className="px-4 py-3 text-right min-w-[60px]">%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {projectPnLRows.map((row, idx) => {
                                // Find parent ID for child rows (look backwards)
                                let parentId = '';
                                if (row.rowType === 'child') {
                                    for (let j = idx - 1; j >= 0; j--) {
                                        if (projectPnLRows[j].rowType === 'parent') {
                                            parentId = projectPnLRows[j].id;
                                            break;
                                        }
                                    }
                                }

                                // Check if this parent/standalone has children
                                const hasChildren = (row.rowType === 'parent') ||
                                    (row.rowType === 'standalone' && idx + 1 < projectPnLRows.length && projectPnLRows[idx + 1].rowType === 'child');

                                // Hide children if parent is collapsed
                                if (row.rowType === 'child' && parentId && !expandedGroups.has(parentId)) {
                                    return null;
                                }

                                const isExpanded = expandedGroups.has(row.id);

                                const isTotal = row.rowType === 'total';
                                const isParent = row.rowType === 'parent';
                                const isChild = row.rowType === 'child';

                                const rowClass = (() => {
                                    if (isTotal) return 'bg-slate-800 text-white font-bold';
                                    if (isParent) return 'bg-slate-100 font-semibold border-t-2 border-slate-300';
                                    if (isChild) return 'hover:bg-gray-50';
                                    return 'hover:bg-gray-50 border-t border-gray-200'; // standalone
                                })();

                                const stickyClass = (() => {
                                    if (isTotal) return 'bg-slate-800 text-white';
                                    if (isParent) return 'bg-slate-100';
                                    return 'bg-white';
                                })();


                                // Revenue cell: always gray-700 / on total row white
                                const revenueClass = isTotal ? 'text-white' : row.revenue !== 0 ? 'text-gray-700' : 'text-gray-300';

                                // COGS: red if > 0
                                const cogsClass = isTotal ? 'text-white' : row.cogs !== 0 ? 'text-red-500' : 'text-gray-300';

                                // Gross profit: green/red
                                const grossClass = (() => {
                                    if (isTotal) return row.grossProfit >= 0 ? 'text-emerald-300' : 'text-red-300';
                                    return row.grossProfit > 0 ? 'text-emerald-600' : row.grossProfit < 0 ? 'text-red-600' : 'text-gray-300';
                                })();

                                // OPEX share for all rows
                                const opexDisplayValue = isTotal ? row.opex : row.opexShare;
                                const opexClass = isTotal ? 'text-white' : opexDisplayValue !== 0 ? 'text-red-500' : 'text-gray-300';

                                // EBITDA: green/red
                                const ebitdaClass = (() => {
                                    if (isTotal) return row.ebitda >= 0 ? 'text-emerald-300' : 'text-red-300';
                                    return row.ebitda > 0 ? 'text-emerald-600' : row.ebitda < 0 ? 'text-red-600' : 'text-gray-300';
                                })();

                                // Margin %
                                const marginClass = (() => {
                                    if (isTotal) return row.marginPercent >= 0 ? 'text-emerald-300' : 'text-red-300';
                                    return row.marginPercent >= 15 ? 'text-emerald-600' : row.marginPercent >= 0 ? 'text-amber-600' : 'text-red-600';
                                })();

                                return (
                                    <tr key={row.id} className={rowClass}>
                                        <td className={`px-4 py-2.5 sticky left-0 z-[5] ${stickyClass}`}>
                                            {isChild ? (
                                                <span className="pl-8 text-gray-600">└ {row.name}</span>
                                            ) : hasChildren ? (
                                                <button
                                                    onClick={() => toggleGroup(row.id)}
                                                    className="flex items-center gap-1.5 cursor-pointer hover:text-blue-700 w-full text-left"
                                                >
                                                    <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                    {row.name}
                                                </button>
                                            ) : (
                                                row.name
                                            )}
                                        </td>

                                        {/* Контракт */}
                                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                                            {row.contractAmount ? formatMoney(row.contractAmount) : <span className="text-gray-300">–</span>}
                                        </td>

                                        {/* Выручка */}
                                        <td className={`px-4 py-2.5 text-right tabular-nums ${revenueClass}`}>
                                            {row.revenue !== 0 ? (
                                                <button
                                                    onClick={() => handleDrilldown(row.id, 'revenue', row.rowType)}
                                                    className="hover:underline hover:text-blue-600 cursor-pointer"
                                                >
                                                    {formatMoney(row.revenue)}
                                                </button>
                                            ) : <span className="text-gray-300">–</span>}
                                        </td>

                                        {/* Осталось закрыть */}
                                        <td className="px-4 py-2.5 text-right tabular-nums">
                                            {row.remaining !== undefined
                                                ? <span className={row.remaining > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600'}>{formatMoney(row.remaining)}</span>
                                                : <span className="text-gray-300">–</span>}
                                        </td>

                                        {/* Себестоимость */}
                                        <td className={`px-4 py-2.5 text-right tabular-nums ${cogsClass}`}>
                                            {row.cogs !== 0 ? (
                                                <button
                                                    onClick={() => handleDrilldown(row.id, 'cogs', row.rowType)}
                                                    className="hover:underline hover:text-blue-600 cursor-pointer"
                                                >
                                                    {formatMoney(row.cogs)}
                                                </button>
                                            ) : <span className="text-gray-300">–</span>}
                                        </td>

                                        {/* Валовая прибыль */}
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${grossClass}`}>
                                            {row.grossProfit !== 0 ? formatMoney(row.grossProfit) : <span className="text-gray-300">–</span>}
                                        </td>

                                        {/* Доля OPEX (distributed for projects, actual for AUP/total) */}
                                        <td className={`px-4 py-2.5 text-right tabular-nums ${opexClass}`}>
                                            {opexDisplayValue !== 0 ? (
                                                <button
                                                    onClick={() => handleDrilldown(row.id, 'opex', row.rowType)}
                                                    className="hover:underline hover:text-blue-600 cursor-pointer"
                                                >
                                                    {formatMoney(opexDisplayValue)}
                                                </button>
                                            ) : <span className="text-gray-300">–</span>}
                                        </td>

                                        {/* EBITDA */}
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${ebitdaClass}`}>
                                            {row.ebitda !== 0 ? formatMoney(row.ebitda) : <span className="text-gray-300">–</span>}
                                        </td>

                                        {/* % margin */}
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${marginClass}`}>
                                            {row.revenue !== 0
                                                ? `${row.marginPercent}%`
                                                : <span className="text-gray-300">–</span>
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500 flex gap-6 flex-wrap">
                        <span><span className="inline-block w-3 h-3 rounded bg-emerald-500 mr-1"></span> Маржа &ge;15%</span>
                        <span><span className="inline-block w-3 h-3 rounded bg-amber-500 mr-1"></span> Маржа 0-15%</span>
                        <span><span className="inline-block w-3 h-3 rounded bg-red-500 mr-1"></span> Убыток</span>
                        <span className="ml-auto text-gray-400">Выручка/Себестоимость: 1С | Расходы: банк | Доля расходов пропорционально выручке</span>
                    </div>
                </div>
            )}

            <SlideOver isOpen={drilldownOpen} onClose={() => setDrilldownOpen(false)} title={drilldownTitle} width="xl">
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-sm text-gray-500">{drilldownTxs.length} операций</span>
                        <span className={`text-lg font-semibold ${drilldownTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatMoney(drilldownTotal)} ₸
                        </span>
                    </div>
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Дата</th>
                                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Описание</th>
                                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Статья</th>
                                    <th className="px-3 py-2 text-right text-gray-500 font-medium">Сумма</th>
                                    <th className="px-3 py-2 text-center text-gray-500 font-medium">Источник</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {drilldownTxs.map(tx => {
                                    const cat = categoryLookup.get(tx.categoryId);
                                    const amount = tx.type === 'income' ? tx.amount : -tx.amount;
                                    return (
                                        <tr key={tx.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                                                {fmtDate(getPaymentDate(tx).toDate(), 'dd.MM.yyyy')}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700 max-w-[300px] truncate" title={tx.description}>
                                                {tx.description || '—'}
                                            </td>
                                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                                                {cat?.name || tx.categoryId}
                                            </td>
                                            <td className={`px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap ${amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {formatMoney(amount)}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                                    tx.sourceType === 'bank' ? 'bg-blue-50 text-blue-700' :
                                                    tx.sourceType === '1c' ? 'bg-amber-50 text-amber-700' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {tx.sourceType === 'bank' ? 'Банк' : tx.sourceType === '1c' ? '1С' : 'Ручной'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </SlideOver>
        </div>
    );
}
