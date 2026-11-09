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
      </Route>

      {/* Rota 404 - captura tudo que não foi encontrado */}
      <Route path="*" element={<NotFound/>} />
    </Routes>
  );
};