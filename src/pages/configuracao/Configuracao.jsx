// Página Configuração: gestão dos modelos de emissão NFS-e.
// Primeira aba (rota padrão): Mapa de emissão (empresa × condição → modelo), o ÚNICO lugar de configuração de modelo
// (decisão do dono, 10/11/2026: a antiga aba "Modelos" foi unificada na ficha do mapa; /configuracao/modelos/* redireciona).
// Prestadores e Auditoria seguem como abas; Regras (consulta e ajuste fino por prioridade) fica no grupo "Avançado".
// Acesso controlado pelo backend (GET /api/nfse/config/me/ → admin_config).
import { NavLink, Outlet } from "react-router-dom";
import { FiMap, FiBriefcase, FiGitBranch, FiList } from "react-icons/fi";
import "../../styles/configuracao.css";

const ABAS = [
  { to: "mapa", rotulo: "Mapa de emissão", icone: FiMap },
  { to: "prestadores", rotulo: "Prestadores", icone: FiBriefcase },
  { to: "auditoria", rotulo: "Auditoria", icone: FiList },
];

const ABAS_AVANCADO = [
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
          Tudo se configura pelo Mapa de emissão: “+ Nova configuração” (condição → parâmetros → ativar) e, na ficha, clonar a
          versão ativa, editar o rascunho, validar no dry-run e ativar.
        </p>
      </div>

      <nav className="cfg-abas">
        {ABAS.map((aba) => (
          <Aba key={aba.to} aba={aba} />
        ))}
        <span className="cfg-abas-grupo" title="Consulta e ajuste fino das regras por prioridade; o caminho normal é o Mapa de emissão">
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
