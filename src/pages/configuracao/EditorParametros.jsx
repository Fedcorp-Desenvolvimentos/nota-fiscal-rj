// Editor dos parâmetros de UMA versão de modelo (formulário por grupos do schema §4.8 + salvar com motivo, §4.3).
// Usado pela ficha do Mapa de emissão e pelo passo 2 do wizard "Nova configuração".
// Versão ativa = só leitura (mudança = clonar). `referencia` (opcional) destaca os campos que diferem dela
// (no wizard: o modelo base do rascunho recém-criado).
// Padrão derivado (§9.6): `campos_fixos._padrao_derivado` é só leitura — aparece como bloco informativo, fica fora do
// JSON editável (omitir no PATCH preserva) e trava o campo prestador (trocar → 400 no backend).
import { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import { FiLink, FiLock, FiSave } from "react-icons/fi";
import { configService } from "../../services/config";
import { CampoMotivo, ErrosBackend } from "./componentes";
import CampoModelo from "./CampoModelo";
import FormularioGrupos from "./FormularioGrupos";
import { camposDosGrupos, campoSomenteLeitura, diretivaDerivado, iguais, nomeCampo, valoresDoModelo } from "./mapaDados";
import { errosDeCampo, mensagemErro, notificarEscrita, validarMotivo } from "./utils";

// Campos que sempre diferem do modelo base num rascunho do mapa (identidade), fora do destaque.
const FORA_DO_DESTAQUE = new Set(["nome", "observacoes", "prestador", "slug", "codigo", "versao", "ativo"]);

/**
 * props: modelo (detalhe §4.2), schema (GET modelos/schema/), prestadores, valoresFicha ({campo: valor} dos grupos da
 *        ficha, para campos de origem prestador/derivado), editavel, onSalvo(modeloAtualizado), onSujo(bool),
 *        referencia (detalhe §4.2 a comparar; opcional).
 */
export default function EditorParametros({ modelo, schema, prestadores, valoresFicha, editavel, onSalvo, onSujo, referencia }) {
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

  // Nova versão em foco (ou recarregada do servidor): reinicia o formulário.
  useEffect(() => {
    setForm(original);
    setJsonValido(true);
    setErrosForm({});
    setErroSalvar(null);
  }, [original]);

  const derivado = useMemo(() => diretivaDerivado(modelo), [modelo]);
  const travados = useMemo(
    () =>
      derivado
        ? { prestador: "Padrão derivado: a empresa é fixa (ligada à regra padrão que será reapontada na ativação)." }
        : {},
    [derivado]
  );
  const somenteLeitura = useMemo(() => {
    const s = new Set(campos.filter(campoSomenteLeitura).map(nomeCampo));
    Object.keys(travados).forEach((k) => s.add(k));
    return s;
  }, [campos, travados]);
  const nomesConhecidos = useMemo(() => [...campos.map(nomeCampo), "hooks", "campos_fixos_extras", "motivo"], [campos]);

  // Só campos editáveis entram no PATCH (prestador/derivado nunca).
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

  const valoresReferencia = useMemo(
    () => (referencia ? valoresDoModelo(referencia, campos, valoresFicha) : null),
    [referencia, campos, valoresFicha]
  );
  const destacados = useMemo(() => {
    if (!valoresReferencia) return null;
    const s = new Set();
    Object.keys(form).forEach((k) => {
      if (!FORA_DO_DESTAQUE.has(k) && !somenteLeitura.has(k) && !iguais(form[k], valoresReferencia[k])) s.add(k);
    });
    return s;
  }, [form, valoresReferencia, somenteLeitura]);

  const obrigatoriosProvedor = useMemo(() => {
    const mapa = schema?.obrigatorios_por_provedor || {};
    return new Set(mapa[form.provedor] || []);
  }, [schema, form.provedor]);

  const salvar = async () => {
    const em = validarMotivo(motivo);
    if (em) {
      setErrosForm({ motivo: em });
      return;
    }
    if (!jsonValido) {
      enqueueSnackbar("Corrija o JSON (grupo Avançado) antes de salvar.", { variant: "warning" });
      return;
    }
    // Campos virtuais vão pela `chave` no nível de cima; null remove a chave (volta ao padrão do builder).
    setSalvando(true);
    setErrosForm({});
    setErroSalvar(null);
    try {
      const resp = await configService.atualizarModelo(modelo.id, { ...alterados }, motivo.trim());
      notificarEscrita(enqueueSnackbar, resp, "Rascunho salvo.");
      setMotivo("");
      const atualizado = resp?.objeto || (await configService.obterModelo(modelo.id));
      onSalvo?.(atualizado);
    } catch (e) {
      setErrosForm(errosDeCampo(e));
      setErroSalvar(e);
      enqueueSnackbar(mensagemErro(e, "Falha ao salvar o rascunho."), { variant: "error" });
    } finally {
      setSalvando(false);
    }
  };

  const temHooksNoForm = campos.some((c) => nomeCampo(c) === "hooks");
  const temExtrasNoForm = campos.some((c) => nomeCampo(c) === "campos_fixos_extras");
  const hooksMeta = schema?.campos_modelo?.hooks || { tipo: "hooks", rotulo: "Hooks" };

  if (!modelo) return null;

  return (
    <div>
      {!editavel && (
        <div className="cfg-aviso">
          <FiLock />
          <span>
            Versão ativa: emite de verdade e não pode ser editada (aqui nem no Django Admin). Use <strong>Clonar para editar</strong>,
            ajuste o rascunho, rode o dry-run e ative. Rollback: ativar de novo a versão anterior.
          </span>
        </div>
      )}
      {destacados && destacados.size > 0 && (
        <div className="cfg-aviso">
          <span>
            <strong>{destacados.size}</strong> campo(s) diferente(s) do modelo base, destacados em amarelo:{" "}
            <span className="cfg-mono">{[...destacados].join(", ")}</span>
          </span>
        </div>
      )}
      {derivado && (
        <div className="cfg-aviso">
          <FiLink />
          <span>
            <strong>
              Padrão derivado de {derivado.codigo_origem || "?"}
              {derivado.regra_id != null ? ` (regra ${derivado.regra_id})` : ""}
            </strong>
            . Ao ativar este rascunho, a regra padrão da empresa passa a apontar para ele; o {derivado.codigo_origem || "modelo de origem"}{" "}
            continua para as demais empresas. Vínculo gerenciado pelo sistema (só leitura)
            {derivado.modelo_origem_id != null ? ` · origem #${derivado.modelo_origem_id}` : ""}
            {derivado.criado_em ? ` · criado em ${String(derivado.criado_em).slice(0, 16).replace("T", " ")}` : ""}.
          </span>
        </div>
      )}
      <ErrosBackend erro={erroSalvar} conhecidos={nomesConhecidos} padrao="Falha ao salvar o rascunho." />

      {grupos.length ? (
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
          destacados={destacados}
          provedor={form.provedor}
          onValidezJson={setJsonValido}
          travados={travados}
        />
      ) : (
        <div className="cfg-aviso cfg-aviso-alerta">
          O backend não publicou <span className="cfg-mono">schema.grupos</span> (GET modelos/schema/ falhou ou está desatualizado):
          sem ele o formulário não pode ser montado. Recarregue a página; se persistir, confira o deploy do backend.
        </div>
      )}

      {/* Hooks e campos_fixos_extras vêm nos grupos "hooks"/"avancado" do schema; só cai aqui se faltarem. */}
      {(!temHooksNoForm || !temExtrasNoForm) && grupos.length > 0 && (
        <details className="cfg-avancado">
          <summary>Avançado — hooks e campos fixos não mapeados</summary>
          {!temHooksNoForm && (
            <CampoModelo
              nome="hooks"
              meta={hooksMeta}
              valor={form.hooks}
              onChange={(v) => setForm((f) => ({ ...f, hooks: v }))}
              schema={schema}
              prestadores={prestadores}
              desabilitado={!editavel}
              erro={errosForm.hooks}
            />
          )}
          {!temExtrasNoForm && (
            <CampoModelo
              nome="campos_fixos_extras"
              meta={{ tipo: "json", rotulo: "campos_fixos (só chaves sem campo no formulário)", ajuda: "Diretivas _* sem campo próprio e chaves desconhecidas." }}
              valor={form.campos_fixos_extras ?? {}}
              onChange={(v) => setForm((f) => ({ ...f, campos_fixos_extras: v }))}
              schema={schema}
              prestadores={prestadores}
              desabilitado={!editavel}
              erro={errosForm.campos_fixos_extras}
              onValidezJson={setJsonValido}
            />
          )}
        </details>
      )}

      {editavel && (
        <div style={{ marginTop: 16 }}>
          <CampoMotivo valor={motivo} onChange={setMotivo} erro={errosForm.motivo} />
          <div className="cfg-acoes" style={{ justifyContent: "flex-end" }}>
            {sujo && <small className="cfg-ajuda">{Object.keys(alterados).length} campo(s) alterado(s)</small>}
            <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setForm(original)} disabled={!sujo || salvando}>
              Descartar
            </button>
            <button type="button" className="cfg-btn cfg-btn-primario" onClick={salvar} disabled={!sujo || salvando || !jsonValido}>
              <FiSave /> {salvando ? "Salvando…" : "Salvar rascunho"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
