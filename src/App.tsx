import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout';
import { ToastProvider } from './components/ui';
import { AuthProvider } from './contexts';
import { ProtectedRoute } from './components/auth';

// Lazy load pages for better performance
const Employees = lazy(() => import('./pages/Employees').then(m => ({ default: m.Employees })));
const Projects = lazy(() => import('./pages/Projects').then(m => ({ default: m.Projects })));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail').then(m => ({ default: m.ProjectDetail })));
const ProjectDocuments = lazy(() => import('./pages/ProjectDocuments').then(m => ({ default: m.ProjectDocuments })));
const Gantt = lazy(() => import('./pages/Gantt').then(m => ({ default: m.Gantt })));
const StandupDashboard = lazy(() => import('./pages/StandupDashboard').then(m => ({ default: m.StandupDashboard })));
const Attendance = lazy(() => import('./pages/Attendance').then(m => ({ default: m.Attendance })));
const QRGenerator = lazy(() => import('./pages/QRGenerator').then(m => ({ default: m.QRGenerator })));
const VDC = lazy(() => import('./pages/VDC').then(m => ({ default: m.VDC })));
const PriceAnalysis = lazy(() => import('./pages/PriceAnalysis').then(m => ({ default: m.PriceAnalysis })));
const ProjectEstimate = lazy(() => import('./pages/PriceAnalysis/ProjectEstimate').then(m => ({ default: m.ProjectEstimate })));
const FinanceLayout = lazy(() => import('./pages/Finance/FinanceLayout').then(m => ({ default: m.FinanceLayout })));
const MobileExecutiveDashboard = lazy(() => import('./pages/Finance/MobileExecutiveDashboard').then(m => ({ default: m.MobileExecutiveDashboard })));
const ImportPage = lazy(() => import('./pages/Import/ImportPage').then(m => ({ default: m.ImportPage })));
const CashflowPage = lazy(() => import('./pages/Finance/CashflowPage').then(m => ({ default: m.CashflowPage })));
const PnLPage = lazy(() => import('./pages/Finance/PnLPage').then(m => ({ default: m.PnLPage })));
const TransactionsPage = lazy(() => import('./pages/Finance/TransactionsPage').then(m => ({ default: m.TransactionsPage })));
const FinanceDashboard = lazy(() => import('./pages/Finance/FinanceDashboard').then(m => ({ default: m.FinanceDashboard })));
const LiveFinancePage = lazy(() => import('./pages/Finance/LiveFinancePage').then(m => ({ default: m.LiveFinancePage })));
const CostItemsPage = lazy(() => import('./pages/Finance/CostItemsPage').then(m => ({ default: m.CostItemsPage })));
const PartnersPage = lazy(() => import('./pages/Finance/PartnersPage').then(m => ({ default: m.PartnersPage })));
const PayrollPage = lazy(() => import('./pages/Finance/PayrollPage').then(m => ({ default: m.PayrollPage })));
const PlanningPage = lazy(() => import('./pages/Finance/PlanningPage').then(m => ({ default: m.PlanningPage })));
const CalendarPage = lazy(() => import('./pages/Finance/CalendarPage').then(m => ({ default: m.CalendarPage })));
const ReconcilePage = lazy(() => import('./pages/Finance/ReconcilePage').then(m => ({ default: m.ReconcilePage })));
const FounderExpensesPage = lazy(() => import('./pages/Finance/FounderExpensesPage').then(m => ({ default: m.FounderExpensesPage })));
const SettlementsPage = lazy(() => import('./pages/Finance/SettlementsPage').then(m => ({ default: m.SettlementsPage })));
const AutoRulesPage = lazy(() => import('./pages/Finance/AutoRulesPage').then(m => ({ default: m.AutoRulesPage })));
const AnalyticsHub = lazy(() => import('./pages/Finance/AnalyticsHub').then(m => ({ default: m.AnalyticsHub })));
const BalancePage = lazy(() => import('./pages/Finance/BalancePage').then(m => ({ default: m.BalancePage })));
const ProjectsReportPage = lazy(() => import('./pages/Finance/ProjectsReportPage').then(m => ({ default: m.ProjectsReportPage })));
const AccountStatementPage = lazy(() => import('./pages/Finance/AccountStatementPage').then(m => ({ default: m.AccountStatementPage })));
const FinancialsPage = lazy(() => import('./pages/Finance/FinancialsPage').then(m => ({ default: m.FinancialsPage })));
const PlanFactPage = lazy(() => import('./pages/Finance/PlanFactPage').then(m => ({ default: m.PlanFactPage })));
const DebtsReportPage = lazy(() => import('./pages/Finance/DebtsReportPage').then(m => ({ default: m.DebtsReportPage })));
const DirectoriesLayout = lazy(() => import('./pages/Directories/DirectoriesLayout').then(m => ({ default: m.DirectoriesLayout })));
const SupplierKPForm = lazy(() => import('./pages/SupplierKPForm'));
const AdminMigration = lazy(() => import('./pages/AdminMigration').then(m => ({ default: m.AdminMigration })));
const Login = lazy(() => import('./pages/Login'));

