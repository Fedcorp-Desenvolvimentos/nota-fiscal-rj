// Normalização das respostas do Mapa v2 (contrato §10) e utilitários do formulário de modelo.

/** Normaliza a apólice como o backend grava: maiúsculas, sem espaços. */
export const normalizarApolice = (v) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Estado de um item do mapa (§10.2): "rascunho" (laranja) se há edição pendente; "publicado" (verde) se o modelo está
 * ativo e o item valendo; senão "desligado" (cinza: apólice desativada, padrão desligado ou só rascunho novo).
 */
export function estadoDe(item) {
  if (!item) return "desligado";
  if (item.rascunho) return "rascunho";
  if (item.modelo?.ativo && item.ativa !== false) return "publicado";
  return "desligado";
}

/**
 * GET mapa/ (§10) → {empresas:[{id, razao_social, cnpj, ativo, padrao, apolices[]}], integracoes[]}.
 * padrao: {modelo, rascunho} | null; apolices: [{apolice, modelo, rascunho, ativa}].
 */
export function normalizarMapa(data) {
  const empresas = (data?.empresas || []).map((e) => {
    const p = e.prestador || {};
    return {
      id: p.id,
      razao_social: p.razao_social || p.cnpj || `#${p.id}`,
      cnpj: p.cnpj || "",
      ativo: p.ativo !== false,
      padrao: e.padrao || null,
      apolices: (e.apolices || []).map((a) => ({ ...a, apolice: a.apolice ?? a.codigo })),
    };
  });
  const integracoes = (data?.integracoes || []).map((i) => ({ ...i, chave: i.chave, rotulo: i.rotulo || i.chave }));
  return { empresas, integracoes };
}

/** O campo do schema se aplica ao provedor atual? (`provedores` vazio/ausente = todos). */
export function campoDoProvedor(campo, provedor) {
  const lista = campo?.provedores;
  if (!Array.isArray(lista) || lista.length === 0 || !provedor) return true;
  return lista.includes(provedor);
}

/** Nome do campo de schema.grupos (§4.8: `chave`; aceita `nome`). */
export const nomeCampo = (c) => c?.chave ?? c?.nome;

/** Campo só leitura por natureza (vem do prestador ou é calculado pelo builder). */
export const campoSomenteLeitura = (c) => c?.editavel === false || c?.origem === "prestador" || c?.origem === "derivado";

export function iguais(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function camposDosGrupos(grupos) {
  return (grupos || []).flatMap((g) => g.campos || []);
}

/** Diretiva gerida pelo sistema (vínculo do padrão derivado): fica fora do JSON editável. */
const DIRETIVA_DERIVADO = "_padrao_derivado";

/**
 * Valores do formulário a partir do detalhe do modelo (§4.2). Campos de origem "prestador"/"derivado" vêm dos grupos
 * da ficha (`valoresFicha`, só leitura).
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
  if (v.campos_fixos_extras && typeof v.campos_fixos_extras === "object" && DIRETIVA_DERIVADO in v.campos_fixos_extras) {
    const { [DIRETIVA_DERIVADO]: _ignorada, ...resto } = v.campos_fixos_extras;
    v.campos_fixos_extras = resto;
  }
  return v;
}
