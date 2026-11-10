// Página Configuração: gestão dos modelos de emissão NFS-e (prestadores, modelos, regras, auditoria).
// Acesso controlado pelo backend (GET /api/nfse/config/me/ → admin_config).
import { NavLink, Outlet } from "react-router-dom";
import { FiBriefcase, FiLayers, FiGitBranch, FiList } from "react-icons/fi";
import "../../styles/configuracao.css";

const ABAS = [
  { to: "prestadores", rotulo: "Prestadores", icone: FiBriefcase },
  { to: "modelos", rotulo: "Modelos", icone: FiLayers },
  { to: "regras", rotulo: "Regras", icone: FiGitBranch },
  { to: "auditoria", rotulo: "Auditoria", icone: FiList },
];

export default function Configuracao() {
  return (
    <div className="cfg-container">
      <div className="cfg-header">
        <h1 className="cfg-titulo">Configuração de emissão</h1>
        <p className="cfg-subtitulo">
          Prestadores, modelos de emissão (versões), regras de resolução e auditoria. Alterações em modelo ativo
          exigem clonar uma nova versão.
        </p>
      </div>

      <nav className="cfg-abas">
        {ABAS.map((aba) => {
          const Icone = aba.icone;
          return (
            <NavLink key={aba.to} to={aba.to} className={({ isActive }) => `cfg-aba ${isActive ? "active" : ""}`}>
              <Icone /> {aba.rotulo}
            </NavLink>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
