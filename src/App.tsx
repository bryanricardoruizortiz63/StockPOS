import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useSession } from './lib/session';
import { isSetUp } from './lib/setup';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/Login';
import { SetupPage } from './pages/Setup';
import { MfaPage } from './pages/Mfa';
import { PosPage } from './pages/Pos';
import { VerifyPage } from './pages/Verify';

const InventoryPage = lazy(() => import('./pages/Inventory'));
const ProductPage = lazy(() => import('./pages/Product'));
const TransferPage = lazy(() => import('./pages/Transfer'));
const ShiftPage = lazy(() => import('./pages/Shift'));
const ShiftsPage = lazy(() => import('./pages/Shifts'));
const PunchPage = lazy(() => import('./pages/Punch'));
const PunchesPage = lazy(() => import('./pages/Punches'));
const KioskPage = lazy(() => import('./pages/Kiosk'));
const MySchedulePage = lazy(() => import('./pages/MySchedule'));
const SchedulesPage = lazy(() => import('./pages/Schedules'));
const PayrollPage = lazy(() => import('./pages/Payroll'));
const EmployeesPage = lazy(() => import('./pages/Employees'));
const DocumentsPage = lazy(() => import('./pages/Documents'));
const CertificationsPage = lazy(() => import('./pages/Certifications'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const StoresPage = lazy(() => import('./pages/Stores'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const OutboxPage = lazy(() => import('./pages/Outbox'));
const NoticesPage = lazy(() => import('./pages/Notices'));

const Spinner = () => <div className="grid min-h-[50dvh] place-items-center text-ink-3"><Loader2 className="size-6 animate-spin" aria-label="Cargando" /></div>;

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useSession();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { ready, user, store, mfaPending } = useSession();
  const loc = useLocation();
  const [setUp, setSetUp] = useState<boolean | null>(null);
  useEffect(() => { isSetUp().then(setSetUp); }, [user]);

  if (loc.pathname === '/verificar' && !user) return <VerifyPage standalone />;
  if (!ready || setUp === null) return <Spinner />;
  if (!setUp) return <SetupPage onDone={() => setSetUp(true)} />;
  if (!user) return <LoginPage />;
  if (mfaPending) return <MfaPage />;
  if (!store) return <div className="p-8 text-center text-ink-2">No tienes tiendas asignadas. Pide al administrador que te asigne una.</div>;

  const A = (el: ReactNode) => <AdminOnly>{el}</AdminOnly>;
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/kiosko" element={A(<KioskPage />)} />
        <Route element={<Shell />}>
          <Route index element={<PosPage />} />
          <Route path="inventario" element={<InventoryPage />} />
          <Route path="inventario/nuevo" element={<ProductPage />} />
          <Route path="inventario/exportar" element={A(<TransferPage />)} />
          <Route path="inventario/:id" element={<ProductPage />} />
          <Route path="turno" element={<ShiftPage />} />
          <Route path="turnos" element={A(<ShiftsPage />)} />
          <Route path="turnos/:id" element={A(<ShiftsPage />)} />
          <Route path="ponchar" element={<PunchPage />} />
          <Route path="ponches" element={A(<PunchesPage />)} />
          <Route path="horario" element={<MySchedulePage />} />
          <Route path="horarios" element={A(<SchedulesPage />)} />
          <Route path="nomina" element={A(<PayrollPage />)} />
          <Route path="empleados" element={A(<EmployeesPage />)} />
          <Route path="documentos" element={<DocumentsPage />} />
          <Route path="certificaciones" element={A(<CertificationsPage />)} />
          <Route path="reportes" element={A(<ReportsPage />)} />
          <Route path="tiendas" element={A(<StoresPage />)} />
          <Route path="configuracion" element={A(<SettingsPage />)} />
          <Route path="salida" element={A(<OutboxPage />)} />
          <Route path="avisos" element={<NoticesPage />} />
          <Route path="verificar" element={<VerifyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
