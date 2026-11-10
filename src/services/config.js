// Serviço da página Configuração: gestão dos modelos de emissão NFS-e (backend /api/nfse/config/).
// Todos os endpoints ficam centralizados aqui para facilitar ajustes no contrato.
// Contrato: NFS-e-Django/.claude/docs/api-config-v1.md (v1, 10/11/2026).
//  - Leituras devolvem o recurso direto; escritas devolvem o envelope
//    {objeto, auditoria_id, efetivo_em_ate_segundos, avisos}.
//  - Erros: {erro: {codigo, mensagem, campos}} (ver pages/configuracao/utils.js).
//  - Paginadas (prestadores, auditoria): ?page=&page_size= (máx. 200) → {count, next, previous, results}.
//  - Camadas fixas (10/11/2026): a aba Regras saiu; o front não cria/edita regra nem prioridade. A regra nasce em
//    POST mapa/criar/ (camada definida pela condição) e só `regras/simular/` continua em uso.
//  - Toda escrita exige `motivo` (≥ 5 caracteres); dry-run e simular não gravam e não pedem motivo.
//  - Travas confirmáveis: envie SEM `confirmar`; se vier 400 `confirmacao_necessaria` (prestador) ou
//    409 `versao_sem_regra_ativa` / `ultima_versao_ativa` (modelo), mostre a mensagem e repita com `confirmar: true`
//    só se o usuário aceitar. 409 `regra_invalida` NÃO aceita confirmar.
import api from "./api";

/** Tamanho máximo de página aceito pelo backend (listas pequenas carregadas de uma vez). */
export const PAGE_SIZE_MAX = 200;

/**
 * Fixtures golden aceitas pelo dry-run (nfse/tests/golden/fixtures.py). O contrato não expõe a lista;
 * se um dia `modelos/schema/` trouxer `fixtures`, ela tem prioridade.
 */
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

export const ENDPOINTS = {
  me: `${BASE}/me/`,
  prestadores: `${BASE}/prestadores/`,
  prestador: (id) => `${BASE}/prestadores/${id}/`,
  modelos: `${BASE}/modelos/`,
  modelosSchema: `${BASE}/modelos/schema/`,
  modelo: (id) => `${BASE}/modelos/${id}/`,
  modeloClonar: (id) => `${BASE}/modelos/${id}/clonar/`,
  modeloAtivar: (id) => `${BASE}/modelos/${id}/ativar/`,
  modeloDesativar: (id) => `${BASE}/modelos/${id}/desativar/`,
  modeloDryRun: (id) => `${BASE}/modelos/${id}/dry-run/`,
  regrasSimular: `${BASE}/regras/simular/`,
  auditoria: `${BASE}/auditoria/`,
  // Mapa de emissão (contrato §9): empresa × condição → regra (camada fixa) + modelo.
  mapa: `${BASE}/mapa/`,
  mapaCriar: `${BASE}/mapa/criar/`,
  mapaFicha: (prestadorId, condicao) => `${BASE}/mapa/${prestadorId}/${encodeURIComponent(condicao)}/`,
};

const dados = (r) => r.data;

export const configService = {
  // Permissão
  me: () => api.get(ENDPOINTS.me).then(dados),

  // Prestadores
  listarPrestadores: (params = {}) =>
    api.get(ENDPOINTS.prestadores, { params: { page_size: PAGE_SIZE_MAX, ...params } }).then(dados),
  obterPrestador: (id) => api.get(ENDPOINTS.prestador(id)).then(dados),
  atualizarPrestador: (id, campos, motivo, confirmar = false) =>
    api.patch(ENDPOINTS.prestador(id), { ...campos, motivo, ...(confirmar ? { confirmar: true } : {}) }).then(dados),

  // Modelos
  /** Lista agrupada por código (não paginada). Filtros: codigo, ativo. */
  listarModelos: (params = {}) => api.get(ENDPOINTS.modelos, { params }).then(dados),
  schemaModelos: () => api.get(ENDPOINTS.modelosSchema).then(dados),
  obterModelo: (id) => api.get(ENDPOINTS.modelo(id)).then(dados),
  atualizarModelo: (id, campos, motivo) => api.patch(ENDPOINTS.modelo(id), { ...campos, motivo }).then(dados),
  clonarModelo: (id, motivo) => api.post(ENDPOINTS.modeloClonar(id), { motivo }).then(dados),
  /** 200: envelope + desativadas + diff_regras + simulacao (calculados antes de gravar). */
  ativarModelo: (id, motivo, confirmar = false) =>
    api.post(ENDPOINTS.modeloAtivar(id), { motivo, ...(confirmar ? { confirmar: true } : {}) }).then(dados),
  desativarModelo: (id, motivo, confirmar = false) =>
    api.post(ENDPOINTS.modeloDesativar(id), { motivo, ...(confirmar ? { confirmar: true } : {}) }).then(dados),
  /** entrada: { id_integracao } ou { fixture } */
  dryRunModelo: (id, entrada) => api.post(ENDPOINTS.modeloDryRun(id), entrada).then(dados),

  // Regras de resolução: só a simulação (o CRUD de regras saiu do front com a aba Regras, 10/11/2026).
  /**
   * Simula modelo atual × proposto nas últimas N notas (não grava).
   * opcoes: { regras?: [ajustes em memória], ativar_modelos?: [ids de versões tratadas como ativas] }
   */
  simularRegras: (ultimas = 200, opcoes = {}) => {
    const corpo = { ultimas };
    if (opcoes.regras?.length) corpo.regras = opcoes.regras;
    if (opcoes.ativar_modelos?.length) corpo.ativar_modelos = opcoes.ativar_modelos;
    return api.post(ENDPOINTS.regrasSimular, corpo).then(dados);
  },

  // Mapa de emissão (§9)
  /** Lista por prestador: {padrao, condicoes[] com `camada`}, transversais e `faixas` (camadas com rótulos). */
  listarMapa: () => api.get(ENDPOINTS.mapa).then(dados),
  /**
   * Cria rascunho + regra para a combinação. corpo: {prestador_id, condicao:{tipo, valor}, base_modelo_id?, motivo}.
   * Sem prioridade: a camada vem da condição (apólice → Apólice, padrao → Padrão da empresa, tipo_nfe → Canal).
   */
  criarMapa: (corpo) => api.post(ENDPOINTS.mapaCriar, corpo).then(dados),
  /** Ficha completa da combinação (modelo ativo por grupos, rascunhos, regra, últimas notas, payload de exemplo). */
  fichaMapa: (prestadorId, condicao) => api.get(ENDPOINTS.mapaFicha(prestadorId, condicao)).then(dados),

  // Auditoria (paginada). Filtros: entidade (prestador|modelo|regra), entidade_id, acao, usuario, page, page_size.
  listarAuditoria: (filtros = {}) => {
    const params = {};
    Object.entries(filtros).forEach(([k, v]) => {
      if (v !== "" && v !== null && v !== undefined) params[k] = v;
    });
    return api.get(ENDPOINTS.auditoria, { params }).then(dados);
  },
};

export default configService;
