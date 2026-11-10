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
  if (tipo === "razao_social") return `Razão social ${valor ?? ""}`.trim(); // compat removida (10/11/2026); só se o backend ainda mandar
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

// ---------------------------------------------------------------------------------------------------------------
// Camadas fixas (decisão do dono, 10/11/2026; contrato §9.1, R85, migração 0044): a prioridade numérica deixou de ser
// exposta/editável. Ordem de avaliação:
//   canal_empresa (5) → canais (10–39, externo/VR transversais) → apolice (900) → padrao (999) → fallback (1000);
//   `legado` = regras inativas de compat (razão social, apólice 1–9).
// O backend manda `camada: {chave, rotulo}` em cada condição de GET mapa/ (sem `prioridade`), `camada: "<chave>"` na
// representação de regra (§5) e em diff_regras, e `faixas.camadas` (lista com rótulo e prioridade). Sem `camada`, ela é
// deduzida do tipo da condição (ou das condições da regra). O número fica só informativo, em cinza.
// ---------------------------------------------------------------------------------------------------------------

/** Camadas conhecidas: rótulo curto exibido, ordem (menor = avaliada antes) e prioridade padrão (§9.1). */
export const CAMADAS = {
  canal_empresa: { chave: "canal_empresa", rotulo: "Canal da empresa", ordem: 0, prioridade: 5 },
  canais: { chave: "canais", rotulo: "Canal", ordem: 1, prioridade: [10, 39] },
  apolice: { chave: "apolice", rotulo: "Apólice", ordem: 2, prioridade: 900 },
  padrao: { chave: "padrao", rotulo: "Padrão da empresa", ordem: 3, prioridade: 999 },
  fallback: { chave: "fallback", rotulo: "Fallback geral", ordem: 4, prioridade: 1000 },
  legado: { chave: "legado", rotulo: "Legado (inativa)", ordem: 5, prioridade: null },
  sistema: { chave: "sistema", rotulo: "Regra de sistema", ordem: 6, prioridade: null },
  outra: { chave: "outra", rotulo: "Regra", ordem: 7, prioridade: null },
};

/** Ordem padrão das camadas (legenda quando o backend não manda `faixas.camadas`). */
export const ORDEM_CAMADAS = ["canal_empresa", "canais", "apolice", "padrao", "fallback"];

/** Camadas da primeira etapa (canais): ficam juntas no topo da árvore / da empresa. */
export const ehCanal = (camada) => camada?.chave === "canais" || camada?.chave === "canal_empresa";

/** Prioridade como texto: 900, [10, 39] → "10–39". */
export function textoPrioridade(p) {
  if (p == null) return null;
  if (Array.isArray(p)) return p.length === 2 ? `${p[0]}–${p[1]}` : p.join(", ");
  return String(p);
}

/** Chave canônica (tolerante a variações: "canal" = canais; "canal_empresa"; "padrao_empresa"...). */
function chaveCanonica(chave) {
  const k = String(chave || "").toLowerCase();
  if (!k) return null;
  if (k.startsWith("canal_emp") || k === "canal_da_empresa") return "canal_empresa";
  if (k.startsWith("canal")) return "canais";
  if (k.startsWith("apolice")) return "apolice";
  if (k.startsWith("padrao")) return "padrao";
  if (k.startsWith("fallback")) return "fallback";
  if (k.startsWith("legado")) return "legado";
  return k;
}

/** Camada deduzida das condições de uma regra (texto "prestador=...; apolice=..." ou campos alterados do diff). */
function chaveDaRegra(regra) {
  if (!regra) return null;
  const cond = String(regra.condicoes || "").toLowerCase();
  const alvo = (campo) => regra.campos?.[campo]?.alvo ?? regra.campos?.[campo]?.atual ?? null;
  if (regra.fallback || /^fallback/i.test(regra.descricao || "") || (!cond && regra.prioridade >= 1000)) return "fallback";
  const temPrestador = /prestador\s*=/.test(cond);
  const temCanal = /tipo_nfe\s*=\s*(vr|externo)/.test(cond) || ["vr", "externo"].includes(alvo("tipo_nfe"));
  if (/apolice\s*=/.test(cond) || alvo("apolice")) return "apolice";
  if (temCanal) return temPrestador ? "canal_empresa" : "canais";
  if (/prefixo_fatura\s*=/.test(cond) && !temPrestador) return "canais";
  if (temPrestador && !cond.replace(/prestador\s*=\s*[^;,\s]+/, "").replace(/[;,\s]/g, "")) return "padrao";
  if (cond) return "apolice"; // demais combinações caem na camada 900 (§9.1)
  return null;
}

