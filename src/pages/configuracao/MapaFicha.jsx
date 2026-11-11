// Ficha de uma combinação do Mapa de emissão (empresa × condição): GET mapa/{prestador_id}/{condicao}/.
// É o ÚNICO lugar de configuração de modelo (decisão do dono, 10/11/2026: a antiga tela "Modelos" foi unificada aqui).
// Cabeçalho (empresa, condição, regra, versão ativa) + seletor de versões (ativa e rascunhos) + formulário por grupos
// (ativa = travada, "Clonar para editar"; rascunho = editável), ativar/desativar com as travas do backend,
// regras da versão, simular impacto (rascunho), dry-run, últimas notas, payload de exemplo e histórico (auditoria do
// modelo e da regra). Camadas fixas (10/11/2026): a regra aparece pela camada ("Apólice", "Padrão da empresa", "Canal",
// "Fallback geral") com o número em cinza, só informativo; não há mais link para a aba Regras (removida).
// Edição do padrão (§9.6): a ficha SEMPRE oferece um caminho de edição. `acoes_disponiveis` decide qual:
//   - "clonar_versao" → "Clonar para editar" (modelo só desta empresa);
//   - "derivar_padrao_proprio" → modelo compartilhado (ex.: B-1, também fallback geral): "Criar padrão próprio desta
//     empresa" → POST mapa/{id}/padrao/derivar/ → wizard no passo "Parâmetros";
//   - "criar_padrao" (empresa `sem_mapeamento`) → "Criar padrão da empresa" (wizard, POST mapa/criar/ com padrao);
//   - `padrao_derivado_pendente` → o rascunho derivado entra no seletor de versões ("editar/ativar rascunho"); ao ativar,
//     o backend reaponta a regra padrão (999) da empresa para ele (diff_regras.reapontadas);
//   - "reativar_padrao" (padrão próprio desativado = rollback; `modelo_a_reativar`) → "Padrão inativo" + "Reativar padrão
//     (B-2)" = POST modelos/{id}/ativar/ com prestador_id. `location.state.reativar` (vindo da árvore) abre direto.
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { FiCopy, FiPlay, FiCheckCircle, FiAlertTriangle, FiFileText, FiPower, FiPlus, FiEdit3 } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Estado, JsonView, Campo, RotuloCamada } from "./componentes";
import DryRunPainel from "./DryRunPainel";
import SimularImpacto from "./SimularImpacto";
import AcaoModeloModal from "./AcaoModeloModal";
import DerivarPadraoModal from "./DerivarPadraoModal";
import EditorParametros from "./EditorParametros";
import HistoricoFicha from "./HistoricoFicha";
import { camadaDe, corCondicao, nomeCampo, normalizarCombinacao, rotuloVersao, textoPadraoCompartilhado } from "./mapaDados";
import { comoLista, formatarCnpj, formatarData, mensagemErro } from "./utils";

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
  add(f.derivadoPendente, "padrão próprio, rascunho");
  f.rascunhos.forEach((r) => add(r, "rascunho"));
  if (f.modeloExibido) add(f.modeloExibido, f.modeloExibido.ativo ? "ativa" : "rascunho");
  return lista;
}

