// Ficha de uma combinação do Mapa de emissão (empresa × condição): GET mapa/{prestador_id}/{condicao}/.
// Cabeçalho (empresa, condição, regra, versão ativa) + formulário por grupos (schema.grupos) da versão escolhida
// (ativa = travada, "Clonar para editar"; rascunho = editável), dry-run, ativação, últimas notas e payload de exemplo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { FiCopy, FiSave, FiPlay, FiCheckCircle, FiLock, FiAlertTriangle, FiSettings, FiFileText } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, CampoMotivo, Estado, JsonView, ListaDetalhes, Modal, Campo } from "./componentes";
import CampoModelo from "./CampoModelo";
import DryRunPainel from "./DryRunPainel";
import ResumoAtivacao from "./ResumoAtivacao";
import FormularioGrupos from "./FormularioGrupos";
import { campoSomenteLeitura, corCondicao, nomeCampo, normalizarCombinacao, rotuloVersao } from "./mapaDados";
import {
  codigoErro,
  comoLista,
  errosDeCampo,
  formatarCnpj,
  formatarData,
  listaCampos,
  mensagemBackend,
  mensagemErro,
  notificarEscrita,
  precisaConfirmar,
  validarMotivo,
} from "./utils";

function iguais(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Todos os campos do schema por grupos, achatados. */
function camposDosGrupos(grupos) {
  return (grupos || []).flatMap((g) => g.campos || []);
}

/**
 * Valores do formulário a partir do detalhe do modelo (§4.2): colunas e campos virtuais (origem "campos_fixos")
 * já vêm no nível de cima pela `chave`; `campos_fixos_extras` = resto do JSON. Campos de origem "prestador"/"derivado"
 * não existem no modelo: vêm do `valor` dos grupos da ficha (só leitura).
 */
function valoresDoModelo(modelo, campos, valoresFicha = {}) {
  const v = {};
  campos.forEach((c) => {
    const nome = nomeCampo(c);
    if (c.origem === "prestador" || c.origem === "derivado") {
      v[nome] = valoresFicha[nome];
      return;
    }
    const bruto = modelo?.[nome];
    v[nome] = nome === "prestador" && bruto && typeof bruto === "object" ? bruto.id : bruto;
  });
  if (!("hooks" in v)) v.hooks = modelo?.hooks ?? [];
  if (!("campos_fixos_extras" in v) && modelo && "campos_fixos_extras" in modelo) v.campos_fixos_extras = modelo.campos_fixos_extras;
  return v;
}

function normalizarFicha(d, condicaoUrl) {
  if (!d) return null;
  const sem = !!d.sem_mapeamento;
  const comb = normalizarCombinacao(
    { ...d, condicao: d.condicao || { chave: condicaoUrl, tipo: condicaoUrl === "padrao" ? "padrao" : undefined } },
    { tipoPadrao: condicaoUrl === "padrao" ? "padrao" : null, semMapeamento: sem }
  );
  // Valores dos campos por grupo (do modelo exibido pela ficha): usados para os campos só leitura (prestador/derivado).
  const valoresFicha = {};
  (d.grupos || []).forEach((g) => (g.campos || []).forEach((c) => (valoresFicha[nomeCampo(c)] = c.valor)));
  const ex = d.exemplo_payload;
  return {
    ...comb,
    prestador: d.prestador || null,
    regra: d.regra || null,
    modeloExibido: d.modelo && typeof d.modelo === "object" ? d.modelo : null,
    valoresFicha,
    ultimasNotas: comoLista(d.ultimas_notas),
    exemplo: ex && typeof ex === "object" && ("payload" in ex || "erro" in ex) ? ex : ex ? { payload: ex } : null,
    avisos: d.avisos || [],
  };
}

/** Versões selecionáveis na ficha: ativa + rascunhos (+ o modelo exibido, se inativo e fora da lista). */
function versoesDaFicha(f) {
  const lista = [];
  const add = (v, papel) => {
    if (v?.id != null && !lista.some((x) => String(x.id) === String(v.id))) lista.push({ ...v, papel });
  };
  add(f.modeloAtivo, "ativa");
  f.rascunhos.forEach((r) => add(r, "rascunho"));
  if (f.modeloExibido) add(f.modeloExibido, f.modeloExibido.ativo ? "ativa" : "rascunho");
  return lista;
}

export default function MapaFicha() {
  const { prestadorId, condicao } = useParams();
  const location = useLocation();
  const { enqueueSnackbar } = useSnackbar();
  const ctx = useOutletContext() || {};

  const [ficha, setFicha] = useState(null);
  const [schema, setSchema] = useState(null);
  const [prestadores, setPrestadores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Versão em foco: id da ativa ou de um rascunho.
  const [versaoId, setVersaoId] = useState(null);
  const [modelo, setModelo] = useState(null);
  const [carregandoModelo, setCarregandoModelo] = useState(false);

  const [form, setForm] = useState({});
  const [jsonValido, setJsonValido] = useState(true);
  const [errosForm, setErrosForm] = useState({});
  const [motivoSalvar, setMotivoSalvar] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [acao, setAcao] = useState(null); // {tipo: "clonar"|"ativar"}
  const [motivoAcao, setMotivoAcao] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [executando, setExecutando] = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);
  const [regrasInvalidas, setRegrasInvalidas] = useState(null);
  const [resumoAtivacao, setResumoAtivacao] = useState(null);
  const [proximosPassos, setProximosPassos] = useState(location.state?.proximosPassos || null);

  const grupos = useMemo(() => schema?.grupos || [], [schema]);
  const campos = useMemo(() => camposDosGrupos(grupos), [grupos]);

  const carregarFicha = useCallback(
    async (preferirId = null) => {
      setCarregando(true);
      setErro("");
      try {
        const [d, s, p] = await Promise.all([
          configService.fichaMapa(prestadorId, condicao),
          schema ? Promise.resolve(schema) : configService.schemaModelos().catch(() => null),
          prestadores.length ? Promise.resolve(prestadores) : configService.listarPrestadores().catch(() => []),
        ]);
        const f = normalizarFicha(d, condicao);
        setFicha(f);
        setSchema(s);
        setPrestadores(comoLista(p));
        // Foco padrão = o modelo exibido pela ficha (ativo; sem ativo, o rascunho mais novo); após clonar/criar, o novo.
        const ids = versoesDaFicha(f).map((v) => String(v.id));
        const alvo =
          preferirId != null && ids.includes(String(preferirId))
            ? preferirId
            : (f.modeloExibido?.id ?? f.modeloAtivo?.id ?? f.rascunhos[0]?.id ?? null);
        setVersaoId(alvo);
      } catch (e) {
        setErro(mensagemErro(e, "Falha ao carregar a ficha desta configuração."));
        setFicha(null);
      } finally {
        setCarregando(false);
      }
    },
    // schema/prestadores são cache: não devem refazer a carga quando chegam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prestadorId, condicao]
  );

  useEffect(() => {
    setProximosPassos(location.state?.proximosPassos || null);
    carregarFicha(location.state?.rascunhoId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregarFicha]);

  const valoresFicha = ficha?.valoresFicha;
  const aplicarModelo = useCallback(
    (m) => {
      setModelo(m);
      setForm(valoresDoModelo(m, campos, valoresFicha));
      setJsonValido(true);
      setErrosForm({});
    },
    [campos, valoresFicha]
  );

  // Carrega a versão em foco completa (GET modelos/{id}/): a ficha pode trazer só o resumo.
  useEffect(() => {
    if (versaoId == null) {
      setModelo(null);
      return;
    }
    let cancelado = false;
    setCarregandoModelo(true);
    configService
      .obterModelo(versaoId)
      .then((m) => !cancelado && aplicarModelo(m))
      .catch((e) => !cancelado && enqueueSnackbar(mensagemErro(e, "Falha ao carregar a versão."), { variant: "error" }))
      .finally(() => !cancelado && setCarregandoModelo(false));
    return () => {
      cancelado = true;
    };
  }, [versaoId, aplicarModelo, enqueueSnackbar]);

  const editavel = modelo && !ficha?.semMapeamento ? (modelo.editavel ?? !modelo.ativo) : false;
  const original = useMemo(() => (modelo ? valoresDoModelo(modelo, campos, valoresFicha) : {}), [modelo, campos, valoresFicha]);
  const somenteLeitura = useMemo(() => new Set(campos.filter(campoSomenteLeitura).map(nomeCampo)), [campos]);

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

  const obrigatoriosProvedor = useMemo(() => {
    const mapa = schema?.obrigatorios_por_provedor || {};
    return new Set(mapa[form.provedor] || []);
  }, [schema, form.provedor]);

  const salvar = async () => {
    const em = validarMotivo(motivoSalvar);
    if (em) {
      setErrosForm({ motivo: em });
      return;
    }
    if (!jsonValido) {
      enqueueSnackbar("Corrija o JSON (grupo Avançado) antes de salvar.", { variant: "warning" });
      return;
    }
    // Campos virtuais (origem "campos_fixos") vão pela `chave` no nível de cima; null remove a chave (volta ao padrão).
    // campos_fixos_extras substitui só as chaves não mapeadas (contrato §4.3).
    const corpo = { ...alterados };
    setSalvando(true);
    setErrosForm({});
    try {
      const resp = await configService.atualizarModelo(modelo.id, corpo, motivoSalvar.trim());
      notificarEscrita(enqueueSnackbar, resp, "Rascunho salvo.");
      setMotivoSalvar("");
      if (resp?.objeto) aplicarModelo(resp.objeto);
      else configService.obterModelo(modelo.id).then(aplicarModelo);
    } catch (e) {
      setErrosForm(errosDeCampo(e));
      enqueueSnackbar(mensagemErro(e, "Falha ao salvar o rascunho."), { variant: "error" });
    } finally {
      setSalvando(false);
    }
  };

  const abrirAcao = (tipo) => {
    setAcao({ tipo });
    setMotivoAcao("");
    setErroAcao("");
    setConfirmacao(null);
    setRegrasInvalidas(null);
  };

  const executarAcao = async (confirmar = false) => {
    const em = validarMotivo(motivoAcao);
    if (em) {
      setErroAcao(em);
      return;
    }
    setExecutando(true);
    setErroAcao("");
    setRegrasInvalidas(null);
    try {
      const motivo = motivoAcao.trim();
      if (acao.tipo === "clonar") {
        const resp = await configService.clonarModelo(modelo.id, motivo);
        notificarEscrita(enqueueSnackbar, resp, `Rascunho v${resp?.objeto?.versao ?? ""} criado (inativo).`);
        setAcao(null);
        await carregarFicha(resp?.objeto?.id ?? null);
        ctx.recarregarMapa?.();
        return;
      }
      const resp = await configService.ativarModelo(modelo.id, motivo, confirmar);
      const desligadas = (resp?.desativadas || []).map((d) => `v${d.versao}`).join(", ");
      notificarEscrita(enqueueSnackbar, resp, `${rotuloVersao(modelo)} ativada${desligadas ? `; desativada(s): ${desligadas}` : ""}.`);
      setResumoAtivacao({ ...resp, rotulo: rotuloVersao(modelo) });
      setAcao(null);
      setConfirmacao(null);
      await carregarFicha(modelo.id);
      ctx.recarregarMapa?.();
    } catch (e) {
      if (!confirmar && precisaConfirmar(e)) {
        setConfirmacao({ mensagem: mensagemBackend(e, "Esta operação exige confirmação.") });
        return;
      }
      if (codigoErro(e) === "regra_invalida") {
        setRegrasInvalidas({ mensagem: mensagemBackend(e, "Há regras ativas inválidas nesta versão."), itens: listaCampos(e) });
        enqueueSnackbar("Ativação recusada: corrija as regras desta versão.", { variant: "error" });
        return;
      }
      const errs = errosDeCampo(e);
      setErroAcao(errs.motivo || mensagemErro(e, "Falha ao executar a ação."));
      enqueueSnackbar(mensagemErro(e, "Falha ao executar a ação."), { variant: "error" });
    } finally {
      setExecutando(false);
    }
  };

  const empresa = ctx.empresa;
  const nomeEmpresa = ficha?.prestador?.razao_social || empresa?.razao_social || `Prestador #${prestadorId}`;
  const cnpjEmpresa = ficha?.prestador?.cnpj || empresa?.cnpj || "";
  const versoes = ficha ? versoesDaFicha(ficha) : [];
  const hooksMeta = schema?.campos_modelo?.hooks || { tipo: "hooks", rotulo: "Hooks" };
  const temHooksNoForm = campos.some((c) => nomeCampo(c) === "hooks");
  const temExtrasNoForm = campos.some((c) => nomeCampo(c) === "campos_fixos_extras");
  const rascunhoMaisNovo = ficha?.rascunhos?.[0] || null;
  // Padrão por FALLBACK: o modelo exibido é o geral (B-1); clonar/ativar daqui afetaria todas as empresas sem padrão.
  const bloqueadoFallback = !!ficha?.semMapeamento;

  return (
    <div>
      <Estado carregando={carregando} erro={erro}>
        {ficha && (
          <>
            {/* Cabeçalho */}
            <div className="cfg-card">
              <div className="cfg-card-titulo">
                <div>
                  <h2>{nomeEmpresa}</h2>
                  <div className="cfg-ficha-sub">
                    <span className="cfg-mono">{formatarCnpj(cnpjEmpresa)}</span>
                    {ficha.tipo === "padrao" ? <Badge>Padrão da empresa</Badge> : <Badge cor={corCondicao(ficha.tipo)}>{ficha.rotulo}</Badge>}
                    {ficha.regra ? (
                      <Link
                        to={`/configuracao/regras?modelo=${(typeof ficha.regra.modelo === "object" ? ficha.regra.modelo?.id : ficha.regra.modelo) ?? ficha.modelo?.id ?? ""}`}
                        title={`${ficha.regra.descricao || ""}${ficha.regra.condicoes ? ` · ${ficha.regra.condicoes}` : ""} — abrir regras (Avançado)`}
                      >
                        <Badge cor={ficha.regra.ativo === false ? "amarelo" : "neutro"}>
                          regra prioridade {ficha.regra.prioridade}
                          {ficha.regra.ativo === false ? " (inativa)" : ""}
                        </Badge>
                      </Link>
                    ) : (
                      <Badge cor="amarelo">sem regra</Badge>
                    )}
                    {ficha.semMapeamento ? (
                      <Badge cor="amarelo">fallback: {rotuloVersao(ficha.modeloAtivo || ficha.modelo)}</Badge>
                    ) : ficha.modeloAtivo ? (
                      <Badge cor="verde">ativo: {rotuloVersao(ficha.modeloAtivo)}</Badge>
                    ) : (
                      <Badge cor="amarelo">não emite (só rascunho)</Badge>
                    )}
                  </div>
                </div>
                {versoes.length > 1 && (
                  <Campo label="Versão em foco">
                    <select className="cfg-input" value={versaoId ?? ""} onChange={(e) => setVersaoId(Number(e.target.value))} disabled={sujo}>
                      {versoes.map((v) => (
                        <option key={v.id} value={v.id}>
                          {rotuloVersao(v)} ({v.papel})
                        </option>
                      ))}
                    </select>
                  </Campo>
                )}
              </div>

              {ficha.avisos.map((a, i) => (
                <div key={i} className="cfg-aviso cfg-aviso-alerta">
                  <FiAlertTriangle /> <span>{typeof a === "string" ? a : JSON.stringify(a)}</span>
                </div>
              ))}

              {proximosPassos && (
                <div className="cfg-aviso">
                  <div>
                    <strong>Próximos passos</strong>
                    {Array.isArray(proximosPassos) ? (
                      <ol className="cfg-lista-detalhes">
                        {proximosPassos.map((p, i) => (
                          <li key={i}>{typeof p === "string" ? p : p.texto || p.descricao || JSON.stringify(p)}</li>
                        ))}
                      </ol>
                    ) : (
                      <div>{String(proximosPassos)}</div>
                    )}
                  </div>
                </div>
              )}

              {(bloqueadoFallback || versoes.length === 0) && (
                <div className="cfg-aviso cfg-aviso-alerta">
                  <FiAlertTriangle />
                  <span>
                    {ficha.tipo === "padrao"
                      ? "Esta empresa não tem padrão próprio: cai no modelo padrão geral (fallback)."
                      : "Esta condição não tem modelo: as notas caem no padrão da empresa ou no padrão geral (fallback)."}
                    {bloqueadoFallback && " O modelo abaixo é o geral, compartilhado por todas as empresas sem padrão: aqui ele fica só para consulta."}{" "}
                    {ctx.abrirNova && empresa && (
                      <button type="button" className="cfg-link-btn" onClick={() => ctx.abrirNova(empresa, ficha.tipo === "padrao" ? "padrao" : "apolice")}>
                        {ficha.tipo === "padrao" ? "Criar padrão da empresa" : "Criar configuração"}
                      </button>
                    )}
                  </span>
                </div>
              )}

              {!bloqueadoFallback && modelo?.ativo && rascunhoMaisNovo && String(rascunhoMaisNovo.id) !== String(versaoId) && (
                <div className="cfg-aviso">
                  <span>
                    Há um rascunho em andamento: <strong>{rotuloVersao(rascunhoMaisNovo)}</strong>.{" "}
                    <button type="button" className="cfg-link-btn" onClick={() => setVersaoId(rascunhoMaisNovo.id)} disabled={sujo}>
                      Editar o rascunho
                    </button>
                  </span>
                </div>
              )}
            </div>

            {/* Formulário por grupos */}
            {versaoId != null && (
              <div className="cfg-card">
                <Estado carregando={carregandoModelo && !modelo}>
                  {modelo && (
                    <>
                      <div className="cfg-card-titulo">
                        <h3>
                          Parâmetros — {rotuloVersao(modelo)} {modelo.nome ? `· ${modelo.nome}` : ""}{" "}
                          {modelo.ativo ? <Badge cor="verde">ativa</Badge> : <Badge>rascunho</Badge>}
                        </h3>
                        <div className="cfg-acoes">
                          {bloqueadoFallback ? null : modelo.ativo ? (
                            <button type="button" className="cfg-btn cfg-btn-primario" onClick={() => abrirAcao("clonar")}>
                              <FiCopy /> Clonar para editar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="cfg-btn cfg-btn-sucesso"
                              onClick={() => abrirAcao("ativar")}
                              disabled={sujo}
                              title={sujo ? "Salve as alterações antes de ativar." : ""}
                            >
                              <FiCheckCircle /> Ativar
                            </button>
                          )}
                          <Link to={`/configuracao/modelos/${modelo.id}`} className="cfg-btn cfg-btn-neutro cfg-btn-sm" title="Visão técnica (Avançado)">
                            <FiSettings /> Abrir em Modelos
                          </Link>
                        </div>
                      </div>

                      {!editavel && (
                        <div className="cfg-aviso">
                          <FiLock />
                          <span>
                            Versão ativa: emite de verdade e não pode ser editada. Use <strong>Clonar para editar</strong>, ajuste o
                            rascunho, rode o dry-run e ative. Rollback: ativar de novo a versão anterior.
                          </span>
                        </div>
                      )}
                      {errosForm.geral && <div className="cfg-aviso cfg-aviso-perigo">{errosForm.geral}</div>}

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
                          provedor={form.provedor}
                          onValidezJson={setJsonValido}
                        />
                      ) : (
                        <div className="cfg-aviso cfg-aviso-alerta">
                          O backend ainda não publica <span className="cfg-mono">schema.grupos</span>. Edite pela aba Modelos
                          (Avançado) até a atualização.
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
                          <CampoMotivo valor={motivoSalvar} onChange={setMotivoSalvar} erro={errosForm.motivo} />
                          <div className="cfg-acoes" style={{ justifyContent: "flex-end" }}>
                            {sujo && (
                              <small className="cfg-ajuda">
                                {Object.keys(alterados).length} campo(s) alterado(s)
                              </small>
                            )}
                            <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => aplicarModelo(modelo)} disabled={!sujo || salvando}>
                              Descartar
                            </button>
                            <button type="button" className="cfg-btn cfg-btn-primario" onClick={salvar} disabled={!sujo || salvando || !jsonValido}>
                              <FiSave /> {salvando ? "Salvando…" : "Salvar rascunho"}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </Estado>
              </div>
            )}

            {/* Dry-run */}
            {modelo && (
              <div className="cfg-card">
                <div className="cfg-card-titulo">
                  <h3>
                    <FiPlay /> Dry-run — {rotuloVersao(modelo)}
                  </h3>
                </div>
                {sujo && <div className="cfg-aviso cfg-aviso-alerta">Há alterações não salvas: o dry-run usa a versão salva no servidor.</div>}
                <DryRunPainel key={modelo.id} modelo={modelo} fixtures={schema?.fixtures} />
              </div>
            )}

            {/* Últimas notas */}
            <div className="cfg-card">
              <div className="cfg-card-titulo">
                <h3>
                  <FiFileText /> Últimas notas desta configuração
                </h3>
              </div>
              {ficha.ultimasNotas.length === 0 ? (
                <div className="cfg-estado">Nenhuma nota recente emitida por esta combinação.</div>
              ) : (
                <div className="cfg-tabela-wrap">
                  <table className="cfg-tabela">
                    <thead>
                      <tr>
                        <th>NFS-e</th>
                        <th>id_integracao</th>
                        <th>Versão</th>
                        <th>Status</th>
                        <th>Criada em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ficha.ultimasNotas.map((n, i) => (
                        <tr key={n.id ?? n.id_integracao ?? i}>
                          <td className="cfg-mono">{n.numero_nfse || "—"}</td>
                          <td className="cfg-mono">{n.id_integracao || n.id || "—"}</td>
                          <td className="cfg-mono">{n.modelo_versao != null ? `v${n.modelo_versao}` : "—"}</td>
                          <td>
                            {n.status ? (
                              <Badge cor={/conclu/i.test(n.status) ? "verde" : /erro/i.test(n.status) ? "vermelho" : "neutro"}>{n.status}</Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{formatarData(n.data_criacao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Payload de exemplo (dry-run do modelo exibido sobre a nota mais recente; tomador mascarado pelo servidor) */}
            <div className="cfg-card">
              <div className="cfg-card-titulo">
                <h3>Payload de exemplo</h3>
                <small className="cfg-ajuda">
                  Tomador mascarado pelo servidor
                  {ficha.exemplo?.modelo ? ` · ${rotuloVersao(ficha.exemplo.modelo)}` : ""}
                  {ficha.exemplo?.id_integracao ? ` · nota ${ficha.exemplo.id_integracao}` : ""}
                </small>
              </div>
              {ficha.exemplo?.erro && (
                <div className="cfg-aviso cfg-aviso-perigo">O pipeline recusou montar o payload: {String(ficha.exemplo.erro)}</div>
              )}
              {ficha.exemplo?.payload ? (
                <JsonView valor={ficha.exemplo.payload} altura={480} />
              ) : (
                !ficha.exemplo?.erro && <div className="cfg-estado">Sem notas desta combinação para montar um exemplo.</div>
              )}
            </div>
          </>
        )}
      </Estado>

      <Modal
        aberto={!!acao}
        titulo={acao?.tipo === "clonar" ? `Clonar ${rotuloVersao(modelo)} para editar` : `Ativar ${rotuloVersao(modelo)}`}
        onFechar={() => !executando && setAcao(null)}
        rodape={
          acao && (
            <>
              <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setAcao(null)} disabled={executando}>
                Cancelar
              </button>
              {confirmacao ? (
                <button type="button" className="cfg-btn cfg-btn-perigo" onClick={() => executarAcao(true)} disabled={executando}>
                  {executando ? "Processando…" : "Confirmar mesmo assim"}
                </button>
              ) : (
                <button
                  type="button"
                  className={`cfg-btn ${acao.tipo === "clonar" ? "cfg-btn-primario" : "cfg-btn-sucesso"}`}
                  onClick={() => executarAcao(false)}
                  disabled={executando || !!regrasInvalidas}
                >
                  {executando ? "Processando…" : acao.tipo === "clonar" ? "Clonar" : "Ativar versão"}
                </button>
              )}
            </>
          )
        }
      >
        {acao && (
          <>
            <div className={`cfg-aviso ${acao.tipo === "clonar" ? "" : "cfg-aviso-alerta"}`}>
              <span>
                {acao.tipo === "clonar"
                  ? "Cria um rascunho INATIVO com todos os parâmetros e regras desta versão. Edite-o aqui, valide no dry-run e ative."
                  : "Esta versão passa a emitir de verdade e a versão ativa atual do código é desativada na mesma operação. O servidor confere o modelo e as regras antes de gravar (regra inválida bloqueia; versão sem regra ativa pede confirmação). A fila aplica em até 60 s. Rollback: ativar de novo a versão anterior."}
              </span>
            </div>
            {confirmacao && (
              <div className="cfg-aviso cfg-aviso-perigo">
                <div>
                  <strong>{confirmacao.mensagem}</strong>
                  <div>Nada foi gravado. Clique em “Confirmar mesmo assim” para prosseguir.</div>
                </div>
              </div>
            )}
            {regrasInvalidas && (
              <div className="cfg-aviso cfg-aviso-perigo">
                <div>
                  <strong>{regrasInvalidas.mensagem}</strong>
                  <ListaDetalhes itens={regrasInvalidas.itens} />
                  Esta trava não aceita confirmação: corrija as regras desta versão.{" "}
                  <Link to={`/configuracao/regras?modelo=${modelo?.id}`}>Abrir regras desta versão</Link>
                </div>
              </div>
            )}
            <CampoMotivo valor={motivoAcao} onChange={setMotivoAcao} erro={erroAcao} />
          </>
        )}
      </Modal>

      <ResumoAtivacao resumo={resumoAtivacao} onFechar={() => setResumoAtivacao(null)} />
    </div>
  );
}
