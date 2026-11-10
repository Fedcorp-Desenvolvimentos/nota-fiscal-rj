import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function useBreadcrumb() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const routeNames = {
    '/': 'Home',
    '/emitir': 'Opções de Emissão',
    '/emitir/fatura': 'Fatura',
    '/emitir/excel': 'EXCEL',
    '/emitir/individual': 'Individual',
    '/consultas': 'Consultas',
    '/historico': 'Histórico',
    '/configuracao': 'Configuração',
    '/configuracao/mapa': 'Mapa de emissão',
    '/configuracao/prestadores': 'Prestadores',
    '/configuracao/modelos': 'Modelos',
    '/configuracao/regras': 'Regras',
    '/configuracao/auditoria': 'Auditoria',
  };

  const formatSegment = (segment) => {
    let texto = segment;
    try {
      texto = decodeURIComponent(segment);
    } catch {
      /* segmento mal codificado: exibe como veio */
    }
    return texto
      .replace(/-/g, ' ')
      .replace(/^\w/, c => c.toUpperCase());
  };

  const getBreadcrumb = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);

    let items = [];
    let currentPath = '';

    if (location.pathname !== '/') {
      items.push({
        label: 'Home',
        path: '/'
      });
    }

    pathSegments.forEach((segment) => {
      currentPath += `/${segment}`;

      items.push({
        label: routeNames[currentPath] || formatSegment(segment),
        path: currentPath
      });
    });

    return items;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setShowUserMenu(false);
  };

  return {
    user,
    showUserMenu,
    setShowUserMenu,
    currentTime,
    breadcrumbItems: getBreadcrumb(),
    handleLogout
  };
}