export default function MapaFicha() {
  const { prestadorId, condicao } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const ctx = useOutletContext() || {};

  const [ficha, setFicha] = useState(null);
  const [schema, setSchema] = useState(null);
  const [erroSchema, setErroSchema] = useState("");
  const [prestadores, setPrestadores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Versão em foco: id da ativa ou de um rascunho.
  const [versaoId, setVersaoId] = useState(null);
  const [modelo, setModelo] = useState(null);
  const [carregandoModelo, setCarregandoModelo] = useState(false);
  const [sujo, setSujo] = useState(false);

  const [acao, setAcao] = useState(null); // "clonar" | "ativar" | "desativar"
  const [derivando, setDerivando] = useState(false);
  const [reativar, setReativar] = useState(null); // modelo (resumo) a reativar pelo AcaoModeloModal "ativar"
  const [pedidoReativar, setPedidoReativar] = useState(false); // "Reativar" clicado na árvore: abre ao carregar
  const [proximosPassos, setProximosPassos] = useState(location.state?.proximosPassos || null);

  const carregarFicha = useCallback(
    async (preferirId = null) => {
      setCarregando(true);
      setErro("");
      try {
        const [d, s, p] = await Promise.all([
          configService.fichaMapa(prestadorId, condicao),
          schema
            ? Promise.resolve(schema)
            : configService.schemaModelos().catch((e) => {
                setErroSchema(mensagemErro(e, "Falha ao carregar o schema dos modelos."));
                return null;
              }),
          prestadores.length
            ? Promise.resolve(prestadores)
            : configService.listarPrestadores().catch((e) => {
                enqueueSnackbar(mensagemErro(e, "Falha ao carregar os prestadores."), { variant: "warning" });
                return [];
              }),
        ]);
        const f = normalizarFicha(d, condicao);
        setFicha(f);
        if (s) {
          setSchema(s);
          setErroSchema("");
        }
        setPrestadores(comoLista(p));
        // Foco padrão = o modelo exibido pela ficha (ativo; sem ativo, o rascunho mais novo); após clonar/criar, o novo.
        const ids = versoesDaFicha(f).map((v) => String(v.id));
        const alvo =
          preferirId != null && ids.includes(String(preferirId))
            ? Number(preferirId)
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
    setReativar(null);
    setPedidoReativar(!!location.state?.reativar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregarFicha]);

  // Carrega a versão em foco completa (GET modelos/{id}/): a ficha pode trazer só o resumo.
  useEffect(() => {
    if (versaoId == null) {
      setModelo(null);
      setSujo(false);
      return;
    }
    let cancelado = false;
    setCarregandoModelo(true);
    configService
      .obterModelo(versaoId)
      .then((m) => !cancelado && setModelo(m))
      .catch((e) => !cancelado && enqueueSnackbar(mensagemErro(e, "Falha ao carregar a versão."), { variant: "error" }))
      .finally(() => !cancelado && setCarregandoModelo(false));
    return () => {
      cancelado = true;
    };
  }, [versaoId, enqueueSnackbar]);

  const aoConcluirAcao = async (tipo, resp) => {
    setAcao(null);
    if (tipo === "clonar") await carregarFicha(resp?.objeto?.id ?? null);
    else await carregarFicha(modelo?.id ?? null);
    ctx.recarregarMapa?.();
  };

  const empresa = ctx.empresa;
  const nomeEmpresa = ficha?.prestador?.razao_social || empresa?.razao_social || `Prestador #${prestadorId}`;
  const cnpjEmpresa = ficha?.prestador?.cnpj || empresa?.cnpj || "";
  const versoes = ficha ? versoesDaFicha(ficha) : [];
  const rascunhoMaisNovo = ficha?.rascunhos?.[0] || null;
  // Caminho de edição (§9.6): `acoes_disponiveis` = clonar_versao | derivar_padrao_proprio | criar_padrao. Sem a lista
  // (backend antigo): criar_padrao se `sem_mapeamento`, senão clonar_versao.
  const acoes = ficha?.acoesDisponiveis || (ficha?.semMapeamento ? ["criar_padrao"] : ["clonar_versao"]);
  const semPadrao = acoes.includes("criar_padrao");
  const aReativar = acoes.includes("reativar_padrao") ? ficha?.modeloAReativar || null : null;
  useEffect(() => {
    if (!pedidoReativar || !ficha) return;
    setPedidoReativar(false);
    if (aReativar?.id != null) setReativar(aReativar);
  }, [pedidoReativar, ficha, aReativar]);
  const abrirReativar = (modeloId = null) => {
    setDerivando(false);
    const alvo = modeloId != null && String(modeloId) !== String(aReativar?.id) ? { id: Number(modeloId) } : aReativar;
    if (alvo?.id != null) setReativar(alvo);
  };
  const pendente = ficha?.derivadoPendente || null;
  // Com rascunho derivado pendente, não deriva de novo (409 derivacao_pendente): edita/ativa o rascunho.
  const podeDerivar = !semPadrao && !pendente && acoes.includes("derivar_padrao_proprio");
  const podeClonar = !semPadrao && acoes.includes("clonar_versao");
  const compartilhado = !!ficha?.modeloCompartilhado || podeDerivar;
  // Empresa sem padrão próprio: a ficha mostra o FALLBACK geral (vale para todas as empresas sem padrão) — fica para
  // consulta e a ação é "Criar padrão da empresa". Nos demais casos, rascunho é editável e a ativa é travada.
  const editavel = modelo && !semPadrao ? (modelo.editavel ?? !modelo.ativo) : false;
  // O compartilhado é também o fallback geral? §9.6: `modelo_eh_fallback` explícito (backend antigo: assume que sim).
  const idCompartilhado = ficha?.modeloAtivo?.id ?? ficha?.modelo?.id ?? null;
  const compartilhadoEhFallback = ficha?.modeloEhFallback ?? true;
  const abrirDerivado = (resp) => {
    setDerivando(false);
    const obj = resp?.objeto || {};
    ctx.recarregarMapa?.();
    navigate(`/configuracao/mapa/nova?prestador=${prestadorId}&tipo=padrao`, {
      state: {
        derivado: {
          modelo: obj.modelo,
          regra: obj.regra || obj.regra_a_reapontar || null,
          condicao: obj.condicao || { chave: "padrao", tipo: "padrao", valor: null },
          base_modelo_id: obj.modelo_origem?.id ?? idCompartilhado,
          reapontamento: obj.reapontamento || "",
          regra_a_reapontar: obj.regra_a_reapontar || null,
        },
      },
    });
  };
  // 409 derivacao_pendente (rascunho já existe): foca o rascunho na própria ficha.
  const abrirPendente = async (modeloId) => {
    setDerivando(false);
    await carregarFicha(modeloId);
  };
  const regraId = ficha?.regra?.id ?? null;
  const novaConfiguracao = (tipo) =>
    ctx.abrirNova ? ctx.abrirNova(empresa || { id: Number(prestadorId) }, tipo) : navigate(`/configuracao/mapa/nova?prestador=${prestadorId}&tipo=${tipo}`);

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
                      <Badge
                        cor={ficha.regra.ativo === false ? "amarelo" : "neutro"}
                        title={`${ficha.regra.descricao || ""}${ficha.regra.condicoes ? ` · ${ficha.regra.condicoes}` : ""}`}
                      >
                        <RotuloCamada camada={ficha.camada} prefixo="camada " />
                        {ficha.regra.ativo === false ? " (inativa)" : ""}
                      </Badge>
                    ) : (
                      <Badge cor="amarelo">sem regra</Badge>
                    )}
                    {ficha.semMapeamento ? (
                      <Badge cor="amarelo">fallback: {rotuloVersao(ficha.modeloAtivo || ficha.modelo)}</Badge>
                    ) : ficha.modeloAtivo ? (
                      <Badge cor="verde">versão ativa: {rotuloVersao(ficha.modeloAtivo)}</Badge>
                    ) : (
                      <Badge cor="amarelo">não emite (só rascunho)</Badge>
                    )}
                  </div>
                </div>
                <div className="cfg-acoes">
                  <button type="button" className="cfg-btn cfg-btn-contorno cfg-btn-sm" onClick={() => novaConfiguracao("apolice")}>
                    <FiPlus /> Nova configuração
                  </button>
                </div>
              </div>

              {/* Seletor de versões + ações da versão em foco */}
              {versoes.length > 0 && (
                <div className="cfg-ficha-versoes">
                  <Campo label="Versão em foco" ajuda={sujo ? "Salve ou descarte as alterações para trocar de versão." : undefined}>
                    <select className="cfg-input" value={versaoId ?? ""} onChange={(e) => setVersaoId(Number(e.target.value))} disabled={sujo}>
                      {versoes.map((v) => (
                        <option key={v.id} value={v.id}>
                          {rotuloVersao(v)} ({v.papel})
                        </option>
                      ))}
                    </select>
                  </Campo>
                  {modelo && (
                    <div className="cfg-acoes">
                      {aReativar && modelo.ativo ? (
                        <button type="button" className="cfg-btn cfg-btn-sucesso" onClick={() => abrirReativar()}>
                          <FiCheckCircle /> Reativar padrão ({rotuloVersao(aReativar)})
                        </button>
                      ) : semPadrao ? (
                        <button type="button" className="cfg-btn cfg-btn-primario" onClick={() => novaConfiguracao("padrao")}>
                          <FiPlus /> Criar padrão da empresa
                        </button>
                      ) : modelo.ativo ? (
                        <>
                          {pendente && String(pendente.id) !== String(modelo.id) && (
                            <button type="button" className="cfg-btn cfg-btn-primario" onClick={() => setVersaoId(pendente.id)} disabled={sujo}>
                              <FiEdit3 /> Editar padrão próprio ({rotuloVersao(pendente)}, rascunho)
                            </button>
                          )}
                          {podeDerivar && (
                            <button type="button" className="cfg-btn cfg-btn-primario" onClick={() => setDerivando(true)}>
                              <FiEdit3 /> Criar padrão próprio desta empresa
                            </button>
                          )}
                          {podeClonar && (
                            <button
                              type="button"
                              className={`cfg-btn ${podeDerivar ? "cfg-btn-contorno" : "cfg-btn-primario"}`}
                              onClick={() => setAcao("clonar")}
                            >
                              <FiCopy /> Clonar para editar
                            </button>
                          )}
                          {podeClonar && !compartilhado && (
                            <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setAcao("desativar")}>
                              <FiPower /> Desativar
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="cfg-btn cfg-btn-sucesso"
                            onClick={() => setAcao("ativar")}
                            disabled={sujo}
                            title={sujo ? "Salve as alterações antes de ativar." : ""}
                          >
                            <FiCheckCircle /> Ativar
                          </button>
                          <button type="button" className="cfg-btn cfg-btn-contorno" onClick={() => setAcao("clonar")} disabled={sujo}>
                            <FiCopy /> Clonar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {ficha.avisos.map((a, i) => (
                <div key={i} className="cfg-aviso cfg-aviso-alerta">
                  <FiAlertTriangle /> <span>{typeof a === "string" ? a : JSON.stringify(a)}</span>
                </div>
              ))}
              {erroSchema && (
                <div className="cfg-aviso cfg-aviso-perigo">
                  <FiAlertTriangle /> <span>{erroSchema} Sem o schema o formulário de parâmetros não é montado.</span>
                </div>
              )}

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

              {(semPadrao || versoes.length === 0) && (
                <div className="cfg-aviso cfg-aviso-alerta">
                  <FiAlertTriangle />
                  <span>
                    {ficha.tipo === "padrao"
                      ? "Esta empresa não tem padrão próprio: cai no modelo padrão geral (fallback)."
                      : "Esta condição não tem modelo: as notas caem no padrão da empresa ou no padrão geral (fallback)."}
                    {semPadrao &&
                      " O modelo abaixo é o geral, compartilhado por todas as empresas sem padrão. Para editar o desta empresa, crie o padrão dela (nasce como cópia editável)."}{" "}
                    <button type="button" className="cfg-link-btn" onClick={() => novaConfiguracao(ficha.tipo === "padrao" ? "padrao" : "apolice")}>
                      {ficha.tipo === "padrao" ? "Criar padrão da empresa" : "Criar configuração"}
                    </button>
                  </span>
                </div>
              )}

              {aReativar && (
                <div className="cfg-aviso cfg-aviso-alerta">
                  <FiAlertTriangle />
                  <span>
                    <strong>Padrão inativo.</strong> O padrão próprio desta empresa ({rotuloVersao(aReativar)}) está desativado: as notas
                    sem canal/apólice caem no fallback geral.{" "}
                    <button type="button" className="cfg-btn cfg-btn-sucesso cfg-btn-sm" onClick={() => abrirReativar()}>
                      Reativar padrão ({rotuloVersao(aReativar)})
                    </button>
                  </span>
                </div>
              )}

              {pendente && (
                <div className="cfg-aviso">
                  <FiEdit3 />
                  <span>
                    Há um padrão próprio desta empresa em rascunho: <strong>{rotuloVersao(pendente)}</strong> (ainda não emite). Ao
                    ativá-lo, a regra padrão da empresa passa do {rotuloVersao(ficha.modeloAtivo || ficha.modelo)} para ele.{" "}
                    {String(versaoId) !== String(pendente.id) && (
                      <button type="button" className="cfg-link-btn" onClick={() => setVersaoId(pendente.id)} disabled={sujo}>
                        Editar / ativar o rascunho
                      </button>
                    )}
                  </span>
                </div>
              )}

              {podeDerivar && (
                <div className="cfg-aviso">
                  <FiEdit3 />
                  <span>
                    {textoPadraoCompartilhado(ficha.modeloAtivo || ficha.modelo, { fallback: compartilhadoEhFallback })}{" "}
                    <button type="button" className="cfg-link-btn" onClick={() => setDerivando(true)}>
                      Criar padrão próprio desta empresa
                    </button>
                  </span>
                </div>
              )}

              {!semPadrao && modelo?.ativo && rascunhoMaisNovo && String(rascunhoMaisNovo.id) !== String(versaoId) && (
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
                          {modelo.provedor && <Badge cor={modelo.provedor === "municipal" ? "roxo" : "azul"}>{modelo.provedor}</Badge>}
                        </h3>
                        <small className="cfg-ajuda">
                          {modelo.slug ? `${modelo.slug} · ` : ""}atualizado em {formatarData(modelo.atualizado_em)}
                        </small>
                      </div>
                      {(modelo.avisos || []).map((a, i) => (
                        <div key={i} className="cfg-aviso cfg-aviso-alerta">
                          <FiAlertTriangle /> <span>{typeof a === "string" ? a : JSON.stringify(a)}</span>
                        </div>
                      ))}
                      <EditorParametros
                        modelo={modelo}
                        schema={schema}
                        prestadores={prestadores}
                        valoresFicha={ficha.valoresFicha}
                        editavel={editavel}
                        onSalvo={setModelo}
                        onSujo={setSujo}
                      />
                    </>
                  )}
                </Estado>
              </div>
            )}

            {/* Regras desta versão (só consulta: a camada é definida pelo Mapa na criação) */}
            {modelo && (
              <div className="cfg-card">
                <div className="cfg-card-titulo">
                  <h3>Regras desta versão</h3>
                  <small className="cfg-ajuda">Ordem fixa: Canal → Apólice → Padrão da empresa → Fallback geral</small>
                </div>
                {(modelo.regras || []).length === 0 ? (
                  <div className="cfg-aviso cfg-aviso-alerta">Sem regras: esta versão não será escolhida pelo resolvedor mesmo se ativada.</div>
                ) : (
                  <div className="cfg-tabela-wrap">
                    <table className="cfg-tabela">
                      <thead>
                        <tr>
                          <th>Camada</th>
                          <th>Condições</th>
                          <th>Descrição</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modelo.regras.map((r) => (
                          <tr key={r.id} className={r.ativo ? "" : "cfg-inativa"}>
                            <td>
                              <RotuloCamada camada={camadaDe({ camada: r.camada, regra: r })} />
                            </td>
                            <td className="cfg-mono">{r.condicoes || "—"}</td>
                            <td>{r.descricao || "—"}</td>
                            <td>
                              {r.ativo ? (
                                <Badge cor="verde">ativa</Badge>
                              ) : String(r.descricao || "").startsWith("[mapa]") ? (
                                <Badge cor="amarelo" title="Ativada junto com a versão">inativa até ativar</Badge>
                              ) : (
                                <Badge>inativa</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Simular impacto: só para rascunho (a versão ativa já emite) */}
            {modelo && !modelo.ativo && !semPadrao && (
              <div className="cfg-card">
                <div className="cfg-card-titulo">
                  <h3>Simular impacto — {rotuloVersao(modelo)}</h3>
                </div>
                <small className="cfg-ajuda">
                  Quantas das últimas notas mudariam de modelo se este rascunho fosse ativado (não grava nada).
                </small>
                {sujo && <div className="cfg-aviso cfg-aviso-alerta">Há alterações não salvas: a simulação usa a versão salva no servidor.</div>}
                <SimularImpacto modeloId={modelo.id} />
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

            {/* Histórico: auditoria da versão em foco e da regra da combinação */}
            <HistoricoFicha
              alvos={[
                { entidade: "modelo", id: modelo?.id ?? null, rotulo: modelo ? `modelo ${rotuloVersao(modelo)}` : "" },
                { entidade: "regra", id: regraId, rotulo: regraId != null ? `regra ${regraId} (camada ${ficha.camada?.rotulo || "?"})` : "" },
              ]}
            />
          </>
        )}
      </Estado>

      <AcaoModeloModal
        acao={acao}
        modelo={modelo}
        prestadorId={prestadorId}
        onDerivar={
          acoes.includes("derivar_padrao_proprio") && !pendente
            ? () => {
                setAcao(null);
                setDerivando(true);
              }
            : undefined
        }
        onFechar={() => setAcao(null)}
        onConcluido={aoConcluirAcao}
      />
      <DerivarPadraoModal
        aberto={derivando}
        prestadorId={prestadorId}
        nomeEmpresa={nomeEmpresa}
        modelo={ficha?.modeloAtivo || ficha?.modelo}
        fallback={compartilhadoEhFallback}
        onFechar={() => setDerivando(false)}
        onConcluido={abrirDerivado}
        onAbrirPendente={abrirPendente}
        onReativar={abrirReativar}
      />
      <AcaoModeloModal
        acao={reativar ? "ativar" : null}
        modelo={reativar}
        prestadorId={prestadorId}
        onFechar={() => setReativar(null)}
        onConcluido={async () => {
          setReativar(null);
          await carregarFicha(null);
          ctx.recarregarMapa?.();
        }}
      />
    </div>
  );
}
