// Ficha de uma combinação do Mapa de emissão (empresa × condição): GET mapa/{prestador_id}/{condicao}/.
// É o ÚNICO lugar de configuração de modelo (decisão do dono, 10/11/2026: a antiga tela "Modelos" foi unificada aqui).
// Cabeçalho (empresa, condição, regra, versão ativa) + seletor de versões (ativa e rascunhos) + formulário por grupos
// (ativa = travada, "Clonar para editar"; rascunho = editável), ativar/desativar com as travas do backend,
// regras da versão, dry-run, últimas notas, payload de exemplo e histórico (auditoria do modelo e da regra).
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { FiCopy, FiPlay, FiCheckCircle, FiAlertTriangle, FiFileText, FiPower, FiPlus } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Estado, JsonView, Campo } from "./componentes";
import DryRunPainel from "./DryRunPainel";
import AcaoModeloModal from "./AcaoModeloModal";
import EditorParametros from "./EditorParametros";
import HistoricoFicha from "./HistoricoFicha";
import { corCondicao, nomeCampo, normalizarCombinacao, rotuloVersao } from "./mapaDados";
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
  // Padrão por FALLBACK: o modelo exibido é o geral (B-1); clonar/ativar daqui afetaria todas as empresas sem padrão.
  const bloqueadoFallback = !!ficha?.semMapeamento;
  const editavel = modelo && !bloqueadoFallback ? (modelo.editavel ?? !modelo.ativo) : false;
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
                      <Link
                        to={`/configuracao/regras?modelo=${(typeof ficha.regra.modelo === "object" ? ficha.regra.modelo?.id : ficha.regra.modelo) ?? ficha.modelo?.id ?? ""}`}
                        title={`${ficha.regra.descricao || ""}${ficha.regra.condicoes ? ` · ${ficha.regra.condicoes}` : ""} — consultar em Avançado → Regras`}
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
                  {modelo && !bloqueadoFallback && (
                    <div className="cfg-acoes">
                      {modelo.ativo ? (
                        <>
                          <button type="button" className="cfg-btn cfg-btn-primario" onClick={() => setAcao("clonar")}>
                            <FiCopy /> Clonar para editar
                          </button>
                          <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setAcao("desativar")}>
                            <FiPower /> Desativar
                          </button>
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

              {(bloqueadoFallback || versoes.length === 0) && (
                <div className="cfg-aviso cfg-aviso-alerta">
                  <FiAlertTriangle />
                  <span>
                    {ficha.tipo === "padrao"
                      ? "Esta empresa não tem padrão próprio: cai no modelo padrão geral (fallback)."
                      : "Esta condição não tem modelo: as notas caem no padrão da empresa ou no padrão geral (fallback)."}
                    {bloqueadoFallback && " O modelo abaixo é o geral, compartilhado por todas as empresas sem padrão: aqui ele fica só para consulta."}{" "}
                    <button type="button" className="cfg-link-btn" onClick={() => novaConfiguracao(ficha.tipo === "padrao" ? "padrao" : "apolice")}>
                      {ficha.tipo === "padrao" ? "Criar padrão da empresa" : "Criar configuração"}
                    </button>
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

            {/* Regras desta versão (consulta; ajuste fino em Avançado → Regras) */}
            {modelo && (
              <div className="cfg-card">
                <div className="cfg-card-titulo">
                  <h3>Regras desta versão</h3>
                  <Link to={`/configuracao/regras?modelo=${modelo.id}`} className="cfg-btn cfg-btn-neutro cfg-btn-sm" title="Ajuste fino (Avançado)">
                    Ajuste fino em Avançado → Regras
                  </Link>
                </div>
                {(modelo.regras || []).length === 0 ? (
                  <div className="cfg-aviso cfg-aviso-alerta">Sem regras: esta versão não será escolhida pelo resolvedor mesmo se ativada.</div>
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
                { entidade: "regra", id: regraId, rotulo: regraId != null ? `regra ${regraId}` : "" },
              ]}
            />
          </>
        )}
      </Estado>

      <AcaoModeloModal acao={acao} modelo={modelo} onFechar={() => setAcao(null)} onConcluido={aoConcluirAcao} />
    </div>
  );
}
