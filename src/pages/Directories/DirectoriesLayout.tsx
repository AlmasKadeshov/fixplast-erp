import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Users, Tags, Wallet } from 'lucide-react';
import { cn } from '../../utils/cn';

export function DirectoriesLayout() {
    const navigate = useNavigate();
    const location = useLocation();

    const tabs = [
        {
            id: 'partners',
            label: 'Контрагенты',
            icon: Users,
            path: '/directories/partners',
        },
        {
            id: 'cost-items',
            label: 'Статьи затрат',
            icon: Tags,
            path: '/directories/cost-items',
        },
        {
            id: 'wallets',
            label: 'Кошельки / Счета',
            icon: Wallet,
            path: '/directories/wallets',
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Справочники</h1>
            </div>

            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = location.pathname === tab.path;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => navigate(tab.path)}
                                className={cn(
                                    isActive
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                                    'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors'
                                )}
                            >
                                <Icon
                                    className={cn(
                                        isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
                                        '-ml-0.5 mr-2 h-5 w-5'
                                    )}
                                />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div className="min-h-[600px]">
                <Outlet />
            </div>
        </div>
    );
}
