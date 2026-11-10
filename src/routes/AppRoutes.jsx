import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Login from "../login/Login";
import ProtectedRoute from "./ProtectedRoute";
import Home from "../pages/Home";
import Fatura from "../pages/emissao/Fatura";
import FaturaPlanilha from "../pages/emissao/FaturaPlanilha";
import Individual from "../pages/emissao/Individual";
// import XLSX descontinuado; nova importação será projetada
// import Excel from "../pages/emissao/Excel";
import Consultas from "../pages/Consultas";
import Historico from "../pages/Historico";
import AdminConfigRoute from "./AdminConfigRoute";
import Configuracao from "../pages/configuracao/Configuracao";
import Prestadores from "../pages/configuracao/Prestadores";
import Modelos from "../pages/configuracao/Modelos";
import ModeloDetalhe from "../pages/configuracao/ModeloDetalhe";
import Regras from "../pages/configuracao/Regras";
import Auditoria from "../pages/configuracao/Auditoria";
import MapaEmissao from "../pages/configuracao/MapaEmissao";
import MapaFicha from "../pages/configuracao/MapaFicha";

// Layout principal (com Sidebar e Breadcrumb)
import MainLayout from "../layouts/MainLayout";
import Emitir from "../pages/Emitir";
import NotFound from "../components/NotFound/NotFound";

export const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Rota pública - Login */}
      <Route 
        path="/login" 
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <Login />
        } 
      />

      {/* Rotas protegidas - todas dentro do MainLayout */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {/* Home - raiz */}
        <Route path="/" element={<Fatura />} />
        
        {/* Rotas de emissão */}
        <Route path="/emitir" element={<Emitir />} />
        <Route path="/emitir/fatura" element={<Fatura />} />
        <Route path="/emitir/fatura-planilha" element={<FaturaPlanilha />} />
        <Route path="/emitir/individual" element={<Individual />} />
        {/* import XLSX descontinuado; nova importação será projetada */}
        {/* <Route path="/emitir/excel" element={<Excel />} /> */}
        
        {/* Outras rotas */}
        <Route path="/consultas" element={<Consultas />} />
        <Route path="/historico" element={<Historico />} />

        {/* Configuração dos modelos de emissão (só admin de configuração; decidido pelo backend) */}
        <Route
          path="/configuracao"
          element={
            <AdminConfigRoute>
              <Configuracao />
            </AdminConfigRoute>
          }
        >
          <Route index element={<Navigate to="mapa" replace />} />
          <Route path="mapa" element={<MapaEmissao />}>
            <Route path=":prestadorId/:condicao" element={<MapaFicha />} />
          </Route>
          <Route path="prestadores" element={<Prestadores />} />
          <Route path="modelos" element={<Modelos />} />
          <Route path="modelos/:id" element={<ModeloDetalhe />} />
          <Route path="regras" element={<Regras />} />
          <Route path="auditoria" element={<Auditoria />} />
        </Route>
      </Route>

      {/* Rota 404 - captura tudo que não foi encontrado */}
      <Route path="*" element={<NotFound/>} />
    </Routes>
  );
};