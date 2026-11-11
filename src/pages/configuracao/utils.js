// Utilitários da página Configuração (modelos de emissão NFS-e).
// Nada aqui registra dados em console: payloads fiscais e nomes de token não vão para log.

/** Corpo de erro no formato do contrato: {erro: {codigo, mensagem, campos}}. */
function corpoErro(error) {
  const data = error?.response?.data;
  if (data && typeof data === "object" && data.erro && typeof data.erro === "object") return data.erro;
  return null;
}

/** Código de erro do backend (ex.: "modelo_ativo_imutavel", "conflito_condicao", "pipeline"). */
export function codigoErro(error) {
  return corpoErro(error)?.codigo || null;
}

/** Códigos de trava que aceitam repetir a chamada com `confirmar: true`. */
export const CODIGOS_CONFIRMAVEIS = new Set([
  "confirmacao_necessaria",
  "versao_sem_regra_ativa",
  "ultima_versao_ativa",
  "origem_desatualizada",
]);

/** True se o erro é uma trava confirmável (400/409 com um dos códigos acima). */
export function precisaConfirmar(error) {
  return CODIGOS_CONFIRMAVEIS.has(codigoErro(error));
}

/** Mensagem principal do backend (erro.mensagem), sem anexar campos. */
export function mensagemBackend(error, padrao = "") {
  return corpoErro(error)?.mensagem || padrao;
}

/** erro.campos como lista [[chave, "mensagens"]] (ex.: {"regra 812": ["..."]}). */
export function listaCampos(error) {
  const campos = corpoErro(error)?.campos;
  if (!campos || typeof campos !== "object") return [];
  return Object.entries(campos).map(([k, v]) => [
    k,
    Array.isArray(v) ? v.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" ") : String(v),
  ]);
}

/**
 * Extrai uma mensagem legível de um erro axios.
 * 403 → "sem permissão"; 409/422 → mensagem do backend; 400 → mensagem + primeiro campo inválido.
 */
export function mensagemErro(error, padrao = "Erro inesperado.") {
  const status = error?.response?.status;
  const data = error?.response?.data;
  if (status === 403) return "Sem permissão: esta área é só para admin de configuração.";
  if (!error?.response) return "Servidor indisponível. Tente novamente.";
  const corpo = corpoErro(error);
  if (corpo) {
    let msg = corpo.mensagem || padrao;
    const campos = corpo.campos && typeof corpo.campos === "object" ? Object.entries(corpo.campos) : [];
    if (campos.length) {
      const [campo, m] = campos[0];
      const texto = Array.isArray(m) ? m.join(" ") : typeof m === "string" ? m : JSON.stringify(m);
      msg = `${msg} ${campo === "__all__" || campo === "non_field_errors" ? "" : `${campo}: `}${texto}`;
    }
    return msg;
  }
  if (typeof data === "string" && data.length < 300 && !data.trim().startsWith("<")) return data;
  if (data?.detail) return String(data.detail);
  if (status === 404) return "Registro não encontrado.";
  if (status === 409) return "Conflito: a operação não é permitida no estado atual.";
  return padrao;
}

/**
 * Erros de validação campo a campo (400): erro.campos {campo: ["msg"]} → {campo: "msg"}.
 * `__all__`/`non_field_errors` vão para a chave `geral`; `motivo_obrigatorio` vira erro do campo `motivo`.
 */
export function errosDeCampo(error) {
  if (error?.response?.status !== 400) return {};
  const corpo = corpoErro(error);
  let campos = corpo?.campos;
  if (!corpo) {
    const data = error.response.data;
    campos = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  }
  const out = {};
  if (corpo?.codigo === "motivo_obrigatorio") out.motivo = corpo.mensagem || "Informe o motivo (mínimo 5 caracteres).";
  if (!campos || typeof campos !== "object") return out;
  for (const [campo, msg] of Object.entries(campos)) {
    if (campo === "detail") continue;
    const chave = campo === "__all__" || campo === "non_field_errors" ? "geral" : campo;
    if (Array.isArray(msg)) out[chave] = msg.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" ");
    else if (typeof msg === "string") out[chave] = msg;
    else out[chave] = JSON.stringify(msg);
  }
  return out;
}

/** Motivo válido segundo o contrato: ≥ 5 caracteres sem espaços nas pontas. */
export function validarMotivo(motivo) {
  const m = (motivo || "").trim();
  if (!m) return "Informe o motivo da alteração.";
  if (m.length < 5) return "O motivo precisa ter pelo menos 5 caracteres.";
  return "";
}

