// Detalhe de UMA versão de modelo: formulário dinâmico (schema/), clonar, salvar rascunho, dry-run, ativar/desativar.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { FiArrowLeft, FiCopy, FiSave, FiPlay, FiCheckCircle, FiPower, FiLock, FiAlertTriangle } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, CampoMotivo, Estado, ListaDetalhes, Modal } from "./componentes";
import ResumoAtivacao from "./ResumoAtivacao";
import CampoModelo from "./CampoModelo";
import DryRunPainel from "./DryRunPainel";
import {
  codigoErro,
  comoLista,
  errosDeCampo,
  formatarData,
  listaCampos,
  mensagemBackend,
  mensagemErro,
  notificarEscrita,
  precisaConfirmar,
  validarMotivo,
} from "./utils";

// Somente leitura sempre (contrato 4.3) ou metadados que não são campos do model.
const SOMENTE_LEITURA = new Set([
  "id",
  "codigo",
  "codigo_versao",
  "slug",
  "versao",
  "ativo",
  "editavel",
  "criado_em",
  "atualizado_em",
  "regras",
  "avisos",
]);

// Campos exibidos primeiro e por último (largos); o resto segue a ordem do schema.
const PRIMEIROS = ["nome", "provedor", "prestador"];
const LARGOS = ["campos_fixos", "hooks", "descricao_padrao", "observacoes"];

