// Página Configuração: gestão dos modelos de emissão NFS-e.
// Primeira aba (rota padrão): Mapa de emissão (empresa × condição → modelo). Prestadores e Auditoria seguem como abas;
// Modelos e Regras (visão técnica, por código/versão e por prioridade) ficam no grupo "Avançado".
// Acesso controlado pelo backend (GET /api/nfse/config/me/ → admin_config).
import { NavLink, Outlet } from "react-router-dom";
import { FiMap, FiBriefcase, FiLayers, FiGitBranch, FiList } from "react-icons/fi";
import "../../styles/configuracao.css";

const ABAS = [
  { to: "mapa", rotulo: "Mapa de emissão", icone: FiMap },
  { to: "prestadores", rotulo: "Prestadores", icone: FiBriefcase },
  { to: "auditoria", rotulo: "Auditoria", icone: FiList },
];

const ABAS_AVANCADO = [
  { to: "modelos", rotulo: "Modelos", icone: FiLayers },
  { to: "regras", rotulo: "Regras", icone: FiGitBranch },
];

function Aba({ aba }) {
  const Icone = aba.icone;
  return (
    <NavLink to={aba.to} className={({ isActive }) => `cfg-aba ${isActive ? "active" : ""}`}>
      <Icone /> {aba.rotulo}
    </NavLink>
  );
}

export default function Configuracao() {
  return (
    <div className="cfg-container">
      <div className="cfg-header">
        <h1 className="cfg-titulo">Configuração de emissão</h1>
        <p className="cfg-subtitulo">
          Qual modelo cada empresa usa (padrão e por apólice/canal) e todos os parâmetros do JSON enviado à Focus.
          Alterações em versão ativa exigem clonar um rascunho, validar no dry-run e ativar.
        </p>
      </div>

      <nav className="cfg-abas">
        {ABAS.map((aba) => (
          <Aba key={aba.to} aba={aba} />
        ))}
        <span className="cfg-abas-grupo" title="Visão técnica: versões por código e regras por prioridade">
          Avançado
        </span>
        {ABAS_AVANCADO.map((aba) => (
          <Aba key={aba.to} aba={aba} />
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
