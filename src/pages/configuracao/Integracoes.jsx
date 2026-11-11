// Aba Integrações: Emissor externo e VR (modelo fixo; só parâmetros editáveis). Contrato §10.2/§10.3.
import { useCallback, useEffect, useState } from "react";
import { NavLink, useOutlet } from "react-router-dom";
import { configService } from "../../services/config";
import { Estado, Ponto } from "./componentes";
import { estadoDe, normalizarMapa } from "./mapaDados";
import { mensagemErro } from "./utils";

export default function Integracoes() {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      setItens(normalizarMapa(await configService.listarMapa()).integracoes);
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar."));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const outlet = useOutlet({ recarregarMapa: carregar });

  return (
    <div>
      <Estado carregando={carregando} erro={erro} vazio={!itens.length} textoVazio="Nenhuma integração.">
        <div className="cfg-integracoes">
          {itens.map((i) => (
            <NavLink key={i.chave} to={`/configuracao/integracoes/${i.chave}`} className={({ isActive }) => `cfg-integracao ${isActive ? "selecionada" : ""}`}>
              <Ponto estado={estadoDe(i)} />
              <strong>{i.rotulo}</strong>
              {i.modelo && (
                <small className="cfg-meta">
                  {i.modelo.codigo} v{i.modelo.versao}
                </small>
              )}
            </NavLink>
          ))}
        </div>
      </Estado>
      {outlet}
    </div>
  );
}
