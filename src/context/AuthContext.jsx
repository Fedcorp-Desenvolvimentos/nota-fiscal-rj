import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useMemo,
    useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { configService } from "../services/config";
import Loading from "../components/Loading/Loading";

const AuthContext = createContext(null);

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>.");
    return ctx;
};

const ACCESS_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    // Permissão da página Configuração (modelos de emissão), decidida pelo backend.
    const [adminConfig, setAdminConfig] = useState(false);

    // Consulta GET /api/nfse/config/me/ uma vez por sessão; qualquer falha = sem acesso.
    const carregarAdminConfig = useCallback(async () => {
        try {
            const me = await configService.me();
            setAdminConfig(me?.admin_config === true);
        } catch {
            setAdminConfig(false);
        }
    }, []);

    // Função central para limpar credenciais e redirecionar
const logout = useCallback(() => {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setUser(null);
        setIsAuthenticated(false);
        setAdminConfig(false);
        setLoading(false);
        // O redirecionamento será feito automaticamente pelo ProtectedRoute
        // ao detectar que isAuthenticated é false.
    }, []);

    // Função para buscar dados do usuário e validar estado
    const hydrateUser = useCallback(async () => {
        try {
            const userData = await authService.getMe();
            await carregarAdminConfig();
            setUser(userData);
            setIsAuthenticated(true);
        } catch (error) {
            console.error("Erro ao validar sessão:", error);
            logout();
        } finally {
            setLoading(false);
        }
    }, [logout, carregarAdminConfig]);

    const login = useCallback(async (credentials) => {
        setLoading(true);
        try {
            const data = await authService.login(credentials);
            
            // SimpleJWT geralmente retorna 'access' e 'refresh'
            localStorage.setItem(ACCESS_KEY, data.access);
            localStorage.setItem(REFRESH_KEY, data.refresh);

            // Após login, buscamos os dados do perfil (me)
            const userData = await authService.getMe();
            await carregarAdminConfig();
            setUser(userData);
            setIsAuthenticated(true);

            return { success: true };
        } catch (error) {
            console.error("Login failed:", error);
            const message = error.response?.data?.detail || "E-mail ou senha inválidos.";
            return { success: false, error: message };
        } finally {
            setLoading(false);
        }
    }, [carregarAdminConfig]);

    // Efeito de inicialização: Verifica se o usuário já está logado ao abrir o app
    useEffect(() => {
        const initializeAuth = async () => {
            const accessToken = localStorage.getItem(ACCESS_KEY);
            
            if (!accessToken) {
                setLoading(false);
                return;
            }

            try {
                // 1. Tenta verificar se o token atual é válido
                await authService.verifyToken(accessToken);
                await hydrateUser();
            } catch (error) {
                // 2. Se falhar, tenta usar o Refresh Token automaticamente
                try {
                    const refreshData = await authService.refreshToken();
                    localStorage.setItem(ACCESS_KEY, refreshData.access);
                    await hydrateUser();
                } catch (refreshError) {
                    // 3. Se tudo falhar, limpa o estado
                    logout();
                }
            }
        };

        initializeAuth();
    }, [hydrateUser, logout]);

    const authContextValue = useMemo(
        () => ({
            user,
            isAuthenticated,
            loading,
            login,
            logout,
            adminConfig,
            recarregarAdminConfig: carregarAdminConfig,
        }),
        [user, isAuthenticated, loading, login, logout, adminConfig, carregarAdminConfig]
    );

    if (loading) {
        return (
            <Loading 
                fullScreen 
                message="Carregando..."
                size="medium"
            />
        );
    }

    return (
        <AuthContext.Provider value={authContextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;