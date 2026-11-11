// Formulário do modelo por grupos (schema.grupos[{chave, rotulo, campos[]}]). Grupos recolhidos, exceto os mais usados.
import { useState } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import CampoModelo from "./CampoModelo";
import { campoDoProvedor, campoSomenteLeitura, nomeCampo } from "./mapaDados";

/** Grupos abertos por padrão (os mais editados). */
const ABERTOS_PADRAO = ["iss", "pis_cofins", "nbs"];
/** Campos geridos pelo sistema (versão, código, empresa): fora do formulário. */
const OCULTOS = new Set(["codigo", "slug", "versao", "ativo", "prestador"]);
const LARGOS = new Set(["campos_fixos", "campos_fixos_extras", "hooks", "descricao_padrao", "observacoes", "discriminacao_padrao"]);
const TIPOS_LARGOS = new Set(["json", "mapa_texto", "hooks"]);

/**
 * props: grupos, valores {nome: valor}, onChange(nome, valor), schema, prestadores, desabilitado, erros {nome: msg},
 *        obrigatorios (Set), alterados (Set), provedor, onValidezJson.
 */
export default function FormularioGrupos({
  grupos = [],
  valores = {},
  onChange,
  schema,
  prestadores,
  desabilitado,
  erros = {},
  obrigatorios,
  alterados,
  provedor,
  onValidezJson,
}) {
  const visiveis = grupos
    .map((g) => ({ ...g, campos: (g.campos || []).filter((c) => !OCULTOS.has(nomeCampo(c)) && campoDoProvedor(c, provedor)) }))
    .filter((g) => g.campos.length > 0);
  const [abertos, setAbertos] = useState(() => new Set(ABERTOS_PADRAO));
  const alternar = (chave) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  if (visiveis.length === 0) return <div className="cfg-estado">Sem campos.</div>;

  return (
    <div className="cfg-grupos">
      {visiveis.map((g) => {
        const comErro = g.campos.some((c) => erros[nomeCampo(c)]);
        const aberto = abertos.has(g.chave) || comErro;
        const qtdAlterados = alterados ? g.campos.filter((c) => alterados.has(nomeCampo(c))).length : 0;
        return (
          <section key={g.chave} className={`cfg-grupo ${aberto ? "aberto" : ""}`}>
            <button type="button" className="cfg-grupo-titulo" onClick={() => alternar(g.chave)} aria-expanded={aberto}>
              {aberto ? <FiChevronDown /> : <FiChevronRight />}
              <span>{g.rotulo || g.chave}</span>
              {qtdAlterados > 0 && <small className="cfg-meta">{qtdAlterados} alterado(s)</small>}
            </button>
            {aberto && (
              <div className="cfg-grupo-corpo cfg-grid">
                {g.campos.map((c) => {
                  const nome = nomeCampo(c);
                  return (
                    <div key={nome} className={LARGOS.has(nome) || TIPOS_LARGOS.has(c.tipo) ? "cfg-grid-largo" : ""}>
                      <CampoModelo
                        nome={nome}
                        meta={c}
                        valor={valores[nome]}
                        onChange={(v) => onChange?.(nome, v)}
                        schema={schema}
                        prestadores={prestadores}
                        desabilitado={desabilitado || campoSomenteLeitura(c)}
                        erro={erros[nome]}
                        obrigatorio={!!c.obrigatorio || !!obrigatorios?.has(nome)}
                        onValidezJson={onValidezJson}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
