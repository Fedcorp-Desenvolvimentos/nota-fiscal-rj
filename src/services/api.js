import axios from "axios";
import { renovarAccessToken } from "./tokenRefresh";

// Vazio = mesma origem (front e API em https://notas.fedcorp.com.br, caminhos já começam com /api/).
// Em dev, defina VITE_API_BASE_URL=http://localhost:8000 no .env local.
const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
});

// No seu arquivo api.js ou authService.js
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("accessToken");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Se o erro for 401 e não for uma tentativa de login ou refresh
        const url = originalRequest?.url ?? "";
        const rotaDeAuth = url.includes("/api/auth/token/") || url.includes("/api/users/login/");
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !rotaDeAuth) {
            originalRequest._retry = true;

            try {
                const { access, refresh } = await renovarAccessToken();
                localStorage.setItem("accessToken", access);
                if (refresh) localStorage.setItem("refreshToken", refresh);

                // Refaz a requisição original com o novo token
                originalRequest.headers.Authorization = `Bearer ${access}`;
                return api(originalRequest);
            } catch (refreshError) {
                // Se o refresh também falhar, desloga (limpa tudo)
                localStorage.clear();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export default api;