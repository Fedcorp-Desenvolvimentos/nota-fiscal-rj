// Wizard "Nova configuração" (rota /configuracao/mapa/nova?prestador=<id>&tipo=apolice|tipo_nfe|padrao), no painel da
// direita do Mapa de emissão. Decisão do dono (10/11/2026): primeiro a condição, depois os parâmetros, depois ativar.
//   1. Condição  → POST mapa/criar/ (rascunho = modelo novo inativo + regra [mapa] inativa). Erros 400/409 ficam no passo.
//   2. Parâmetros → formulário por grupos do rascunho (EditorParametros), salvar com motivo e dry-run inline; campos que
//                   diferem do modelo base em destaque.
//   3. Ativar    → resumo, "Simular impacto" (regras/simular/ com ativar_modelos=[id]), "Ativar agora" (travas +
//                   ResumoAtivacao) ou "Deixar como rascunho". Ao terminar, abre a ficha da combinação.
// Camadas fixas (10/11/2026): não há campo de prioridade; a camada vem do tipo da condição (apólice → Apólice,
// padrão → Padrão da empresa, canal → Canal) e o backend escolhe a prioridade. O número aparece só em cinza.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { FiArrowLeft, FiArrowRight, FiCheckCircle, FiLayers, FiPlay, FiSave } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Campo, CampoMotivo, ErrosBackend, Estado, RotuloCamada } from "./componentes";
import DryRunPainel from "./DryRunPainel";
import SimularImpacto from "./SimularImpacto";
import EditorParametros from "./EditorParametros";
import AcaoModeloModal from "./AcaoModeloModal";
import { agruparModelos } from "./modelosDados";
import { CANAIS, camadaDe, chaveCondicao, normalizarApolice, opcoesModeloBase, rotuloCondicao, rotuloVersao } from "./mapaDados";
import {
  MENSAGEM_CONFLITO_CONDICAO,
  codigoErro,
  ehConflitoCondicao,
  errosDeCampo,
  formatarCnpj,
  mensagemErro,
  notificarEscrita,
  validarMotivo,
} from "./utils";

/** Texto curto do passo 1: em que camada a condição escolhida entra e o que ela vence. */
function ExplicacaoCamada({ tipo, valor }) {
  const camada = camadaDe({ tipo });
  const canal = CANAIS.find((c) => c.valor === valor)?.rotulo || "do canal";
  const textos = {
    apolice: "Vale para as notas desta empresa com esta apólice; perde só para os canais (VR/externo).",
    padrao: "Vale para toda nota desta empresa sem canal nem apólice própria; hoje ela cai no fallback geral.",
    canal_empresa: `Vale para as notas ${canal} desta empresa; vence o canal geral, a apólice e o padrão da empresa.`,
  };
  return (
    <div className="cfg-grid-largo">
      <div className="cfg-aviso">
        <FiLayers />
        <span>
          Esta condição entra na camada <strong>{camada.rotulo}</strong>. {textos[camada.chave] || ""} Apólices vencem o padrão
          da empresa; o padrão vence o fallback geral. A ordem é fixa (não há prioridade para escolher).
        </span>
      </div>
    </div>
  );
}

const PASSOS = ["Condição", "Parâmetros", "Ativar"];

function Progresso({ passo }) {
  return (
    <ol className="cfg-wizard-passos" aria-label="Progresso">
      {PASSOS.map((p, i) => (
        <li key={p} className={i === passo ? "atual" : i < passo ? "feito" : ""} aria-current={i === passo ? "step" : undefined}>
          <span className="cfg-wizard-num">{i < passo ? "✓" : i + 1}</span> {p}
        </li>
      ))}
    </ol>
  );
}

/** Modelo base padrão (contrato §9.3): o ativo do padrão da empresa; sem padrão próprio, o FALLBACK — só se compatível. */
function basePadrao(empresa, opcoes) {
  if (!empresa?.padrao) return null;
  const candidato = empresa.padrao.modeloAtivo?.id ?? empresa.padrao.modelo?.id ?? null;
  return opcoes.some((o) => String(o.id) === String(candidato)) ? String(candidato) : null;
}

