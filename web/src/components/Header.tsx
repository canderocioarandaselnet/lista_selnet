'use client';

import React, { useEffect, useState } from 'react';
import { UserTier } from '@/types';
import { Moon, Sun, ShieldCheck, RefreshCw, User, Menu } from 'lucide-react';

interface HeaderProps {
  email: string;
  tier: UserTier;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
  onOpenSidebar?: () => void;
  selectedMarca?: string | null;
}

export const SelnetLogoIcon: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="selnet-icon-svg"
  >
    {/* Red Background Circle */}
    <circle cx="50" cy="50" r="48" fill="var(--primary)" />
    {/* Top swirl of S */}
    <path
      d="M50 18C34.5 18 22 30.5 22 46c0 10.5 5.8 19.8 14.5 24.6l5.8-9.8C37.5 57.6 34 52.2 34 46c0-8.8 7.2-16 16-16 7.4 0 13.6 5 15.4 11.8l11.6-3.2C73.8 27.2 62.8 18 50 18z"
      fill="#ffffff"
    />
    {/* Bottom swirl of S */}
    <path
      d="M50 82c15.5 0 28-12.5 28-28 0-10.5-5.8-19.8-14.5-24.6l-5.8 9.8c4.8 3.2 8.3 8.6 8.3 14.8 0 8.8-7.2 16-16 16-7.4 0-13.6-5-15.4-11.8l-11.6 3.2C36.2 72.8 47.2 82 50 82z"
      fill="#ffffff"
    />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({
  email,
  tier,
  isAdmin,
  onOpenAdmin,
  onLogout,
  onOpenSidebar,
  selectedMarca,
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const savedTheme = (localStorage.getItem('selnet_theme') as 'dark' | 'light') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('selnet_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const getTierClass = (t: UserTier) => {
    switch (t) {
      case 'diamond': return 'tier-diamond';
      case 'black': return 'tier-black';
      case 'platinum': return 'tier-platinum';
      case 'ruby': return 'tier-ruby';
      case 'gold': return 'tier-gold';
      case 'interna': return 'tier-interna';
      default: return 'tier-gold';
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        {onOpenSidebar && (
          <button
            className="mobile-menu-btn"
            onClick={onOpenSidebar}
            aria-label="Abrir catálogo de marcas"
            title="Catálogo de marcas"
          >
            <Menu size={18} />
            <span className="mobile-menu-text">Marcas</span>
            {selectedMarca && (
              <span className="mobile-menu-brand-indicator">
                {selectedMarca}
              </span>
            )}
          </button>
        )}

        <div className="brand-logo-area">
          <SelnetLogoIcon size={30} />
          <div className="brand-titles">
            <span className="brand-wordmark">SELNET</span>
            <span className="brand-subtitle">LISTA DE PRECIOS OFICIAL</span>
          </div>
        </div>
      </div>

      <div className="header-right">
        {/* Botón de Administración de Accesos (Solo para Admins) */}
        {isAdmin && onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="btn-admin-access-nav"
            title="Panel de gestión centralizada de accesos"
          >
            ⚙️ <span className="admin-btn-text">Gestión de Accesos</span>
          </button>
        )}

        {/* Status de Sincronización */}
        <div className="sync-status" title="Sincronización en tiempo real con BigQuery activa">
          <span className="sync-dot"></span>
          <span className="sync-text">BigQuery Live</span>
        </div>

        {/* User Pill con Tier Badge */}
        <div className="user-pill">
          <User size={13} className="user-icon" />
          <span className="user-email">{email}</span>
          <span className={`tier-badge ${getTierClass(tier)}`}>
            <ShieldCheck size={11} />
            <span className="tier-name">{tier.toUpperCase()}</span>
          </span>
        </div>

        {/* Theme Toggle */}
        <button
          className="btn theme-toggle-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label="Alternar modo visual"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {onLogout && (
          <button className="btn logout-btn" onClick={onLogout} title="Cerrar sesión">
            Salir
          </button>
        )}
      </div>
    </header>
  );
};
