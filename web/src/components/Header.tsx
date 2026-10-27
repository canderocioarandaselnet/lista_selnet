'use client';

import React, { useEffect, useState } from 'react';
import { UserTier } from '@/types';
import { Moon, Sun, ShieldCheck, RefreshCw, User } from 'lucide-react';

interface HeaderProps {
  email: string;
  tier: UserTier;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ email, tier, onLogout }) => {
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
      <div className="brand-logo-area">
        <div className="logo-badge">SELNET</div>
        <div className="app-title">
          Lista de Precios
          <span className="subtitle">Mayorista Oficial</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Status de Sincronización */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <RefreshCw size={14} className="text-emerald-500" />
          <span>BigQuery Live</span>
        </div>

        {/* User Pill con Tier Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '5px 12px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border)'
        }}>
          <User size={15} color="var(--text-muted)" />
          <span style={{ fontSize: '12.5px', fontWeight: 500 }}>{email}</span>
          <span className={`tier-badge ${getTierClass(tier)}`}>
            <ShieldCheck size={12} />
            {tier.toUpperCase()}
          </span>
        </div>

        {/* Theme Toggle */}
        <button
          className="btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          style={{ padding: '8px', borderRadius: 'var(--radius-full)' }}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {onLogout && (
          <button className="btn" onClick={onLogout} style={{ fontSize: '12px' }}>
            Salir
          </button>
        )}
      </div>
    </header>
  );
};
