// Ficha de um item do mapa (contrato §10.3): Padrão da empresa, Apólice da empresa ou Integração (externo/VR).
// Cabeçalho curto + selo, ações no topo (Editar · Publicar · Descartar · Testar · ⋯) e parâmetros por grupos.
// Fluxo (§10.5): editar → PATCH do rascunho → (testar) → publicar (ou descartar).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { FiCheckCircle, FiEdit3, FiMoreHorizontal, FiPlay, FiTrash2 } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Estado, MotivoModal } from "./componentes";
import EditorParametros from "./EditorParametros";
import HistoricoDrawer from "./HistoricoDrawer";
import PublicarModal from "./PublicarModal";
import TestarPainel from "./TestarPainel";
import { nomeCampo } from "./mapaDados";
import { comoLista, formatarData, mensagemErro, notificarEscrita } from "./utils";

/** Motivo gravado ao abrir o rascunho (editar não muda nada fiscal; o motivo real vai no salvar/publicar). */
const MOTIVO_EDITAR = "Abrir rascunho para edição";

// Schema dos modelos: igual para todas as fichas, carregado uma vez por sessão da página.
let schemaCache = null;

function Menu({ itens }) {
  const [aberto, setAberto] = useState(false);
  if (!itens.length) return null;
  return (
    <div className="cfg-menu">
      <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={() => setAberto((a) => !a)} aria-label="Mais ações">
        <FiMoreHorizontal />
      </button>
      {aberto && (
        <div className="cfg-menu-lista" onMouseLeave={() => setAberto(false)}>
          {itens.map((it) => (
            <button
              key={it.rotulo}
              type="button"
              onClick={() => {
                setAberto(false);
                it.onClick();
              }}
            >
              {it.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotasRecentes({ notas }) {
  if (!notas.length) return null;
  return (
    <details className="cfg-detalhe">
      <summary>Notas recentes</summary>
      <table className="cfg-tabela cfg-tabela-compacta">
        <tbody>
          {notas.map((n) => (
            <tr key={n.id}>
              <td className="cfg-mono">{n.id_integracao || n.id}</td>
              <td>{formatarData(n.data_criacao)}</td>
              <td>{n.status}</td>
              <td>{n.numero_nfse || "—"}</td>
              <td className="cfg-meta">{n.modelo_versao != null ? `v${n.modelo_versao}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** props: tipo "padrao" | "apolice" | "integracao". Parâmetros da rota: prestadorId, codigo, chave. */
export default function Ficha({ tipo }) {
  const { prestadorId, codigo, chave } = useParams();
  return <FichaConteudo key={`${tipo}:${prestadorId}:${codigo}:${chave}`} tipo={tipo} prestadorId={prestadorId} codigo={codigo} chave={chave} />;
}

function FichaConteudo({ tipo, prestadorId, codigo, chave }) {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const ctx = useOutletContext() || {};

  const [ficha, setFicha] = useState(null);
  const [semPadrao, setSemPadrao] = useState(false);
  const [schema, setSchema] = useState(schemaCache);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [foco, setFoco] = useState("rascunho"); // "rascunho" | "publicado"
  const [modelo, setModelo] = useState(null);
  const [sujo, setSujo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [modal, setModal] = useState(null); // "publicar" | "descartar" | "desativar" | "reativar" | "criarPadrao"
  const [testando, setTestando] = useState(false);
  const [historico, setHistorico] = useState(false);

  const buscar = useCallback(() => {
    if (tipo === "padrao") return configService.fichaPadrao(prestadorId);
    if (tipo === "apolice") return configService.fichaApolice(prestadorId, codigo);
    return configService.fichaIntegracao(chave);
  }, [tipo, prestadorId, codigo, chave]);

  const carregar = useCallback(
    async (focoPreferido = null) => {
      setErro("");
      try {
        const [f, s] = await Promise.all([buscar(), schemaCache ? Promise.resolve(schemaCache) : configService.schemaModelos()]);
        schemaCache = s;
        setSchema(s);
        setFicha(f);
        setSemPadrao(false);
        setFoco(focoPreferido || (f.rascunho ? "rascunho" : "publicado"));
      } catch (e) {
        if (tipo === "padrao" && e?.response?.status === 404) {
          setSemPadrao(true);
          setFicha(null);
        } else {
          setErro(mensagemErro(e, "Falha ao carregar."));
        }
      } finally {
        setCarregando(false);
      }
    },
    [buscar, tipo]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const rascunho = ficha?.rascunho || null;
  // Padrão desligado pode vir sem `modelo_ativo`: o modelo dos grupos é a versão a editar.
  const publicado = ficha?.modelo_ativo || (!rascunho ? ficha?.modelo_dos_grupos || null : null);
  const emFoco = foco === "rascunho" && rascunho ? rascunho : publicado || rascunho;
  const editandoRascunho = !!rascunho && emFoco?.id === rascunho.id;

  // Detalhe completo da versão em foco (GET modelos/{id}/) para o formulário.
  useEffect(() => {
    if (!emFoco?.id) {
      setModelo(null);
      return undefined;
    }
    let cancelado = false;
    configService
      .obterModelo(emFoco.id)
      .then((m) => !cancelado && setModelo(m))
      .catch((e) => !cancelado && enqueueSnackbar(mensagemErro(e, "Falha ao carregar o modelo."), { variant: "error" }));
    return () => {
      cancelado = true;
    };
  }, [emFoco?.id, enqueueSnackbar]);

  const valoresFicha = useMemo(() => {
    const v = {};
    if (ficha?.modelo_dos_grupos?.id === emFoco?.id) {
      (ficha?.grupos || []).forEach((g) => (g.campos || []).forEach((c) => (v[nomeCampo(c)] = c.valor)));
    }
    return v;
  }, [ficha, emFoco?.id]);

  const recarregarTudo = async (focoPreferido = null) => {
    await carregar(focoPreferido);
    ctx.recarregarMapa?.();
  };

  const editar = async () => {
    setOcupado(true);
    try {
      await configService.editarModelo(publicado.id, MOTIVO_EDITAR);
      await recarregarTudo("rascunho");
    } catch (e) {
      enqueueSnackbar(mensagemErro(e, "Falha ao abrir o rascunho."), { variant: "error" });
    } finally {
      setOcupado(false);
    }
  };

  const aoPublicar = async (resp) => {
    setModal(null);
    const mudam = resp?.simulacao?.mudariam;
    notificarEscrita(enqueueSnackbar, resp, mudam ? `Publicado · ${mudam} nota(s) recente(s) passam a usar este modelo` : "Publicado");
    await recarregarTudo("publicado");
  };

  const descartar = async (motivo) => {
    const apoliceNova = tipo === "apolice" && !publicado;
    const resp = await configService.descartarModelo(rascunho.id, motivo);
    setModal(null);
    notificarEscrita(enqueueSnackbar, resp, "Rascunho descartado");
    if (apoliceNova) {
      ctx.recarregarMapa?.();
      navigate("/configuracao/mapa");
    } else {
      await recarregarTudo("publicado");
    }
  };

  const desativar = async (motivo, confirmar) => {
    const resp = await configService.desativarApolice(prestadorId, codigo, motivo, confirmar);
    setModal(null);
    notificarEscrita(enqueueSnackbar, resp, "Apólice desativada");
    await recarregarTudo();
  };

  const reativar = async (motivo) => {
    const resp = await configService.reativarApolice(prestadorId, codigo, motivo);
    setModal(null);
    notificarEscrita(enqueueSnackbar, resp, "Apólice reativada");
    await recarregarTudo();
  };

  const criarPadrao = async (motivo) => {
    const resp = await configService.criarPadrao(prestadorId, motivo);
    setModal(null);
    notificarEscrita(enqueueSnackbar, resp, "Padrão criado");
    setCarregando(true);
    await recarregarTudo("rascunho");
  };

  // Cabeçalho
  const razao = ficha?.prestador?.razao_social || ctx.empresa?.razao_social || "";
  const sufixo = tipo === "padrao" ? "Padrão" : tipo === "apolice" ? `Apólice ${ficha?.apolice || codigo}` : "";
  const titulo = tipo === "integracao" ? ficha?.titulo || chave : [razao, sufixo].filter(Boolean).join(" · ");
  const desligado = tipo === "apolice" ? ficha?.ativa === false : publicado && publicado.ativo === false;
  const selo = editandoRascunho ? (
    <Badge cor="amarelo">Rascunho</Badge>
  ) : desligado ? (
    <Badge>{tipo === "apolice" ? "Desativada" : "Desligado"}</Badge>
  ) : (
    <Badge cor="verde">Publicado</Badge>
  );

  if (semPadrao) {
    return (
      <div className="cfg-card">
        <div className="cfg-ficha-cab">
          <h2>{[razao, "Padrão"].filter(Boolean).join(" · ")}</h2>
          <button type="button" className="cfg-btn cfg-btn-primario cfg-btn-sm" onClick={() => setModal("criarPadrao")}>
            Criar padrão
          </button>
        </div>
        <MotivoModal aberto={modal === "criarPadrao"} titulo="Criar padrão" botao="Criar" onFechar={() => setModal(null)} onConfirmar={criarPadrao} />
      </div>
    );
  }

  const menu = [];
  if (tipo === "apolice" && ficha) {
    if (ficha.ativa !== false) menu.push({ rotulo: "Desativar apólice", onClick: () => setModal("desativar") });
    else if (publicado?.ativo) menu.push({ rotulo: "Reativar apólice", onClick: () => setModal("reativar") });
  }

  return (
    <Estado carregando={carregando} erro={erro}>
      {ficha && (
        <div className="cfg-card">
          <div className="cfg-ficha-cab">
            <div className="cfg-ficha-titulo">
              <h2>{titulo}</h2>
              {selo}
              {rascunho && publicado && (
                <button type="button" className="cfg-link-btn cfg-meta" onClick={() => setFoco(editandoRascunho ? "publicado" : "rascunho")} disabled={sujo}>
                  {editandoRascunho ? "ver publicado" : "ver rascunho"}
                </button>
              )}
            </div>
            <div className="cfg-acoes">
              {!rascunho && publicado && (
                <button type="button" className="cfg-btn cfg-btn-primario cfg-btn-sm" onClick={editar} disabled={ocupado}>
                  <FiEdit3 /> {ocupado ? "Abrindo…" : "Editar"}
                </button>
              )}
              {rascunho && (
                <>
                  <button
                    type="button"
                    className="cfg-btn cfg-btn-sucesso cfg-btn-sm"
                    onClick={() => setModal("publicar")}
                    disabled={sujo}
                    title={sujo ? "Salve antes de publicar" : ""}
                  >
                    <FiCheckCircle /> Publicar
                  </button>
                  <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={() => setModal("descartar")} disabled={sujo}>
                    <FiTrash2 /> Descartar
                  </button>
                </>
              )}
              {emFoco && (
                <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={() => setTestando((t) => !t)}>
                  <FiPlay /> Testar
                </button>
              )}
              <Menu itens={menu} />
            </div>
          </div>
          <div className="cfg-ficha-meta">
            {emFoco && (
              <span className="cfg-meta">
                {emFoco.codigo} v{emFoco.versao}
              </span>
            )}
            <button type="button" className="cfg-link-btn cfg-meta" onClick={() => setHistorico(true)}>
              Histórico
            </button>
          </div>

          {ficha.aviso && <div className="cfg-aviso cfg-aviso-alerta">{ficha.aviso}</div>}

          {testando && emFoco && <TestarPainel modelo={emFoco} exemplo={ficha.exemplo_payload} onFechar={() => setTestando(false)} />}

          {modelo && String(modelo.id) === String(emFoco?.id) ? (
            <EditorParametros
              modelo={modelo}
              schema={schema}
              prestadores={[]}
              valoresFicha={valoresFicha}
              editavel={editandoRascunho}
              onSalvo={(m) => setModelo(m)}
              onSujo={setSujo}
            />
          ) : (
            emFoco && <div className="cfg-estado">Carregando…</div>
          )}

          <NotasRecentes notas={comoLista(ficha.ultimas_notas)} />
        </div>
      )}

      <PublicarModal modelo={modal === "publicar" ? rascunho : null} onFechar={() => setModal(null)} onPublicado={aoPublicar} />
      <MotivoModal aberto={modal === "descartar"} titulo="Descartar rascunho" botao="Descartar" perigo onFechar={() => setModal(null)} onConfirmar={descartar} />
      <MotivoModal
        aberto={modal === "desativar"}
        titulo="Desativar apólice"
        botao="Desativar"
        perigo
        confirmaveis={["confirmar_desativacao"]}
        onFechar={() => setModal(null)} onConfirmar={desativar} />
      <MotivoModal aberto={modal === "reativar"} titulo="Reativar apólice" botao="Reativar" onFechar={() => setModal(null)} onConfirmar={reativar} />
      <HistoricoDrawer
        aberto={historico}
        onFechar={() => setHistorico(false)}
        alvos={[
          { entidade: "modelo", id: publicado?.id ?? null },
          { entidade: "modelo", id: rascunho?.id ?? null },
        ]}
      />
    </Estado>
  );
}
