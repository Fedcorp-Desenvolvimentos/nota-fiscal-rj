import axios from "axios";

// URL do n8n definida no build (VITE_N8N_URL). Vazio = desativado/mesma origem.
const n8n = axios.create({
  baseURL: import.meta.env.VITE_N8N_URL ?? "",
});

export default n8n;
