import axios from "axios";
import api from "./api";

export const getNotaPorIdOuProtocolo = async (idNota) => {
  try {
    const response = await api.get(`/api/consultas/nfse/${idNota}/`);
    return response.data;
  } catch (error) {
    console.error("Erro ao buscar nota:", error);
    throw error;
  }
};

export const getNotaPorFatura = async (numero_fatura) => {
  try {
    const response = await api.get(
      `/api/consultas/nfse/consulta-nota-por-fatura/${numero_fatura}/`,
    );
    return response.data;
  } catch (error) {
    console.error("Erro ao buscar nota:", error);
    throw error;
  }
};

export const getNotaPorID = async (id_tecnospeed) => {
  try {
    const response = await api.get(
      `/api/consultas/nfse/consulta-nota-por-id/${id_tecnospeed}/`,
    );
    return response.data;
  } catch (error) {
    console.error("Erro ao buscar nota:", error);
    throw error;
  }
};

export const getNotaPorIDIntegracao = async (id_integracao) => {
  try {
    const response = await api.get(
      `/api/consultas/nfse/consulta-nota-por-integracao/${id_integracao}/`,
    );
    return response.data;
  } catch (error) {
    console.error("ENDPOINT - Erro ao buscar nota:", error);
    throw error;
  }
};

// Consulta as notas na Focus (via backend) e atualiza o status no banco.
export const sincronizarNotas = async (refs) => {
  const response = await api.post("/api/nfse/sincronizar/", { refs });
  return response.data;
};

export const getHistoricoFatura = async (numero_fatura) => {
  try {
    const response = await api.get(
      `/api/consultas/historico/consulta-por-fatura/${numero_fatura}`,
    );
    return response.data;
  } catch (error) {
    console.error("Erro ao buscar histórico da fatura:", error);
    throw error;
  }
};

export const getHistoricoNota = async (notaId) => {
  try {
    const response = await api.get(
      `/api/consultas/historico/consulta-por-id/${notaId}`,
    );
    return response.data;
  } catch (error) {
    console.error("Erro ao buscar histórico da nota:", error);
    throw error;
  }
};

export const transmitirNota = async (payload) => {
  try {
    const { data } = await api.post("/api/consultar-faturas/", payload);
    return data;
  } catch (error) {
    console.error("Erro ao transmitir nota:", error);
    throw error;
  }
};

export const downloadPdfNota = async (payload) => {
  try {
    const response = await api.post("/api/nfse/download-pdf/nfse/", payload, {
      responseType: "blob",
      headers: {
        Accept:
          "application/pdf, application/zip, application/x-zip-compressed, application/octet-stream",
      },
    });

    return response;
  } catch (error) {
    console.error("Erro no download:", error);
    throw error;
  }
};

export const cancelarNota = async (notasArray) => {
  const payload = Array.isArray(notasArray)
    ? { notas: notasArray }
    : notasArray && typeof notasArray === "object"
      ? notasArray
      : { notas: [] };

  return await api.post("/api/nfse/cancela/nfse/", payload);
};

// Reprocessamento em massa: volta todas as notas rejeitadas/erro para 'pendente',
// para a fila do backend reenviar ao Focus (mesma referência).
export const reprocessarRejeitadas = async ({ ids_integracao = [], fatura = "" } = {}) => {
  const response = await api.post("/api/nfse/reprocessa/nfse/", {
    ids_integracao,
    fatura,
  });
  return response.data;
};

export const reemitirNota = async (payload) => {
  try {
    const response = await api.post("/api/nfse/cep-fix/nfse/", {
      id_integracao: payload?.id_integracao ?? payload?.idIntegracao ?? "",
      cep: String(payload?.cep || "")
        .replace(/\D/g, "")
        .slice(0, 8),
      tomador_codigo: String(payload?.tomador_codigo || "")
        .replace(/\D/g, "")
        .slice(0, 7),
    });

    return response.data;
  } catch (error) {
    console.error("Erro ao reemitir nota:", error);
    throw error;
  }
};

export const buscarIbgePorCep = async (cep) => {
  const cepDigits = String(cep || "")
    .replace(/\D/g, "")
    .slice(0, 8);

  if (cepDigits.length !== 8) return null;

  try {
    const { data } = await axios.get(
      `https://viacep.com.br/ws/${cepDigits}/json/`,
      { timeout: 10000 },
    );

    if (data && !data.erro && data.ibge) {
      return {
        ibge: String(data.ibge),
        cidade: data.localidade || "",
        uf: data.uf || "",
      };
    }
  } catch (error) {
    console.error("Erro ao buscar IBGE pelo CEP:", error);
  }

  return null;
};
