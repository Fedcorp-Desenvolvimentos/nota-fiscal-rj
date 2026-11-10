// Normalização das respostas do Mapa de emissão (contrato §9) para o formato usado pelas telas.
// Tolerante a pequenas variações de nome de campo para não quebrar a tela se o backend ajustar o contrato.

/** Tipos de condição aceitos em mapa/criar/ e rótulos em pt-BR. */
export const TIPOS_CONDICAO = {
  padrao: "Padrão",
  apolice: "Apólice",
  tipo_nfe: "Canal",
  prefixo: "Prefixo de fatura",
  prefixo_fatura: "Prefixo de fatura",
};

/** Canais (tipo_nfe) que fazem sentido como condição; "comum" é o próprio padrão da empresa. */
export const CANAIS = [
  { valor: "vr", rotulo: "Canal VR" },
  { valor: "externo", rotulo: "Canal externo" },
];

/** Chave de rota da condição: "padrao" ou "tipo:valor" (usada se o backend não mandar `chave`). */
export function chaveCondicao(tipo, valor) {
  if (!tipo || tipo === "padrao") return "padrao";
  return `${tipo}:${valor ?? ""}`;
}

/** Rótulo curto da condição para badges: "Padrão", "Apólice PSPS01", "Canal VR", "Prefixo XLSX". */
export function rotuloCondicao(tipo, valor, extra = {}) {
  if (!tipo || tipo === "padrao") return "Padrão";
  if (tipo === "apolice") return `Apólice ${valor}${extra.tipo_nfe ? ` (${extra.tipo_nfe})` : ""}`;
  if (tipo === "tipo_nfe") {
    const canal = CANAIS.find((c) => c.valor === valor);
    return canal ? canal.rotulo : `Canal ${valor}`;
  }
  if (tipo === "prefixo" || tipo === "prefixo_fatura") return `Prefixo ${valor}`;
  if (tipo === "razao_social") return "Compat. razão social";
  if (tipo === "outra") return extra.outras_condicoes ? `Outra: ${extra.outras_condicoes}` : "Outra condição";
  return `${TIPOS_CONDICAO[tipo] || tipo} ${valor ?? ""}`.trim();
}

export function corCondicao(tipo) {
  if (tipo === "apolice") return "roxo";
  if (tipo === "tipo_nfe") return "azul";
  if (tipo === "prefixo" || tipo === "prefixo_fatura") return "amarelo";
  if (tipo === "razao_social" || tipo === "outra") return "neutro";
  return "neutro";
}

function versaoCurta(m) {
  if (!m) return null;
  if (typeof m !== "object") return { id: m };
  return {
    id: m.id ?? m.modelo_id,
    codigo: m.codigo,
    versao: m.versao,
    nome: m.nome,
    provedor: m.provedor,
    ativo: m.ativo,
  };
}

export function rotuloVersao(m) {
  if (!m) return "—";
  if (m.codigo && m.versao != null) return `${m.codigo} v${m.versao}`;
  return m.codigo || (m.id != null ? `#${m.id}` : "—");
}

/**
 * Normaliza uma linha de condição (ou o padrão) de GET mapa/ (§9.2):
 * {chave, tipo, valor, tipo_nfe, outras_condicoes, regra, modelo, modelo_ativo, versoes_rascunho}.
 * Status: modelo_ativo → "ativo"; senão rascunho/modelo inativo → "rascunho"; padrão por FALLBACK → "sem".
 */
export function normalizarCombinacao(c, { tipoPadrao = null, semMapeamento = false } = {}) {
  if (!c) return null;
  const cond = c.condicao && typeof c.condicao === "object" ? c.condicao : null;
  const tipo = cond?.tipo ?? c.tipo ?? tipoPadrao ?? "padrao";
  const valor = cond?.valor ?? c.valor ?? null;
  const tipoNfe = cond?.tipo_nfe ?? c.tipo_nfe ?? null;
  const modeloAtivo = versaoCurta(c.modelo_ativo ?? null);
  const modelo = versaoCurta(c.modelo ?? null);
  const rascunhos = (c.versoes_rascunho || c.rascunhos || []).map(versaoCurta).filter(Boolean);
  const sem = !!(semMapeamento || c.sem_mapeamento);
  let status = "sem";
  if (sem) status = "sem";
  else if (modeloAtivo?.id != null) status = "ativo";
  else if (rascunhos.length || modelo) status = "rascunho";
  return {
    chave: cond?.chave ?? c.chave ?? chaveCondicao(tipo, valor),
    tipo,
    valor,
    tipoNfe,
    rotulo: rotuloCondicao(tipo, valor, { tipo_nfe: tipoNfe, outras_condicoes: c.outras_condicoes }),
    regra: c.regra || null,
    modelo,
    modeloAtivo,
    rascunhos,
    semMapeamento: sem,
    status,
  };
}

/**
 * Normaliza GET mapa/ → {empresas: [{id, razao_social, cnpj, ativo, provedor_padrao, padrao, condicoes, semMapeamento}],
 * transversais: [combinações sem prestador]}.
 */
export function normalizarMapa(data) {
  const lista = Array.isArray(data) ? data : data?.empresas || data?.results || [];
  const empresas = lista
    .map((e) => {
      const p = e.prestador && typeof e.prestador === "object" ? e.prestador : e;
      const sem = !!e.sem_mapeamento;
      return {
        id: p.id ?? e.prestador_id,
        razao_social: p.razao_social || `#${p.id}`,
        cnpj: p.cnpj || "",
        ativo: p.ativo !== false,
        provedor_padrao: p.provedor_padrao || "",
        padrao: normalizarCombinacao(e.padrao, { tipoPadrao: "padrao", semMapeamento: sem }),
        condicoes: (e.condicoes || []).map((c) => normalizarCombinacao(c)).filter(Boolean),
        semMapeamento: sem,
      };
    })
    .sort((a, b) => String(a.razao_social).localeCompare(String(b.razao_social), "pt-BR"));
  const transversais = (Array.isArray(data?.transversais) ? data.transversais : []).map((c) => normalizarCombinacao(c)).filter(Boolean);
  return { empresas, transversais };
}

export const STATUS_COMBINACAO = {
  ativo: { classe: "ok", texto: "ativo" },
  rascunho: { classe: "rascunho", texto: "só rascunho" },
  sem: { classe: "nao", texto: "sem mapeamento" },
};

/** O campo do schema por grupos se aplica ao provedor atual? (`provedores` vazio/ausente = todos). */
export function campoDoProvedor(campo, provedor) {
  const lista = campo?.provedores;
  if (!Array.isArray(lista) || lista.length === 0 || !provedor) return true;
  return lista.includes(provedor);
}

/** Nome do campo de schema.grupos na API (contrato §4.8: `chave`; aceita `nome` por compat). */
export const nomeCampo = (c) => c?.chave ?? c?.nome;

/** Campo só leitura por natureza (vem do prestador ou é calculado pelo builder). */
export const campoSomenteLeitura = (c) => c?.editavel === false || c?.origem === "prestador" || c?.origem === "derivado";