/**
 * Normaliza a camada de uma condição/regra → {chave, rotulo, rotuloBackend, prioridade (texto), ordem}.
 * fonte: objeto com `camada` (objeto ou string do backend) e/ou `tipo`, `regra`, `semMapeamento`/`fallback`.
 * prioridades: mapa chave → prioridade vindo de `faixas.camadas` (opcional).
 */
export function camadaDe(fonte = {}, prioridades = null) {
  const bruta = fonte.camada ?? fonte.regra?.camada ?? null;
  let chave = null;
  let rotuloBackend = null;
  let prioridade = null;
  if (bruta && typeof bruta === "object") {
    chave = chaveCanonica(bruta.chave);
    rotuloBackend = bruta.rotulo || null;
    prioridade = bruta.prioridade ?? null;
  } else if (typeof bruta === "string") {
    chave = chaveCanonica(bruta);
  }
  if (!chave) {
    if (fonte.semMapeamento || fonte.fallback) chave = "fallback";
    else if (fonte.tipo === "tipo_nfe") chave = "canal_empresa";
    else if (fonte.tipo === "apolice") chave = "apolice";
    else if (fonte.tipo === "padrao") chave = "padrao";
    else chave = chaveDaRegra(fonte.regra || fonte) || (fonte.tipo ? "sistema" : "outra");
  }
  const conhecida = CAMADAS[chave];
  prioridade = prioridade ?? fonte.regra?.prioridade ?? fonte.prioridade ?? prioridades?.[chave] ?? conhecida?.prioridade ?? null;
  return {
    chave,
    rotulo: conhecida?.rotulo || rotuloBackend || chave,
    rotuloBackend,
    prioridade: textoPrioridade(prioridade),
    ordem: conhecida?.ordem ?? CAMADAS.sistema.ordem,
  };
}

/** Ordena por camada mantendo a ordem do backend dentro da camada (o backend já manda na ordem do resolvedor). */
export function ordenarPorCamada(lista) {
  return [...(lista || [])].sort((a, b) => (a.camada?.ordem ?? 9) - (b.camada?.ordem ?? 9));
}

/** Lista de camadas de `faixas` (§9.2: `{camadas: [...]}`; aceita lista direta). */
function listaFaixas(faixas) {
  if (Array.isArray(faixas)) return faixas;
  if (Array.isArray(faixas?.camadas)) return faixas.camadas;
  return [];
}

/** Mapa chave → prioridade a partir de `faixas.camadas` (null se o backend não mandou). */
export function prioridadesDasFaixas(faixas) {
  const lista = listaFaixas(faixas);
  if (!lista.length) return null;
  const m = {};
  lista.forEach((f) => {
    const k = chaveCanonica(f?.chave);
    if (k) m[k] = f.prioridade ?? null;
  });
  return m;
}

/** Camadas para a legenda: `faixas.camadas` do backend (rótulo curto + o do backend no title) ou a ordem padrão. */
export function camadasDaLegenda(faixas) {
  const lista = listaFaixas(faixas);
  if (lista.length) {
    return lista
      .map((f) => {
        const chave = chaveCanonica(f?.chave) || "sistema";
        return {
          chave,
          rotulo: CAMADAS[chave]?.rotulo || f?.rotulo || f?.chave,
          rotuloBackend: f?.rotulo || null,
          prioridade: textoPrioridade(f?.prioridade),
        };
      })
      .filter((f) => f.rotulo && f.chave !== "legado");
  }
  return ORDEM_CAMADAS.map((k) => ({ ...CAMADAS[k], rotuloBackend: null, prioridade: textoPrioridade(CAMADAS[k].prioridade) }));
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
export function normalizarCombinacao(c, { tipoPadrao = null, semMapeamento = false, prioridades = null } = {}) {
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
  const camada = camadaDe(
    { camada: c.camada ?? cond?.camada, tipo, regra: c.regra, semMapeamento: sem, fallback: c.fallback },
    prioridades
  );
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
    camada,
    status,
  };
}

/**
 * Normaliza GET mapa/ → {empresas: [{id, razao_social, cnpj, ativo, provedor_padrao, padrao, condicoes, sistema, semMapeamento}],
 * transversais, canais (transversais da camada Canal), sistema (demais transversais), fallback, camadas (legenda)}.
 * As condições de cada empresa vêm ordenadas por camada (Canal da empresa, Apólice); `sistema` = legado da empresa.
 */
