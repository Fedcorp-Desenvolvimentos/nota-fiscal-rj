// Aba Modelos: cards por código (A-1…E-2) com a versão ativa e as versões inativas (rascunhos/arquivadas).
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiRefreshCw, FiChevronRight } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Estado } from "./componentes";
import { agruparModelos, rotuloPrestador } from "./modelosDados";
import { formatarData, mensagemErro } from "./utils";

export default function Modelos() {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setGrupos(agruparModelos(await configService.listarModelos()));
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar modelos."));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const termo = filtro.trim().toLowerCase();
  const exibidos = termo
    ? grupos.filter((g) => `${g.codigo} ${g.nome} ${g.versoes.map((v) => v.slug).join(" ")}`.toLowerCase().includes(termo))
    : grupos;

  return (
    <div className="cfg-card">
      <div className="cfg-card-titulo">
        <h2>Modelos de emissão</h2>
        <div className="cfg-acoes">
          <input
            className="cfg-input"
            style={{ width: 220 }}
            placeholder="Filtrar (código, nome, slug)"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={carregar} disabled={carregando}>
            <FiRefreshCw /> Atualizar
          </button>
        </div>
      </div>

      <div className="cfg-aviso">
        Versão ativa emite de verdade e não pode ser editada (nem pelo Django Admin). Fluxo: abrir a versão ativa → “Clonar
        como nova versão” → editar o clone e as regras dele → dry-run → Simular (aba Regras, tratando o clone como ativo)
        → Ativar. Rollback: ativar de novo a versão anterior.
      </div>

      <Estado carregando={carregando} erro={erro} vazio={!exibidos.length} textoVazio="Nenhum modelo encontrado.">
        <div className="cfg-cards">
          {exibidos.map((g) => (
            <div key={g.codigo} className="cfg-modelo-card">
              <div>
                <div className="cfg-modelo-codigo">{g.codigo}</div>
                <div className="cfg-modelo-nome">{g.nome}</div>
              </div>
              <div>
                {g.ativa ? <Badge cor="verde">ativa v{g.ativa.versao}</Badge> : <Badge cor="amarelo">sem versão ativa</Badge>}
                {g.provedor && <Badge cor={g.provedor === "municipal" ? "roxo" : "azul"}>{g.provedor}</Badge>}
                {g.slug && <div className="cfg-modelo-nome cfg-mono">{g.slug}</div>}
                {g.prestador && <div className="cfg-modelo-nome">{rotuloPrestador(g.prestador)}</div>}
              </div>
              <div className="cfg-versoes">
                {g.versoes.map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    className={`cfg-versao ${v.ativo ? "cfg-versao-ativa" : ""}`}
                    onClick={() => navigate(`/configuracao/modelos/${v.id}`)}
                  >
                    <span>
                      <strong>v{v.versao}</strong> {v.nome && v.nome !== g.nome && <span>{v.nome}</span>}
                      {v.atualizado_em && <small className="cfg-ajuda"> · {formatarData(v.atualizado_em)}</small>}
                    </span>
                    <span>
                      {v.ativo ? <Badge cor="verde">ativa</Badge> : <Badge cor="neutro">inativa</Badge>}
                      <FiChevronRight />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Estado>
    </div>
  );
}
