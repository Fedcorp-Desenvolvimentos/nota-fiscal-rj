// Campo dinâmico do formulário de modelo (rótulo curto + valor; ajuda e chave_json só no ícone (i)).
import { Campo, Info, JsonEditor } from "./componentes";
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
      {hooks.length === 0 && <small className="cfg-ajuda">—</small>}
      {hooks.map((h) => (
        <label key={h.nome} className="cfg-hook">
          <input type="checkbox" checked={selecionados.includes(h.nome)} disabled={desabilitado} onChange={() => alternar(h.nome)} />
          <span>
            <span className="cfg-mono">{h.nome}</span>
            <Info texto={h.descricao} />
          </span>
        </label>
      ))}
      {desconhecidos.map((nome) => (
        <label key={nome} className="cfg-hook cfg-hook-desconhecido">
          <input type="checkbox" checked disabled={desabilitado} onChange={() => alternar(nome)} />
          <span>
            <span className="cfg-mono">{nome}</span>
            <Info texto={motivoRemovido(nome) || "Hook não registrado"} />
          </span>
        </label>
      ))}
    </div>
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

/** Texto do (i): ajuda do schema + chave no JSON enviado à Focus. */
function textoInfo(meta) {
  const partes = [];
  if (meta?.ajuda) partes.push(meta.ajuda);
  if (meta?.chave_json) partes.push(`JSON: ${meta.chave_json}`);
  if (meta?.origem === "prestador") partes.push("Vem do prestador");
  return partes.join(" · ");
}

/**
 * Campo do modelo montado a partir de GET modelos/schema/ (grupos[].campos ou campos_modelo).
 * Campos com origem "campos_fixos" vão pelo nome no PATCH (o backend grava dentro de campos_fixos).
 */
export default function CampoModelo(props) {
  return <CampoModeloInterno {...props} />;
}

function CampoModeloInterno({ nome, meta = {}, valor, onChange, schema, prestadores = [], desabilitado, erro, obrigatorio, onValidezJson }) {
  const rotulo = meta.rotulo || nome;
  const ajuda = textoInfo(meta);
  // Aceita "decimal" ou o nome interno do Django ("DecimalField", "BooleanField"...).
  const tipo = String(meta.tipo || "").toLowerCase().replace(/field$/, "");
  const enums = schema?.enums || {};
  const choices = Array.isArray(meta.choices) && meta.choices.length ? meta.choices : enums[nome];

  if (nome === "hooks") {
    return (
      <Campo label={rotulo} erro={erro} info={ajuda} obrigatorio={obrigatorio}>
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
    return (
      <Campo label={rotulo} erro={erro} info={ajuda} obrigatorio={obrigatorio}>
        <JsonEditor valor={valor} onChange={onChange} onValidez={onValidezJson} desabilitado={desabilitado} linhas={8} />
      </Campo>
    );
  }

  if (nome === "prestador" || tipo === "fk" || tipo === "foreignkey" || tipo === "fk_prestador") {
    const atual = valor && typeof valor === "object" ? valor.id : valor;
    return (
      <Campo label={rotulo} erro={erro} info={ajuda} obrigatorio={obrigatorio}>
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
      <Campo label={rotulo} erro={erro} info={ajuda} obrigatorio={obrigatorio}>
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
      <Campo erro={erro}>
        <label className="cfg-check">
          <input type="checkbox" checked={!!valor} disabled={desabilitado} onChange={(e) => onChange(e.target.checked)} />
          {rotulo}
          <Info texto={ajuda} />
        </label>
      </Campo>
    );
  }

  if (tipo === "text" || tipo === "textfield" || nome === "descricao_padrao" || nome === "observacoes") {
    return (
      <Campo label={rotulo} erro={erro} info={ajuda} obrigatorio={obrigatorio}>
        <textarea className="cfg-input" rows={3} value={valor ?? ""} disabled={desabilitado} onChange={(e) => onChange(e.target.value)} />
      </Campo>
    );
  }

  const numerico = tipo === "decimal" || TIPOS_INTEIRO.includes(tipo);
  return (
    <Campo label={rotulo} erro={erro} info={ajuda} obrigatorio={obrigatorio}>
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
