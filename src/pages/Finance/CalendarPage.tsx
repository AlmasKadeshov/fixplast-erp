import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Download, Link2, MoveRight, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { Project, Partner } from '../../models';
import { CostItem } from '../../models/costItems';
import { Transaction, TransactionRecurrenceRule, TransactionType, getPaymentDate } from '../../models/finance';
import { SearchableSelect, useToast } from '../../components/ui';
import { financeService } from '../../services/finance.service';
import { projectsService } from '../../services/projects.service';
import { costItemsService } from '../../services/costItems.service';
import { partnersService } from '../../services/partners.service';
import { useAccountBalances } from '../../hooks/useAccountBalances';
import { buildProjectSelectTree } from '../../utils/projectTree';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { formatMoney } from '../../utils/formatters';

type FilterValue = 'all';
type RecurrenceFormValue = 'none' | TransactionRecurrenceRule;

interface CalendarPaymentForm {
  date: string;
  amount: string;
  type: TransactionType;
  status: 'plan' | 'fact';
  description: string;
  projectId: string;
  partnerId: string;
  categoryId: string;
  recurrence: RecurrenceFormValue;
  recurrenceUntil: string;
}

interface PaymentTemplate {
  id: string;
  label: string;
  description: string;
  type: TransactionType;
  status: 'plan' | 'fact';
  categoryId: string;
  recurrence: RecurrenceFormValue;
}

const defaultForm = (): CalendarPaymentForm => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  amount: '',
  type: 'expense',
  status: 'plan',
  description: '',
  projectId: '',
  partnerId: '',
  categoryId: '',
  recurrence: 'none',
  recurrenceUntil: '',
});

const QUICK_TEMPLATES: PaymentTemplate[] = [
  {
    id: 'rent',
    label: 'Аренда',
    description: 'Аренда офиса/склада',
    type: 'expense',
    status: 'plan',
    categoryId: 'OFFICE_RENT',
    recurrence: 'monthly',
  },
  {
    id: 'salary',
    label: 'Зарплата',
    description: 'Выплата заработной платы',
    type: 'expense',
    status: 'plan',
    categoryId: 'SALARY_AUP',
    recurrence: 'monthly',
  },
  {
    id: 'taxes',
    label: 'Налоги',
    description: 'Налоговые платежи',
    type: 'expense',
    status: 'plan',
    categoryId: 'TAXES_AUP',
    recurrence: 'monthly',
  },
  {
    id: 'materials',
    label: 'Материалы',
    description: 'Оплата поставщику за ТМЦ',
    type: 'expense',
    status: 'plan',
    categoryId: 'PAYMENT_FOR_TMC',
    recurrence: 'none',
  },
  {
    id: 'subcontract',
    label: 'Подрядчики',
    description: 'Оплата подрядных работ',
    type: 'expense',
    status: 'plan',
    categoryId: 'SUBCONTRACT_SMR',
    recurrence: 'none',
  },
  {
    id: 'client_income',
    label: 'Поступление',
    description: 'Оплата от заказчика',
    type: 'income',
    status: 'plan',
    categoryId: 'CLIENT_PAYMENT',
    recurrence: 'none',
  },
];

const PROJECT_OPTIONAL_CATEGORY_IDS = new Set([
  'OFFICE_RENT',
  'SALARY_AUP',
  'TAXES_AUP',
  'TAXES',
  'AUP',
  'ADMIN',
]);

const PROJECT_OPTIONAL_KEYWORDS = ['налог', 'ауп', 'аренд', 'офис', 'админ'];

const isProjectRequiredForCategory = (categoryId: string, categoryMap: Map<string, string>): boolean => {
  if (!categoryId) return false;
  if (PROJECT_OPTIONAL_CATEGORY_IDS.has(categoryId)) return false;
  const categoryName = (categoryMap.get(categoryId) || '').toLowerCase();
  if (PROJECT_OPTIONAL_KEYWORDS.some((kw) => categoryName.includes(kw))) return false;
  return true;
};

function buildRecurringDates(startDate: Date, recurrence: RecurrenceFormValue, untilDate?: Date): Date[] {
  if (recurrence === 'none') return [startDate];
  if (!untilDate) return [startDate];

  const result: Date[] = [startDate];
  let cursor = startDate;

  while (result.length < 120) {
    if (recurrence === 'weekly') cursor = addWeeks(cursor, 1);
    else if (recurrence === 'monthly') cursor = addMonths(cursor, 1);
    else cursor = addYears(cursor, 1);

    if (cursor > untilDate) break;
    result.push(cursor);
  }

  return result;
}

function recurrenceLabel(rule?: TransactionRecurrenceRule): string {
  if (rule === 'weekly') return 'каждую неделю';
  if (rule === 'monthly') return 'каждый месяц';
  if (rule === 'yearly') return 'каждый год';
  return '';
}

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const parseImportAmount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.abs(value);
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.abs(amount);
};

const parseImportDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const dotMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const day = Number(dotMatch[1]);
    const month = Number(dotMatch[2]) - 1;
    const year = Number(dotMatch[3]);
    const dt = new Date(year, month, day);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const isoLike = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]) - 1;
    const day = Number(isoLike[3]);
    const dt = new Date(year, month, day);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
  }

  return null;
};

const parseImportType = (value: unknown): TransactionType | null => {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (['поступление', 'приход', 'income', 'in'].includes(raw)) return 'income';
  if (['оплата', 'расход', 'expense', 'out'].includes(raw)) return 'expense';
  return null;
};

const parseImportStatus = (value: unknown): 'plan' | 'fact' => {
  const raw = normalizeText(value);
  if (['факт', 'fact', 'проведено', 'проведен'].includes(raw)) return 'fact';
  return 'plan';
};

