// Página Configuração: gestão dos modelos de emissão NFS-e.
// Primeira aba (rota padrão): Mapa de emissão (empresa × condição → modelo), o ÚNICO lugar de configuração de modelo
// (decisão do dono, 10/11/2026: a antiga aba "Modelos" foi unificada na ficha do mapa; /configuracao/modelos/* redireciona).
// Prestadores e Auditoria seguem como abas. A aba "Regras" (e o grupo "Avançado") saiu em 10/11/2026: a prioridade
// numérica deixou de ser exposta; a camada da regra (Canal → Apólice → Padrão da empresa → Fallback geral) é definida
// pelo Mapa na criação. /configuracao/regras redireciona para o mapa.
// Acesso controlado pelo backend (GET /api/nfse/config/me/ → admin_config).
import { NavLink, Outlet } from "react-router-dom";
import { FiMap, FiBriefcase, FiList } from "react-icons/fi";
import "../../styles/configuracao.css";

const ABAS = [
  { to: "mapa", rotulo: "Mapa de emissão", icone: FiMap },
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
      <div className="cfg-header">
        <h1 className="cfg-titulo">Configuração de emissão</h1>
        <p className="cfg-subtitulo">
          Qual modelo cada empresa usa (padrão e por apólice/canal) e todos os parâmetros do JSON enviado à Focus.
          Tudo se configura pelo Mapa de emissão: “+ Nova configuração” (condição → parâmetros → ativar) e, na ficha, clonar a
          versão ativa, editar o rascunho, validar no dry-run e ativar. A ordem é fixa: canal (VR/externo) → apólice → padrão
          da empresa → fallback geral.
        </p>
      </div>

      <nav className="cfg-abas">
        {ABAS.map((aba) => (
          <Aba key={aba.to} aba={aba} />
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
