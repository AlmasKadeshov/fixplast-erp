import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Wallet,
  TrendingUp,
  FileText,
  Truck,
  BarChart3,
  GanttChart,
  Edit,
  ArrowDownLeft,
  Banknote,
  Receipt,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Hand,
  Archive,
  ClipboardList,
  ExternalLink,
} from 'lucide-react';
import { Gantt } from './Gantt';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  PACKAGE_TYPE_LABELS,
  Project as ProjectModel,
  ProjectDocument,
  ProjectDocumentPackage,
  REQUIRED_DOCUMENTS_BY_PACKAGE,
  Transaction,
} from '../models';
import { projectsService, financeService, partnersService, projectDocumentsService } from '../services';
import { ProjectModal } from '../components/projects';
import { costItemsService } from '../services/costItems.service';
import { CostItem } from '../models/costItems';
import { Partner } from '../models';
import { formatMoney as fmt } from '../utils/formatters';

type TabId = 'overview' | 'gpr' | 'supply' | 'finance' | 'documents';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  planning: { label: 'Планирование', color: 'text-gray-600', bg: 'bg-gray-100' },
  in_progress: { label: 'В работе', color: 'text-blue-700', bg: 'bg-blue-100' },
  finishing: { label: 'Завершение', color: 'text-orange-700', bg: 'bg-orange-100' },
  completed: { label: 'Завершён', color: 'text-green-700', bg: 'bg-green-100' },
};

const tabs: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Обзор', icon: BarChart3 },
  { id: 'gpr', label: 'ГПР', icon: GanttChart },
  { id: 'supply', label: 'Снабжение', icon: Truck },
  { id: 'finance', label: 'Финансы', icon: Wallet },
  { id: 'documents', label: 'Документы', icon: FileText },
];

function formatBudget(value: number): string {
  if (!value || value === 0) return '—';
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} млрд ₸`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(0)} млн ₸`;
  return `${value.toLocaleString('ru-RU')} ₸`;
}

function formatDate(date?: Date): string {
  if (!date) return '—';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '??';
}

function getPackageProgress(pkg: ProjectDocumentPackage, docs: ProjectDocument[]) {
  const requiredTypes = REQUIRED_DOCUMENTS_BY_PACKAGE[pkg.packageType] || [];

  if (requiredTypes.length === 0) {
    return { done: 0, total: 0, signed: true, onHands: true, stitched: true };
  }

  const requiredDocs = requiredTypes.map((type) =>
    docs.find((item) => item.packageId === pkg.id && item.type === type)
  );

  const done = requiredDocs.filter((item) => item && item.isSigned && item.isOnHands).length;
  const signed = requiredDocs.every((item) => !!item && item.isSigned);
  const onHands = requiredDocs.every((item) => !!item && item.isOnHands);
  const stitched = requiredDocs.every((item) => !!item && item.isStitched);

  return { done, total: requiredTypes.length, signed, onHands, stitched };
}

// ============================================
// OVERVIEW TAB
// ============================================

