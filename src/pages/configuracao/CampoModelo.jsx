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

/**
 * Renderiza um campo do modelo.
 * meta: schema.campos_modelo[nome] ({tipo, obrigatorio, rotulo, ajuda, max_digits, decimal_places, max_length})
 */
export default function CampoModelo({ nome, meta = {}, valor, onChange, schema, prestadores, desabilitado, erro, obrigatorio, onValidezJson }) {
  const rotulo = meta.rotulo || nome;
  const ajuda = meta.ajuda;
  // Aceita "decimal" ou o nome interno do Django ("DecimalField", "BooleanField"...).
  const tipo = String(meta.tipo || "").toLowerCase().replace(/field$/, "");
  const enums = schema?.enums || {};

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

  if (nome === "campos_fixos" || tipo === "json") {
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

  if (nome === "prestador" || tipo === "fk" || tipo === "foreignkey") {
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

  if (enums[nome]) {
    const opcoes = opcoesEnum(enums[nome]);
    return (
      <Campo label={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio}>
        <select className="cfg-input" value={valor ?? ""} disabled={desabilitado} onChange={(e) => onChange(e.target.value)}>
          {!opcoes.some((o) => o.valor === valor) && <option value={valor ?? ""}>{valor || "—"}</option>}
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </Campo>
    );
  }

  if (tipo === "boolean" || tipo === "bool" || typeof valor === "boolean") {
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

  const numerico = ["decimal", "integer", "int", "positiveinteger", "positivesmallinteger", "number"].includes(tipo);
  const ajudaNum =
    tipo === "decimal" && meta.decimal_places != null ? `${ajuda ? `${ajuda} ` : ""}(${meta.decimal_places} casas; vazio = nulo)` : ajuda;
  return (
    <Campo label={rotulo} erro={erro} ajuda={ajudaNum} obrigatorio={obrigatorio}>
      <input
        className="cfg-input"
        inputMode={numerico ? "decimal" : undefined}
        maxLength={meta.max_length || undefined}
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
