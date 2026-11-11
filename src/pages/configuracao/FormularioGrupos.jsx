// Formulário de modelo por grupos (contrato §4.8: schema.grupos[{chave, rotulo, campos[]}]).
// Cada grupo vira uma seção colapsável; cada campo usa o CampoModelo (rótulo, ajuda e a chave_json em cinza).
import { useState } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import CampoModelo from "./CampoModelo";
import { campoDoProvedor, campoSomenteLeitura, nomeCampo } from "./mapaDados";

// Campos largos ocupam a linha inteira da grade.
const LARGOS = new Set(["campos_fixos", "campos_fixos_extras", "hooks", "descricao_padrao", "observacoes", "discriminacao_padrao"]);
const TIPOS_LARGOS = new Set(["json", "mapa_texto", "hooks"]);

function Grupo({ grupo, aberto, onAlternar, children, qtdAlterados, qtdDestacados }) {
  return (
    <section className={`cfg-grupo ${aberto ? "aberto" : ""}`}>
      <button type="button" className="cfg-grupo-titulo" onClick={onAlternar} aria-expanded={aberto}>
        {aberto ? <FiChevronDown /> : <FiChevronRight />}
        <span>{grupo.rotulo || grupo.chave}</span>
        <small className="cfg-ajuda">
          {grupo.campos.length} campo(s)
          {qtdAlterados > 0 ? ` · ${qtdAlterados} alterado(s)` : ""}
          {qtdDestacados > 0 ? ` · ${qtdDestacados} diferente(s) do modelo base` : ""}
        </small>
      </button>
      {aberto && <div className="cfg-grupo-corpo">{children}</div>}
    </section>
  );
}

/**
 * props:
 *  - grupos: schema.grupos (já filtrados ou não por provedor; filtra de novo por `provedor`)
 *  - valores: {nome: valor}; onChange(nome, valor)
 *  - alterados: Set de nomes alterados (marca o grupo)
 *  - erros: {nome: "msg"}; obrigatorios: Set extra (obrigatórios por provedor)
 *  - destacados: Set de nomes que diferem de uma referência (ex.: modelo base no wizard); marca o campo e o grupo
 *  - travados: {nome: "explicação"} — campos desabilitados por regra do backend (ex.: prestador do padrão derivado)
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
  abertosInicial,
  destacados,
  travados = {},
}) {
  const visiveis = grupos
    .map((g) => ({ ...g, campos: (g.campos || []).filter((c) => campoDoProvedor(c, provedor)) }))
    .filter((g) => g.campos.length > 0);

  const [abertos, setAbertos] = useState(() => new Set(abertosInicial || visiveis.slice(0, 2).map((g) => g.chave)));
  const alternar = (chave) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  // Erro em campo de grupo fechado: abre o grupo para o usuário ver.
  const comErro = (g) => g.campos.some((c) => erros[nomeCampo(c)]);
  const qtdDestacados = (g) => (destacados ? g.campos.filter((c) => destacados.has(nomeCampo(c))).length : 0);

  if (visiveis.length === 0) return <div className="cfg-estado">O schema não trouxe grupos de campos.</div>;

  return (
    <div className="cfg-grupos">
      <div className="cfg-acoes" style={{ justifyContent: "flex-end", marginBottom: 6 }}>
        <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={() => setAbertos(new Set(visiveis.map((g) => g.chave)))}>
          Expandir todos
        </button>
        <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={() => setAbertos(new Set())}>
          Recolher todos
        </button>
      </div>
      {visiveis.map((g) => (
        <Grupo
          key={g.chave}
          grupo={g}
          aberto={abertos.has(g.chave) || comErro(g)}
          onAlternar={() => alternar(g.chave)}
          qtdAlterados={alterados ? g.campos.filter((c) => alterados.has(nomeCampo(c))).length : 0}
          qtdDestacados={qtdDestacados(g)}
        >
          <div className="cfg-grid">
            {g.campos.map((c) => {
              const nome = nomeCampo(c);
              return (
                <div
                  key={nome}
                  className={`${LARGOS.has(nome) || TIPOS_LARGOS.has(c.tipo) ? "cfg-grid-largo" : ""} ${destacados?.has(nome) ? "cfg-campo-diferente" : ""}`}
                  title={destacados?.has(nome) ? "Difere do modelo base" : undefined}
                >
                  <CampoModelo
                    nome={nome}
                    meta={c}
                    valor={valores[nome]}
                    onChange={(v) => onChange?.(nome, v)}
                    schema={schema}
                    prestadores={prestadores}
                    desabilitado={desabilitado || campoSomenteLeitura(c) || !!travados[nome]}
                    erro={erros[nome]}
                    obrigatorio={!!c.obrigatorio || !!obrigatorios?.has(nome)}
                    onValidezJson={onValidezJson}
                  />
                  {travados[nome] && <small className="cfg-ajuda">{travados[nome]}</small>}
                </div>
              );
            })}
          </div>
        </Grupo>
      ))}
    </div>
  );
}
