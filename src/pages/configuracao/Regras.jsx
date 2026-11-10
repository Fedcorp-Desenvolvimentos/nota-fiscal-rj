// Aba Regras: regras de resolução de modelo (menor prioridade vence), CRUD com motivo e simulação.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { FiPlus, FiEdit2, FiTrash2, FiRefreshCw, FiPlay, FiToggleLeft, FiToggleRight, FiLock } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Campo, CampoMotivo, Estado, Modal } from "./componentes";
import { agruparModelos } from "./modelosDados";
import { comoLista, errosDeCampo, formatarCnpj, mensagemErro, notificarEscrita, opcoesEnum, validarMotivo } from "./utils";

const CAMPOS_CONDICAO_PADRAO = [
  "apolice",
  "produto_codigo",
  "ramo",
  "tp_fatura",
  "tipo_nfe",
  "prefixo_fatura",
  "prestador",
  "prestador_razao_social_igual",
  "codigo_servico",
  "texto_discriminacao_contem",
];

const ROTULOS = {
  apolice: "Apólice",
  produto_codigo: "Produto",
  ramo: "Ramo",
  tp_fatura: "Tipo fatura",
  tipo_nfe: "Tipo de nota",
  prefixo_fatura: "Prefixo da fatura",
  prestador: "Prestador",
  prestador_razao_social_igual: "Razão social igual a",
  codigo_servico: "Código de serviço",
  texto_discriminacao_contem: "Discriminação contém",
};

const COR_CONDICAO = { apolice: "roxo", tipo_nfe: "azul", prefixo_fatura: "amarelo", prestador: "verde" };

const VAZIA = { prioridade: "", ativo: true, descricao: "", modelo: "" };

