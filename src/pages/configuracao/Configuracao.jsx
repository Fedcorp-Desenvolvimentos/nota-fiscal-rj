// Página Configuração: modelos de emissão NFS-e (backend /api/nfse/config/, contrato §10 "Mapa simplificado v2").
// Abas: Mapa (faturas: Padrão da empresa + Apólice), Integrações (externo, VR), Prestadores, Auditoria.
// Acesso decidido pelo backend (GET /api/nfse/config/me/ → admin_config).
import { NavLink, Outlet } from "react-router-dom";
import { FiMap, FiBriefcase, FiList, FiLink } from "react-icons/fi";
import "../../styles/configuracao.css";

const ABAS = [
  { to: "mapa", rotulo: "Mapa", icone: FiMap },
  { to: "integracoes", rotulo: "Integrações", icone: FiLink },
  { to: "prestadores", rotulo: "Prestadores", icone: FiBriefcase },
  { to: "auditoria", rotulo: "Auditoria", icone: FiList },
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
      <h1 className="cfg-titulo">Configuração</h1>
      <nav className="cfg-abas">
        {ABAS.map((aba) => (
          <Aba key={aba.to} aba={aba} />
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
