import { useNavigate } from 'react-router-dom';
import {
    TrendingUp,
    PieChart,
    Scale,
    ArrowDownToLine,
    Target,
    BarChart3,
} from 'lucide-react';

interface ReportCard {
    title: string;
    description: string;
    icon: typeof TrendingUp;
    path: string;
    color: string;
    bgColor: string;
    status: 'ready' | 'coming';
}

const reports: ReportCard[] = [
    {
        title: 'Деньги / Cash Flow',
        description: 'Движение денежных средств по периодам',
        icon: TrendingUp,
        path: '/finance/analytics/cashflow',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        status: 'ready',
    },
    {
        title: 'Прибыль / P&L',
        description: 'Отчёт о прибылях и убытках',
        icon: PieChart,
        path: '/finance/analytics/pnl',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        status: 'ready',
    },
    {
        title: 'Баланс',
        description: 'Балансовый отчёт: Активы = Пассивы',
        icon: Scale,
        path: '/finance/analytics/balance',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        status: 'ready',
    },
    {
        title: 'Дебиторка / Кредиторка',
        description: 'Задолженности: кто нам должен и кому мы должны',
        icon: ArrowDownToLine,
        path: '/finance/analytics/debts',
        color: 'text-teal-600',
        bgColor: 'bg-teal-50',
        status: 'ready',
    },
    {
        title: 'План-Факт',
        description: 'Сравнение бюджета с фактом',
        icon: Target,
        path: '/finance/analytics/planfact',
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        status: 'ready',
    },
    {
        title: 'Финансовые показатели',
        description: 'EBITDA, маржинальность, рентабельность',
        icon: BarChart3,
        path: '/finance/analytics/financials',
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50',
        status: 'ready',
    },
];

export function AnalyticsHub() {
    const navigate = useNavigate();

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-xl font-bold text-gray-900">Аналитика</h1>
                <p className="text-sm text-gray-500 mt-1">Финансовые отчёты и аналитика</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {reports.map((report) => {
                    const Icon = report.icon;
                    return (
                        <button
                            key={report.title}
                            onClick={() => {
                                if (report.status === 'ready') {
                                    navigate(report.path);
                                }
                            }}
                            disabled={report.status === 'coming'}
                            className={`
                                relative text-left p-5 bg-white rounded-xl border border-gray-200
                                transition-all duration-200 group
                                ${report.status === 'ready'
                                    ? 'hover:shadow-md hover:border-gray-300 cursor-pointer'
                                    : 'opacity-60 cursor-not-allowed'
                                }
                            `}
                        >
                            {report.status === 'coming' && (
                                <span className="absolute top-3 right-3 text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                    скоро
                                </span>
                            )}
                            <div className={`w-10 h-10 rounded-lg ${report.bgColor} flex items-center justify-center mb-3`}>
                                <Icon className={`w-5 h-5 ${report.color}`} />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">
                                {report.title}
                            </h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                {report.description}
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
