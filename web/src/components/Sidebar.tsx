'use client';

import React from 'react';
import { UserTier } from '@/types';
import { Layers, ShieldAlert, Sparkles, Tag, X, User, ShieldCheck, LogOut, Settings } from 'lucide-react';

interface SidebarProps {
  selectedMarca: string | null;
  onSelectMarca: (marca: string | null) => void;
  brandCounts: Record<string, number>;
  tier: UserTier;
  isOpen?: boolean;
  onClose?: () => void;
  userEmail?: string;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
}

const BRANDS_ESTANDAR = [
  'HIKVISION',
  'EZVIZ',
  'DIGIFORT',
  'HIKMICRO',
  'OUTLET',
  'RANGER',
  'SEAGATE',
  'TAKEX',
  'ULTRACELL',
  'VIVOTEK',
  'VORTEX',
];

const BRANDS_INTERNAS = [
  'BENTEL - FIRECLASS',
  'DSC',
  'SYSTEM SENSOR',
];

export const Sidebar: React.FC<SidebarProps> = ({
  selectedMarca,
  onSelectMarca,
  brandCounts,
  tier,
  isOpen = false,
  onClose,
  userEmail,
  isAdmin,
  onOpenAdmin,
  onLogout,
}) => {
  const totalCount = Object.values(brandCounts).reduce((a, b) => a + b, 0);

  const handleSelect = (brand: string | null) => {
    onSelectMarca(brand);
    if (onClose) onClose();
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
    <>
      {/* Backdrop overlay for mobile drawer */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-label="Cerrar panel de marcas"
        />
      )}

      <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Drawer header on mobile */}
        <div className="sidebar-drawer-header">
          <div className="sidebar-drawer-title">
            <Layers size={18} />
            <span>Marcas del Catálogo</span>
          </div>
          {onClose && (
            <button
              className="sidebar-close-btn"
              onClick={onClose}
              aria-label="Cerrar marcas"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Zona scrollable de marcas */}
        <div className="sidebar-nav-scroll">
          <div className="sidebar-section-title">Catálogo Principal</div>

          <ul className="sidebar-menu">
            <li
              className={`sidebar-item ${selectedMarca === null ? 'active' : ''}`}
              onClick={() => handleSelect(null)}
            >
              <div className="brand-name">
                <Layers size={16} />
                <span>TODAS LAS MARCAS</span>
              </div>
              <span className="brand-count">{totalCount}</span>
            </li>

            {BRANDS_ESTANDAR.map((brand) => {
              const count = brandCounts[brand] || 0;
              return (
                <li
                  key={brand}
                  className={`sidebar-item ${selectedMarca === brand ? 'active' : ''}`}
                  onClick={() => handleSelect(brand)}
                >
                  <div className="brand-name">
                    {brand === 'OUTLET' ? <Tag size={15} /> : <Sparkles size={15} />}
                    <span>{brand}</span>
                  </div>
                  <span className="brand-count">{count}</span>
                </li>
              );
            })}
          </ul>

          {/* Marcas Exclusivas para uso Interno */}
          {tier === 'interna' && (
            <>
              <div className="sidebar-section-title" style={{ marginTop: '20px', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={13} />
                <span>Exclusivo Interna (Alarma / Incendio)</span>
              </div>

              <ul className="sidebar-menu">
                {BRANDS_INTERNAS.map((brand) => {
                  const count = brandCounts[brand] || 0;
                  return (
                    <li
                      key={brand}
                      className={`sidebar-item ${selectedMarca === brand ? 'active' : ''}`}
                      onClick={() => handleSelect(brand)}
                      style={{ borderColor: selectedMarca === brand ? '#a855f7' : 'transparent' }}
                    >
                      <div className="brand-name" style={{ color: selectedMarca === brand ? '#c084fc' : undefined }}>
                        <span>🚨 {brand}</span>
                      </div>
                      <span className="brand-count">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Zona fija inferior: Gestión de accesos + Perfil de Usuario */}
        <div className="sidebar-user-footer">
          {/* Botón Gestión de Accesos (Solo Admins) */}
          {isAdmin && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="sidebar-admin-btn"
              title="Panel de gestión centralizada de accesos"
            >
              <Settings size={14} />
              <span>Gestión de Accesos</span>
            </button>
          )}

          {/* Tarjeta de Usuario con Email y Nivel Activo */}
          <div className="sidebar-user-card">
            <div className="sidebar-user-info">
              <div className="sidebar-user-avatar">
                <User size={14} />
              </div>
              <div className="sidebar-user-text">
                <span className="sidebar-user-email" title={userEmail || ''}>
                  {userEmail || 'Usuario'}
                </span>
                <span className={`tier-badge ${getTierClass(tier)} sidebar-tier-badge`}>
                  <ShieldCheck size={10} />
                  <span>{tier.toUpperCase()}</span>
                </span>
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="sidebar-logout-btn"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
