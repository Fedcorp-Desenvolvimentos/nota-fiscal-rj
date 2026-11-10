// "Histórico" da ficha: auditoria (§6) filtrada pela versão de modelo em foco e pela regra da combinação.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiRefreshCw } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Estado } from "./componentes";
import { comoLista, formatarData, mensagemErro } from "./utils";

const COR_ACAO = { criar: "azul", clonar: "azul", alterar: "amarelo", ativar: "verde", desativar: "neutro", excluir: "vermelho" };

/** props: alvos [{entidade: "modelo"|"regra", id, rotulo}] — ids nulos são ignorados. */
export default function HistoricoFicha({ alvos }) {
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const chave = JSON.stringify((alvos || []).filter((a) => a.id != null).map((a) => [a.entidade, a.id]));

  const carregar = useCallback(async () => {
    const lista = JSON.parse(chave);
    if (!lista.length) {
      setLinhas([]);
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const respostas = await Promise.all(
        lista.map(([entidade, id]) => configService.listarAuditoria({ entidade, entidade_id: id, page_size: 50 }))
      );
      const todas = respostas.flatMap(comoLista);
      const unicas = Array.from(new Map(todas.map((l) => [l.id, l])).values());
      unicas.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
      setLinhas(unicas);
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar o histórico."));
    } finally {
      setCarregando(false);
    }
  }, [chave]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="cfg-card">
      <div className="cfg-card-titulo">
        <h3>Histórico</h3>
        <div className="cfg-acoes">
          <small className="cfg-ajuda">
            {(alvos || [])
              .filter((a) => a.id != null)
              .map((a) => a.rotulo)
              .join(" + ")}
          </small>
          <button type="button" className="cfg-icon-btn" onClick={carregar} title="Recarregar histórico" aria-label="Recarregar histórico">
            <FiRefreshCw />
          </button>
          <Link to="/configuracao/auditoria" className="cfg-btn cfg-btn-neutro cfg-btn-sm">
            Auditoria completa
          </Link>
        </div>
      </div>
      <Estado carregando={carregando} erro={erro} vazio={!linhas.length} textoVazio="Nenhum registro de auditoria para esta versão/regra.">
        <div className="cfg-tabela-wrap">
          <table className="cfg-tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Usuário</th>
                <th>Entidade</th>
                <th>Ação</th>
                <th>Origem</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td>{formatarData(l.criado_em)}</td>
                  <td>{l.usuario_email || l.usuario || "—"}</td>
                  <td className="cfg-mono">
                    {l.entidade} #{l.entidade_id}
                  </td>
                  <td>
                    <Badge cor={COR_ACAO[l.acao] || "neutro"}>{l.acao}</Badge>
                  </td>
                  <td>{l.origem || "—"}</td>
                  <td>{l.motivo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
    </div>
  );
}
