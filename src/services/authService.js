import api from './api';
import { renovarAccessToken } from './tokenRefresh';

const TOKEN_KEY = "accessToken";

export const authService = {
    async login(credentials) {
        // Rota: /api/auth/token/
        const response = await api.post('/api/users/login/', credentials);
        return response.data; // Espera-se { access: '...', refresh: '...' }
    },

    async refreshToken() {
        // Rota: /api/auth/token/refresh/ (axios puro, sem interceptors; ver tokenRefresh.js)
        return renovarAccessToken();
    },

    async verifyToken(token) {
        // Rota: /api/auth/token/verify/
        const response = await api.post('/api/auth/token/verify/', { token });
        return response.status === 200;
    },

    async getMe() {
        const response = await api.get('/api/users/me/');
        return response.data;
    }

    
};