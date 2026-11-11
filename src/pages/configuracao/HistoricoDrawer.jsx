// Histórico da ficha (drawer): auditoria (§6) dos modelos/regras da combinação.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { configService } from "../../services/config";
import { Drawer, Estado } from "./componentes";
import { comoLista, formatarData, mensagemErro } from "./utils";

/** props: aberto, onFechar, alvos [{entidade: "modelo"|"regra", id}] (ids nulos ignorados). */
export default function HistoricoDrawer({ aberto, onFechar, alvos }) {
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const chave = JSON.stringify((alvos || []).filter((a) => a.id != null).map((a) => [a.entidade, a.id]));

  useEffect(() => {
    if (!aberto) return undefined;
    const lista = JSON.parse(chave);
    let cancelado = false;
    setCarregando(true);
    setErro("");
    Promise.all(lista.map(([entidade, id]) => configService.listarAuditoria({ entidade, entidade_id: id, page_size: 50 })))
      .then((respostas) => {
        if (cancelado) return;
        const todas = respostas.flatMap(comoLista);
        const unicas = Array.from(new Map(todas.map((l) => [l.id, l])).values());
        unicas.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
        setLinhas(unicas);
      })
      .catch((e) => !cancelado && setErro(mensagemErro(e, "Falha ao carregar.")))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [aberto, chave]);

  return (
    <Drawer titulo="Histórico" aberto={aberto} onFechar={onFechar}>
      <Estado carregando={carregando} erro={erro} vazio={!linhas.length} textoVazio="Nada registrado.">
        <ul className="cfg-historico">
          {linhas.map((l) => (
            <li key={l.id}>
              <div>
                <strong>{l.acao}</strong> <span className="cfg-meta">{l.entidade} #{l.entidade_id}</span>
              </div>
              {l.motivo && <div>{l.motivo}</div>}
              <small className="cfg-meta">
                {formatarData(l.criado_em)} · {l.usuario_email || l.usuario || "—"}
              </small>
            </li>
          ))}
        </ul>
      </Estado>
      <Link to="/configuracao/auditoria" className="cfg-link">
        Auditoria completa
      </Link>
    </Drawer>
  );
}