export function normalizarMapa(data) {
  const lista = Array.isArray(data) ? data : data?.empresas || data?.results || [];
  const prioridades = prioridadesDasFaixas(data?.faixas);
  const empresas = lista
    .map((e) => {
      const p = e.prestador && typeof e.prestador === "object" ? e.prestador : e;
      const sem = !!e.sem_mapeamento;
      const todas = ordenarPorCamada((e.condicoes || []).map((c) => normalizarCombinacao(c, { prioridades })).filter(Boolean));
      return {
        id: p.id ?? e.prestador_id,
        razao_social: p.razao_social || `#${p.id}`,
        cnpj: p.cnpj || "",
        ativo: p.ativo !== false,
        provedor_padrao: p.provedor_padrao || "",
        padrao: normalizarCombinacao(e.padrao, { tipoPadrao: "padrao", semMapeamento: sem, prioridades }),
        // Canal da empresa → Apólice; `legado` (compat razão social, apólice 1–9 inativas) e outras camadas fora da
        // ordem normal vão para "Regras de sistema" da empresa (colapsado).
        condicoes: todas.filter((c) => ["canal_empresa", "canais", "apolice", "padrao"].includes(c.camada.chave)),
        sistema: todas.filter((c) => !["canal_empresa", "canais", "apolice", "padrao"].includes(c.camada.chave)),
        semMapeamento: sem,
      };
    })
    .sort((a, b) => String(a.razao_social).localeCompare(String(b.razao_social), "pt-BR"));
  const transversais = ordenarPorCamada(
    (Array.isArray(data?.transversais) ? data.transversais : []).map((c) => normalizarCombinacao(c, { prioridades })).filter(Boolean)
  );
  // Canais transversais (externo/VR) valem para todas as empresas; o resto (FALLBACK, XLSX inativa...) = "regras de sistema".
  const canais = transversais.filter((c) => ehCanal(c.camada));
  const sistema = transversais.filter((c) => !ehCanal(c.camada));
  // FALLBACK geral: o transversal da camada fallback (ou o `padrao` de uma empresa sem mapeamento).
  const fallback =
    transversais.find((c) => c.camada.chave === "fallback") ||
    empresas.find((e) => e.semMapeamento && e.padrao)?.padrao ||
    null;
  return { empresas, transversais, canais, sistema, fallback, camadas: camadasDaLegenda(data?.faixas) };
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

/** Comparação estrutural simples (valores do formulário). */
export function iguais(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Todos os campos do schema por grupos, achatados. */
export function camposDosGrupos(grupos) {
  return (grupos || []).flatMap((g) => g.campos || []);
}

/**
 * Valores do formulário a partir do detalhe do modelo (§4.2): colunas e campos virtuais (origem "campos_fixos")
 * já vêm no nível de cima pela `chave`; `campos_fixos_extras` = resto do JSON. Campos de origem "prestador"/"derivado"
 * não existem no modelo: vêm do `valor` dos grupos da ficha (só leitura).
 */
export function valoresDoModelo(modelo, campos, valoresFicha = {}) {
  const v = {};
  campos.forEach((c) => {
    const nome = nomeCampo(c);
    if (c.origem === "prestador" || c.origem === "derivado") {
      v[nome] = valoresFicha?.[nome];
      return;
    }
    const bruto = modelo?.[nome];
    v[nome] = nome === "prestador" && bruto && typeof bruto === "object" ? bruto.id : bruto;
  });
  if (!("hooks" in v)) v.hooks = modelo?.hooks ?? [];
  if (!("campos_fixos_extras" in v) && modelo && "campos_fixos_extras" in modelo) v.campos_fixos_extras = modelo.campos_fixos_extras;
  return v;
}

/** Normaliza o valor da apólice como o backend grava: maiúsculas, sem espaços. */
export const normalizarApolice = (v) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

/** Id do prestador de um grupo/versão de modelo (aceita objeto ou id). */
function idPrestador(p) {
  if (p == null) return null;
  return typeof p === "object" ? (p.id ?? null) : p;
}

/**
 * Opções do combo "Modelo base" do wizard (contrato §9.3): só versões ATIVAS, de modelos sem prestador ou do próprio
 * prestador, e do mesmo provedor da empresa (senão o backend recusa com 400 em base_modelo_id/provedor).
 * `grupos` = agruparModelos(GET modelos/). Rótulo "A-1 v1 · nome" (o código vem do grupo; as versões não trazem).
 */
export function opcoesModeloBase(grupos, empresa) {
  const provedor = empresa?.provedor_padrao || "";
  return (grupos || [])
    .filter((g) => g.ativa)
    .filter((g) => {
      const pid = idPrestador(g.prestador ?? g.ativa?.prestador);
      return pid == null || String(pid) === String(empresa?.id);
    })
    .filter((g) => !provedor || !g.provedor || g.provedor === provedor)
    .map((g) => ({
      id: g.ativa.id ?? g.id_ativo,
      codigo: g.codigo,
      versao: g.ativa.versao ?? g.versao_ativa,
      rotulo: `${g.codigo} v${g.ativa.versao ?? g.versao_ativa}${g.nome ? ` · ${g.nome}` : ""}`,
      daEmpresa: idPrestador(g.prestador ?? g.ativa?.prestador) != null,
    }));
}
