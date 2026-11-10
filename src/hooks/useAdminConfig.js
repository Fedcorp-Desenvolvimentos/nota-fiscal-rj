import { useAuth } from "../context/AuthContext";

/** true se o backend (GET /api/nfse/config/me/) disse que o usuário é admin de configuração. */
export function useAdminConfig() {
  const { adminConfig, recarregarAdminConfig } = useAuth();
  return { adminConfig: adminConfig === true, recarregar: recarregarAdminConfig };
}
