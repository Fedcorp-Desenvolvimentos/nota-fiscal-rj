// Campo dinâmico do formulário de modelo, montado a partir de GET modelos/schema/.
import { Campo, JsonEditor } from "./componentes";
import { opcoesEnum } from "./utils";

function ListaHooks({ valor, onChange, hooks, hooksRemovidos, desabilitado }) {
  const selecionados = Array.isArray(valor) ? valor : [];
  const conhecidos = new Set(hooks.map((h) => h.nome));
  const desconhecidos = selecionados.filter((n) => !conhecidos.has(n));
  const motivoRemovido = (nome) => hooksRemovidos.find((h) => h.nome === nome)?.motivo;

  const alternar = (nome) => {
    if (selecionados.includes(nome)) onChange(selecionados.filter((n) => n !== nome));
    else onChange([...selecionados, nome]);
  };

  return (
    <div className="cfg-hooks">
      {hooks.length === 0 && <small className="cfg-ajuda">Nenhum hook disponível no schema.</small>}
      {hooks.map((h) => (
        <label key={h.nome} className="cfg-hook">
          <input type="checkbox" checked={selecionados.includes(h.nome)} disabled={desabilitado} onChange={() => alternar(h.nome)} />
          <span>
            <span className="cfg-mono">{h.nome}</span>
            {h.descricao && <small>{h.descricao}</small>}
          </span>
        </label>
      ))}
      {desconhecidos.map((nome) => (
        <label key={nome} className="cfg-hook cfg-hook-desconhecido">
          <input type="checkbox" checked disabled={desabilitado} onChange={() => alternar(nome)} />
          <span>
            <span className="cfg-mono">{nome}</span>
            <small>{motivoRemovido(nome) || "Hook não registrado: será recusado ao salvar."}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Linha cinza "vai como `x` no JSON" (+ origem campos_fixos), usada pelo formulário por grupos. */
function DestinoJson({ meta }) {
  const origem = meta?.origem;
  const extra = origem === "campos_fixos" || origem === "prestador" || origem === "derivado";
  if (!meta?.chave_json && !extra && !meta?.afeta?.length) return null;
  return (
    <small className="cfg-chave-json">
      {meta.chave_json && (
        <>
          vai como <code>{meta.chave_json}</code> no JSON
        </>
      )}
      {meta.afeta?.length > 0 && <> · afeta {meta.afeta.map((a) => <code key={a}>{a}</code>)}</>}
      {origem === "campos_fixos" && meta.chave_campos_fixos && (
        <span className="cfg-origem">
          {" "}
          · em campos_fixos[<code>{meta.chave_campos_fixos}</code>]
        </span>
      )}
      {origem === "prestador" && <span className="cfg-origem"> · vem do Prestador (editar na aba Prestadores)</span>}
      {origem === "derivado" && <span className="cfg-origem"> · calculado pelo builder (informativo)</span>}
    </small>
  );
}

/** Texto do placeholder a partir de `padrao` (valor que o builder usa quando o campo está vazio). */
function textoPadrao(meta) {
  if (meta?.padrao === null || meta?.padrao === undefined || meta?.padrao === "") return undefined;
  const v = typeof meta.padrao === "object" ? JSON.stringify(meta.padrao) : String(meta.padrao);
  return `padrão: ${v}`;
}

// Tipos do contrato (4.8: texto, inteiro, decimal, booleano, enum, json, fk_prestador, hooks) e nomes internos do Django.
const TIPOS_INTEIRO = ["integer", "int", "inteiro", "positiveinteger", "positivesmallinteger", "smallinteger", "number"];
const TIPOS_BOOL = ["boolean", "bool", "booleano"];

/**
 * Renderiza um campo do modelo.
 * meta: schema.campos_modelo[nome] ou um campo de schema.grupos[].campos
 *   ({tipo, obrigatorio, rotulo, ajuda, choices, chave_json, origem, max_digits, decimal_places, max_length}).
 * Campos com origem "campos_fixos" são enviados pelo nome no PATCH (o backend grava dentro de campos_fixos).
 */
export default function CampoModelo(props) {
  const { meta = {} } = props;
  return (
    <div className="cfg-campo-modelo">
      <CampoModeloInterno {...props} />
      <DestinoJson meta={meta} />
    </div>
  );
}

function CampoModeloInterno({ nome, meta = {}, valor, onChange, schema, prestadores = [], desabilitado, erro, obrigatorio, onValidezJson }) {
  const rotulo = meta.rotulo || nome;
  const ajuda = meta.ajuda;
  // Aceita "decimal" ou o nome interno do Django ("DecimalField", "BooleanField"...).
  const tipo = String(meta.tipo || "").toLowerCase().replace(/field$/, "");
  const enums = schema?.enums || {};
  const choices = Array.isArray(meta.choices) && meta.choices.length ? meta.choices : enums[nome];

  if (nome === "hooks") {
    return (
      <Campo label={rotulo} erro={erro} ajuda={ajuda || "Executados na ordem marcada."} obrigatorio={obrigatorio}>
        <ListaHooks
          valor={valor}
          onChange={onChange}
          hooks={schema?.hooks || []}
          hooksRemovidos={schema?.hooks_removidos || []}
          desabilitado={desabilitado}
        />
      </Campo>
    );
  }

  if (nome === "campos_fixos" || tipo === "json" || tipo === "mapa_texto") {
    const diretivas = schema?.diretivas_campos_fixos || [];
    return (
      <Campo label={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio}>
        <JsonEditor valor={valor} onChange={onChange} onValidez={onValidezJson} desabilitado={desabilitado} linhas={8} />
        {diretivas.length > 0 && (
          <small className="cfg-ajuda">
            Diretivas: {diretivas.map((d) => `${d.nome}${d.descricao ? ` (${d.descricao})` : ""}`).join("; ")}
          </small>
        )}
      </Campo>
    );
  }

  if (nome === "prestador" || tipo === "fk" || tipo === "foreignkey" || tipo === "fk_prestador") {
    const atual = valor && typeof valor === "object" ? valor.id : valor;
    return (
      <Campo label={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio}>
        <select
          className="cfg-input"
          value={atual ?? ""}
          disabled={desabilitado}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">—</option>
          {prestadores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.razao_social}
              {p.ativo ? "" : " (inativo)"}
            </option>
          ))}
        </select>
      </Campo>
    );
  }

  if (choices) {
    const opcoes = opcoesEnum(choices);
    const igual = (o) => String(o.valor) === String(valor ?? "");
    return (
      <Campo label={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio}>
        <select
          className="cfg-input"
          value={valor ?? ""}
          disabled={desabilitado}
          onChange={(e) => {
            // Devolve o valor no tipo original da opção (choices numéricas continuam números); "" = nulo.
            const o = opcoes.find((x) => String(x.valor) === e.target.value);
            onChange(e.target.value === "" ? null : o ? o.valor : e.target.value);
          }}
        >
          {(valor === null || valor === undefined || valor === "") ? (
            <option value="">{textoPadrao(meta) ? `— (${textoPadrao(meta)})` : "—"}</option>
          ) : (
            !opcoes.some(igual) && <option value={valor}>{String(valor)}</option>
          )}
          {!meta.obrigatorio && valor !== null && valor !== undefined && valor !== "" && (
            <option value="">{textoPadrao(meta) ? `limpar (${textoPadrao(meta)})` : "limpar (vazio)"}</option>
          )}
          {opcoes.map((o) => (
            <option key={String(o.valor)} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </Campo>
    );
  }

  if (TIPOS_BOOL.includes(tipo) || typeof valor === "boolean") {
    return (
      <Campo erro={erro} ajuda={ajuda}>
        <label className="cfg-check">
          <input type="checkbox" checked={!!valor} disabled={desabilitado} onChange={(e) => onChange(e.target.checked)} />
          {rotulo}
        </label>
      </Campo>
    );
  }

  if (tipo === "text" || tipo === "textfield" || nome === "descricao_padrao" || nome === "observacoes") {
    return (
      <Campo label={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio}>
        <textarea className="cfg-input" rows={3} value={valor ?? ""} disabled={desabilitado} onChange={(e) => onChange(e.target.value)} />
      </Campo>
    );
  }

  const numerico = tipo === "decimal" || TIPOS_INTEIRO.includes(tipo);
  const ajudaNum =
    tipo === "decimal" && meta.decimal_places != null ? `${ajuda ? `${ajuda} ` : ""}(${meta.decimal_places} casas; vazio = nulo)` : ajuda;
  return (
    <Campo label={rotulo} erro={erro} ajuda={ajudaNum} obrigatorio={obrigatorio}>
      <input
        className="cfg-input"
        inputMode={numerico ? "decimal" : undefined}
        maxLength={meta.max_length || undefined}
        placeholder={textoPadrao(meta)}
        value={valor ?? ""}
        disabled={desabilitado}
        onChange={(e) => {
          const v = e.target.value;
          if (tipo === "decimal") onChange(v === "" ? null : v.replace(",", "."));
          else if (numerico) onChange(v === "" ? null : /^\d+$/.test(v) ? Number(v) : v);
          else onChange(v);
        }}
      />
    </Campo>
  );
}