export function CalendarPage() {
  const { totalBalance: liveBalance } = useAccountBalances();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [showDayPanel, setShowDayPanel] = useState(false);
  const [showDetailList, setShowDetailList] = useState(false);
  const [isExecutiveMode, setIsExecutiveMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('finance_calendar_exec_mode') !== '0';
  });
  const [forecastOpeningBalanceInput, setForecastOpeningBalanceInput] = useState<string>(() => {
    if (typeof window === 'undefined') return '0';
    return window.localStorage.getItem('finance_calendar_opening_balance') || '0';
  });
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [projectFilter, setProjectFilter] = useState<string | FilterValue>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'plan' | 'fact'>('plan');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [searchFilter, setSearchFilter] = useState('');

  const [form, setForm] = useState<CalendarPaymentForm>(defaultForm());
  const [editForm, setEditForm] = useState<CalendarPaymentForm>(defaultForm());
  const [confirmingTxId, setConfirmingTxId] = useState<string | null>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [movingOverdue, setMovingOverdue] = useState(false);

  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txs, prjs, items, ptrs] = await Promise.all([
        financeService.getTransactions({}),
        projectsService.getAll(),
        costItemsService.getAll(),
        partnersService.getAll(),
      ]);
      setTransactions(txs);
      setProjects(prjs);
      setCostItems(items);
      setPartners(ptrs);
    } catch (error) {
      console.error(error);
      showToast('Ошибка загрузки платёжного календаря', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('finance_calendar_exec_mode', isExecutiveMode ? '1' : '0');
  }, [isExecutiveMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('finance_calendar_opening_balance', forecastOpeningBalanceInput);
  }, [forecastOpeningBalanceInput]);

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [projects]);
  const projectTree = useMemo(() => buildProjectSelectTree(projects, true), [projects]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    costItems.forEach((c) => map.set(c.itemId, c.itemName));
    return map;
  }, [costItems]);

  const partnerMap = useMemo(() => {
    const map = new Map<string, string>();
    partners.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [partners]);

  const categoryByName = useMemo(() => {
    const map = new Map<string, string>();
    costItems.forEach((item) => {
      map.set(normalizeText(item.itemName), item.itemId);
      map.set(normalizeText(item.itemId), item.itemId);
    });
    return map;
  }, [costItems]);

  const projectByName = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => {
      map.set(normalizeText(project.name), project.id);
      map.set(normalizeText(project.code), project.id);
    });
    return map;
  }, [projects]);

  const partnerByName = useMemo(() => {
    const map = new Map<string, string>();
    partners.forEach((partner) => {
      map.set(normalizeText(partner.name), partner.id);
      if (partner.bin) map.set(normalizeText(partner.bin), partner.id);
    });
    return map;
  }, [partners]);

  const projectOptions = useMemo(
    () =>
      projectTree.flatMap((group) =>
        group.children.length > 0
          ? group.children.map((child) => ({
              value: child.id,
              label: `${group.name} / ${child.name}`,
              keywords: `${group.name} ${child.name}`,
            }))
          : [{ value: group.id, label: group.name, keywords: group.name }]
      ),
    [projectTree]
  );

  const partnerOptions = useMemo(
    () =>
      partners
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((partner) => ({
          value: partner.id,
          label: partner.name,
          keywords: `${partner.name} ${partner.bin || ''}`,
        })),
    [partners]
  );

  const categoryOptions = useMemo(
    () =>
      costItems
        .slice()
        .sort((a, b) => a.itemName.localeCompare(b.itemName, 'ru'))
        .map((item) => ({
          value: item.itemId,
          label: item.itemName,
          keywords: `${item.itemName} ${item.itemId}`,
        })),
    [costItems]
  );

  const filteredTransactions = useMemo(() => {
    const queryText = searchFilter.trim().toLowerCase();

    return transactions.filter((t) => {
      if (projectFilter !== 'all' && t.projectId !== projectFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;

      if (queryText) {
        const projectName = projectMap.get(t.projectId)?.toLowerCase() || '';
        const categoryName = categoryMap.get(t.categoryId)?.toLowerCase() || '';
        const partnerName = partnerMap.get(t.partnerId)?.toLowerCase() || '';
        const description = (t.description || '').toLowerCase();

        return (
          description.includes(queryText) ||
          projectName.includes(queryText) ||
          categoryName.includes(queryText) ||
          partnerName.includes(queryText)
        );
      }

      return true;
    });
  }, [transactions, projectFilter, statusFilter, typeFilter, searchFilter, projectMap, categoryMap, partnerMap]);

  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);

  const monthTransactions = useMemo(() => {
    return filteredTransactions.filter((t) => {
      const d = getPaymentDate(t).toDate();
      return d >= monthStart && d <= monthEnd;
    });
  }, [filteredTransactions, monthStart, monthEnd]);

  const dayMap = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    monthTransactions.forEach((t) => {
      const key = format(getPaymentDate(t).toDate(), 'yyyy-MM-dd');
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [monthTransactions]);

  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDay) return [];
    return (dayMap[selectedDay] || []).slice().sort((a, b) => b.amount - a.amount);
  }, [selectedDay, dayMap]);

  const overduePlannedExpenses = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filteredTransactions
      .filter((t) => t.status === 'plan' && t.type === 'expense' && getPaymentDate(t).toDate() < today)
      .sort((a, b) => getPaymentDate(a).toDate().getTime() - getPaymentDate(b).toDate().getTime());
  }, [filteredTransactions]);

  const weekPlanSummary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    let plannedExpense = 0;
    let plannedIncome = 0;
    let plannedCount = 0;

    for (const tx of filteredTransactions) {
      if (tx.status !== 'plan') continue;
      const d = getPaymentDate(tx).toDate();
      if (d < today || d > end) continue;
      plannedCount++;
      if (tx.type === 'expense') plannedExpense += tx.amount;
      else plannedIncome += tx.amount;
    }

    return {
      plannedCount,
      plannedExpense,
      plannedIncome,
      net: plannedIncome - plannedExpense,
    };
  }, [filteredTransactions]);

  const forecastOpeningBalance = useMemo(() => {
    // Приоритет: ручной ввод → живой баланс счетов
    const parsed = Number(forecastOpeningBalanceInput);
    if (forecastOpeningBalanceInput && Number.isFinite(parsed) && parsed !== 0) return parsed;
    return liveBalance;
  }, [forecastOpeningBalanceInput, liveBalance]);

  const sixMonthForecast = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = endOfMonth(addMonths(start, 6));
    const daysRange = eachDayOfInterval({ start, end });
    const dailyNet = new Map<string, number>();

    for (const tx of transactions) {
      const txDate = getPaymentDate(tx).toDate();
      if (txDate < start || txDate > end) continue;
      const key = format(txDate, 'yyyy-MM-dd');
      const current = dailyNet.get(key) || 0;
      const delta = tx.type === 'income' ? tx.amount : -tx.amount;
      dailyNet.set(key, current + delta);
    }

    let balance = forecastOpeningBalance;
    let minBalance = forecastOpeningBalance;
    let firstGapDate: Date | null = null;
    let negativeDays = 0;

    const rows = daysRange.map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const dayNet = dailyNet.get(key) || 0;
      balance += dayNet;
      if (balance < minBalance) minBalance = balance;
      if (balance < 0) {
        negativeDays++;
        if (!firstGapDate) firstGapDate = day;
      }
      return { day, dayNet, balance };
    });

    return {
      rows,
      minBalance,
      firstGapDate,
      negativeDays,
      endBalance: rows.length > 0 ? rows[rows.length - 1].balance : forecastOpeningBalance,
    };
  }, [transactions, forecastOpeningBalance]);

  const projectRequiredForFormCategory = useMemo(
    () => isProjectRequiredForCategory(form.categoryId, categoryMap),
    [form.categoryId, categoryMap]
  );

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const setFormField = <K extends keyof CalendarPaymentForm>(key: K, value: CalendarPaymentForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setEditFormField = <K extends keyof CalendarPaymentForm>(key: K, value: CalendarPaymentForm[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleDayClick = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    setSelectedDay(dayStr);
    setFormField('date', dayStr);
    setShowDayPanel(true);
  };

  const resetForm = () => setForm(defaultForm());

  /** Быстрое подтверждение план→факт (Finmap-style) */
  const handleConfirmPayment = async (txId: string) => {
    const amount = Number(confirmAmount);
    if (!amount || amount <= 0) {
      showToast('Введите корректную сумму', 'error');
      return;
    }
    try {
      setSaving(true);
      await financeService.updateTransaction(txId, {
        status: 'fact',
        amount,
      });
      showToast('Платёж подтверждён', 'success');
      setConfirmingTxId(null);
      setConfirmAmount('');
      await loadData();
    } catch {
      showToast('Ошибка подтверждения', 'error');
    } finally {
      setSaving(false);
    }
  };

  /** Перенос всех просроченных плановых на сегодня */
  const handleMoveOverdueToToday = async () => {
    if (overduePlannedExpenses.length === 0) return;
    if (!confirm(`Перенести ${overduePlannedExpenses.length} просроченных платежей на сегодня?`)) return;

    try {
      setMovingOverdue(true);
      const today = Timestamp.fromDate(new Date());
      for (const tx of overduePlannedExpenses) {
        await financeService.updateTransaction(tx.id, { date: today });
      }
      showToast(`Перенесено: ${overduePlannedExpenses.length} платежей`, 'success');
      await loadData();
    } catch {
      showToast('Ошибка переноса', 'error');
    } finally {
      setMovingOverdue(false);
    }
  };

  const applyTemplate = (template: PaymentTemplate) => {
    const current = new Date();
    const until = addMonths(current, 12);

    setForm((prev) => ({
      ...prev,
      type: template.type,
      status: template.status,
      description: template.description,
      categoryId: template.categoryId,
      recurrence: template.recurrence,
      recurrenceUntil: template.recurrence === 'none' ? '' : format(until, 'yyyy-MM-dd'),
    }));

    setShowForm(true);
  };

  const validateForm = (data: CalendarPaymentForm): { ok: boolean; amount: number; startDate?: Date; untilDate?: Date } => {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Укажите корректную сумму', 'error');
      return { ok: false, amount: 0 };
    }
    if (!data.date) {
      showToast('Укажите дату платежа', 'error');
      return { ok: false, amount };
    }
    if (!data.categoryId) {
      showToast('Выберите статью', 'error');
      return { ok: false, amount };
    }
    if (isProjectRequiredForCategory(data.categoryId, categoryMap) && !data.projectId) {
      showToast('Для этой статьи нужно выбрать проект', 'error');
      return { ok: false, amount };
    }

    const startDate = new Date(`${data.date}T00:00:00`);
    let untilDate: Date | undefined;

    if (data.recurrence !== 'none') {
      if (!data.recurrenceUntil) {
        showToast('Укажите дату окончания цикла', 'error');
        return { ok: false, amount };
      }
      untilDate = new Date(`${data.recurrenceUntil}T00:00:00`);
      if (untilDate < startDate) {
        showToast('Дата окончания цикла должна быть позже даты старта', 'error');
        return { ok: false, amount };
      }
    }

    return { ok: true, amount, startDate, untilDate };
  };

  const handleCreatePayment = async () => {
    const validated = validateForm(form);
    if (!validated.ok || !validated.startDate) return;

    const recurrence = isExecutiveMode ? 'none' : form.recurrence;
    const status = isExecutiveMode ? 'plan' : form.status;
    const partnerId = isExecutiveMode ? '' : form.partnerId;
    const recurrenceId =
      recurrence === 'none'
        ? undefined
        : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const dates = buildRecurringDates(validated.startDate, recurrence, validated.untilDate);

    setSaving(true);
    try {
      for (const d of dates) {
        await financeService.addTransaction({
          date: Timestamp.fromDate(d),
          amount: validated.amount,
          type: form.type,
          status,
          walletId: '',
          partnerId,
          categoryId: form.categoryId,
          projectId: form.projectId,
          description: form.description || categoryMap.get(form.categoryId) || 'Платёж',
          sourceDoc: status === 'plan' ? 'payment_calendar_plan' : 'payment_calendar',
          sourceType: 'bank',
          recurrenceId,
          recurrenceRule: recurrence === 'none' ? undefined : recurrence,
        });
      }

      showToast(dates.length > 1 ? `Создано ${dates.length} платежей по циклу` : 'Платёж создан', 'success');
      resetForm();
      setShowForm(false);
      await loadData();
    } catch (error) {
      console.error(error);
      showToast('Ошибка при создании платежа', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setEditForm({
      date: format(getPaymentDate(tx).toDate(), 'yyyy-MM-dd'),
      amount: String(tx.amount),
      type: tx.type,
      status: tx.status,
      description: tx.description || '',
      projectId: tx.projectId || '',
      partnerId: tx.partnerId || '',
      categoryId: tx.categoryId || '',
      recurrence: tx.recurrenceRule || 'none',
      recurrenceUntil: '',
    });
  };

  const cancelEdit = () => {
    setEditingTxId(null);
    setEditForm(defaultForm());
  };

  const handleUpdatePayment = async (tx: Transaction) => {
    const validated = validateForm(editForm);
    if (!validated.ok || !validated.startDate) return;

    setSaving(true);
    try {
      await financeService.updateTransaction(tx.id, {
        date: validated.startDate,
        amount: validated.amount,
        type: editForm.type,
        status: editForm.status,
        description: editForm.description,
        projectId: editForm.projectId,
        partnerId: editForm.partnerId,
        categoryId: editForm.categoryId,
      });

      showToast('Платёж обновлён', 'success');
      cancelEdit();
      await loadData();
    } catch (error) {
      console.error(error);
      showToast('Ошибка при обновлении платежа', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (tx: Transaction) => {
    const ok = window.confirm('Удалить этот платёж?');
    if (!ok) return;

    setSaving(true);
    try {
      await financeService.deleteTransactions([tx.id]);
      showToast('Платёж удалён', 'success');
      await loadData();
    } catch (error) {
      console.error(error);
      showToast('Ошибка при удалении платежа', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSeries = async (tx: Transaction) => {
    if (!tx.recurrenceId) return;

    const seriesIds = transactions
      .filter((item) => item.recurrenceId && item.recurrenceId === tx.recurrenceId)
      .map((item) => item.id);

    if (seriesIds.length === 0) return;

    const ok = window.confirm(`Удалить всю серию (${seriesIds.length} платежей)?`);
    if (!ok) return;

    setSaving(true);
    try {
      await financeService.deleteTransactions(seriesIds);
      showToast(`Удалено ${seriesIds.length} платежей серии`, 'success');
      await loadData();
    } catch (error) {
      console.error(error);
      showToast('Ошибка при удалении серии', 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadCalendarTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AMRE ERP';
    workbook.created = new Date();

    const calendarSheet = workbook.addWorksheet('Календарь');
    calendarSheet.columns = [
      { header: 'Тип', key: 'type', width: 14 },
      { header: 'Дата', key: 'date', width: 14 },
      { header: 'Проект', key: 'project', width: 40 },
      { header: 'Контрагент', key: 'partner', width: 35 },
      { header: 'Категория', key: 'category', width: 40 },
      { header: 'Сумма', key: 'amount', width: 14 },
      { header: 'Комментарий', key: 'comment', width: 50 },
    ];
    calendarSheet.getRow(1).font = { bold: true };
    calendarSheet.addRow({
      type: 'Оплата',
      date: format(new Date(), 'dd.MM.yyyy'),
      project: '',
      partner: '',
      category: '',
      amount: '',
      comment: '',
    });

    const categoriesSorted = costItems.slice().sort((a, b) => a.itemName.localeCompare(b.itemName, 'ru'));
    const partnersSorted = partners.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const projectsSorted = projects.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    const categoriesSheet = workbook.addWorksheet('Справочник_категорий');
    categoriesSheet.columns = [
      { header: 'Категория (выберите в листе "Календарь")', key: 'name', width: 55 },
      { header: 'Код', key: 'code', width: 24 },
    ];
    categoriesSheet.getRow(1).font = { bold: true };
    categoriesSorted.forEach((item) => categoriesSheet.addRow({ name: item.itemName, code: item.itemId }));

    const partnersSheet = workbook.addWorksheet('Справочник_контрагентов');
    partnersSheet.columns = [
      { header: 'Контрагент (выберите в листе "Календарь")', key: 'name', width: 50 },
      { header: 'БИН', key: 'bin', width: 16 },
    ];
    partnersSheet.getRow(1).font = { bold: true };
    partnersSorted.forEach((partner) => partnersSheet.addRow({ name: partner.name, bin: partner.bin || '' }));

    const projectsSheet = workbook.addWorksheet('Справочник_проектов');
    projectsSheet.columns = [
      { header: 'Проект (выберите в листе "Календарь")', key: 'name', width: 55 },
      { header: 'Код', key: 'code', width: 18 },
    ];
    projectsSheet.getRow(1).font = { bold: true };
    projectsSorted.forEach((project) => projectsSheet.addRow({ name: project.name, code: project.code || '' }));

    const instructionSheet = workbook.addWorksheet('Инструкция');
    instructionSheet.columns = [{ header: 'Правила', key: 'rule', width: 95 }];
    instructionSheet.getRow(1).font = { bold: true };
    [
      '1) Обязательные поля: Тип, Дата, Категория, Сумма.',
      '2) Тип: Поступление или Оплата.',
      '3) Для Категории/Контрагента/Проекта используйте выпадающий список в строке.',
      '4) Для проектных статей поле "Проект" обязательно. Для общих статей (налоги/аренда/АУП) можно оставить пустым.',
      '5) Все записи из этого шаблона при импорте создаются как План.',
      '6) Комментарий необязателен.',
    ].forEach((rule) => instructionSheet.addRow({ rule }));

    const maxRows = 500;
    const categoryRangeEnd = Math.max(2, categoriesSorted.length + 1);
    const partnerRangeEnd = Math.max(2, partnersSorted.length + 1);
    const projectRangeEnd = Math.max(2, projectsSorted.length + 1);
    const categoryFormula = `'Справочник_категорий'!$A$2:$A$${categoryRangeEnd}`;
    const partnerFormula = `'Справочник_контрагентов'!$A$2:$A$${partnerRangeEnd}`;
    const projectFormula = `'Справочник_проектов'!$A$2:$A$${projectRangeEnd}`;

    for (let row = 2; row <= maxRows; row++) {
      calendarSheet.getCell(`A${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Оплата,Поступление"'],
      };
      calendarSheet.getCell(`C${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [projectFormula],
      };
      calendarSheet.getCell(`D${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [partnerFormula],
      };
      calendarSheet.getCell(`E${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [categoryFormula],
      };
      calendarSheet.getCell(`F${row}`).numFmt = '#,##0.00';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Шаблон_платежного_календаря_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCalendarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSaving(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets['Календарь'] || workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) {
        showToast('Не найден лист для импорта', 'error');
        return;
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
      if (rows.length < 2) {
        showToast('Файл пустой или не содержит данных', 'error');
        return;
      }

      const header = rows[0].map((cell) => normalizeText(cell));
      const columnIndex = {
        type: header.findIndex((h) => ['тип', 'type'].includes(h)),
        date: header.findIndex((h) => ['дата', 'date'].includes(h)),
        project: header.findIndex((h) => ['проект', 'project'].includes(h)),
        partner: header.findIndex((h) => ['контрагент', 'partner'].includes(h)),
        category: header.findIndex((h) => ['категория', 'статья', 'category'].includes(h)),
        amount: header.findIndex((h) => ['сумма', 'amount'].includes(h)),
        status: header.findIndex((h) => ['статус', 'status'].includes(h)),
        comment: header.findIndex((h) => ['комментарий', 'описание', 'comment', 'description'].includes(h)),
      };

      if (columnIndex.type < 0 || columnIndex.date < 0 || columnIndex.category < 0 || columnIndex.amount < 0) {
        showToast('Неверный шаблон: нет обязательных колонок', 'error');
        return;
      }

      const importRows: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[] = [];
      const errors: string[] = [];

      rows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2;

        const rawType = row[columnIndex.type];
        const rawDate = row[columnIndex.date];
        const rawCategory = row[columnIndex.category];
        const rawAmount = row[columnIndex.amount];
        const rawProject = columnIndex.project >= 0 ? row[columnIndex.project] : '';
        const rawPartner = columnIndex.partner >= 0 ? row[columnIndex.partner] : '';
        const rawStatus = columnIndex.status >= 0 ? row[columnIndex.status] : '';
        const rawComment = columnIndex.comment >= 0 ? row[columnIndex.comment] : '';

        const isEmptyRow = [rawType, rawDate, rawCategory, rawAmount, rawProject, rawPartner, rawComment]
          .every((cell) => !String(cell ?? '').trim());
        if (isEmptyRow) return;

        const type = parseImportType(rawType);
        const date = parseImportDate(rawDate);
        const amount = parseImportAmount(rawAmount);
        const status = parseImportStatus(rawStatus);
        const categoryId = categoryByName.get(normalizeText(rawCategory));
        const projectText = String(rawProject ?? '').trim();
        const partnerText = String(rawPartner ?? '').trim();
        const commentText = String(rawComment ?? '').trim();

        if (!type) {
          errors.push(`Строка ${rowNumber}: поле "Тип" должно быть "Поступление" или "Оплата".`);
          return;
        }
        if (!date) {
          errors.push(`Строка ${rowNumber}: неверная дата.`);
          return;
        }
        if (!categoryId) {
          errors.push(`Строка ${rowNumber}: категория не найдена в справочнике.`);
          return;
        }
        if (!amount) {
          errors.push(`Строка ${rowNumber}: сумма должна быть больше нуля.`);
          return;
        }

        let projectId = '';
        if (projectText) {
          const foundProjectId = projectByName.get(normalizeText(projectText));
          if (!foundProjectId) {
            errors.push(`Строка ${rowNumber}: проект "${projectText}" не найден.`);
            return;
          }
          projectId = foundProjectId;
        }
        if (isProjectRequiredForCategory(categoryId, categoryMap) && !projectId) {
          errors.push(`Строка ${rowNumber}: для статьи "${categoryMap.get(categoryId) || categoryId}" требуется проект.`);
          return;
        }

        let partnerId = '';
        if (partnerText) {
          const foundPartnerId = partnerByName.get(normalizeText(partnerText));
          if (!foundPartnerId) {
            errors.push(`Строка ${rowNumber}: контрагент "${partnerText}" не найден.`);
            return;
          }
          partnerId = foundPartnerId;
        }

        importRows.push({
          date: Timestamp.fromDate(date),
          amount,
          type,
          status,
          walletId: '',
          partnerId,
          categoryId,
          projectId,
          description: commentText || `${type === 'income' ? 'Поступление' : 'Оплата'}: ${categoryMap.get(categoryId) || ''}`.trim(),
          sourceDoc: `calendar_excel_import:${file.name}`,
          sourceType: 'bank',
        });
      });

      if (importRows.length === 0) {
        showToast(errors[0] || 'Нет валидных строк для импорта', 'error');
        return;
      }

      const result = await financeService.batchImportTransactions(importRows);
      await loadData();

      if (errors.length > 0) {
        console.warn('Ошибки импорта календаря:', errors);
        showToast(`Импортировано: ${result.imported}. Ошибок: ${errors.length}. Проверьте консоль.`, 'warning');
      } else {
        showToast(`Импортировано записей: ${result.imported}`, 'success');
      }
    } catch (error) {
      console.error(error);
      showToast('Ошибка импорта Excel', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyLiveLink = async () => {
    const url = `${window.location.origin}/finance/live`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Ссылка для руководителя скопирована', 'success');
    } catch {
      window.prompt('Скопируйте ссылку:', url);
    }
  };

  const selectedDayPlannedExpenses = useMemo(
    () => selectedDayTransactions.filter((tx) => tx.status === 'plan' && tx.type === 'expense'),
    [selectedDayTransactions]
  );
  const selectedDayPlannedIncome = useMemo(
    () => selectedDayTransactions.filter((tx) => tx.status === 'plan' && tx.type === 'income'),
    [selectedDayTransactions]
  );
  const selectedDayFacts = useMemo(
    () => selectedDayTransactions.filter((tx) => tx.status === 'fact'),
    [selectedDayTransactions]
  );

  if (loading) {
    return <div className="text-gray-500">Загрузка платёжного календаря...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Баннер просроченных плановых платежей */}
      {overduePlannedExpenses.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <span className="text-sm font-medium text-amber-800">
                {overduePlannedExpenses.length} просроченных плановых платежей
              </span>
              <span className="text-sm text-amber-700 ml-2">
                на сумму {formatMoney(overduePlannedExpenses.reduce((s, t) => s + t.amount, 0))} ₸
              </span>
            </div>
          </div>
          <button
            onClick={handleMoveOverdueToToday}
            disabled={movingOverdue}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"
          >
            {movingOverdue ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <MoveRight className="w-4 h-4" />
            )}
            Перенести на сегодня
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold capitalize text-gray-900">
            {format(currentDate, 'LLLL yyyy', { locale: ru })}
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded" title="Предыдущий месяц">
              <ChevronLeft className="w-5 h-5 text-gray-500" />
            </button>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded" title="Следующий месяц">
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Скрыть форму' : 'Новый платёж'}
        </button>
        <button
          onClick={downloadCalendarTemplate}
          className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
        >
          <Download className="w-4 h-4 mr-2" />
          Скачать шаблон Excel
        </button>
        <button
          onClick={() => importInputRef.current?.click()}
          disabled={saving}
          className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400"
        >
          <Upload className="w-4 h-4 mr-2" />
          Импорт из Excel
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImportCalendarFile}
        />
        <button
          onClick={copyLiveLink}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Link2 className="w-4 h-4 mr-2" />
          Ссылка руководителю
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Быстрые шаблоны</h3>
        <div className="flex flex-wrap gap-2">
          {QUICK_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => applyTemplate(template)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm"
            >
              {template.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Режим заполнения</div>
            <div className="text-xs text-gray-500 mt-1">
              В режиме руководителя скрыты лишние поля, статус всегда сохраняется как План.
            </div>
          </div>
          <button
            onClick={() => setIsExecutiveMode((prev) => !prev)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              isExecutiveMode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {isExecutiveMode ? 'Руководитель: ВКЛ' : 'Руководитель: ВЫКЛ'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value as string | FilterValue)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">Все проекты</option>
          {projectTree.map((group) => (
            group.children.length > 0 ? (
              <optgroup key={group.id} label={group.name}>
                {group.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            )
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'plan' | 'fact')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">План + Факт</option>
          <option value="plan">Только план</option>
          <option value="fact">Только факт</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | TransactionType)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">Приход + Расход</option>
          <option value="income">Только приход</option>
          <option value="expense">Только расход</option>
        </select>

        <input
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Поиск: описание, проект, контрагент"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-700 font-medium">План выплат на 7 дней</div>
          <div className="text-lg font-bold text-red-600 mt-1">-{formatMoney(weekPlanSummary.plannedExpense)} ₸</div>
          <div className="text-xs text-gray-500 mt-1">{weekPlanSummary.plannedCount} плановых платежей</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700 font-medium">План поступлений на 7 дней</div>
          <div className="text-lg font-bold text-emerald-600 mt-1">+{formatMoney(weekPlanSummary.plannedIncome)} ₸</div>
          <div className="text-xs text-gray-500 mt-1">С учетом фильтров календаря</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-600 font-medium">Риск и чистый план</div>
          <div className={`text-lg font-bold mt-1 ${weekPlanSummary.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {weekPlanSummary.net >= 0 ? '+' : '-'}{formatMoney(Math.abs(weekPlanSummary.net))} ₸
          </div>
          <div className="text-xs text-red-600 mt-1">Просрочено к оплате: {overduePlannedExpenses.length}</div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Прогноз остатка на 6 месяцев</div>
            <div className="text-xs text-gray-500 mt-1">Основан на текущем плане/факте и стартовом остатке.</div>
          </div>
          <label className="text-sm text-gray-700">
            Стартовый остаток (₸)
            <input
              type="number"
              value={forecastOpeningBalanceInput}
              onChange={(e) => setForecastOpeningBalanceInput(e.target.value)}
              className="mt-1 w-40 px-3 py-2 border border-gray-300 rounded-lg"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Минимальный остаток</div>
            <div className={`mt-1 text-lg font-bold ${sixMonthForecast.minBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {sixMonthForecast.minBalance >= 0 ? '+' : ''}{formatMoney(sixMonthForecast.minBalance)} ₸
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Остаток в конце горизонта</div>
            <div className={`mt-1 text-lg font-bold ${sixMonthForecast.endBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {sixMonthForecast.endBalance >= 0 ? '+' : ''}{formatMoney(sixMonthForecast.endBalance)} ₸
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Дней ниже нуля</div>
            <div className={`mt-1 text-lg font-bold ${sixMonthForecast.negativeDays > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {sixMonthForecast.negativeDays}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Первый кассовый разрыв</div>
            <div className={`mt-1 text-sm font-semibold ${sixMonthForecast.firstGapDate ? 'text-red-600' : 'text-emerald-600'}`}>
              {sixMonthForecast.firstGapDate
                ? format(sixMonthForecast.firstGapDate, 'dd.MM.yyyy')
                : 'Не ожидается'}
            </div>
          </div>
        </div>
        {/* Forecast Chart */}
        {sixMonthForecast.rows.length > 0 && (
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sixMonthForecast.rows.filter((_, i) => i % 3 === 0 || i === sixMonthForecast.rows.length - 1).map(r => ({
                  date: format(r.day, 'dd.MM'),
                  balance: Math.round(r.balance),
                  net: Math.round(r.dayNet),
                }))}
                margin={{ top: 5, right: 20, bottom: 5, left: 20 }}
              >
                <defs>
                  <linearGradient id="forecastPositive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`}
                  width={55}
                />
                <Tooltip
                  formatter={(value) => [`${formatMoney(Number(value))} ₸`, 'Остаток']}
                  labelFormatter={(label) => `Дата: ${String(label)}`}
                />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#10b981"
                  fill="url(#forecastPositive)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-1 pr-2">Дата</th>
                <th className="text-right py-1 px-2">Чистый поток</th>
                <th className="text-right py-1 pl-2">Прогноз остатка</th>
              </tr>
            </thead>
            <tbody>
              {sixMonthForecast.rows
                .filter((row) => row.dayNet !== 0 || row.balance < 0)
                .slice(0, 30)
                .map((row) => (
                  <tr key={format(row.day, 'yyyy-MM-dd')} className={row.balance < 0 ? 'bg-red-50' : ''}>
                    <td className="py-1 pr-2">{format(row.day, 'dd.MM.yyyy')}</td>
                    <td className={`py-1 px-2 text-right ${row.dayNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {row.dayNet >= 0 ? '+' : ''}{formatMoney(row.dayNet)}
                    </td>
                    <td className={`py-1 pl-2 text-right font-semibold ${row.balance >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                      {row.balance >= 0 ? '+' : ''}{formatMoney(row.balance)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Добавить платёж в календарь</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm text-gray-700">
              Дата
              <input
                type="date"
                value={form.date}
                onChange={(e) => setFormField('date', e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
              />
            </label>

            <label className="text-sm text-gray-700">
              Сумма
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setFormField('amount', e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="0"
              />
            </label>

            <label className="text-sm text-gray-700">
              Тип
              <select
                value={form.type}
                onChange={(e) => setFormField('type', e.target.value as TransactionType)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="expense">Расход</option>
                <option value="income">Приход</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-gray-700">
              Статья
              <SearchableSelect
                value={form.categoryId}
                onChange={(value) => setFormField('categoryId', value)}
                options={categoryOptions}
                placeholder="Выберите статью"
                searchPlaceholder="Найти статью..."
                className="mt-1"
              />
            </label>

            <label className="text-sm text-gray-700">
              Проект {projectRequiredForFormCategory ? '*' : ''}
              <SearchableSelect
                value={form.projectId}
                onChange={(value) => setFormField('projectId', value)}
                options={projectOptions}
                placeholder={projectRequiredForFormCategory ? 'Выберите проект' : 'Без проекта'}
                clearLabel="Без проекта"
                searchPlaceholder="Найти проект..."
                className="mt-1"
              />
              {projectRequiredForFormCategory && (
                <span className="text-xs text-amber-700 mt-1 block">Для этой статьи проект обязателен</span>
              )}
            </label>
          </div>

          <div className={`grid grid-cols-1 ${isExecutiveMode ? 'md:grid-cols-1' : 'md:grid-cols-2'} gap-3`}>
            {!isExecutiveMode && (
              <label className="text-sm text-gray-700">
                Контрагент
                <SearchableSelect
                  value={form.partnerId}
                  onChange={(value) => setFormField('partnerId', value)}
                  options={partnerOptions}
                  placeholder="Не указан"
                  clearLabel="Не указан"
                  searchPlaceholder="Найти контрагента..."
                  className="mt-1"
                />
              </label>
            )}

            <label className="text-sm text-gray-700">
              Описание
              <input
                value={form.description}
                onChange={(e) => setFormField('description', e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Например: Аренда офиса"
              />
            </label>
          </div>

          {!isExecutiveMode && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-sm text-gray-700">
                  Статус
                  <select
                    value={form.status}
                    onChange={(e) => setFormField('status', e.target.value as 'plan' | 'fact')}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="plan">План</option>
                    <option value="fact">Факт</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm text-gray-700">
                  Цикл повторения
                  <select
                    value={form.recurrence}
                    onChange={(e) => setFormField('recurrence', e.target.value as RecurrenceFormValue)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="none">Без повторения</option>
                    <option value="weekly">Каждую неделю</option>
                    <option value="monthly">Каждый месяц</option>
                    <option value="yearly">Каждый год</option>
                  </select>
                </label>

                <label className="text-sm text-gray-700">
                  Повторять до
                  <input
                    type="date"
                    value={form.recurrenceUntil}
                    disabled={form.recurrence === 'none'}
                    onChange={(e) => setFormField('recurrenceUntil', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </label>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreatePayment}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              onClick={resetForm}
              type="button"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Сбросить
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-2">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <div key={d} className="text-xs font-semibold text-gray-500 uppercase text-center py-1">
            {d}
          </div>
        ))}

        {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {days.map((day) => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const txs = dayMap[dayStr] || [];
          const planExpense = txs
            .filter((t) => t.status === 'plan' && t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
          const planIncome = txs
            .filter((t) => t.status === 'plan' && t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
          const dayNetPlan = planIncome - planExpense;
          const overdueCount = txs.filter((t) => {
            if (t.status !== 'plan' || t.type !== 'expense') return false;
            const td = new Date();
            td.setHours(0, 0, 0, 0);
            return getPaymentDate(t).toDate() < td;
          }).length;
          const hasPlan = txs.some((t) => t.status === 'plan');
          const hasFact = txs.some((t) => t.status === 'fact');

          return (
            <button
              key={dayStr}
              onClick={() => handleDayClick(day)}
              className={`
                min-h-[110px] p-2 rounded-lg border text-left transition-colors
                ${selectedDay === dayStr ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}
                ${!isSameMonth(day, currentDate) ? 'opacity-40' : ''}
                ${isToday(day) ? 'ring-1 ring-blue-500' : ''}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-sm font-medium ${isToday(day) ? 'text-blue-600' : 'text-gray-700'}`}>
                  {format(day, 'd')}
                </span>
                {txs.length > 0 && (
                  <span className={`text-xs font-semibold ${dayNetPlan >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {dayNetPlan >= 0 ? '+' : '-'}{formatMoney(Math.abs(dayNetPlan))}
                  </span>
                )}
              </div>

              {txs.length > 0 && (
                <div className="mt-1 space-y-1">
                  <div className="text-[11px] text-gray-500">Платежей: {txs.length}</div>
                  {hasPlan && (
                    <div className="text-[10px] text-red-600">
                      К оплате: {formatMoney(planExpense)}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    {hasPlan && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700">План</span>}
                    {hasFact && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">Факт</span>}
                    {overdueCount > 0 && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-700">Просрочка: {overdueCount}</span>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowDetailList((v) => !v)}
            className="text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
          >
            {showDetailList ? 'Скрыть детальные операции' : 'Показать детальные операции'}
          </button>
        </div>
      )}

      {showDayPanel && selectedDay && (
        <div className="fixed inset-0 z-40 bg-black/30">
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Что оплатить: {format(new Date(`${selectedDay}T00:00:00`), 'd MMMM yyyy', { locale: ru })}
                </h3>
                <p className="text-xs text-gray-500">Управленческий срез по выбранному дню</p>
              </div>
              <button
                onClick={() => setShowDayPanel(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
                title="Закрыть"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  Просрочено к оплате: {overduePlannedExpenses.length}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Сумма: {formatMoney(overduePlannedExpenses.reduce((s, t) => s + t.amount, 0))} ₸
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-semibold text-gray-900 mb-2">
                  К оплате сегодня ({selectedDayPlannedExpenses.length})
                </div>
                {selectedDayPlannedExpenses.length === 0 ? (
                  <div className="text-xs text-gray-500">Плановых расходов на день нет</div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayPlannedExpenses.map((tx) => (
                      <div key={tx.id} className="rounded-md border border-gray-200 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm text-gray-800">{tx.description || 'Без описания'}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-red-600">-{formatMoney(tx.amount)}</div>
                            {confirmingTxId !== tx.id && (
                              <button
                                onClick={() => { setConfirmingTxId(tx.id); setConfirmAmount(String(tx.amount)); }}
                                className="p-1 rounded bg-green-100 hover:bg-green-200 text-green-700"
                                title="Провести (план → факт)"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {confirmingTxId === tx.id && (
                          <div className="mt-2 flex items-center gap-2 bg-green-50 rounded p-2">
                            <input
                              type="number"
                              value={confirmAmount}
                              onChange={(e) => setConfirmAmount(e.target.value)}
                              className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
                              placeholder="Сумма"
                            />
                            <button
                              onClick={() => handleConfirmPayment(tx.id)}
                              disabled={saving}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              Провести
                            </button>
                            <button
                              onClick={() => { setConfirmingTxId(null); setConfirmAmount(''); }}
                              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                            >
                              Отмена
                            </button>
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-1 flex gap-2 flex-wrap">
                          <span>{categoryMap.get(tx.categoryId) || tx.categoryId}</span>
                          {tx.projectId && <span>{projectMap.get(tx.projectId) || 'Проект'}</span>}
                          {tx.partnerId && <span>{partnerMap.get(tx.partnerId) || 'Контрагент'}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-semibold text-gray-900 mb-2">
                  План поступлений ({selectedDayPlannedIncome.length})
                </div>
                {selectedDayPlannedIncome.length === 0 ? (
                  <div className="text-xs text-gray-500">Плановых поступлений на день нет</div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayPlannedIncome.map((tx) => (
                      <div key={tx.id} className="rounded-md border border-gray-200 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm text-gray-800">{tx.description || 'Без описания'}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-emerald-600">+{formatMoney(tx.amount)}</div>
                            {confirmingTxId !== tx.id && (
                              <button
                                onClick={() => { setConfirmingTxId(tx.id); setConfirmAmount(String(tx.amount)); }}
                                className="p-1 rounded bg-green-100 hover:bg-green-200 text-green-700"
                                title="Провести (план → факт)"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {confirmingTxId === tx.id && (
                          <div className="mt-2 flex items-center gap-2 bg-green-50 rounded p-2">
                            <input
                              type="number"
                              value={confirmAmount}
                              onChange={(e) => setConfirmAmount(e.target.value)}
                              className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
                              placeholder="Сумма"
                            />
                            <button
                              onClick={() => handleConfirmPayment(tx.id)}
                              disabled={saving}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              Провести
                            </button>
                            <button
                              onClick={() => { setConfirmingTxId(null); setConfirmAmount(''); }}
                              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                            >
                              Отмена
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-semibold text-gray-900 mb-2">
                  Уже проведено (факт): {selectedDayFacts.length}
                </div>
                <div className="text-xs text-gray-600">
                  Сумма факта: {formatMoney(selectedDayFacts.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0))} ₸
                </div>
              </div>

              <button
                onClick={() => {
                  setShowDetailList(true);
                  setShowDayPanel(false);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Открыть детальную таблицу операций
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDay && showDetailList && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">
            Платежи за {format(new Date(`${selectedDay}T00:00:00`), 'd MMMM yyyy', { locale: ru })}
          </h3>

          {selectedDayTransactions.length === 0 ? (
            <div className="text-sm text-gray-500">На эту дату платежей нет</div>
          ) : (
            <div className="space-y-2">
              {selectedDayTransactions.map((tx) => {
                const isEditing = editingTxId === tx.id;

                if (isEditing) {
                  return (
                    <div key={tx.id} className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                          type="date"
                          value={editForm.date}
                          onChange={(e) => setEditFormField('date', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <input
                          type="number"
                          min="0"
                          value={editForm.amount}
                          onChange={(e) => setEditFormField('amount', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Сумма"
                        />
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditFormField('status', e.target.value as 'plan' | 'fact')}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="plan">План</option>
                          <option value="fact">Факт</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <select
                          value={editForm.type}
                          onChange={(e) => setEditFormField('type', e.target.value as TransactionType)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="expense">Расход</option>
                          <option value="income">Приход</option>
                        </select>
                        <SearchableSelect
                          value={editForm.categoryId}
                          onChange={(value) => setEditFormField('categoryId', value)}
                          options={categoryOptions}
                          placeholder="Выберите статью"
                          searchPlaceholder="Найти статью..."
                        />
                        <SearchableSelect
                          value={editForm.projectId}
                          onChange={(value) => setEditFormField('projectId', value)}
                          options={projectOptions}
                          placeholder="Без проекта"
                          clearLabel="Без проекта"
                          searchPlaceholder="Найти проект..."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <SearchableSelect
                          value={editForm.partnerId}
                          onChange={(value) => setEditFormField('partnerId', value)}
                          options={partnerOptions}
                          placeholder="Не указан"
                          clearLabel="Не указан"
                          searchPlaceholder="Найти контрагента..."
                        />
                        <input
                          value={editForm.description}
                          onChange={(e) => setEditFormField('description', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Описание"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdatePayment(tx)}
                          disabled={saving}
                          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:bg-gray-400"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={tx.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-800">{tx.description || 'Без описания'}</div>
                      <div className="flex items-center gap-2">
                        <div className={`text-sm font-semibold ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                        </div>
                        <button
                          onClick={() => startEdit(tx)}
                          className="p-1 rounded hover:bg-slate-100"
                          title="Редактировать"
                        >
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </button>
                        <button
                          onClick={() => handleDeletePayment(tx)}
                          className="p-1 rounded hover:bg-red-50"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-3">
                      <span>{tx.status === 'plan' ? 'План' : 'Факт'}</span>
                      <span>{categoryMap.get(tx.categoryId) || tx.categoryId || 'Без статьи'}</span>
                      {tx.projectId && <span>{projectMap.get(tx.projectId) || 'Проект'}</span>}
                      {tx.partnerId && <span>{partnerMap.get(tx.partnerId) || 'Контрагент'}</span>}
                      {tx.recurrenceRule && <span>Цикл: {recurrenceLabel(tx.recurrenceRule)}</span>}
                    </div>

                    {tx.recurrenceId && (
                      <div className="mt-2">
                        <button
                          onClick={() => handleDeleteSeries(tx)}
                          className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          Удалить всю серию
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