function iguais(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export default function ModeloDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [modelo, setModelo] = useState(null);
  const [schema, setSchema] = useState(null);
  const [prestadores, setPrestadores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [form, setForm] = useState({});
  const [jsonValido, setJsonValido] = useState(true);
  const [errosForm, setErrosForm] = useState({});
  const [motivoSalvar, setMotivoSalvar] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Modal de ação com motivo: {tipo: "clonar"|"ativar"|"desativar"}
  const [acao, setAcao] = useState(null);
  const [motivoAcao, setMotivoAcao] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [executando, setExecutando] = useState(false);
  // Trava confirmável (409 versao_sem_regra_ativa / ultima_versao_ativa): {mensagem}
  const [confirmacao, setConfirmacao] = useState(null);
  // 409 regra_invalida (não aceita confirmar): {mensagem, itens:[["regra <id> (prioridade N)", msg]]}
  const [regrasInvalidas, setRegrasInvalidas] = useState(null);
  // Resposta 200 de ativar (desativadas, diff_regras, simulacao) para o resumo pós-ativação.
  const [resumoAtivacao, setResumoAtivacao] = useState(null);

  const aplicarModelo = useCallback((m) => {
    setModelo(m);
    const f = {};
    Object.keys(m || {}).forEach((k) => {
      if (!SOMENTE_LEITURA.has(k)) f[k] = m[k] && typeof m[k] === "object" && k === "prestador" ? m[k].id : m[k];
    });
    setForm(f);
    setJsonValido(true);
    setErrosForm({});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [m, s, p] = await Promise.all([
        configService.obterModelo(id),
        configService.schemaModelos().catch(() => null),
        configService.listarPrestadores().catch(() => []),
      ]);
      aplicarModelo(m);
      setSchema(s);
      setPrestadores(comoLista(p));
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar o modelo."));
    } finally {
      setCarregando(false);
    }
  }, [id, aplicarModelo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const editavel = modelo ? (modelo.editavel ?? !modelo.ativo) : false;

  // Campos do formulário: schema.campos_modelo (ordem do backend) ou, sem schema, as chaves do próprio modelo.
  const campos = useMemo(() => {
    if (!modelo) return [];
    const doSchema = schema?.campos_modelo ? Object.keys(schema.campos_modelo) : Object.keys(form);
    const lista = doSchema.filter((k) => !SOMENTE_LEITURA.has(k));
    const meio = lista.filter((k) => !PRIMEIROS.includes(k) && !LARGOS.includes(k));
    return [...PRIMEIROS.filter((k) => lista.includes(k)), ...meio, ...LARGOS.filter((k) => lista.includes(k))];
  }, [modelo, schema, form]);

  const obrigatoriosProvedor = useMemo(() => {
    const mapa = schema?.obrigatorios_por_provedor || {};
    return new Set(mapa[form.provedor] || []);
  }, [schema, form.provedor]);

  const alterados = useMemo(() => {
    if (!modelo) return {};
    const out = {};
    Object.keys(form).forEach((k) => {
      const original = k === "prestador" && modelo[k] && typeof modelo[k] === "object" ? modelo[k].id : modelo[k];
      if (!iguais(form[k], original)) out[k] = form[k];
    });
    return out;
  }, [form, modelo]);
  const sujo = Object.keys(alterados).length > 0;

  const salvar = async () => {
    const em = validarMotivo(motivoSalvar);
    if (em) {
      setErrosForm({ motivo: em });
      return;
    }
    if (!jsonValido) {
      enqueueSnackbar("Corrija o JSON de campos fixos antes de salvar.", { variant: "warning" });
      return;
    }
    setSalvando(true);
    setErrosForm({});
    try {
      const resp = await configService.atualizarModelo(modelo.id, alterados, motivoSalvar.trim());
      notificarEscrita(enqueueSnackbar, resp, "Rascunho salvo.");
      setMotivoSalvar("");
      if (resp?.objeto) aplicarModelo(resp.objeto);
      else carregar();
    } catch (e) {
      setErrosForm(errosDeCampo(e));
      enqueueSnackbar(mensagemErro(e, "Falha ao salvar o modelo."), { variant: "error" });
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
        notificarEscrita(enqueueSnackbar, resp, `Nova versão v${resp?.objeto?.versao ?? ""} criada (inativa).`);
        setAcao(null);
        if (resp?.objeto?.id) navigate(`/configuracao/modelos/${resp.objeto.id}`);
        return;
      }
      if (acao.tipo === "ativar") {
        const resp = await configService.ativarModelo(modelo.id, motivo, confirmar);
        const desligadas = (resp?.desativadas || []).map((d) => `v${d.versao}`).join(", ");
        notificarEscrita(
          enqueueSnackbar,
          resp,
          `${modelo.codigo} v${modelo.versao} ativada${desligadas ? `; desativada(s): ${desligadas}` : ""}.`
        );
        setResumoAtivacao({ ...resp, rotulo: `${modelo.codigo} v${modelo.versao}` });
      } else {
        const resp = await configService.desativarModelo(modelo.id, motivo, confirmar);
        notificarEscrita(enqueueSnackbar, resp, `${modelo.codigo} v${modelo.versao} desativada.`);
      }
      setAcao(null);
      setConfirmacao(null);
      carregar();
    } catch (e) {
      if (!confirmar && precisaConfirmar(e)) {
        setConfirmacao({ mensagem: mensagemBackend(e, "Esta operação exige confirmação.") });
        return;
      }
      if (codigoErro(e) === "regra_invalida") {
        setRegrasInvalidas({
          mensagem: mensagemBackend(e, "Há regras ativas inválidas nesta versão."),
          itens: listaCampos(e),
        });
        enqueueSnackbar("Ativação recusada: corrija as regras desta versão.", { variant: "error" });
        return;
      }
      const campos = errosDeCampo(e);
      setErroAcao(campos.motivo || mensagemErro(e, "Falha ao executar a ação."));
      enqueueSnackbar(mensagemErro(e, "Falha ao executar a ação."), { variant: "error" });
    } finally {
      setExecutando(false);
    }
  };

  const textosAcao = {
    clonar: {
      titulo: "Clonar como nova versão",
      botao: "Clonar",
      classe: "cfg-btn-primario",
      texto:
        "Cria uma nova versão INATIVA com todos os campos e as regras desta versão. Edite o clone, valide no dry-run e ative.",
    },
    ativar: {
      titulo: `Ativar ${modelo?.codigo} v${modelo?.versao}`,
      botao: "Ativar versão",
      classe: "cfg-btn-sucesso",
      texto:
        "Esta versão passa a emitir de verdade. A versão ativa atual deste código será desativada na mesma operação. Antes de gravar, o servidor confere o modelo e cada regra ativa desta versão (regra inválida bloqueia; versão sem regra ativa pede confirmação) e o conflito de prioridade com outros códigos. A fila aplica a mudança em até 60 s (cache de regras dos workers). Rollback: ativar de novo a versão anterior.",
    },
    desativar: {
      titulo: `Desativar ${modelo?.codigo} v${modelo?.versao}`,
      botao: "Desativar",
      classe: "cfg-btn-perigo",
      texto:
        "Sem versão ativa, as notas que resolviam este modelo caem na próxima regra (até o FALLBACK). Desativar a única versão ativa do código pede confirmação. Vale para a fila em até 60 s.",
    },
  };

  return (
    <div>
      <button type="button" className="cfg-voltar" onClick={() => navigate("/configuracao/modelos")}>
        <FiArrowLeft /> Modelos
      </button>

      <Estado carregando={carregando} erro={erro}>
        {modelo && (
          <>
            <div className="cfg-card">
              <div className="cfg-card-titulo">
                <div>
                  <h2>
                    {modelo.codigo_versao || `${modelo.codigo} v${modelo.versao}`} — {modelo.nome}
                  </h2>
                  <div style={{ marginTop: 6 }}>
                    {modelo.ativo ? <Badge cor="verde">ativa</Badge> : <Badge cor="neutro">inativa (rascunho)</Badge>}
                    {modelo.provedor && <Badge cor={modelo.provedor === "municipal" ? "roxo" : "azul"}>{modelo.provedor}</Badge>}
                    {modelo.slug && <Badge>{modelo.slug}</Badge>}
                    <small className="cfg-ajuda"> atualizado em {formatarData(modelo.atualizado_em)}</small>
                  </div>
                </div>
                <div className="cfg-acoes">
                  <button type="button" className="cfg-btn cfg-btn-contorno" onClick={() => abrirAcao("clonar")}>
                    <FiCopy /> Clonar como nova versão
                  </button>
                  {modelo.ativo ? (
                    <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => abrirAcao("desativar")}>
                      <FiPower /> Desativar
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
                </div>
              </div>

              {(modelo.avisos || []).map((a, i) => (
                <div key={i} className="cfg-aviso cfg-aviso-alerta">
                  <FiAlertTriangle /> <span>{typeof a === "string" ? a : JSON.stringify(a)}</span>
                </div>
              ))}

              {!editavel && (
                <div className="cfg-aviso">
                  <FiLock />
                  <span>
                    Versão ativa: emite de verdade e não pode ser editada (aqui nem no Django Admin). Para mudar, use{" "}
                    <strong>Clonar como nova versão</strong>, edite o clone e as regras dele, rode o dry-run, simule as regras
                    tratando o clone como ativo e ative. Rollback: ativar de novo a versão anterior.
                  </span>
                </div>
              )}
              {errosForm.geral && <div className="cfg-aviso cfg-aviso-perigo">{errosForm.geral}</div>}

              <div className="cfg-grid">
                {campos.map((nome) => (
                  <div key={nome} className={LARGOS.includes(nome) ? "cfg-grid-largo" : ""}>
                    <CampoModelo
                      nome={nome}
                      meta={schema?.campos_modelo?.[nome]}
                      valor={form[nome]}
                      onChange={(v) => setForm((f) => ({ ...f, [nome]: v }))}
                      schema={schema}
                      prestadores={prestadores}
                      desabilitado={!editavel}
                      erro={errosForm[nome]}
                      obrigatorio={!!schema?.campos_modelo?.[nome]?.obrigatorio || obrigatoriosProvedor.has(nome)}
                      onValidezJson={setJsonValido}
                    />
                  </div>
                ))}
              </div>

              {editavel && (
                <div style={{ marginTop: 16 }}>
                  <CampoMotivo valor={motivoSalvar} onChange={setMotivoSalvar} erro={errosForm.motivo} />
                  <div className="cfg-acoes" style={{ justifyContent: "flex-end" }}>
                    {sujo && <small className="cfg-ajuda">{Object.keys(alterados).length} campo(s) alterado(s)</small>}
                    <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => aplicarModelo(modelo)} disabled={!sujo || salvando}>
                      Descartar
                    </button>
                    <button type="button" className="cfg-btn cfg-btn-primario" onClick={salvar} disabled={!sujo || salvando || !jsonValido}>
                      <FiSave /> {salvando ? "Salvando…" : "Salvar rascunho"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="cfg-card">
              <div className="cfg-card-titulo">
                <h3>Regras desta versão</h3>
                <Link to={`/configuracao/regras?modelo=${modelo.id}`} className="cfg-btn cfg-btn-neutro cfg-btn-sm">
                  Gerenciar regras
                </Link>
              </div>
              {(modelo.regras || []).length === 0 ? (
                <div className="cfg-aviso cfg-aviso-alerta">
                  Sem regras: esta versão não será escolhida pelo resolvedor mesmo se ativada.
                </div>
              ) : (
                <div className="cfg-tabela-wrap">
                  <table className="cfg-tabela">
                    <thead>
                      <tr>
                        <th>Prioridade</th>
                        <th>Condições</th>
                        <th>Descrição</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelo.regras.map((r) => (
                        <tr key={r.id} className={r.ativo ? "" : "cfg-inativa"}>
                          <td>{r.prioridade}</td>
                          <td className="cfg-mono">{r.condicoes || "—"}</td>
                          <td>{r.descricao || "—"}</td>
                          <td>{r.ativo ? <Badge cor="verde">ativa</Badge> : <Badge>inativa</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="cfg-card">
              <div className="cfg-card-titulo">
                <h3>
                  <FiPlay /> Dry-run
                </h3>
              </div>
              {sujo && (
                <div className="cfg-aviso cfg-aviso-alerta">
                  Há alterações não salvas: o dry-run usa a versão salva no servidor.
                </div>
              )}
              <DryRunPainel modelo={modelo} fixtures={schema?.fixtures} />
            </div>
          </>
        )}
      </Estado>

      <Modal
        aberto={!!acao}
        titulo={acao ? textosAcao[acao.tipo].titulo : ""}
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
                  className={`cfg-btn ${textosAcao[acao.tipo].classe}`}
                  onClick={() => executarAcao(false)}
                  disabled={executando || !!regrasInvalidas}
                >
                  {executando ? "Processando…" : textosAcao[acao.tipo].botao}
                </button>
              )}
            </>
          )
        }
      >
        {acao && (
          <>
            <div className={`cfg-aviso ${acao.tipo === "clonar" ? "" : "cfg-aviso-alerta"}`}>
              <span>{textosAcao[acao.tipo].texto}</span>
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
                  Esta trava não aceita confirmação: corrija ou desative essas regras nesta versão (aba Regras) e tente de
                  novo. <Link to={`/configuracao/regras?modelo=${modelo.id}`}>Abrir regras desta versão</Link>
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
