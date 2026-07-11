/**
 * Light TMS - Route map.
 *
 * /login is public; everything else is wrapped by ProtectedRoute + AppShell.
 * Business modules currently render Placeholder and are filled in per phase.
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { useAuthStore, type Pagina } from './store/auth';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import TercerosList from './pages/terceros/TercerosList';
import TerceroForm from './pages/terceros/TerceroForm';
import VehiculosList from './pages/vehiculos/VehiculosList';
import VehiculoForm from './pages/vehiculos/VehiculoForm';
import ProductosList from './pages/productos/ProductosList';
import ProductoForm from './pages/productos/ProductoForm';
import EmpresaPage from './pages/empresa/EmpresaPage';
import SolicitudesList from './pages/solicitudes/SolicitudesList';
import SolicitudForm from './pages/solicitudes/SolicitudForm';
import SolicitudDetalle from './pages/solicitudes/SolicitudDetalle';
import DespachoForm from './pages/despachos/DespachoForm';
import DespachosList from './pages/despachos/DespachosList';
import ColaMonitor from './pages/cola/ColaMonitor';
import CumplidoList from './pages/cumplido/CumplidoList';
import CumplidoForm from './pages/cumplido/CumplidoForm';
import InformePage from './pages/informe/InformePage';
import UsuariosList from './pages/usuarios/UsuariosList';
import UsuarioForm from './pages/usuarios/UsuarioForm';

/** Redirects home if the current user can't access `pagina` (admin always can). */
function PageGuard({ pagina, adminOnly, children }: { pagina?: Pagina; adminOnly?: boolean; children: React.ReactNode }) {
  const canAccess = useAuthStore((s) => s.canAccess);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (pagina && !canAccess(pagina)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Shell({ children, pagina, adminOnly }: { children: React.ReactNode; pagina?: Pagina; adminOnly?: boolean }) {
  return (
    <ProtectedRoute>
      <PageGuard pagina={pagina} adminOnly={adminOnly}>
        <AppShell>{children}</AppShell>
      </PageGuard>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<Shell><Inicio /></Shell>} />
      <Route path="/solicitudes" element={<Shell pagina="solicitudes"><SolicitudesList /></Shell>} />
      <Route path="/solicitudes/nueva" element={<Shell pagina="solicitudes"><SolicitudForm /></Shell>} />
      <Route path="/solicitudes/:id" element={<Shell pagina="solicitudes"><SolicitudDetalle /></Shell>} />
      <Route path="/solicitudes/:id/editar" element={<Shell pagina="solicitudes"><SolicitudForm /></Shell>} />
      <Route path="/solicitudes/:id/despachar" element={<Shell pagina="solicitudes"><DespachoForm /></Shell>} />
      <Route path="/despachos" element={<Shell pagina="despachos"><DespachosList /></Shell>} />
      <Route path="/despachos/:manifiestoId/editar" element={<Shell pagina="despachos"><DespachoForm /></Shell>} />
      <Route path="/cola" element={<Shell pagina="cola"><ColaMonitor /></Shell>} />
      <Route path="/cumplido" element={<Shell pagina="cumplido"><CumplidoList /></Shell>} />
      <Route path="/cumplido/:manifiestoId" element={<Shell pagina="cumplido"><CumplidoForm /></Shell>} />
      <Route path="/informe" element={<Shell pagina="informe"><InformePage /></Shell>} />
      <Route path="/terceros" element={<Shell pagina="terceros"><TercerosList /></Shell>} />
      <Route path="/terceros/nuevo" element={<Shell pagina="terceros"><TerceroForm /></Shell>} />
      <Route path="/terceros/:id/editar" element={<Shell pagina="terceros"><TerceroForm /></Shell>} />
      <Route path="/vehiculos" element={<Shell pagina="vehiculos"><VehiculosList /></Shell>} />
      <Route path="/vehiculos/nuevo" element={<Shell pagina="vehiculos"><VehiculoForm /></Shell>} />
      <Route path="/vehiculos/:id/editar" element={<Shell pagina="vehiculos"><VehiculoForm /></Shell>} />
      <Route path="/productos" element={<Shell pagina="productos"><ProductosList /></Shell>} />
      <Route path="/productos/:codigo/editar" element={<Shell pagina="productos"><ProductoForm /></Shell>} />
      <Route path="/empresa" element={<Shell pagina="empresa"><EmpresaPage /></Shell>} />
      <Route path="/usuarios" element={<Shell adminOnly><UsuariosList /></Shell>} />
      <Route path="/usuarios/nuevo" element={<Shell adminOnly><UsuarioForm /></Shell>} />
      <Route path="/usuarios/:id/editar" element={<Shell adminOnly><UsuarioForm /></Shell>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
