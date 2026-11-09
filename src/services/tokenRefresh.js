import axios from "axios";

// Renovação do access token isolada em módulo próprio.
// Usa axios "puro" (sem os interceptors de api.js) para:
//  1) evitar ciclo de import api.js <-> authService.js;
//  2) impedir que um 401 no próprio refresh dispare outro refresh (loop).
const REFRESH_KEY = "refreshToken";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function renovarAccessToken() {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!refresh) throw new Error("No refresh token available");

    // Rota: /api/auth/token/refresh/ (simplejwt)
    const response = await axios.post(`${baseURL}/api/auth/token/refresh/`, { refresh });
    return response.data; // { access: '...' } (e 'refresh' se houver rotação)
}
