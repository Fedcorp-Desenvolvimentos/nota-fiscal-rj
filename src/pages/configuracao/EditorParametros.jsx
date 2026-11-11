// Parâmetros de uma versão de modelo: formulário por grupos + salvar (PATCH modelos/{id}/ com motivo).
// Publicado = só leitura (mudança = "Editar", que abre um rascunho).
import { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import { FiSave } from "react-icons/fi";
import { configService } from "../../services/config";
import { ErrosBackend } from "./componentes";
import FormularioGrupos from "./FormularioGrupos";
import { camposDosGrupos, campoSomenteLeitura, iguais, nomeCampo, valoresDoModelo } from "./mapaDados";
import { errosDeCampo, mensagemErro, notificarEscrita, validarMotivo } from "./utils";

/** props: modelo (detalhe §4.2), schema, prestadores, valoresFicha, editavel, onSalvo(modelo), onSujo(bool). */
export default function EditorParametros({ modelo, schema, prestadores, valoresFicha, editavel, onSalvo, onSujo }) {
  const { enqueueSnackbar } = useSnackbar();
  const grupos = useMemo(() => schema?.grupos || [], [schema]);
  const campos = useMemo(() => camposDosGrupos(grupos), [grupos]);
  const original = useMemo(() => (modelo ? valoresDoModelo(modelo, campos, valoresFicha) : {}), [modelo, campos, valoresFicha]);

  const [form, setForm] = useState(original);
  const [jsonValido, setJsonValido] = useState(true);
  const [errosForm, setErrosForm] = useState({});
  const [erroSalvar, setErroSalvar] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setForm(original);
    setJsonValido(true);
    setErrosForm({});
    setErroSalvar(null);
  }, [original]);

  const somenteLeitura = useMemo(() => new Set(campos.filter(campoSomenteLeitura).map(nomeCampo)), [campos]);
  const alterados = useMemo(() => {
    const out = {};
    Object.keys(form).forEach((k) => {
      if (!somenteLeitura.has(k) && !iguais(form[k], original[k])) out[k] = form[k];
    });
    return out;
  }, [form, original, somenteLeitura]);
  const sujo = Object.keys(alterados).length > 0;
  const nomesAlterados = useMemo(() => new Set(Object.keys(alterados)), [alterados]);

  useEffect(() => {
    onSujo?.(sujo);
  }, [sujo, onSujo]);

  const obrigatoriosProvedor = useMemo(() => new Set((schema?.obrigatorios_por_provedor || {})[form.provedor] || []), [schema, form.provedor]);

  const salvar = async () => {
    const em = validarMotivo(motivo);
    if (em) {
      setErrosForm({ motivo: em });
      return;
    }
    if (!jsonValido) {
      enqueueSnackbar("JSON inválido.", { variant: "warning" });
      return;
    }
    setSalvando(true);
    setErrosForm({});
    setErroSalvar(null);
    try {
      const resp = await configService.atualizarModelo(modelo.id, { ...alterados }, motivo.trim());
      notificarEscrita(enqueueSnackbar, resp, "Salvo.");
      setMotivo("");
      onSalvo?.(resp?.objeto || (await configService.obterModelo(modelo.id)));
    } catch (e) {
      setErrosForm(errosDeCampo(e));
      setErroSalvar(e);
      enqueueSnackbar(mensagemErro(e, "Falha ao salvar."), { variant: "error" });
    } finally {
      setSalvando(false);
    }
  };

  if (!modelo) return null;
  if (!grupos.length) return <div className="cfg-estado">Schema indisponível.</div>;

  return (
    <div>
      <ErrosBackend erro={erroSalvar} padrao="Falha ao salvar." />
      <FormularioGrupos
        key={modelo.id}
        grupos={grupos}
        valores={form}
        onChange={(nome, v) => setForm((f) => ({ ...f, [nome]: v }))}
        schema={schema}
        prestadores={prestadores}
        desabilitado={!editavel}
        erros={errosForm}
        obrigatorios={obrigatoriosProvedor}
        alterados={nomesAlterados}
        provedor={form.provedor}
        onValidezJson={setJsonValido}
      />
      {editavel && sujo && (
        <div className="cfg-salvar">
          <input
            className={`cfg-input ${errosForm.motivo ? "cfg-input-erro" : ""}`}
            placeholder="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            title={errosForm.motivo || ""}
          />
          <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setForm(original)} disabled={salvando}>
            Desfazer
          </button>
          <button type="button" className="cfg-btn cfg-btn-primario" onClick={salvar} disabled={salvando || !jsonValido}>
            <FiSave /> {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      )}
    </div>
  );
}
