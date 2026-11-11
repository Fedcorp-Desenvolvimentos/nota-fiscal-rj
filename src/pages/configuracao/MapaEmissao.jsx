// Aba Mapa: faturas por empresa — modelo Padrão e modelo por Apólice (apólice vence o padrão). Contrato §10.
// Esquerda: busca + empresas; ao expandir, "Padrão" e uma linha por apólice. Direita: ficha (rota filha).
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useMatch, useNavigate, useOutlet } from "react-router-dom";
import { FiChevronDown, FiChevronRight, FiSearch } from "react-icons/fi";
import { useSnackbar } from "notistack";
import { configService } from "../../services/config";
import { Estado, Ponto } from "./componentes";
import NovaApoliceModal from "./NovaApoliceModal";
import { estadoDe, normalizarMapa } from "./mapaDados";
import { formatarCnpj, mensagemErro } from "./utils";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Empresa({ empresa, aberta, onAlternar, onNovaApolice }) {
  const base = `/configuracao/mapa/${empresa.id}`;
  const cls = ({ isActive }) => `cfg-mapa-linha ${isActive ? "selecionada" : ""}`;
  return (
    <div className="cfg-mapa-empresa">
      <button type="button" className="cfg-mapa-empresa-cab" onClick={onAlternar} aria-expanded={aberta}>
        {aberta ? <FiChevronDown /> : <FiChevronRight />}
        <span className="cfg-mapa-empresa-nome">
          <strong title={empresa.razao_social}>{empresa.razao_social}</strong>
          <small>{formatarCnpj(empresa.cnpj)}</small>
        </span>
      </button>
      {aberta && (
        <div className="cfg-mapa-filhos">
          {empresa.padrao ? (
            <NavLink to={`${base}/padrao`} className={cls}>
              <Ponto estado={estadoDe(empresa.padrao)} />
              Padrão
            </NavLink>
          ) : (
            <NavLink to={`${base}/padrao`} className={(a) => `${cls(a)} cfg-mapa-linha-discreta`}>
              Padrão — criar
            </NavLink>
          )}
          {empresa.apolices.map((a) => (
            <NavLink
              key={a.apolice}
              to={`${base}/apolice/${encodeURIComponent(a.apolice)}`}
              className={(x) => `${cls(x)} ${a.ativa === false ? "cfg-mapa-linha-inativa" : ""}`}
            >
              <Ponto estado={estadoDe(a)} />
              <span className="cfg-mono">{a.apolice}</span>
            </NavLink>
          ))}
          <button type="button" className="cfg-link-btn cfg-mapa-nova" onClick={onNovaApolice}>
            + Nova apólice
          </button>
        </div>
      )}
    </div>
  );
}

export default function MapaEmissao() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const match = useMatch("/configuracao/mapa/:prestadorId/*");
  const prestadorAtual = match?.params?.prestadorId;

  const [mapa, setMapa] = useState({ empresas: [], integracoes: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState(() => new Set());
  const [novaApolice, setNovaApolice] = useState(null);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      setMapa(normalizarMapa(await configService.listarMapa()));
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar o mapa."));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // A empresa da rota fica sempre expandida.
  useEffect(() => {
    if (prestadorAtual) setAbertas((s) => (s.has(String(prestadorAtual)) ? s : new Set(s).add(String(prestadorAtual))));
  }, [prestadorAtual]);

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    const qDig = busca.replace(/\D/g, "");
    if (!q) return mapa.empresas;
    return mapa.empresas.filter(
      (e) =>
        semAcento(e.razao_social).includes(q) ||
        (qDig && e.cnpj.includes(qDig)) ||
        e.apolices.some((a) => semAcento(a.apolice).includes(q))
    );
  }, [mapa.empresas, busca]);

  const alternar = (id) =>
    setAbertas((s) => {
      const n = new Set(s);
      const k = String(id);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const empresaAtual = mapa.empresas.find((e) => String(e.id) === String(prestadorAtual)) || null;
  const outlet = useOutlet({ recarregarMapa: carregar, empresa: empresaAtual, abrirNovaApolice: setNovaApolice });

  return (
    <div className="cfg-mapa">
      <aside className="cfg-mapa-arvore">
        <div className="cfg-mapa-busca">
          <FiSearch />
          <input className="cfg-input" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Estado carregando={carregando} erro={erro} vazio={!filtradas.length} textoVazio="Nenhuma empresa.">
          {filtradas.map((e) => (
            <Empresa
              key={e.id}
              empresa={e}
              aberta={abertas.has(String(e.id)) || !!busca.trim()}
              onAlternar={() => alternar(e.id)}
              onNovaApolice={() => setNovaApolice(e)}
            />
          ))}
        </Estado>
      </aside>

      <section className="cfg-mapa-ficha">
        {outlet || (
          <div className="cfg-estado">Escolha uma empresa.</div>
        )}
      </section>

      <NovaApoliceModal
        empresa={novaApolice}
        onFechar={() => setNovaApolice(null)}
        onCriada={(codigo) => {
          const id = novaApolice.id;
          setNovaApolice(null);
          enqueueSnackbar("Apólice criada.", { variant: "success" });
          carregar();
          navigate(`/configuracao/mapa/${id}/apolice/${encodeURIComponent(codigo)}`);
        }}
      />
    </div>
  );
}