function OverviewTab({ project }: { project: ProjectModel }) {
  const status = statusConfig[project.status] || statusConfig.planning;
  const progress = project.progress || 0;
  const budget = project.contractAmount || 0;
  const margin = project.plannedMargin || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Прогресс</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{progress}%</p>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
            <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8 }}
              className="h-full bg-blue-500 rounded-full" />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Бюджет</span>
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatBudget(budget)}</p>
          <p className="text-sm text-gray-400 mt-1">Сумма договора</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Маржа</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{margin}%</p>
          {budget > 0 && margin > 0 && (
            <p className="text-sm text-gray-400 mt-1">≈ {formatBudget(budget * margin / 100)}</p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Статус</span>
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-orange-600" />
            </div>
          </div>
          <span className={`inline-block px-3 py-1.5 rounded-lg text-sm font-medium ${status.bg} ${status.color}`}>
            {status.label}
          </span>
          <p className="text-sm text-gray-400 mt-2">
            {(() => {
              if (!project.endDate) return 'Сроки не указаны';
              const diff = Math.ceil((project.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              if (diff < 0) return `Просрочен на ${Math.abs(diff)} дн.`;
              if (diff === 0) return 'Завершается сегодня';
              return `Осталось: ${diff} дн.`;
            })()}
          </p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Информация о проекте</h3>
          {project.description && <p className="text-gray-500 leading-relaxed mb-6">{project.description}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400 mb-1">Заказчик</p>
              <p className="font-medium text-gray-800">{project.clientName || '—'}</p>
            </div>
            {project.contractNumber && (
              <div>
                <p className="text-sm text-gray-400 mb-1">Номер договора</p>
                <p className="font-medium text-gray-800">{project.contractNumber}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-400 mb-1">Дата начала</p>
              <p className="font-medium text-gray-800">{formatDate(project.startDate)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Дата завершения</p>
              <p className="font-medium text-gray-800">{formatDate(project.endDate)}</p>
            </div>
            {project.contractDate && (
              <div>
                <p className="text-sm text-gray-400 mb-1">Дата договора</p>
                <p className="font-medium text-gray-800">{formatDate(project.contractDate)}</p>
              </div>
            )}
            {project.type && (
              <div>
                <p className="text-sm text-gray-400 mb-1">Тип</p>
                <p className="font-medium text-gray-800">
                  {project.type === 'group' ? 'ЖК / Объект' : project.type === 'block' ? 'Блок'
                    : project.type === 'system' ? 'Система' : project.type === 'contract' ? 'Договор' : 'Проект'}
                </p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Команда проекта</h3>
          <div className="space-y-4">
            {project.rpId && project.rpId !== '-' ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-semibold text-sm">
                  {getInitials(project.rpId)}
                </div>
                <div>
                  <p className="font-medium text-gray-800">{project.rpId}</p>
                  <p className="text-sm text-gray-400">Руководитель проекта</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-semibold text-sm">РП</div>
                <div>
                  <p className="font-medium text-gray-400">Не назначен</p>
                  <p className="text-sm text-gray-300">Руководитель проекта</p>
                </div>
              </div>
            )}
            {project.ptoId && project.ptoId !== '-' ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white font-semibold text-sm">
                  {getInitials(project.ptoId)}
                </div>
                <div>
                  <p className="font-medium text-gray-800">{project.ptoId}</p>
                  <p className="text-sm text-gray-400">Инженер ПТО</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-semibold text-sm">ПТО</div>
                <div>
                  <p className="font-medium text-gray-400">Не назначен</p>
                  <p className="text-sm text-gray-300">Инженер ПТО</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ============================================
// FINANCE TAB
// ============================================

function FinanceTab({ project, allProjects }: { project: ProjectModel; allProjects: ProjectModel[] }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  // Вкладки: 'payments' = банк расходы/доходы, 'docs' = 1С документы
  const [activeTab, setActiveTab] = useState<'payments' | 'docs'>('payments');

  // Фильтры — платежи
  const [paySearch, setPaySearch] = useState('');
  const [payType, setPayType] = useState<'all' | 'income' | 'expense'>('all');
  const [payPartner, setPayPartner] = useState('');
  const [payCategory, setPayCategory] = useState('');
  const [payShowAll, setPayShowAll] = useState(false);

  // Фильтры — документы
  const [docSearch, setDocSearch] = useState('');
  const [docType, setDocType] = useState<'all' | 'income' | 'expense'>('all');
  const [docPartner, setDocPartner] = useState('');
  const [docShowAll, setDocShowAll] = useState(false);

  const projectIds = useMemo(() => {
    const ids = new Set<string>([project.id]);
    const collectChildren = (parentId: string) => {
      allProjects.forEach(p => {
        if (p.parentId === parentId && !ids.has(p.id)) {
          ids.add(p.id);
          collectChildren(p.id);
        }
      });
    };
    collectChildren(project.id);
    return ids;
  }, [project.id, allProjects]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const allTxns: Transaction[] = [];
        const idArr = Array.from(projectIds);
        for (let i = 0; i < idArr.length; i += 5) {
          const batch = idArr.slice(i, i + 5);
          const results = await Promise.all(batch.map(pid => financeService.getByProject(pid)));
          results.forEach(txns => allTxns.push(...txns));
        }
        const [items, allPartners] = await Promise.all([
          costItemsService.getAll(),
          partnersService.getAll(),
        ]);
        setTransactions(allTxns);
        setCostItems(items);
        setPartners(allPartners);
      } catch (err) {
        console.error('Error loading finance data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectIds]);

  const costItemMap = useMemo(() => {
    const map = new Map<string, CostItem>();
    costItems.forEach(ci => map.set(ci.itemId, ci));
    return map;
  }, [costItems]);

  const partnerMap = useMemo(() => {
    const map = new Map<string, Partner>();
    partners.forEach(p => { map.set(p.id, p); if (p.bin) map.set(p.bin, p); });
    return map;
  }, [partners]);

  const getPartnerName = (t: Transaction): string => {
    if (t.partnerId) {
      const p = partnerMap.get(t.partnerId);
      if (p) return p.name;
    }
    if (t.partnerBin) {
      const p = partnerMap.get(t.partnerBin);
      if (p) return p.name;
    }
    return t.partnerBin || t.partnerId || '—';
  };

  // Транзакции банка (платежи)
  const bankTxns = useMemo(() =>
    transactions.filter(t => t.status === 'fact' && t.sourceType === 'bank')
      .sort((a, b) => b.date.toDate().getTime() - a.date.toDate().getTime()),
    [transactions]);

  // Транзакции 1С (документы)
  const docTxns = useMemo(() =>
    transactions.filter(t => t.status === 'fact' && t.sourceType === '1c')
      .sort((a, b) => b.date.toDate().getTime() - a.date.toDate().getTime()),
    [transactions]);

  // Уникальные партнёры для фильтра — банк
  const bankPartners = useMemo(() => {
    const names = new Set(bankTxns.map(t => getPartnerName(t)).filter(n => n !== '—'));
    return Array.from(names).sort();
  }, [bankTxns, partnerMap]);

  // Уникальные партнёры для фильтра — 1С
  const docPartners = useMemo(() => {
    const names = new Set(docTxns.map(t => getPartnerName(t)).filter(n => n !== '—'));
    return Array.from(names).sort();
  }, [docTxns, partnerMap]);

  // Уникальные категории для фильтра — банк
  const bankCategories = useMemo(() => {
    const cats = new Map<string, string>();
    bankTxns.forEach(t => {
      if (t.categoryId) {
        const name = costItemMap.get(t.categoryId)?.itemName || t.categoryId;
        cats.set(t.categoryId, name);
      }
    });
    return Array.from(cats.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [bankTxns, costItemMap]);

  // Применяем фильтры — платежи
  const filteredPayments = useMemo(() => {
    return bankTxns.filter(t => {
      if (payType !== 'all' && t.type !== payType) return false;
      if (payPartner && getPartnerName(t) !== payPartner) return false;
      if (payCategory && t.categoryId !== payCategory) return false;
      if (paySearch) {
        const q = paySearch.toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const partner = getPartnerName(t).toLowerCase();
        if (!desc.includes(q) && !partner.includes(q)) return false;
      }
      return true;
    });
  }, [bankTxns, payType, payPartner, payCategory, paySearch, partnerMap]);

  // Применяем фильтры — документы
  const filteredDocs = useMemo(() => {
    return docTxns.filter(t => {
      if (docType !== 'all' && t.type !== docType) return false;
      if (docPartner && getPartnerName(t) !== docPartner) return false;
      if (docSearch) {
        const q = docSearch.toLowerCase();
        const desc = (t.description || t.sourceDoc || '').toLowerCase();
        const partner = getPartnerName(t).toLowerCase();
        if (!desc.includes(q) && !partner.includes(q)) return false;
      }
      return true;
    });
  }, [docTxns, docType, docPartner, docSearch, partnerMap]);

  const totals = useMemo(() => {
    let bankIncome = 0, bankExpense = 0, accrualIncome = 0, accrualExpense = 0;
    transactions.forEach(t => {
      if (t.status !== 'fact') return;
      if (t.sourceType === 'bank') {
        if (t.type === 'income') bankIncome += t.amount; else bankExpense += t.amount;
      } else {
        if (t.type === 'income') accrualIncome += t.amount; else accrualExpense += t.amount;
      }
    });
    // Задолженности:
    // Клиент нам должен = закрыли актами (1С доход) - получили деньги (банк доход)
    // Мы должны поставщикам = получили накладных (1С расход) - заплатили (банк расход)
    const clientDebt = accrualIncome - bankIncome;   // >0 нам должны, <0 мы получили аванс
    const supplierDebt = accrualExpense - bankExpense; // >0 мы должны, <0 мы заплатили аванс
    return {
      bankIncome, bankExpense, bankBalance: bankIncome - bankExpense,
      accrualIncome, accrualExpense, accrualMargin: accrualIncome - accrualExpense,
      clientDebt, supplierDebt,
    };
  }, [transactions]);

  // Таблица расходов — только 1С (начисления), без дублирования банка
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; income: number; expense: number }>();
    transactions.filter(t => t.status === 'fact' && t.sourceType === '1c').forEach(t => {
      const catId = t.categoryId || 'unknown';
      const ci = costItemMap.get(catId);
      if (!map.has(catId)) map.set(catId, { name: ci?.itemName || catId, income: 0, expense: 0 });
      const entry = map.get(catId)!;
      if (t.type === 'income') entry.income += t.amount; else entry.expense += t.amount;
    });
    return Array.from(map.values()).sort((a, b) => (b.expense + b.income) - (a.expense + a.income));
  }, [transactions, costItemMap]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 mt-3 text-sm">Загрузка финансов...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-12 text-center border border-gray-200 shadow-sm">
        <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Нет финансовых данных</h3>
        <p className="text-gray-500">Транзакции по этому проекту пока не загружены</p>
      </motion.div>
    );
  }

  const marginPct = totals.accrualIncome > 0
    ? ((totals.accrualMargin / totals.accrualIncome) * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-4">

      {/* ── СВОДНАЯ ТАБЛИЦА ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Шапка */}
        <div className="grid grid-cols-4 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <div className="px-5 py-2.5"></div>
          <div className="px-5 py-2.5 text-right border-l border-gray-100">Выручка / Приход</div>
          <div className="px-5 py-2.5 text-right border-l border-gray-100">Расходы / Оплачено</div>
          <div className="px-5 py-2.5 text-right border-l border-gray-100">Итого</div>
        </div>

        {/* Строка 1: По документам (1С) */}
        <div className="grid grid-cols-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
          <div className="px-5 py-3.5 flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">По документам</p>
              <p className="text-xs text-gray-400">Акты и накладные 1С</p>
            </div>
          </div>
          <div className="px-5 py-3.5 text-right border-l border-gray-100 flex flex-col justify-center">
            <p className="text-sm font-semibold text-emerald-600">+{fmt(totals.accrualIncome)} ₸</p>
            <p className="text-xs text-gray-400">акты выданные</p>
          </div>
          <div className="px-5 py-3.5 text-right border-l border-gray-100 flex flex-col justify-center">
            <p className="text-sm font-semibold text-red-500">−{fmt(totals.accrualExpense)} ₸</p>
            <p className="text-xs text-gray-400">накладные полученные</p>
          </div>
          <div className="px-5 py-3.5 text-right border-l border-gray-100 flex flex-col justify-center">
            <p className={`text-sm font-bold ${totals.accrualMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totals.accrualMargin >= 0 ? '+' : ''}{fmt(totals.accrualMargin)} ₸
            </p>
            {marginPct && <p className="text-xs text-gray-400">маржа {marginPct}%</p>}
          </div>
        </div>

        {/* Строка 2: По банку */}
        <div className="grid grid-cols-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
          <div className="px-5 py-3.5 flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">По банку</p>
              <p className="text-xs text-gray-400">Реальное движение денег</p>
            </div>
          </div>
          <div className="px-5 py-3.5 text-right border-l border-gray-100 flex flex-col justify-center">
            <p className="text-sm font-semibold text-emerald-600">+{fmt(totals.bankIncome)} ₸</p>
            <p className="text-xs text-gray-400">получено</p>
          </div>
          <div className="px-5 py-3.5 text-right border-l border-gray-100 flex flex-col justify-center">
            <p className="text-sm font-semibold text-red-500">−{fmt(totals.bankExpense)} ₸</p>
            <p className="text-xs text-gray-400">оплачено</p>
          </div>
          <div className="px-5 py-3.5 text-right border-l border-gray-100 flex flex-col justify-center">
            <p className={`text-sm font-bold ${totals.bankBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totals.bankBalance >= 0 ? '+' : ''}{fmt(totals.bankBalance)} ₸
            </p>
            <p className="text-xs text-gray-400">остаток</p>
          </div>
        </div>

        {/* Строка 3: Задолженности */}
        <div className="grid grid-cols-4 hover:bg-gray-50 transition-colors">
          <div className="px-5 py-3.5 flex items-center gap-2">
            <ArrowDownLeft className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">Задолженности</p>
              <p className="text-xs text-gray-400">Документы vs банк</p>
            </div>
          </div>
          {/* Заказчик */}
          <div className="px-5 py-3.5 text-right border-l border-gray-100 flex flex-col justify-center">
            {totals.clientDebt > 0 ? (
              <>
                <p className="text-sm font-semibold text-amber-600">+{fmt(totals.clientDebt)} ₸</p>
                <p className="text-xs text-amber-500">заказчик должен нам</p>
              </>
            ) : totals.clientDebt < 0 ? (
              <>
                <p className="text-sm font-semibold text-emerald-600">{fmt(Math.abs(totals.clientDebt))} ₸</p>
                <p className="text-xs text-emerald-500">аванс от заказчика</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">расчёты закрыты</p>
            )}
          </div>
          {/* Поставщики */}
          <div className="px-5 py-3.5 text-right border-l border-gray-100 flex flex-col justify-center">
            {totals.supplierDebt > 0 ? (
              <>
                <p className="text-sm font-semibold text-red-500">−{fmt(totals.supplierDebt)} ₸</p>
                <p className="text-xs text-red-400">мы должны поставщикам</p>
              </>
            ) : totals.supplierDebt < 0 ? (
              <>
                <p className="text-sm font-semibold text-blue-500">{fmt(Math.abs(totals.supplierDebt))} ₸</p>
                <p className="text-xs text-blue-400">аванс поставщику</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">расчёты закрыты</p>
            )}
          </div>
          <div className="border-l border-gray-100" />
        </div>
      </motion.div>

      {/* ── Расходы по статьям (только 1С) ── */}
      {categoryBreakdown.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Структура по статьям <span className="font-normal text-gray-400 ml-1">— 1С начисления</span></h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400 uppercase">Статья</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400 uppercase">Выручка</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400 uppercase">Расход</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400 uppercase">Итого</th>
                </tr>
              </thead>
              <tbody>
                {categoryBreakdown.map((cat, i) => (
                  <tr key={i} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5 text-sm text-gray-700">{cat.name}</td>
                    <td className="px-5 py-2.5 text-sm text-right text-emerald-600">
                      {cat.income > 0 ? `+${fmt(cat.income)}` : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-sm text-right text-red-500">
                      {cat.expense > 0 ? `−${fmt(cat.expense)}` : '—'}
                    </td>
                    <td className={`px-5 py-2.5 text-sm text-right font-semibold ${(cat.income - cat.expense) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmt(cat.income - cat.expense)} ₸
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="px-5 py-2.5 text-sm font-semibold text-gray-800">Итого</td>
                  <td className="px-5 py-2.5 text-sm text-right font-semibold text-emerald-600">+{fmt(categoryBreakdown.reduce((s, c) => s + c.income, 0))}</td>
                  <td className="px-5 py-2.5 text-sm text-right font-semibold text-red-500">−{fmt(categoryBreakdown.reduce((s, c) => s + c.expense, 0))}</td>
                  <td className={`px-5 py-2.5 text-sm text-right font-bold ${categoryBreakdown.reduce((s, c) => s + c.income - c.expense, 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmt(categoryBreakdown.reduce((s, c) => s + c.income - c.expense, 0))} ₸
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── ВКЛАДКИ: ПЛАТЕЖИ / ДОКУМЕНТЫ ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Tab header */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('payments')}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'payments'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Banknote className="w-4 h-4" />
            Платежи (Банк)
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{bankTxns.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'docs'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Документы (1С)
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{docTxns.length}</span>
          </button>
        </div>

        {/* ── ПЛАТЕЖИ ── */}
        {activeTab === 'payments' && (
          <div>
            {/* Фильтры */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2 items-center">
              {/* Поиск */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск по описанию / контрагенту..."
                  value={paySearch}
                  onChange={e => setPaySearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              {/* Тип */}
              <select
                value={payType}
                onChange={e => setPayType(e.target.value as 'all' | 'income' | 'expense')}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">Все типы</option>
                <option value="income">Приход</option>
                <option value="expense">Расход</option>
              </select>
              {/* Контрагент */}
              <select
                value={payPartner}
                onChange={e => setPayPartner(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[200px]"
              >
                <option value="">Все контрагенты</option>
                {bankPartners.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {/* Статья */}
              <select
                value={payCategory}
                onChange={e => setPayCategory(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[180px]"
              >
                <option value="">Все статьи</option>
                {bankCategories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              {/* Итог */}
              <span className="ml-auto text-xs text-gray-400">
                {filteredPayments.length} записей ·{' '}
                <span className="text-emerald-600 font-medium">+{fmt(filteredPayments.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0))}</span>
                {' / '}
                <span className="text-red-600 font-medium">−{fmt(filteredPayments.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0))}</span>
              </span>
            </div>

            {/* Таблица */}
            <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-white border-b border-gray-100">
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Дата</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Тип</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Контрагент</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Статья</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Описание</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {(payShowAll ? filteredPayments : filteredPayments.slice(0, 50)).map((t, i) => {
                    const date = t.date?.toDate?.();
                    const dateStr = date ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
                    const ci = costItemMap.get(t.categoryId);
                    const partner = getPartnerName(t);
                    return (
                      <tr key={t.id || i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">{dateStr}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${t.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {t.type === 'income' ? 'Приход' : 'Расход'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 max-w-[180px]">
                          <span className="text-sm text-gray-700 whitespace-normal leading-tight">{partner}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[160px]">
                          <span className="whitespace-normal leading-tight">{ci?.itemName || '—'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-400 max-w-[260px]">
                          <span className="whitespace-normal leading-tight" title={t.description}>{t.description || '—'}</span>
                        </td>
                        <td className={`px-4 py-2.5 text-sm text-right font-medium whitespace-nowrap ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {t.type === 'income' ? '+' : '−'}{fmt(t.amount)} ₸
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredPayments.length > 50 && (
              <div className="px-4 py-3 border-t border-gray-100 text-center">
                <button
                  onClick={() => setPayShowAll(!payShowAll)}
                  className="flex items-center gap-1 mx-auto text-xs text-blue-600 hover:text-blue-800"
                >
                  {payShowAll ? <><ChevronUp className="w-3.5 h-3.5" /> Свернуть</> : <><ChevronDown className="w-3.5 h-3.5" /> Показать все {filteredPayments.length}</>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ДОКУМЕНТЫ 1С ── */}
        {activeTab === 'docs' && (
          <div>
            {/* Фильтры */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск по документу / контрагенту..."
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value as 'all' | 'income' | 'expense')}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="all">Все типы</option>
                <option value="income">Акты выданные</option>
                <option value="expense">Накладные полученные</option>
              </select>
              <select
                value={docPartner}
                onChange={e => setDocPartner(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 max-w-[200px]"
              >
                <option value="">Все контрагенты</option>
                {docPartners.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <span className="ml-auto text-xs text-gray-400">
                {filteredDocs.length} записей ·{' '}
                <span className="text-emerald-600 font-medium">+{fmt(filteredDocs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0))}</span>
                {' / '}
                <span className="text-red-600 font-medium">−{fmt(filteredDocs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0))}</span>
              </span>
            </div>

            {/* Таблица */}
            <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-white border-b border-gray-100">
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Дата</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Тип</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Контрагент</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Документ</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Статья</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {(docShowAll ? filteredDocs : filteredDocs.slice(0, 50)).map((t, i) => {
                    const date = t.date?.toDate?.();
                    const dateStr = date ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
                    const ci = costItemMap.get(t.categoryId);
                    const partner = getPartnerName(t);
                    return (
                      <tr key={t.id || i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">{dateStr}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${t.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                            {t.type === 'income' ? 'Акт выданный' : 'Накладная'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 max-w-[180px]">
                          <span className="text-sm text-gray-700 whitespace-normal leading-tight">{partner}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[200px]">
                          <span className="whitespace-normal leading-tight">{t.sourceDoc || t.description || '—'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-400 max-w-[160px]">
                          <span className="whitespace-normal leading-tight">{ci?.itemName || '—'}</span>
                        </td>
                        <td className={`px-4 py-2.5 text-sm text-right font-medium whitespace-nowrap ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {t.type === 'income' ? '+' : '−'}{fmt(t.amount)} ₸
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredDocs.length > 50 && (
              <div className="px-4 py-3 border-t border-gray-100 text-center">
                <button
                  onClick={() => setDocShowAll(!docShowAll)}
                  className="flex items-center gap-1 mx-auto text-xs text-purple-600 hover:text-purple-800"
                >
                  {docShowAll ? <><ChevronUp className="w-3.5 h-3.5" /> Свернуть</> : <><ChevronDown className="w-3.5 h-3.5" /> Показать все {filteredDocs.length}</>}
                </button>
              </div>
            )}
          </div>
        )}

      </motion.div>
    </div>
  );
}

function DocumentsTab({ project, allProjects }: { project: ProjectModel; allProjects: ProjectModel[] }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<ProjectDocumentPackage[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);

  const projectIds = useMemo(() => {
    const ids = new Set<string>([project.id]);
    const collectChildren = (parentId: string) => {
      allProjects.forEach((p) => {
        if (p.parentId === parentId && !ids.has(p.id)) {
          ids.add(p.id);
          collectChildren(p.id);
        }
      });
    };
    collectChildren(project.id);
    return ids;
  }, [project.id, allProjects]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const registry = await projectDocumentsService.getRegistry();
        const filteredPackages = registry.packages.filter((item) => projectIds.has(item.projectId));
        const packageIds = new Set(filteredPackages.map((item) => item.id));
        const filteredDocs = registry.documents.filter((item) => packageIds.has(item.packageId));
        setPackages(filteredPackages);
        setDocuments(filteredDocs);
      } catch (err) {
        console.error('Error loading project documents:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectIds]);

  const summary = useMemo(() => {
    const complete = packages.filter((pkg) => {
      const packageDocs = documents.filter((doc) => doc.packageId === pkg.id);
      const progress = getPackageProgress(pkg, packageDocs);
      return progress.done === progress.total;
    }).length;
    const missingOnHands = documents.filter((doc) => doc.required && !doc.isOnHands).length;
    return {
      totalPackages: packages.length,
      complete,
      totalDocuments: documents.length,
      missingOnHands,
    };
  }, [packages, documents]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 mt-3 text-sm">Загрузка документов...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Пакетов</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{summary.totalPackages}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Полностью закрыто</p>
          <p className="text-2xl font-semibold text-emerald-600 mt-1">{summary.complete}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Документов</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{summary.totalDocuments}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Нет оригиналов на руках</p>
          <p className="text-2xl font-semibold text-red-600 mt-1">{summary.missingOnHands}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Пакеты документов проекта</h3>
          <button
            onClick={() => navigate(`/project-documents?projectId=${project.id}`)}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Полный реестр
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {packages.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">По проекту пока нет пакетов документов</p>
            <p className="text-xs text-gray-500 mt-1">Нажмите «Полный реестр», чтобы создать первый пакет</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {packages.map((pkg) => {
              const pkgDocs = documents.filter((doc) => doc.packageId === pkg.id);
              const progress = getPackageProgress(pkg, pkgDocs);
              const progressPercent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 100;
              const requiredTypes = REQUIRED_DOCUMENTS_BY_PACKAGE[pkg.packageType] || [];

              return (
                <div key={pkg.id} className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-gray-900">{pkg.title}</h4>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100">
                          {PACKAGE_TYPE_LABELS[pkg.packageType]}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <span className={`inline-flex items-center gap-1 ${progress.signed ? 'text-emerald-600' : 'text-gray-400'}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Подписано
                        </span>
                        <span className={`inline-flex items-center gap-1 ${progress.onHands ? 'text-emerald-600' : 'text-gray-400'}`}>
                          <Hand className="w-3.5 h-3.5" /> На руках
                        </span>
                        <span className={`inline-flex items-center gap-1 ${progress.stitched ? 'text-emerald-600' : 'text-gray-400'}`}>
                          <Archive className="w-3.5 h-3.5" /> Подшито
                        </span>
                      </div>
                    </div>

                    <div className="min-w-[150px]">
                      <p className="text-xs text-gray-500 mb-1">Готовность</p>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{progress.done} / {progress.total}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                    {requiredTypes.map((type) => {
                      const doc = pkgDocs.find((item) => item.type === type);
                      return (
                        <div key={`${pkg.id}-${type}`} className="rounded-lg border border-gray-200 px-3 py-2">
                          <p className="text-xs text-gray-500">{DOCUMENT_TYPE_LABELS[type]}</p>
                          {doc ? (
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-700 truncate">{DOCUMENT_STATUS_LABELS[doc.status]}</span>
                              {!doc.isOnHands && <AlertCircle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                            </div>
                          ) : (
                            <p className="text-xs text-red-600 mt-1">Отсутствует</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceholderTab({ title }: { title: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl p-12 text-center border border-gray-200 shadow-sm">
      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-500">Этот раздел находится в разработке</p>
    </motion.div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [project, setProject] = useState<ProjectModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [allProjects, setAllProjects] = useState<ProjectModel[]>([]);

  const loadProject = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [data, all] = await Promise.all([projectsService.getById(id), projectsService.getAll()]);
      setAllProjects(all);
      if (data) setProject(data);
    } catch (error) {
      console.error('Error loading project:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProject(); }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 mt-4">Загрузка проекта...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center">
        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Проект не найден</h3>
        <button onClick={() => navigate('/projects')} className="text-blue-600 hover:text-blue-500 mt-2">← Вернуться к проектам</button>
      </div>
    );
  }

  const status = statusConfig[project.status] || statusConfig.planning;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/projects')}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </motion.button>
          <div>
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-[var(--color-secondary)]" />
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${status.bg} ${status.color}`}>{status.label}</span>
              {project.isAUP && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-100 text-pink-700">АУП</span>
              )}
            </div>
            <p className="text-gray-500 mt-1 ml-9">{project.clientName || 'Заказчик не указан'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-9 sm:ml-0">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setShowEditModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
            <Edit className="w-4 h-4" />
            Редактировать
          </motion.button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-1 flex gap-1 overflow-x-auto shadow-sm">
        {tabs.map(({ id, label, icon: Icon }) => (
          <motion.button key={id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === id
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-gray-500 hover:bg-gray-50'
              }`}>
            <Icon className="w-4 h-4" />
            {label}
          </motion.button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab project={project} />}
      {activeTab === 'gpr' && <Gantt projectId={project.id} isEmbedded={true} />}
      {activeTab === 'supply' && <PlaceholderTab title="Снабжение проекта" />}
      {activeTab === 'finance' && <FinanceTab project={project} allProjects={allProjects} />}
      {activeTab === 'documents' && <DocumentsTab project={project} allProjects={allProjects} />}

      {project && (
        <ProjectModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={loadProject}
          existingProjects={allProjects}
          mode="edit"
          project={project}
        />
      )}
    </div>
  );
}