// PWA pages - separate chunks for mobile
const Checkin = lazy(() => import('./pages/Checkin').then(m => ({ default: m.Checkin })));
const InvoiceReceive = lazy(() => import('./pages/InvoiceReceive').then(m => ({ default: m.InvoiceReceive })));

// Minimal loading spinner for PWA
function PWALoader() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Loading for main app
function AppLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Страница логина - без защиты */}
            <Route
              path="/login"
              element={
                <Suspense fallback={<AppLoader />}>
                  <Login />
                </Suspense>
              }
            />

            {/* Публичная форма для поставщика - без защиты */}
            <Route
              path="/kp/:token"
              element={
                <Suspense fallback={<AppLoader />}>
                  <SupplierKPForm />
                </Suspense>
              }
            />

            {/* Подотчёт учредителя - доступ по ссылке с токеном */}
            <Route
              path="/founder/:token"
              element={
                <Suspense fallback={<PWALoader />}>
                  <FounderExpensesPage />
                </Suspense>
              }
            />
            <Route
              path="/founder"
              element={
                <Suspense fallback={<PWALoader />}>
                  <FounderExpensesPage />
                </Suspense>
              }
            />

            {/* PWA страницы - защищённые */}
            <Route
              path="/checkin"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PWALoader />}>
                    <Checkin />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoice-receive"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PWALoader />}>
                    <InvoiceReceive />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Основное приложение с Layout - защищённое */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <Suspense fallback={<AppLoader />}>
                    <MobileExecutiveDashboard />
                  </Suspense>
                }
              />
              <Route
                path="import"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <ImportPage />
                  </Suspense>
                }
              />
              <Route
                path="projects"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <Projects />
                  </Suspense>
                }
              />
              <Route
                path="projects/:id"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <ProjectDetail />
                  </Suspense>
                }
              />
              <Route
                path="project-documents"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <ProjectDocuments />
                  </Suspense>
                }
              />
              <Route
                path="gantt"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <Gantt />
                  </Suspense>
                }
              />
              <Route
                path="standup"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <StandupDashboard />
                  </Suspense>
                }
              />
              <Route
                path="finance"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <FinanceLayout />
                  </Suspense>
                }
              >
                <Route index element={
                  <Suspense fallback={<AppLoader />}>
                    <FinanceDashboard />
                  </Suspense>
                } />
                <Route
                  path="import"
                  element={<Navigate to="/import" replace />}
                />
                <Route
                  path="planning"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <PlanningPage />
                    </Suspense>
                  }
                />
                <Route
                  path="calendar"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <CalendarPage />
                    </Suspense>
                  }
                />
                <Route
                  path="live"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <LiveFinancePage />
                    </Suspense>
                  }
                />
                <Route
                  path="cashflow"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <CashflowPage />
                    </Suspense>
                  }
                />
                <Route
                  path="pnl"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <PnLPage />
                    </Suspense>
                  }
                />
                {/* Хаб аналитики */}
                <Route
                  path="analytics"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <AnalyticsHub />
                    </Suspense>
                  }
                />
                {/* Аналитика — вложенные маршруты (под analytics/) */}
                <Route
                  path="analytics/cashflow"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <CashflowPage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/pnl"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <PnLPage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/balance"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <BalancePage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/projects"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <ProjectsReportPage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/account-statement"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <AccountStatementPage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/financials"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <FinancialsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/planfact"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <PlanFactPage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/debts"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <DebtsReportPage />
                    </Suspense>
                  }
                />
                <Route
                  path="transactions"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <TransactionsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="cost-items"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <CostItemsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="partners"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <PartnersPage />
                    </Suspense>
                  }
                />
                <Route
                  path="payroll"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <PayrollPage />
                    </Suspense>
                  }
                />
                <Route
                  path="reconcile"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <ReconcilePage />
                    </Suspense>
                  }
                />
                <Route
                  path="settlements"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <SettlementsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="auto-rules"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <AutoRulesPage />
                    </Suspense>
                  }
                />
              </Route>
              <Route
                path="employees"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <Employees />
                  </Suspense>
                }
              />
              <Route
                path="timesheet"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <Attendance />
                  </Suspense>
                }
              />
              <Route
                path="qr-codes"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <QRGenerator />
                  </Suspense>
                }
              />
              <Route
                path="supply"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <VDC />
                  </Suspense>
                }
              />
              <Route
                path="price-analysis"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <PriceAnalysis />
                  </Suspense>
                }
              />
              <Route
                path="price-analysis/:estimateId/*"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <ProjectEstimate />
                  </Suspense>
                }
              />
              <Route
                path="admin/migration"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <AdminMigration />
                  </Suspense>
                }
              />

              {/* Справочники */}
              <Route
                path="directories"
                element={
                  <Suspense fallback={<AppLoader />}>
                    <DirectoriesLayout />
                  </Suspense>
                }
              >
                <Route index element={
                  <Suspense fallback={<AppLoader />}>
                    <PartnersPage />
                  </Suspense>
                } />
                <Route
                  path="partners"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <PartnersPage />
                    </Suspense>
                  }
                />
                <Route
                  path="cost-items"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <CostItemsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="wallets"
                  element={
                    <Suspense fallback={<AppLoader />}>
                      <div className="p-8 text-center text-gray-500">Кошельки / Счета (в разработке)</div>
                    </Suspense>
                  }
                />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
