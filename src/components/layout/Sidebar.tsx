import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet,
  Building2,
  X,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import { useAuth, hasAccessToModule } from '../../contexts/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const allNavItems = [
  { path: '/finance', label: 'Финансы', icon: Wallet },
  { path: '/directories', label: 'Справочники', icon: BookOpen },
  // Временно скрыты на время разработки Finance v2.0
  // { path: '/projects', label: 'Проекты', icon: FolderKanban },
  // { path: '/project-documents', label: 'Реестр документов', icon: ClipboardList },
  // { path: '/price-analysis', label: 'Ценовой анализ', icon: Calculator },
  // { path: '/supply', label: 'Снабжение', icon: Package },
  // { path: '/employees', label: 'Сотрудники', icon: Users },
  // { path: '/timesheet', label: 'Табель', icon: Clock },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { appUser } = useAuth();

  // Фильтруем модули по роли пользователя
  const navItems = allNavItems.filter(item => {
    if (!appUser) return false;
    return hasAccessToModule(appUser.role, item.path);
  });

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-screen w-[260px] min-w-[260px] max-w-[260px]
          bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800
          text-white
          flex flex-col overflow-hidden
          transition-transform duration-300 ease-out
          lg:translate-x-0 lg:sticky lg:z-auto
          shadow-2xl lg:shadow-none
          border-r border-slate-700/50
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Construction Group</h1>
              <p className="text-xs text-white/50">ERP System</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
              const Icon = item.icon;

              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={() => onClose()}
                    className="block"
                  >
                    <motion.div
                      whileHover={{ scale: 1.02, x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-xl
                        transition-all duration-200
                        ${isActive
                          ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/30 text-white shadow-lg border border-blue-500/30'
                          : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }
                      `}
                    >
                      <div className={`
                        p-1.5 rounded-lg
                        ${isActive
                          ? 'bg-blue-500/20 shadow-inner'
                          : 'bg-transparent'
                        }
                      `}>
                        <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
                      </div>
                      <span className="font-medium">{item.label}</span>
                      {isActive && (
                        <ChevronRight className="w-4 h-4 ml-auto text-blue-400" />
                      )}
                    </motion.div>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User profile */}
        <div className="p-4 pb-6 border-t border-white/10 flex-shrink-0">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 cursor-pointer border border-slate-600/50"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-semibold flex-shrink-0 shadow-lg">
              {appUser?.displayName?.charAt(0) || 'А'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate text-white">{appUser?.displayName || 'Пользователь'}</p>
              <p className="text-xs text-white/50 truncate">{appUser?.role || 'Роль'}</p>
            </div>
          </motion.div>
        </div>
      </aside>
    </>
  );
}
