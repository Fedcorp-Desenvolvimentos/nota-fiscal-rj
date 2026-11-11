// Serviço da página Configuração (backend /api/nfse/config/).
// Contrato: NFS-e-Django/.claude/docs/api-config-v1.md — §10 "Mapa simplificado v2" (faturas: Padrão da empresa +
// Apólice; integrações externo/VR com modelo fixo). Prestadores (§3), modelos (§4: detalhe, schema, PATCH, dry-run) e
// auditoria (§6) seguem a v1.
//  - Leituras devolvem o recurso direto; escritas devolvem o envelope {objeto, auditoria_id, efetivo_em_ate_segundos, avisos}.
//  - Erros: {erro: {codigo, mensagem, campos}} (ver pages/configuracao/utils.js).
//  - Toda escrita exige `motivo` (≥ 5 caracteres), inclusive editar/descartar (§10.5).
//  - Travas confirmáveis: envie SEM `confirmar`; se o backend pedir confirmação, repita com `confirmar: true`.
import api from "./api";

/** Tamanho máximo de página aceito pelo backend. */
export const PAGE_SIZE_MAX = 200;

/** Fixtures golden aceitas pelo dry-run (nfse/tests/golden/fixtures.py). */
export const FIXTURES_PADRAO = [
  "comum_fedcorp_adm_ded0",
  "comum_fedcorp_adm_socio_ded",
  "comum_condomed_rio_ded",
  "comum_condocorp_cpf_tomador",
  "vr_sem_discri_data_criacao",
  "vr_com_discri_numero_dps_nulo",
  "externo_sem_discri",
  "sp_cpf_3093_ded",
  "sp_cnpj_3039",
  "sp_cnpj_outro_truncamento",
];

const BASE = "/api/nfse/config";
const enc = encodeURIComponent;

export const ENDPOINTS = {
  me: `${BASE}/me/`,
  prestadores: `${BASE}/prestadores/`,
  prestador: (id) => `${BASE}/prestadores/${id}/`,
  modelosSchema: `${BASE}/modelos/schema/`,
  modelo: (id) => `${BASE}/modelos/${id}/`,
  modeloEditar: (id) => `${BASE}/modelos/${id}/editar/`,
  modeloPublicar: (id) => `${BASE}/modelos/${id}/publicar/`,
  modeloDescartar: (id) => `${BASE}/modelos/${id}/descartar/`,
  modeloDryRun: (id) => `${BASE}/modelos/${id}/dry-run/`,
  auditoria: `${BASE}/auditoria/`,
  // §10 Mapa simplificado v2
  mapa: `${BASE}/mapa/`,
  mapaPadrao: (prestadorId) => `${BASE}/mapa/${prestadorId}/padrao/`,
  mapaApolices: (prestadorId) => `${BASE}/mapa/${prestadorId}/apolice/`,
  mapaApolice: (prestadorId, codigo) => `${BASE}/mapa/${prestadorId}/apolice/${enc(codigo)}/`,
  mapaApoliceDesativar: (prestadorId, codigo) => `${BASE}/mapa/${prestadorId}/apolice/${enc(codigo)}/desativar/`,
  mapaApoliceReativar: (prestadorId, codigo) => `${BASE}/mapa/${prestadorId}/apolice/${enc(codigo)}/reativar/`,
  mapaIntegracao: (chave) => `${BASE}/mapa/integracao/${enc(chave)}/`,
};

const dados = (r) => r.data;
const comConfirmar = (corpo, confirmar) => (confirmar ? { ...corpo, confirmar: true } : corpo);

export const configService = {
  me: () => api.get(ENDPOINTS.me).then(dados),

  // Prestadores (§3)
  listarPrestadores: (params = {}) =>
    api.get(ENDPOINTS.prestadores, { params: { page_size: PAGE_SIZE_MAX, ...params } }).then(dados),
  atualizarPrestador: (id, campos, motivo, confirmar = false) =>
    api.patch(ENDPOINTS.prestador(id), comConfirmar({ ...campos, motivo }, confirmar)).then(dados),

  // Modelos (§4 + §10)
  schemaModelos: () => api.get(ENDPOINTS.modelosSchema).then(dados),
  obterModelo: (id) => api.get(ENDPOINTS.modelo(id)).then(dados),
  atualizarModelo: (id, campos, motivo) => api.patch(ENDPOINTS.modelo(id), { ...campos, motivo }).then(dados),
  /** Abre (ou devolve) o rascunho de edição; `objeto` = detalhe do rascunho (§10.5). */
  editarModelo: (id, motivo) => api.post(ENDPOINTS.modeloEditar(id), { motivo }).then(dados),
  publicarModelo: (id, motivo, confirmar = false) =>
    api.post(ENDPOINTS.modeloPublicar(id), comConfirmar({ motivo }, confirmar)).then(dados),
  descartarModelo: (id, motivo) => api.post(ENDPOINTS.modeloDescartar(id), { motivo }).then(dados),
  /** entrada: { id_integracao } ou { fixture } */
  dryRunModelo: (id, entrada) => api.post(ENDPOINTS.modeloDryRun(id), entrada).then(dados),

  // Mapa v2 (§10)
  listarMapa: () => api.get(ENDPOINTS.mapa).then(dados),
  fichaPadrao: (prestadorId) => api.get(ENDPOINTS.mapaPadrao(prestadorId)).then(dados),
  fichaApolice: (prestadorId, codigo) => api.get(ENDPOINTS.mapaApolice(prestadorId, codigo)).then(dados),
  fichaIntegracao: (chave) => api.get(ENDPOINTS.mapaIntegracao(chave)).then(dados),
  /** Empresa sem padrão: cria o rascunho do padrão. */
  criarPadrao: (prestadorId, motivo) => api.post(ENDPOINTS.mapaPadrao(prestadorId), { motivo }).then(dados),
  criarApolice: (prestadorId, apolice, motivo) =>
    api.post(ENDPOINTS.mapaApolices(prestadorId), { apolice, motivo }).then(dados),
  /** 1ª chamada sem `confirmar`: 409 `confirmar_desativacao` traz a mensagem/simulação; repita com confirmar. */
  desativarApolice: (prestadorId, codigo, motivo, confirmar = false) =>
    api.post(ENDPOINTS.mapaApoliceDesativar(prestadorId, codigo), comConfirmar({ motivo }, confirmar)).then(dados),
  reativarApolice: (prestadorId, codigo, motivo) =>
    api.post(ENDPOINTS.mapaApoliceReativar(prestadorId, codigo), { motivo }).then(dados),

  // Auditoria (§6). Filtros: entidade, entidade_id, acao, usuario, page, page_size.
  listarAuditoria: (filtros = {}) => {
    const params = {};
    Object.entries(filtros).forEach(([k, v]) => {
      if (v !== "" && v !== null && v !== undefined) params[k] = v;
    });
    return api.get(ENDPOINTS.auditoria, { params }).then(dados);
  },
};

export default configService;
