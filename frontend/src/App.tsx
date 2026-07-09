/**
 * Light TMS - Route map.
 *
 * /login is public; everything else is wrapped by ProtectedRoute + AppShell.
 * Business modules currently render Placeholder and are filled in per phase.
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<Shell><Inicio /></Shell>} />
      <Route path="/solicitudes" element={<Shell><SolicitudesList /></Shell>} />
      <Route path="/solicitudes/nueva" element={<Shell><SolicitudForm /></Shell>} />
      <Route path="/solicitudes/:id" element={<Shell><SolicitudDetalle /></Shell>} />
      <Route path="/solicitudes/:id/editar" element={<Shell><SolicitudForm /></Shell>} />
      <Route path="/solicitudes/:id/despachar" element={<Shell><DespachoForm /></Shell>} />
      <Route path="/despachos" element={<Shell><DespachosList /></Shell>} />
      <Route path="/despachos/:manifiestoId/editar" element={<Shell><DespachoForm /></Shell>} />
      <Route path="/cola" element={<Shell><ColaMonitor /></Shell>} />
      <Route path="/cumplido" element={<Shell><CumplidoList /></Shell>} />
      <Route path="/cumplido/:manifiestoId" element={<Shell><CumplidoForm /></Shell>} />
      <Route path="/informe" element={<Shell><InformePage /></Shell>} />
      <Route path="/terceros" element={<Shell><TercerosList /></Shell>} />
      <Route path="/terceros/nuevo" element={<Shell><TerceroForm /></Shell>} />
      <Route path="/terceros/:id/editar" element={<Shell><TerceroForm /></Shell>} />
      <Route path="/vehiculos" element={<Shell><VehiculosList /></Shell>} />
      <Route path="/vehiculos/nuevo" element={<Shell><VehiculoForm /></Shell>} />
      <Route path="/vehiculos/:id/editar" element={<Shell><VehiculoForm /></Shell>} />
      <Route path="/productos" element={<Shell><ProductosList /></Shell>} />
      <Route path="/productos/:codigo/editar" element={<Shell><ProductoForm /></Shell>} />
      <Route path="/empresa" element={<Shell><EmpresaPage /></Shell>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