export default function Regras() {
  const { enqueueSnackbar } = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroModelo = searchParams.get("modelo") || "";

  const [regras, setRegras] = useState([]);
  const [total, setTotal] = useState(0);
  const [grupos, setGrupos] = useState([]);
  const [prestadores, setPrestadores] = useState([]);
  const [schema, setSchema] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");

  // Modal criar/editar
  const [editando, setEditando] = useState(null); // null fechado; {} nova; regra existente
  const [form, setForm] = useState(VAZIA);
  const [errosForm, setErrosForm] = useState({});
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Modal de ação rápida (ativar/desativar/excluir) com motivo
  const [acao, setAcao] = useState(null); // {tipo, regra}
  const [motivoAcao, setMotivoAcao] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [executando, setExecutando] = useState(false);

  // Simulação
  const [ultimas, setUltimas] = useState(200);
  const [ativarModelos, setAtivarModelos] = useState([]);
  const [simulando, setSimulando] = useState(false);
  const [simulacao, setSimulacao] = useState(null);

  const camposCondicao = schema?.regras?.campos_condicao || CAMPOS_CONDICAO_PADRAO;
  const editaveisModeloAtivo = schema?.regras?.campos_editaveis_modelo_ativo || ["ativo", "descricao"];

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = {};
      if (filtroModelo) params.modelo = filtroModelo;
      if (filtroAtivo) params.ativo = filtroAtivo;
      const data = await configService.listarRegras(params);
      const lista = comoLista(data).sort((a, b) => a.prioridade - b.prioridade || a.id - b.id);
      setRegras(lista);
      setTotal(data?.count ?? lista.length);
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar regras."));
    } finally {
      setCarregando(false);
    }
  }, [filtroModelo, filtroAtivo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    configService.listarModelos().then((d) => setGrupos(agruparModelos(d))).catch(() => {});
    configService.listarPrestadores().then((d) => setPrestadores(comoLista(d))).catch(() => {});
    configService.schemaModelos().then(setSchema).catch(() => {});
  }, []);

  // Versões de modelo em lista plana, para selects.
  const versoes = useMemo(
    () => grupos.flatMap((g) => g.versoes.map((v) => ({ ...v, codigo: g.codigo, prestador: v.prestador ?? g.prestador }))),
    [grupos]
  );
  const versaoPorId = (id) => versoes.find((v) => String(v.id) === String(id));
  const nomePrestador = (id) => {
    const p = prestadores.find((x) => String(x.id) === String(id));
    return p ? p.razao_social : `#${id}`;
  };
  const opcoesTipoNfe = opcoesEnum(schema?.enums?.tipo_nfe || ["comum", "vr", "externo"]);

  // ---------- criar/editar ----------
  const abrirNova = () => {
    const inicial = { ...VAZIA };
    camposCondicao.forEach((c) => (inicial[c] = ""));
    if (filtroModelo) inicial.modelo = filtroModelo;
    setEditando({});
    setForm(inicial);
    setErrosForm({});
    setMotivo("");
  };

  const abrirEdicao = (r) => {
    const f = { prioridade: r.prioridade, ativo: r.ativo, descricao: r.descricao || "", modelo: r.modelo ?? "" };
    camposCondicao.forEach((c) => (f[c] = r[c] ?? ""));
    setEditando(r);
    setForm(f);
    setErrosForm({});
    setMotivo("");
  };

  const regraDeModeloAtivo = !!(editando && editando.id && editando.modelo_ativo);
  const travado = (campo) => regraDeModeloAtivo && !editaveisModeloAtivo.includes(campo);

  const normalizar = (campo, v) => {
    if (campo === "prioridade") return v === "" ? null : Number(v);
    if (campo === "modelo" || campo === "prestador") return v === "" || v === null ? null : Number(v);
    if (campo === "ativo") return !!v;
    if (campo === "descricao") return v;
    return v === "" ? null : v; // condições vazias = null (não filtra)
  };

  const salvar = async () => {
    const em = validarMotivo(motivo);
    if (em) {
      setErrosForm({ motivo: em });
      return;
    }
    const campos = ["prioridade", "ativo", "descricao", "modelo", ...camposCondicao];
    const corpo = {};
    campos.forEach((c) => {
      const novo = normalizar(c, form[c]);
      if (!editando.id) corpo[c] = novo;
      else if (!travado(c) && JSON.stringify(novo) !== JSON.stringify(normalizar(c, editando[c] ?? ""))) corpo[c] = novo;
    });
    if (editando.id && !Object.keys(corpo).length) {
      enqueueSnackbar("Nenhuma alteração para salvar.", { variant: "info" });
      return;
    }
    setSalvando(true);
    setErrosForm({});
    try {
      const resp = editando.id
        ? await configService.atualizarRegra(editando.id, corpo, motivo.trim())
        : await configService.criarRegra(corpo, motivo.trim());
      notificarEscrita(enqueueSnackbar, resp, editando.id ? "Regra atualizada." : "Regra criada.");
      setEditando(null);
      carregar();
    } catch (e) {
      setErrosForm(errosDeCampo(e));
      enqueueSnackbar(mensagemErro(e, "Falha ao salvar a regra."), { variant: "error" });
    } finally {
      setSalvando(false);
    }
  };

  // ---------- ações rápidas ----------
  const abrirAcao = (tipo, regra) => {
    setAcao({ tipo, regra });
    setMotivoAcao("");
    setErroAcao("");
  };

  const executarAcao = async () => {
    const em = validarMotivo(motivoAcao);
    if (em) {
      setErroAcao(em);
      return;
    }
    setExecutando(true);
    try {
      const { tipo, regra } = acao;
      let resp;
      if (tipo === "excluir") resp = await configService.excluirRegra(regra.id, motivoAcao.trim());
      else resp = await configService.atualizarRegra(regra.id, { ativo: tipo === "ativar" }, motivoAcao.trim());
      const msg = { excluir: "Regra excluída.", ativar: "Regra ativada.", desativar: "Regra desativada." }[tipo];
      notificarEscrita(enqueueSnackbar, resp, msg);
      setAcao(null);
      carregar();
    } catch (e) {
      const campos = errosDeCampo(e);
      setErroAcao(campos.motivo || mensagemErro(e, "Falha na operação."));
      enqueueSnackbar(mensagemErro(e, "Falha na operação."), { variant: "error" });
    } finally {
      setExecutando(false);
    }
  };

  // ---------- simulação ----------
  const simular = async () => {
    setSimulando(true);
    setSimulacao(null);
    try {
      const n = Math.min(Math.max(Number(ultimas) || 200, 1), 1000);
      setSimulacao(await configService.simularRegras(n, { ativar_modelos: ativarModelos.map(Number) }));
    } catch (e) {
      enqueueSnackbar(mensagemErro(e, "Falha na simulação."), { variant: "error" });
    } finally {
      setSimulando(false);
    }
  };

  const badgesCondicao = (r) => {
    const itens = camposCondicao.filter((c) => r[c] !== null && r[c] !== undefined && r[c] !== "");
    if (!itens.length) return <Badge cor="amarelo">sem condição (FALLBACK)</Badge>;
    return itens.map((c) => (
      <Badge key={c} cor={COR_CONDICAO[c] || "neutro"} title={ROTULOS[c] || c}>
        {ROTULOS[c] || c}: {c === "prestador" ? nomePrestador(r[c]) : String(r[c])}
      </Badge>
    ));
  };

  const rotuloModelo = (r) => {
    if (r.modelo_codigo_versao) return r.modelo_codigo_versao;
    const v = versaoPorId(r.modelo);
    return v ? `${v.codigo} v${v.versao}` : `#${r.modelo}`;
  };

  const versoesInativas = versoes.filter((v) => !v.ativo);
  const textoAcao = {
    ativar: "A regra passa a participar da resolução (se o modelo estiver ativo). Vale para a fila em até 60 s.",
    desativar: "A regra deixa de participar da resolução; as notas caem na próxima regra. Vale para a fila em até 60 s.",
    excluir: "Exclusão definitiva (fica registrada na auditoria). Regra de modelo ativo não pode ser excluída: desative-a.",
  };

  return (
    <div>
      <div className="cfg-card">
        <div className="cfg-card-titulo">
          <h2>Regras de resolução</h2>
          <div className="cfg-acoes">
            <select className="cfg-input" style={{ width: 200 }} value={filtroModelo} onChange={(e) => setSearchParams(e.target.value ? { modelo: e.target.value } : {})}>
              <option value="">Todos os modelos</option>
              {versoes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.codigo} v{v.versao} {v.ativo ? "(ativa)" : "(inativa)"}
                </option>
              ))}
            </select>
            <select className="cfg-input" style={{ width: 150 }} value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value)}>
              <option value="">Ativas e inativas</option>
              <option value="true">Só ativas</option>
              <option value="false">Só inativas</option>
            </select>
            <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={carregar} disabled={carregando}>
              <FiRefreshCw /> Atualizar
            </button>
            <button type="button" className="cfg-btn cfg-btn-primario cfg-btn-sm" onClick={abrirNova}>
              <FiPlus /> Nova regra
            </button>
          </div>
        </div>

        <div className="cfg-aviso">
          Menor prioridade vence. Regra de modelo ativo só muda <strong>ativo</strong> e <strong>descrição</strong>; para mudar
          condições, prioridade ou criar regras, clone o modelo e edite as regras do clone antes de ativá-lo (a ativação
          confere as regras salvas: regra inválida bloqueia). Prioridade não pode repetir entre regras efetivas. As mesmas
          travas valem no Django Admin.
        </div>

        <Estado carregando={carregando} erro={erro} vazio={!regras.length} textoVazio="Nenhuma regra encontrada.">
          <div className="cfg-tabela-wrap">
            <table className="cfg-tabela">
              <thead>
                <tr>
                  <th>Prior.</th>
                  <th>Condições</th>
                  <th>Modelo</th>
                  <th>Descrição</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {regras.map((r) => (
                  <tr key={r.id} className={r.ativo ? "" : "cfg-inativa"}>
                    <td>
                      <strong>{r.prioridade}</strong>
                    </td>
                    <td>{badgesCondicao(r)}</td>
                    <td>
                      → <Badge cor={r.modelo_ativo ? "verde" : "neutro"}>{rotuloModelo(r)}</Badge>
                      {r.modelo_ativo && <FiLock title="Modelo ativo" />}
                    </td>
                    <td>{r.descricao || "—"}</td>
                    <td>
                      {r.ativo ? <Badge cor="verde">ativa</Badge> : <Badge>inativa</Badge>}
                      {r.efetiva && <Badge cor="azul">efetiva</Badge>}
                    </td>
                    <td>
                      <div className="cfg-acoes">
                        <button type="button" className="cfg-icon-btn" title={r.ativo ? "Desativar" : "Ativar"} onClick={() => abrirAcao(r.ativo ? "desativar" : "ativar", r)}>
                          {r.ativo ? <FiToggleRight size={20} color="#10b981" /> : <FiToggleLeft size={20} />}
                        </button>
                        <button type="button" className="cfg-icon-btn" title="Editar" onClick={() => abrirEdicao(r)}>
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="cfg-icon-btn"
                          title={r.modelo_ativo ? "Regra de modelo ativo não pode ser excluída" : "Excluir"}
                          disabled={r.modelo_ativo}
                          onClick={() => abrirAcao("excluir", r)}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > regras.length && <small className="cfg-ajuda">Exibindo {regras.length} de {total} regras.</small>}
        </Estado>
      </div>

      <div className="cfg-card">
        <div className="cfg-card-titulo">
          <h3>Simular</h3>
        </div>
        <p className="cfg-subtitulo" style={{ marginBottom: 12 }}>
          Recalcula o modelo das últimas notas com as regras atuais (e, opcionalmente, tratando versões inativas como
          ativas) e lista as que mudariam. Não grava nada. Use antes de ativar um clone (passo 5 do fluxo).
        </p>
        <div className="cfg-filtros">
          <Campo label="Últimas notas" ajuda="1 a 1000">
            <input className="cfg-input" type="number" min={1} max={1000} value={ultimas} onChange={(e) => setUltimas(e.target.value)} />
          </Campo>
          <Campo label="Tratar como ativas (opcional)" ajuda="Ctrl/Cmd + clique para várias">
            <select
              className="cfg-input"
              multiple
              size={Math.min(4, Math.max(2, versoesInativas.length))}
              value={ativarModelos}
              onChange={(e) => setAtivarModelos(Array.from(e.target.selectedOptions).map((o) => o.value))}
            >
              {versoesInativas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.codigo} v{v.versao}
                </option>
              ))}
            </select>
          </Campo>
          <button type="button" className="cfg-btn cfg-btn-primario" onClick={simular} disabled={simulando} style={{ marginBottom: 4 }}>
            <FiPlay /> {simulando ? "Simulando…" : "Simular"}
          </button>
        </div>

        {simulacao && (
          <>
            <div className="cfg-aviso">
              {simulacao.mudariam ?? simulacao.notas?.length ?? 0} de {simulacao.total ?? "?"} nota(s) mudariam de modelo.
              {simulacao.sem_modelo_atual > 0 && ` Sem modelo hoje: ${simulacao.sem_modelo_atual}.`}
              {simulacao.sem_modelo_proposto > 0 && ` Ficariam sem modelo: ${simulacao.sem_modelo_proposto}.`}
            </div>
            {(simulacao.resumo || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {simulacao.resumo.map((r, i) => (
                  <Badge key={i} cor="amarelo">
                    {r.atual || "—"} → {r.proposto || "—"}: {r.quantidade}
                  </Badge>
                ))}
              </div>
            )}
            {(simulacao.notas || []).length > 0 && (
              <div className="cfg-tabela-wrap">
                <table className="cfg-tabela">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>id_integracao</th>
                      <th>Tipo</th>
                      <th>Fatura</th>
                      <th>Prestador</th>
                      <th>Apólice</th>
                      <th>Modelo atual → proposto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulacao.notas.map((n) => (
                      <tr key={n.id}>
                        <td>{n.id}</td>
                        <td className="cfg-mono">{n.id_integracao || "—"}</td>
                        <td>{n.tipo_nfe || "—"}</td>
                        <td>{n.fatura || "—"}</td>
                        <td className="cfg-mono">{n.prestador_cpf_cnpj ? formatarCnpj(n.prestador_cpf_cnpj) : "—"}</td>
                        <td>{n.apolice || "—"}</td>
                        <td>
                          <Badge>{n.atual ? `${n.atual.codigo} v${n.atual.versao}` : "nenhum"}</Badge> →{" "}
                          <Badge cor="amarelo">{n.proposto ? `${n.proposto.codigo} v${n.proposto.versao}` : "nenhum"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal criar/editar */}
      <Modal
        aberto={!!editando}
        largo
        titulo={editando?.id ? `Editar regra #${editando.id} (prioridade ${editando.prioridade})` : "Nova regra"}
        onFechar={() => !salvando && setEditando(null)}
        rodape={
          <>
            <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </button>
            <button type="button" className="cfg-btn cfg-btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {editando && (
          <>
            {regraDeModeloAtivo && (
              <div className="cfg-aviso">
                <FiLock /> <span>Regra de modelo ativo: só ativo e descrição podem mudar.</span>
              </div>
            )}
            {errosForm.geral && <div className="cfg-aviso cfg-aviso-perigo">{errosForm.geral}</div>}
            <div className="cfg-grid">
              <Campo label="Prioridade" obrigatorio erro={errosForm.prioridade} ajuda="Menor vence. Com apólice: 1–9 ou 41–44.">
                <input className="cfg-input" type="number" min={1} value={form.prioridade} disabled={travado("prioridade")} onChange={(e) => setForm((f) => ({ ...f, prioridade: e.target.value }))} />
              </Campo>
              <Campo label="Modelo" obrigatorio erro={errosForm.modelo} ajuda="Versões ativas não aceitam regra nova: use um clone (inativo).">
                <select className="cfg-input" value={form.modelo ?? ""} disabled={travado("modelo")} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}>
                  <option value="">—</option>
                  {grupos.map((g) => (
                    <optgroup key={g.codigo} label={`${g.codigo} — ${g.nome}`}>
                      {g.versoes.map((v) => (
                        <option key={v.id} value={v.id} disabled={v.ativo && !regraDeModeloAtivo && String(v.id) !== String(editando.modelo ?? "")}>
                          {g.codigo} v{v.versao} {v.ativo ? "(ativa)" : "(inativa)"}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Campo>
              <Campo erro={errosForm.ativo}>
                <label className="cfg-check" style={{ marginTop: 24 }}>
                  <input type="checkbox" checked={!!form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} /> Regra ativa
                </label>
              </Campo>
              <div className="cfg-grid-largo">
                <Campo label="Descrição" erro={errosForm.descricao} ajuda='Regra sem condição só como FALLBACK (descrição começando com "FALLBACK").'>
                  <input className="cfg-input" maxLength={200} value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
                </Campo>
              </div>
              {camposCondicao.map((c) => (
                <Campo key={c} label={ROTULOS[c] || c} erro={errosForm[c]} ajuda={c === "prefixo_fatura" ? "Sem diferença de caixa." : c === "prestador" ? "Deve ser o prestador do modelo." : undefined}>
                  {c === "prestador" ? (
                    <select className="cfg-input" value={form[c] ?? ""} disabled={travado(c)} onChange={(e) => setForm((f) => ({ ...f, [c]: e.target.value }))}>
                      <option value="">(qualquer)</option>
                      {prestadores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.razao_social}
                        </option>
                      ))}
                    </select>
                  ) : c === "tipo_nfe" ? (
                    <select className="cfg-input" value={form[c] ?? ""} disabled={travado(c)} onChange={(e) => setForm((f) => ({ ...f, [c]: e.target.value }))}>
                      <option value="">(qualquer)</option>
                      {opcoesTipoNfe.map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.rotulo}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="cfg-input" value={form[c] ?? ""} placeholder="(qualquer)" disabled={travado(c)} onChange={(e) => setForm((f) => ({ ...f, [c]: e.target.value }))} />
                  )}
                </Campo>
              ))}
              <div className="cfg-grid-largo">
                <CampoMotivo valor={motivo} onChange={setMotivo} erro={errosForm.motivo} />
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Modal ativar/desativar/excluir */}
      <Modal
        aberto={!!acao}
        titulo={acao ? `${{ ativar: "Ativar", desativar: "Desativar", excluir: "Excluir" }[acao.tipo]} regra #${acao.regra.id} (prioridade ${acao.regra.prioridade})` : ""}
        onFechar={() => !executando && setAcao(null)}
        rodape={
          acao && (
            <>
              <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setAcao(null)} disabled={executando}>
                Cancelar
              </button>
              <button type="button" className={`cfg-btn ${acao.tipo === "excluir" ? "cfg-btn-perigo" : "cfg-btn-primario"}`} onClick={executarAcao} disabled={executando}>
                {executando ? "Processando…" : "Confirmar"}
              </button>
            </>
          )
        }
      >
        {acao && (
          <>
            <div className={`cfg-aviso ${acao.tipo === "excluir" ? "cfg-aviso-perigo" : "cfg-aviso-alerta"}`}>{textoAcao[acao.tipo]}</div>
            <div style={{ marginBottom: 10 }}>
              {badgesCondicao(acao.regra)} → <Badge>{rotuloModelo(acao.regra)}</Badge>
            </div>
            <CampoMotivo valor={motivoAcao} onChange={setMotivoAcao} erro={erroAcao} />
          </>
        )}
      </Modal>
    </div>
  );
}
