import { Navigate } from "react-router-dom";
import { useAdminConfig } from "../hooks/useAdminConfig";

/** Guarda das rotas /configuracao/*: sem admin_config redireciona para a home. */
export default function AdminConfigRoute({ children }) {
  const { adminConfig } = useAdminConfig();
  if (!adminConfig) return <Navigate to="/" replace />;
  return children;
}
