// Aba Auditoria: histórico paginado de alterações (API e Django Admin), com antes/depois em JSON.
import { Fragment, useCallback, useEffect, useState } from "react";
import { FiChevronDown, FiChevronRight, FiRefreshCw } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Campo, DiffLadoALado, Estado, JsonView } from "./componentes";
import { comoLista, formatarData, mensagemErro } from "./utils";

const PAGE_SIZE = 50;
const COR_ACAO = { criar: "verde", clonar: "azul", alterar: "amarelo", ativar: "verde", desativar: "neutro", excluir: "vermelho" };
const FILTROS_VAZIOS = { entidade: "", entidade_id: "", acao: "", usuario: "" };

export default function Auditoria() {
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [modoDetalhe, setModoDetalhe] = useState("diff");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await configService.listarAuditoria({ ...aplicados, page: pagina, page_size: PAGE_SIZE });
      setItens(comoLista(data));
      setTotal(data?.count ?? comoLista(data).length);
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar a auditoria."));
    } finally {
      setCarregando(false);
    }
  }, [aplicados, pagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const aplicar = (e) => {
    e?.preventDefault();
    setPagina(1);
    setAplicados({ ...filtros });
  };

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="cfg-card">
      <div className="cfg-card-titulo">
        <h2>Auditoria</h2>
        <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={carregar} disabled={carregando}>
          <FiRefreshCw /> Atualizar
        </button>
      </div>

      <form className="cfg-filtros" onSubmit={aplicar}>
        <Campo label="Entidade">
          <select className="cfg-input" value={filtros.entidade} onChange={(e) => setFiltros((f) => ({ ...f, entidade: e.target.value }))}>
            <option value="">Todas</option>
            <option value="prestador">Prestador</option>
            <option value="modelo">Modelo</option>
            <option value="regra">Regra</option>
          </select>
        </Campo>
        <Campo label="ID da entidade">
          <input className="cfg-input" inputMode="numeric" value={filtros.entidade_id} onChange={(e) => setFiltros((f) => ({ ...f, entidade_id: e.target.value.replace(/\D/g, "") }))} />
        </Campo>
        <Campo label="Ação">
          <select className="cfg-input" value={filtros.acao} onChange={(e) => setFiltros((f) => ({ ...f, acao: e.target.value }))}>
            <option value="">Todas</option>
            {Object.keys(COR_ACAO).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Usuário (e-mail)">
          <input className="cfg-input" value={filtros.usuario} onChange={(e) => setFiltros((f) => ({ ...f, usuario: e.target.value }))} />
        </Campo>
        <button type="submit" className="cfg-btn cfg-btn-primario" style={{ marginBottom: 4 }}>
          Filtrar
        </button>
        <button
          type="button"
          className="cfg-btn cfg-btn-neutro"
          style={{ marginBottom: 4 }}
          onClick={() => {
            setFiltros(FILTROS_VAZIOS);
            setAplicados(FILTROS_VAZIOS);
            setPagina(1);
          }}
        >
          Limpar
        </button>
      </form>

      <Estado carregando={carregando} erro={erro} vazio={!itens.length} textoVazio="Nenhum registro de auditoria.">
        <div className="cfg-tabela-wrap">
          <table className="cfg-tabela">
            <thead>
              <tr>
                <th />
                <th>Quando</th>
                <th>Quem</th>
                <th>Entidade</th>
                <th>Ação</th>
                <th>Origem</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => {
                const aberto = expandido === it.id;
                return (
                  <Fragment key={it.id}>
                    <tr onClick={() => setExpandido(aberto ? null : it.id)} style={{ cursor: "pointer" }}>
                      <td>{aberto ? <FiChevronDown /> : <FiChevronRight />}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatarData(it.criado_em)}</td>
                      <td>{it.usuario_email || (it.usuario ? `#${it.usuario}` : "—")}</td>
                      <td>
                        {it.entidade} <span className="cfg-mono">#{it.entidade_id}</span>
                      </td>
                      <td>
                        <Badge cor={COR_ACAO[it.acao] || "neutro"}>{it.acao}</Badge>
                      </td>
                      <td>{it.origem || "—"}</td>
                      <td>{it.motivo || "—"}</td>
                    </tr>
                    {aberto && (
                      <tr className="cfg-linha-expandida">
                        <td colSpan={7}>
                          <div className="cfg-acoes" style={{ marginBottom: 8 }}>
                            <label className="cfg-check">
                              <input type="radio" checked={modoDetalhe === "diff"} onChange={() => setModoDetalhe("diff")} /> Diferenças
                            </label>
                            <label className="cfg-check">
                              <input type="radio" checked={modoDetalhe === "json"} onChange={() => setModoDetalhe("json")} /> JSON completo
                            </label>
                          </div>
                          {modoDetalhe === "diff" ? (
                            <DiffLadoALado a={it.antes || {}} b={it.depois || {}} rotuloA="Antes" rotuloB="Depois" />
                          ) : (
                            <div className="cfg-lado-a-lado">
                              <div>
                                <small className="cfg-ajuda">Antes</small>
                                <JsonView valor={it.antes ?? null} altura={360} />
                              </div>
                              <div>
                                <small className="cfg-ajuda">Depois</small>
                                <JsonView valor={it.depois ?? null} altura={360} />
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Estado>

      <div className="cfg-paginacao">
        <span>
          {total} registro(s) · página {pagina} de {totalPaginas}
        </span>
        <div className="cfg-acoes">
          <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" disabled={pagina <= 1 || carregando} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" disabled={pagina >= totalPaginas || carregando} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