/** Toast de sucesso + avisos do envelope de escrita ({objeto, auditoria_id, efetivo_em_ate_segundos, avisos}). */
export function notificarEscrita(enqueueSnackbar, resposta, mensagem) {
  enqueueSnackbar(mensagem, { variant: "success" });
  (resposta?.avisos || []).forEach((a) =>
    enqueueSnackbar(typeof a === "string" ? a : JSON.stringify(a), { variant: "warning", autoHideDuration: 10000 })
  );
}

/** Normaliza respostas paginadas (DRF {results, count}) ou listas puras. */
export function comoLista(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.itens)) return data.itens;
  return [];
}

export function formatarData(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString("pt-BR");
}

export function formatarCnpj(cnpj = "") {
  const d = String(cnpj).replace(/\D/g, "");
  if (d.length !== 14) return cnpj || "—";
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** JSON estável (chaves ordenadas) para exibir e comparar. */
export function jsonOrdenado(valor) {
  const ordenar = (v) => {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v && typeof v === "object") {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = ordenar(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(ordenar(valor), null, 2);
}

/**
 * Achata um objeto em {"a.b[0].c": valor} para comparar payloads.
 */
export function achatar(obj, prefixo = "", out = {}) {
  if (Array.isArray(obj)) {
    if (obj.length === 0) out[prefixo] = [];
    obj.forEach((v, i) => achatar(v, `${prefixo}[${i}]`, out));
  } else if (obj && typeof obj === "object") {
    const chaves = Object.keys(obj);
    if (chaves.length === 0 && prefixo) out[prefixo] = {};
    chaves.forEach((k) => achatar(obj[k], prefixo ? `${prefixo}.${k}` : k, out));
  } else {
    out[prefixo] = obj;
  }
  return out;
}

/**
 * Diff entre dois objetos achatados.
 * Retorna [{chave, a, b, tipo: "igual"|"alterado"|"so_a"|"so_b"}] ordenado por chave.
 */
export function diffObjetos(a, b) {
  const fa = achatar(a || {});
  const fb = achatar(b || {});
  const chaves = Array.from(new Set([...Object.keys(fa), ...Object.keys(fb)])).sort();
  return chaves.map((chave) => {
    const temA = Object.prototype.hasOwnProperty.call(fa, chave);
    const temB = Object.prototype.hasOwnProperty.call(fb, chave);
    let tipo = "igual";
    if (temA && !temB) tipo = "so_a";
    else if (!temA && temB) tipo = "so_b";
    else if (JSON.stringify(fa[chave]) !== JSON.stringify(fb[chave])) tipo = "alterado";
    return { chave, a: fa[chave], b: fb[chave], tipo };
  });
}

/** Converte o diff do backend (vários formatos possíveis) em linhas do diffObjetos. */
export function normalizarDiffBackend(diff) {
  if (!diff) return null;
  if (Array.isArray(diff)) {
    return diff
      .map((d) => {
        const chave = d.chave ?? d.campo ?? d.path ?? d.key;
        if (!chave) return null;
        const a = d.ativo ?? d.antes ?? d.a ?? d.esperado ?? d.old;
        const b = d.novo ?? d.rascunho ?? d.depois ?? d.b ?? d.obtido ?? d.new;
        const tipo = d.tipo || (a === undefined ? "so_b" : b === undefined ? "so_a" : "alterado");
        return { chave, a, b, tipo };
      })
      .filter(Boolean);
  }
  if (typeof diff === "object") {
    return Object.entries(diff).map(([chave, v]) => {
      if (Array.isArray(v) && v.length === 2) return { chave, a: v[0], b: v[1], tipo: "alterado" };
      if (v && typeof v === "object") {
        const a = v.ativo ?? v.antes ?? v.a ?? v.esperado;
        const b = v.novo ?? v.rascunho ?? v.depois ?? v.b ?? v.obtido;
        const temA = "esperado" in v || "ativo" in v || "antes" in v || "a" in v;
        const temB = "novo" in v || "rascunho" in v || "depois" in v || "b" in v || "obtido" in v;
        const tipo = temA && !temB ? "so_a" : !temA && temB ? "so_b" : "alterado";
        return { chave, a, b, tipo };
      }
      return { chave, a: undefined, b: v, tipo: "alterado" };
    });
  }
  return null;
}

export function valorCurto(v) {
  if (v === undefined) return "∅";
  if (v === null) return "null";
  if (typeof v === "string") return `"${v}"`;
  return JSON.stringify(v);
}

/** Opções de enum no formato do schema: [{valor, rotulo}] ou ["valor"]. */
export function opcoesEnum(lista) {
  return (lista || []).map((o) =>
    typeof o === "string"
      ? { valor: o, rotulo: o }
      : { valor: o.valor ?? o.value, rotulo: o.rotulo ?? o.label ?? o.valor ?? o.value }
  );
}
