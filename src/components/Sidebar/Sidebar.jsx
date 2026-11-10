import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { FiChevronDown, FiFileText, FiSearch, FiClock, FiHome, FiX, FiSettings } from "react-icons/fi";
import { BiDoorOpen } from "react-icons/bi";
import { useAuth } from "../../context/AuthContext";
import "../../styles/sidebar.css";

function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [openEmissao, setOpenEmissao] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const { user, logout, adminConfig } = useAuth();
  const nivelAcesso = user?.tipo;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isActive = (path) => (location.pathname === path ? "active" : "");

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleLinkClick = () => {
    if (isMobile) {
      onClose();
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-header">
        <div className="header-top">
          <Link to="/" className="logo-link" onClick={handleLinkClick}>
            <img
              src="https://i.postimg.cc/dtb0y31C/logo2.png"
              alt="Logo"
              className="logo-desktop"
            />
            <img
              src="/imagens/Fedcorp-icone01-50x50.png"
              alt="Ícone Fedcorp"
              className="logo-mobile"
            />
          </Link>

          {/* Botão de fechar no mobile */}
          {isMobile && (
            <button className="close-sidebar" onClick={onClose}>
              <FiX size={24} />
            </button>
          )}
        </div>

        <h2 className="sidebar-title">Nota Fiscal</h2>
        <p className="subtitle">Sistema de Transmissão Grupo Fedcorp</p>
      </div>

      <nav className="sidebar-nav">
        {/* Home */}
        <Link to="/" className={isActive("/")} onClick={handleLinkClick}>
          <FiHome className="icon" /> Home
        </Link>

        {/* Emissão */}
        <div className="menu-group">
          <button className="menu-toggle" onClick={() => setOpenEmissao((p) => !p)}>
            <FiFileText className="icon" />
            <span>Emissão</span>
            <FiChevronDown className={`arrow ${openEmissao ? "rotated" : ""}`} size={16} />
          </button>

          {openEmissao && (
            <div className={`submenu ${openEmissao ? 'open' : ''}`}>
              <Link to="/emitir/fatura" className={isActive("/emitir/fatura")} onClick={handleLinkClick}>
                Fatura
              </Link>
              <Link to="/emitir/fatura-planilha" className={isActive("/emitir/fatura-planilha")} onClick={handleLinkClick}>
                Fatura + Descrição
              </Link>
              {/* import XLSX descontinuado; nova importação será projetada (rota /api/nfse/import/xlsx/ removida do backend em 09/11/2026) */}
              {["adm", "dev"].includes(nivelAcesso) && (
                <>
                  <Link to="/emitir/individual" className={isActive("/emitir/individual")} onClick={handleLinkClick}>
                    Individual
                  </Link>

                </>
              )}

            </div>
          )}
        </div>

        {/* Consultas */}
        <Link to="/consultas" className={isActive("/consultas")} onClick={handleLinkClick}>
          <FiSearch className="icon" /> Consultar
        </Link>

        {/* Histórico (apenas para adm/dev) */}
        {["adm", "dev"].includes(nivelAcesso) && (
          <Link to="/historico" className={isActive("/historico")} onClick={handleLinkClick}>
            <FiClock className="icon" /> Histórico
          </Link>
        )}

        {/* Configuração dos modelos de emissão (só admin de configuração, decidido pelo backend) */}
        {adminConfig && (
          <Link
            to="/configuracao"
            className={location.pathname.startsWith("/configuracao") ? "active" : ""}
            onClick={handleLinkClick}
          >
            <FiSettings className="icon" /> Configuração
          </Link>
        )}

        {/* Logout */}
        <div className="login">
          <button type="button" className="logout-btn" onClick={handleLogout}>
            <BiDoorOpen className="icon-login" /> Sair
          </button>
        </div>
      </nav>
    </aside>
  );
}

export default Sidebar;