export default function NovaConfiguracaoWizard() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const ctx = useOutletContext() || {};
  const empresas = useMemo(() => ctx.empresas || [], [ctx.empresas]);

  const [passo, setPasso] = useState(0);

  // ---- passo 1 ----
  const [empresaId, setEmpresaId] = useState(params.get("prestador") || "");
  const [tipo, setTipo] = useState(params.get("tipo") || "apolice");
  const [valor, setValor] = useState("");
  const [baseId, setBaseId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errosCampo, setErrosCampo] = useState({});
  const [erroCriar, setErroCriar] = useState(null);
  const [criando, setCriando] = useState(false);
  const [grupos, setGrupos] = useState([]);
  const [erroModelos, setErroModelos] = useState("");
  const [carregandoModelos, setCarregandoModelos] = useState(true);

  // ---- resultado do passo 1 e passos 2/3 ----
  const [criado, setCriado] = useState(null); // {modelo, regra, condicao}
  const [rascunho, setRascunho] = useState(null);
  const [base, setBase] = useState(null);
  const [schema, setSchema] = useState(null);
  const [erroSchema, setErroSchema] = useState("");
  const [sujo, setSujo] = useState(false);
  const [acao, setAcao] = useState(null);
  const [ativado, setAtivado] = useState(false);

  const empresa = empresas.find((e) => String(e.id) === String(empresaId)) || null;
  const opcoes = useMemo(() => opcoesModeloBase(grupos, empresa), [grupos, empresa]);
  const padraoBase = basePadrao(empresa, opcoes);

  // Parâmetros da URL mudaram (outro "+ Nova configuração"): recomeça o wizard.
  const consulta = params.toString();
  useEffect(() => {
    const q = new URLSearchParams(consulta);
    setEmpresaId(q.get("prestador") || "");
    setTipo(q.get("tipo") || "apolice");
    setPasso(0);
    setCriado(null);
    setRascunho(null);
    setAtivado(false);
    setValor("");
    setMotivo("");
    setCodigo("");
    setErroCriar(null);
  }, [consulta]);

  const carregarModelos = useCallback(async () => {
    setCarregandoModelos(true);
    setErroModelos("");
    try {
      setGrupos(agruparModelos(await configService.listarModelos({ ativo: true })));
    } catch (e) {
      setErroModelos(mensagemErro(e, "Falha ao carregar os modelos ativos (combo Modelo base)."));
      setGrupos([]);
    } finally {
      setCarregandoModelos(false);
    }
  }, []);

  useEffect(() => {
    carregarModelos();
    configService
      .schemaModelos()
      .then(setSchema)
      .catch((e) => setErroSchema(mensagemErro(e, "Falha ao carregar o schema dos modelos.")));
  }, [carregarModelos]);

  // Empresa trocada: tipo coerente (padrão só para empresa sem mapeamento), valor e base padrão.
  useEffect(() => {
    if (criado) return;
    setTipo((t) => (t === "padrao" && empresa && !empresa.semMapeamento ? "apolice" : t));
    setErrosCampo({});
    setErroCriar(null);
  }, [empresa, criado]);
  useEffect(() => {
    if (!criado) setBaseId(padraoBase ?? "");
  }, [padraoBase, criado]);

  const tiposDisponiveis = [
    { valor: "apolice", rotulo: "Apólice" },
    { valor: "tipo_nfe", rotulo: "Canal (VR / externo)" },
    ...(empresa?.semMapeamento ? [{ valor: "padrao", rotulo: "Padrão da empresa" }] : []),
  ];

  const valorEnviado = tipo === "apolice" ? normalizarApolice(valor) : tipo === "tipo_nfe" ? valor || CANAIS[0].valor : null;
  const chaveFicha = empresa ? chaveCondicao(tipo, valorEnviado) : null;

  // ---- passo 1: criar ----
  const criar = async () => {
    const e = {};
    if (!empresa) e.empresa = "Escolha a empresa.";
    else if (!empresa.ativo) e.empresa = "Empresa inativa: ative-a na aba Prestadores antes de mapear.";
    if (tipo === "apolice" && !valorEnviado) e.valor = "Informe o código da apólice (ex.: PSPS01).";
    if (!baseId) e.base_modelo_id = "Escolha o modelo base.";
    const em = validarMotivo(motivo);
    if (em) e.motivo = em;
    setErrosCampo(e);
    setErroCriar(null);
    if (Object.keys(e).length) return;

    const corpo = {
      prestador_id: Number(empresa.id),
      condicao: tipo === "padrao" ? { tipo: "padrao" } : { tipo, valor: valorEnviado },
      base_modelo_id: Number(baseId),
      motivo: motivo.trim(),
    };
    if (codigo.trim()) corpo.codigo_sugerido = codigo.trim().toUpperCase();

    setCriando(true);
    try {
      const resp = await configService.criarMapa(corpo);
      const obj = resp?.objeto || {};
      notificarEscrita(enqueueSnackbar, resp, `Rascunho ${rotuloVersao(obj.modelo)} e regra criados (inativos).`);
      setCriado({ modelo: obj.modelo, regra: obj.regra, condicao: obj.condicao || { chave: chaveFicha, tipo, valor: valorEnviado } });
      // O envelope traz o detalhe §4.2 do rascunho (com campos virtuais); sem ele, busca pelo id.
      if (obj.modelo?.id && obj.modelo?.provedor) setRascunho(obj.modelo);
      else if (obj.modelo?.id)
        configService
          .obterModelo(obj.modelo.id)
          .then(setRascunho)
          .catch((err) => enqueueSnackbar(mensagemErro(err, "Rascunho criado, mas falhou ao carregá-lo: abra pela ficha."), { variant: "error" }));
      configService
        .obterModelo(Number(baseId))
        .then(setBase)
        .catch((err) => enqueueSnackbar(mensagemErro(err, "Não foi possível carregar o modelo base para comparar."), { variant: "warning" }));
      ctx.recarregarMapa?.();
      setPasso(1);
    } catch (err) {
      const campos = errosDeCampo(err);
      const mapeados = {};
      if (campos.motivo) mapeados.motivo = campos.motivo;
      if (campos.base_modelo_id) mapeados.base_modelo_id = campos.base_modelo_id;
      if (campos.codigo_sugerido) mapeados.codigo_sugerido = campos.codigo_sugerido;
      if (campos.prestador_id) mapeados.empresa = campos.prestador_id;
      if (campos.condicao && tipo !== "padrao") mapeados.valor = campos.condicao;
      setErrosCampo(mapeados);
      setErroCriar(err);
      enqueueSnackbar(mensagemErro(err, "Falha ao criar a configuração."), { variant: "error" });
    } finally {
      setCriando(false);
    }
  };

  const conhecidosCriar = ["motivo", "base_modelo_id", "codigo_sugerido", "prestador_id", ...(tipo !== "padrao" ? ["condicao"] : [])];
  // 409 conflito_condicao (alias conflito_prioridade) é da ativação; aqui só por garantia, com texto próprio.
  const conflitoCondicao = ehConflitoCondicao(erroCriar);
  const duplicada = !conflitoCondicao && (codigoErro(erroCriar) === "condicao_duplicada" || erroCriar?.response?.status === 409);

  const irParaFicha = () => {
    const pid = empresa?.id ?? empresaId;
    navigate(`/configuracao/mapa/${pid}/${encodeURIComponent(criado?.condicao?.chave || chaveFicha || "padrao")}`, {
      state: { rascunhoId: rascunho?.id ?? null },
    });
  };

  const rotuloCond = criado
    ? rotuloCondicao(criado.condicao?.tipo, criado.condicao?.valor)
    : rotuloCondicao(tipo, valorEnviado);
  // Camada da regra criada: `camada` do backend (na regra ou na condição) ou deduzida do tipo da condição.
  const camadaCriada = criado
    ? camadaDe({ camada: criado.regra?.camada ?? criado.condicao?.camada, tipo: criado.condicao?.tipo ?? tipo, regra: criado.regra })
    : null;

  return (
    <div className="cfg-card">
      <div className="cfg-card-titulo">
        <div>
          <h2>Nova configuração</h2>
          {empresa && (
            <div className="cfg-ficha-sub">
              <strong>{empresa.razao_social}</strong> <span className="cfg-mono">{formatarCnpj(empresa.cnpj)}</span>
              {criado && <Badge cor="roxo">{rotuloCond}</Badge>}
              {criado?.modelo && <Badge>rascunho {rotuloVersao(criado.modelo)}</Badge>}
            </div>
          )}
        </div>
        <Link to="/configuracao/mapa" className="cfg-btn cfg-btn-neutro cfg-btn-sm">
          {criado ? "Sair (o rascunho fica salvo)" : "Cancelar"}
        </Link>
      </div>

      <Progresso passo={passo} />

      {/* ---------------- Passo 1: condição ---------------- */}
      {passo === 0 && (
        <div>
          {criado ? (
            <div className="cfg-aviso">
              <span>
                Rascunho <strong>{rotuloVersao(criado.modelo)}</strong> já criado para <strong>{rotuloCond}</strong> (camada{" "}
                <RotuloCamada camada={camadaCriada} />, regra inativa até ativar). Para outra condição, saia e comece uma nova
                configuração; este rascunho fica no mapa.
              </span>
            </div>
          ) : (
            <>
              <div className="cfg-aviso">
                <span>
                  Cria um <strong>modelo novo inativo</strong> (cópia do modelo base, código próprio) e a regra da condição, também
                  inativa. Nada muda na emissão até você revisar os parâmetros, rodar o dry-run e ativar (a regra é ativada junto).
                </span>
              </div>

              <ErrosBackend erro={erroCriar} conhecidos={conhecidosCriar} padrao="Falha ao criar a configuração.">
                {conflitoCondicao && <div style={{ marginTop: 4 }}>{MENSAGEM_CONFLITO_CONDICAO}</div>}
                {duplicada && chaveFicha && (
                  <div style={{ marginTop: 4 }}>
                    Esta condição já tem modelo/regra para a empresa: edite o rascunho existente ou clone a versão ativa na ficha.{" "}
                    <Link to={`/configuracao/mapa/${empresa?.id}/${encodeURIComponent(chaveFicha)}`}>Abrir a ficha existente</Link>
                  </div>
                )}
              </ErrosBackend>

              <div className="cfg-grid">
                <Campo label="Empresa" obrigatorio erro={errosCampo.empresa}>
                  <select className="cfg-input" value={empresaId} onChange={(ev) => setEmpresaId(ev.target.value)}>
                    <option value="">Escolha…</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id} disabled={!e.ativo}>
                        {e.razao_social} — {formatarCnpj(e.cnpj)}
                        {!e.ativo ? " (inativa)" : e.semMapeamento ? " (sem padrão próprio)" : ""}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Tipo de condição" obrigatorio>
                  <select
                    className="cfg-input"
                    value={tipo}
                    onChange={(ev) => {
                      setTipo(ev.target.value);
                      setValor(ev.target.value === "tipo_nfe" ? CANAIS[0].valor : "");
                    }}
                  >
                    {tiposDisponiveis.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </option>
                    ))}
                  </select>
                </Campo>
                {tipo === "apolice" && (
                  <Campo
                    label="Apólice"
                    obrigatorio
                    erro={errosCampo.valor}
                    ajuda="Código da apólice no FedHub (FATURAS.APOLICE), ex.: PSPS01. Enviado em maiúsculas, sem espaços."
                  >
                    <input
                      className="cfg-input cfg-mono"
                      value={valor}
                      onChange={(ev) => setValor(normalizarApolice(ev.target.value))}
                      placeholder="PSPS01"
                      maxLength={30}
                    />
                  </Campo>
                )}
                {tipo === "tipo_nfe" && (
                  <Campo label="Canal" obrigatorio erro={errosCampo.valor}>
                    <select className="cfg-input" value={valor || CANAIS[0].valor} onChange={(ev) => setValor(ev.target.value)}>
                      {CANAIS.map((c) => (
                        <option key={c.valor} value={c.valor}>
                          {c.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                )}
                <ExplicacaoCamada tipo={tipo} valor={valorEnviado} />
                {tipo === "padrao" && empresa?.padrao?.modelo && (
                  <div className="cfg-grid-largo">
                    <small className="cfg-ajuda">Fallback geral usado hoje por esta empresa: {rotuloVersao(empresa.padrao.modelo)}.</small>
                  </div>
                )}
                <div className="cfg-grid-largo">
                  <Campo
                    label="Modelo base"
                    obrigatorio
                    erro={errosCampo.base_modelo_id}
                    ajuda={
                      padraoBase
                        ? empresa?.semMapeamento
                          ? "Pré-selecionado: o modelo padrão geral (fallback), que é o que esta empresa usa hoje."
                          : "Pré-selecionado: o modelo ativo do padrão da empresa. O rascunho nasce como cópia dele."
                        : "Só aparecem versões ATIVAS sem empresa ou desta empresa, do mesmo provedor; as demais o servidor recusa."
                    }
                  >
                    <select className="cfg-input" value={baseId} onChange={(ev) => setBaseId(ev.target.value)} disabled={!empresa || carregandoModelos}>
                      <option value="">{carregandoModelos ? "Carregando…" : "Escolha…"}</option>
                      {opcoes.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.rotulo}
                          {String(o.id) === padraoBase ? " (padrão)" : ""}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  {erroModelos && (
                    <div className="cfg-aviso cfg-aviso-perigo">
                      {erroModelos}{" "}
                      <button type="button" className="cfg-link-btn" onClick={carregarModelos}>
                        Tentar de novo
                      </button>
                    </div>
                  )}
                  {empresa && !carregandoModelos && !erroModelos && !padraoBase && (
                    <div className="cfg-aviso cfg-aviso-alerta">
                      <span>
                        {opcoes.length
                          ? empresa.semMapeamento
                            ? "Esta empresa não tem padrão próprio e o modelo geral (fallback) não serve de base para ela (restrito a outra empresa ou de outro provedor): escolha explicitamente um modelo ativo."
                            : "O modelo do padrão da empresa não está entre as bases compatíveis: escolha explicitamente um modelo ativo."
                          : `Nenhum modelo ativo compatível (sem empresa ou desta empresa, provedor ${empresa.provedor_padrao || "?"}). Crie primeiro o padrão da empresa ou ajuste o prestador.`}
                      </span>
                    </div>
                  )}
                </div>
                <Campo label="Código do novo modelo" erro={errosCampo.codigo_sugerido} ajuda="Opcional (ex.: A-5). Vazio = próximo código livre da empresa.">
                  <input className="cfg-input cfg-mono" value={codigo} onChange={(ev) => setCodigo(ev.target.value.toUpperCase())} placeholder="automático" />
                </Campo>
              </div>
              <CampoMotivo valor={motivo} onChange={setMotivo} erro={errosCampo.motivo} />
            </>
          )}

          <div className="cfg-acoes cfg-wizard-rodape">
            {criado ? (
              <button type="button" className="cfg-btn cfg-btn-primario" onClick={() => setPasso(1)}>
                Parâmetros <FiArrowRight />
              </button>
            ) : (
              <button type="button" className="cfg-btn cfg-btn-primario" onClick={criar} disabled={criando}>
                {criando ? "Criando…" : (
                  <>
                    Criar rascunho e avançar <FiArrowRight />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Passo 2: parâmetros ---------------- */}
      {passo === 1 && (
        <div>
          {erroSchema && <div className="cfg-aviso cfg-aviso-perigo">{erroSchema}</div>}
          <Estado carregando={!rascunho}>
            {rascunho && (
              <>
                <h3>
                  Parâmetros — {rotuloVersao(rascunho)} {rascunho.nome ? `· ${rascunho.nome}` : ""} <Badge>rascunho</Badge>
                </h3>
                <small className="cfg-ajuda">
                  Comparado com o modelo base {base ? rotuloVersao(base) : "(carregando…)"}.
                </small>
                <EditorParametros
                  modelo={rascunho}
                  schema={schema}
                  editavel
                  referencia={base}
                  onSalvo={setRascunho}
                  onSujo={setSujo}
                />
                <div className="cfg-card cfg-wizard-dryrun">
                  <h3>
                    <FiPlay /> Dry-run — {rotuloVersao(rascunho)}
                  </h3>
                  {sujo && <div className="cfg-aviso cfg-aviso-alerta">Há alterações não salvas: o dry-run usa a versão salva no servidor.</div>}
                  <DryRunPainel key={rascunho.id} modelo={rascunho} fixtures={schema?.fixtures} />
                </div>
              </>
            )}
          </Estado>
          <div className="cfg-acoes cfg-wizard-rodape">
            <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setPasso(0)} disabled={sujo}>
              <FiArrowLeft /> Voltar
            </button>
            <button
              type="button"
              className="cfg-btn cfg-btn-primario"
              onClick={() => setPasso(2)}
              disabled={sujo}
              title={sujo ? "Salve ou descarte as alterações antes de avançar." : ""}
            >
              <FiSave /> Avançar para ativação <FiArrowRight />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Passo 3: ativar ---------------- */}
      {passo === 2 && rascunho && (
        <div>
          <table className="cfg-tabela cfg-wizard-resumo">
            <tbody>
              <tr>
                <th>Empresa</th>
                <td>
                  {empresa?.razao_social} <span className="cfg-mono">{formatarCnpj(empresa?.cnpj)}</span>
                </td>
              </tr>
              <tr>
                <th>Condição</th>
                <td>{rotuloCond}</td>
              </tr>
              <tr>
                <th>Camada</th>
                <td>
                  {criado?.regra ? (
                    <>
                      <strong>
                        <RotuloCamada camada={camadaCriada} />
                      </strong>{" "}
                      · <span className="cfg-mono">{criado.regra.condicoes || "—"}</span>{" "}
                      {ativado ? <Badge cor="verde">ativa</Badge> : <Badge cor="amarelo">inativa até ativar</Badge>}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
              <tr>
                <th>Versão</th>
                <td>
                  {rotuloVersao(rascunho)} {rascunho.nome ? `· ${rascunho.nome}` : ""}{" "}
                  {ativado ? <Badge cor="verde">ativa</Badge> : <Badge>rascunho</Badge>}
                </td>
              </tr>
              <tr>
                <th>Modelo base</th>
                <td>{base ? rotuloVersao(base) : "—"}</td>
              </tr>
            </tbody>
          </table>

          <SimularImpacto modeloId={rascunho.id} desabilitado={ativado} />

          <div className="cfg-acoes cfg-wizard-rodape">
            <button type="button" className="cfg-btn cfg-btn-neutro" onClick={() => setPasso(1)} disabled={ativado}>
              <FiArrowLeft /> Voltar
            </button>
            <button type="button" className="cfg-btn cfg-btn-neutro" onClick={irParaFicha}>
              {ativado ? "Abrir a ficha" : "Deixar como rascunho"}
            </button>
            {!ativado && (
              <button type="button" className="cfg-btn cfg-btn-sucesso" onClick={() => setAcao("ativar")}>
                <FiCheckCircle /> Ativar agora
              </button>
            )}
          </div>
        </div>
      )}

      <AcaoModeloModal
        acao={acao}
        modelo={rascunho}
        onFechar={() => setAcao(null)}
        onConcluido={() => {
          setAcao(null);
          setAtivado(true);
          ctx.recarregarMapa?.();
        }}
        onResumoFechado={irParaFicha}
      />
    </div>
  );
}
