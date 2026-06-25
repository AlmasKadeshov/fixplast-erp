import { useEffect, useMemo, useState } from 'react';
import { addDays, endOfMonth, format, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Wallet, ArrowDownCircle, ArrowUpCircle, CalendarClock, Link2, AlertTriangle, TrendingUp } from 'lucide-react';
import { db } from '../../config/firebase';
import { Transaction } from '../../models/finance';
import { Project } from '../../models';
import { projectsService } from '../../services/projects.service';
import { MetricCard } from '../../components/finance/MetricCard';
import { formatMoney } from '../../utils/formatters';

export function LiveFinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribed = false;
    projectsService.getAll()
      .then((data) => {
        if (!unsubscribed) setProjects(data);
      })
      .catch(console.error);

    const txQuery = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(
      txQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.date,
            amount: Math.abs(data.amount || 0),
            type: data.type || 'expense',
            status: data.status || 'plan',
            walletId: data.walletId || '',
            partnerId: data.partnerId || '',
            categoryId: data.categoryId || '',
            projectId: data.projectId || '',
            description: data.description || '',
            sourceDoc: data.sourceDoc || '',
            sourceType: data.sourceType || 'bank',
            createdAt: data.createdAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || new Date(),
          } as Transaction;
        });
        setTransactions(rows);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, []);

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => map.set(project.id, project.name));
    return map;
  }, [projects]);

  const monthBounds = useMemo(() => {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, []);

  const monthSummary = useMemo(() => {
    let plannedIncome = 0;
    let plannedExpense = 0;
    let factIncome = 0;
    let factExpense = 0;

    for (const tx of transactions) {
      const txDate = tx.date.toDate();
      if (txDate < monthBounds.start || txDate > monthBounds.end) continue;

      if (tx.status === 'plan') {
        if (tx.type === 'income') plannedIncome += tx.amount;
        else plannedExpense += tx.amount;
      } else {
        if (tx.type === 'income') factIncome += tx.amount;
        else factExpense += tx.amount;
      }
    }

    return {
      plannedIncome,
      plannedExpense,
      plannedNet: plannedIncome - plannedExpense,
      factIncome,
      factExpense,
      factNet: factIncome - factExpense,
    };
  }, [transactions, monthBounds]);

  const overduePlanned = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return transactions.filter(
      (tx) => tx.status === 'plan' && tx.date.toDate() < now
    );
  }, [transactions]);

  const overdueTotalAmount = useMemo(
    () => overduePlanned.reduce((s, t) => s + t.amount, 0),
    [overduePlanned]
  );

  const upcomingPayments = useMemo(() => {
    const now = new Date();
    const limit = addDays(now, 21);
    return transactions
      .filter((tx) => tx.status === 'plan')
      .filter((tx) => {
        const txDate = tx.date.toDate();
        return txDate >= now && txDate <= limit;
      })
      .sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime())
      .slice(0, 20);
  }, [transactions]);

  const copyLink = async () => {
    const url = `${window.location.origin}/finance/live`;
    try {
      await navigator.clipboard.writeText(url);
      window.alert('Ссылка скопирована');
    } catch {
      window.prompt('Скопируйте ссылку:', url);
    }
  };

  if (loading) {
    return <div className="text-gray-500">Загрузка live-данных...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live: Календарь и Бюджет</h1>
          <p className="text-sm text-gray-500">Данные обновляются в реальном времени</p>
        </div>
        <button
          onClick={copyLink}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Link2 className="w-4 h-4 mr-2" />
          Скопировать ссылку
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard title="План поступлений (месяц)" value={`+${formatMoney(monthSummary.plannedIncome)} ₸`} color="emerald" />
        <MetricCard title="План оплат (месяц)" value={`-${formatMoney(monthSummary.plannedExpense)} ₸`} color="red" />
        <MetricCard title="Факт поступлений (месяц)" value={`+${formatMoney(monthSummary.factIncome)} ₸`} color="blue" />
        <MetricCard title="Факт оплат (месяц)" value={`-${formatMoney(monthSummary.factExpense)} ₸`} color="slate" />
      </div>

      {/* Overdue + Net position */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {overduePlanned.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              Просроченные плановые платежи
            </div>
            <div className="mt-1 text-xl font-bold text-amber-700">{overduePlanned.length} шт.</div>
            <div className="text-xs text-amber-600 mt-1">На сумму: {formatMoney(overdueTotalAmount)} ₸</div>
          </div>
        )}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center gap-2 text-indigo-700 text-sm font-medium">
            <TrendingUp className="w-4 h-4" />
            Чистая позиция (план vs факт)
          </div>
          <div className={`mt-1 text-xl font-bold ${monthSummary.factNet >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {monthSummary.factNet >= 0 ? '+' : ''}{formatMoney(monthSummary.factNet)} ₸
          </div>
          <div className="text-xs text-indigo-600 mt-1">
            План: {monthSummary.plannedNet >= 0 ? '+' : ''}{formatMoney(monthSummary.plannedNet)} ₸
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-blue-600" />
          Ближайшие плановые операции (21 день)
        </h2>

        {upcomingPayments.length === 0 ? (
          <div className="text-sm text-gray-500">Плановых операций на ближайшие 21 день нет</div>
        ) : (
          <div className="space-y-2">
            {upcomingPayments.map((tx) => (
              <div key={tx.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{tx.description || 'Без описания'}</div>
                  <div className="text-xs text-gray-500">
                    {format(tx.date.toDate(), 'dd.MM.yyyy', { locale: ru })}
                    {' · '}
                    {projectMap.get(tx.projectId) || 'Без проекта'}
                  </div>
                </div>
                <div className={`text-sm font-semibold ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'} flex items-center gap-1`}>
                  {tx.type === 'income' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                  {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)} ₸
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          Ссылка предназначена для руководителя. Доступ регулируется правами пользователя.
        </div>
      </div>
    </div>
  );
}
