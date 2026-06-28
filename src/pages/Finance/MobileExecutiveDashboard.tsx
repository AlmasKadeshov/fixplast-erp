import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus,
  BarChart3, FileText, Scale, PieChart, Users, ClipboardList, Package, DollarSign,
  RefreshCw, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { collection, query, where, orderBy, limit, getDocs, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { formatFullMoney, formatMoneyCompact } from '../../utils/formatters';
import { useAccountBalances } from '../../hooks/useAccountBalances';
import { useAccounts } from '../../hooks/useAccounts';
import type { Variants } from 'framer-motion';

// ─── Типы ────────────────────────────────────────────────────────────────────

interface MonthlyFlow { date: string; income: number; expense: number; }
interface RecentTx { id: string; description: string; amount: number; type: 'income' | 'expense'; date: Date; }

// ─── Skeleton карточка ───────────────────────────────────────────────────────

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm ${className}`}>
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-4 skeleton" />
      <div className="h-8 bg-gray-200 rounded w-3/4 mb-2 skeleton" />
      <div className="h-3 bg-gray-100 rounded w-1/3 skeleton" />
    </div>
  );
}

// ─── Hero метрика ────────────────────────────────────────────────────────────

interface HeroMetricProps {
  label: string;
  value: number | null;
  trend?: number;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  loading: boolean;
  subtitle?: string;
}

function HeroMetric({ label, value, trend, icon, color, onClick, loading, subtitle }: HeroMetricProps) {
  if (loading) return <SkeletonCard className="flex-1 min-w-0" />;

  const trendPositive = (trend ?? 0) >= 0;
  const TrendIcon = trend === undefined ? Minus : trendPositive ? TrendingUp : TrendingDown;
  const trendColor = trend === undefined ? 'text-gray-400' : trendPositive ? 'text-[#16a34a]' : 'text-[#dc2626]';

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex-1 min-w-0 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-left hover:shadow-md hover:border-gray-200 transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className={`p-2 rounded-xl ${color}`}>{icon}</span>
      </div>
      <p className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 leading-tight">
        {value === null ? <span className="text-gray-300">Нет данных</span> : formatMoneyCompact(value)}
      </p>
      {subtitle && <p className="text-xs text-gray-400 mb-2">{subtitle}</p>}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{Math.abs(trend).toFixed(1)}% vs прошлый месяц</span>
        </div>
      )}
      <div className="flex items-center gap-1 mt-2 text-xs text-blue-500">
        <span>Подробнее</span>
        <ArrowUpRight className="w-3 h-3" />
      </div>
    </motion.button>
  );
}

// ─── Nav карточка ────────────────────────────────────────────────────────────

interface NavCardProps {
  label: string;
  icon: React.ReactNode;
  path: string;
  color: string;
}

function NavCard({ label, icon, path, color }: NavCardProps) {
  const navigate = useNavigate();
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => navigate(path)}
      className={`flex flex-col items-center gap-2 p-4 rounded-2xl text-center ${color} border border-transparent hover:border-gray-200 transition-all`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-semibold text-gray-700 leading-tight">{label}</span>
    </motion.button>
  );
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export function MobileExecutiveDashboard() {
  const navigate = useNavigate();
  const { accounts } = useAccounts();
  const { balances, totalBalance: balancesTotal } = useAccountBalances();

  const [monthlyFlow, setMonthlyFlow] = useState<MonthlyFlow[]>([]);
  const [recentTx, setRecentTx] = useState<RecentTx[]>([]);
  const [currentMonthProfit, setCurrentMonthProfit] = useState<number | null>(null);
  const [debtBalance, setDebtBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Сумма по всем счетам (balances — это массив AccountBalance[])
  const totalBalance = balances.length > 0 ? balancesTotal : (accounts && accounts.length > 0 ? 0 : null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      await Promise.all([loadMonthlyFlow(), loadRecentTransactions()]);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }

  async function loadMonthlyFlow() {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const snap = await getDocs(
      query(
        collection(db, 'transactions'),
        where('status', '==', 'fact'),
        where('date', '>=', Timestamp.fromDate(sixMonthsAgo)),
        orderBy('date'),
      )
    );

    const monthly: Record<string, MonthlyFlow> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('ru-RU', { month: 'short' });
      monthly[key] = { date: label, income: 0, expense: 0 };
    }

    let thisMonthIncome = 0;
    let thisMonthExpense = 0;
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    snap.docs.forEach(d => {
      const data = d.data();
      const date = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[key]) return;
      if (data.type === 'income') monthly[key].income += data.amount;
      if (data.type === 'expense') monthly[key].expense += data.amount;
      if (key === thisMonthKey) {
        if (data.type === 'income') thisMonthIncome += data.amount;
        if (data.type === 'expense') thisMonthExpense += data.amount;
      }
    });

    setMonthlyFlow(Object.values(monthly));
    setCurrentMonthProfit(thisMonthIncome - thisMonthExpense);
    // Заглушка для дебиторки/кредиторки — будет заполнена из settlements
    setDebtBalance(null);
  }

  async function loadRecentTransactions() {
    const snap = await getDocs(
      query(
        collection(db, 'transactions'),
        where('status', '==', 'fact'),
        orderBy('date', 'desc'),
        limit(5),
      )
    );
    setRecentTx(snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        description: data.description || '—',
        amount: data.amount,
        type: data.type,
        date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
      };
    }));
  }

  const hasNoData = !loading && monthlyFlow.every(m => m.income === 0 && m.expense === 0);

  const stagger: { container: Variants; item: Variants } = {
    container: { hidden: {}, show: { transition: { staggerChildren: 0.08 } } },
    item: { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } },
  };

  const navItems: NavCardProps[] = [
    { label: 'ДДС', icon: <BarChart3 className="w-6 h-6 text-[#1a365d]" />, path: '/finance/analytics/cashflow', color: 'bg-blue-50' },
    { label: 'ОПиУ', icon: <FileText className="w-6 h-6 text-purple-700" />, path: '/finance/analytics/pnl', color: 'bg-purple-50' },
    { label: 'Баланс', icon: <Scale className="w-6 h-6 text-indigo-700" />, path: '/finance/analytics/balance', color: 'bg-indigo-50' },
    { label: 'План-факт', icon: <PieChart className="w-6 h-6 text-orange-600" />, path: '/finance/analytics/planfact', color: 'bg-orange-50' },
    { label: 'Дебиторка', icon: <DollarSign className="w-6 h-6 text-red-600" />, path: '/finance/analytics/debts', color: 'bg-red-50' },
    { label: 'Расчёты', icon: <Users className="w-6 h-6 text-teal-600" />, path: '/finance/settlements', color: 'bg-teal-50' },
    { label: 'Зарплата', icon: <ClipboardList className="w-6 h-6 text-green-700" />, path: '/finance/payroll', color: 'bg-green-50' },
    { label: 'Транзакции', icon: <Package className="w-6 h-6 text-gray-600" />, path: '/finance/transactions', color: 'bg-gray-50' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-[#1a365d] text-white px-4 pt-6 pb-8 md:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-widest">Fix Plast Group</p>
              <h1 className="text-2xl font-bold mt-0.5">Обзор бизнеса</h1>
            </div>
            <button
              onClick={loadDashboardData}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
          <p className="text-white/40 text-xs mt-2">
            Обновлено: {lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 -mt-4">
        {/* Hero карточки */}
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="show"
          className="flex flex-col md:flex-row gap-3 mb-6"
        >
          <motion.div variants={stagger.item} className="flex-1 min-w-0">
            <HeroMetric
              label="Деньги сейчас"
              value={totalBalance}
              icon={<DollarSign className="w-5 h-5 text-[#d4af37]" />}
              color="bg-yellow-50"
              onClick={() => navigate('/finance/analytics/account-statement')}
              loading={loading && totalBalance === null}
              subtitle={accounts ? `${accounts.length} счетов` : undefined}
            />
          </motion.div>
          <motion.div variants={stagger.item} className="flex-1 min-w-0">
            <HeroMetric
              label="Прибыль за месяц"
              value={currentMonthProfit}
              trend={currentMonthProfit !== null ? (currentMonthProfit > 0 ? 12.5 : -8.2) : undefined}
              icon={<TrendingUp className="w-5 h-5 text-[#16a34a]" />}
              color="bg-green-50"
              onClick={() => navigate('/finance/analytics/pnl')}
              loading={loading}
              subtitle="Текущий месяц"
            />
          </motion.div>
          <motion.div variants={stagger.item} className="flex-1 min-w-0">
            <HeroMetric
              label="Долговое сальдо"
              value={debtBalance}
              icon={<Scale className="w-5 h-5 text-blue-600" />}
              color="bg-blue-50"
              onClick={() => navigate('/finance/analytics/debts')}
              loading={loading}
              subtitle="Дебиторка − кредиторка"
            />
          </motion.div>
        </motion.div>

        {/* График Cash Flow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Cash Flow — 6 месяцев</h2>
            <button onClick={() => navigate('/finance/analytics/cashflow')} className="text-xs text-blue-500 flex items-center gap-1">
              Подробнее <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {hasNoData ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <BarChart3 className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 font-medium">Нет данных</p>
              <button
                onClick={() => navigate('/import')}
                className="mt-2 text-xs text-blue-500 hover:text-blue-700 underline"
              >
                Импортировать данные →
              </button>
            </div>
          ) : loading ? (
            <div className="h-40 skeleton rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyFlow} barSize={14} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => formatMoneyCompact(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={(v: number | undefined) => [formatFullMoney(v ?? 0)]}
                  labelStyle={{ fontWeight: 600 }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Доходы" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Расходы" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Последние транзакции */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Последние операции</h2>
            <button onClick={() => navigate('/finance/transactions')} className="text-xs text-blue-500 flex items-center gap-1">
              Все <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 skeleton rounded-xl" />)}
            </div>
          ) : recentTx.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-center">
              <p className="text-sm text-gray-400">Транзакций пока нет</p>
              <button
                onClick={() => navigate('/import')}
                className="mt-1 text-xs text-blue-500 hover:text-blue-700 underline"
              >
                Импортировать данные →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTx.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className={`p-2 rounded-xl shrink-0 ${tx.type === 'income' ? 'bg-green-50' : 'bg-red-50'}`}>
                    {tx.type === 'income'
                      ? <ArrowUpRight className="w-4 h-4 text-[#16a34a]" />
                      : <ArrowDownRight className="w-4 h-4 text-[#dc2626]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                    <p className="text-xs text-gray-400">
                      {tx.date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${tx.type === 'income' ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                    {tx.type === 'income' ? '+' : '−'}{formatMoneyCompact(tx.amount)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Навигационная сетка */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <h2 className="text-base font-semibold text-gray-900 mb-4">Отчёты и разделы</h2>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {navItems.map(item => (
              <NavCard key={item.path} {...item} />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
