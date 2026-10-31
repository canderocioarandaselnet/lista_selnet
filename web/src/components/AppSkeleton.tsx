'use client';

import React from 'react';
import { SelnetLogoIcon } from './Header';
import { ProductTableSkeleton } from './ProductTableSkeleton';

export const AppSkeleton: React.FC = () => {
  const brandPlaceholders = [
    { name: 'TODAS LAS MARCAS', width: 120, count: 1945 },
    { name: 'HIKVISION', width: 90, count: 1067 },
    { name: 'EZVIZ', width: 60, count: 183 },
    { name: 'DIGIFORT', width: 80, count: 294 },
    { name: 'HIKMICRO', width: 85, count: 1 },
    { name: 'OUTLET', width: 70, count: 163 },
    { name: 'RANGER', width: 75, count: 18 },
    { name: 'SEAGATE', width: 80, count: 11 },
    { name: 'TAKEX', width: 65, count: 28 },
    { name: 'ULTRACELL', width: 85, count: 1 },
    { name: 'VIVOTEK', width: 80, count: 105 },
  ];

  return (
    <div className="main-wrapper skeleton-app-wrapper">
      {/* 1. Header Skeleton */}
      <header className="app-header">
        <div className="header-left">
          <div className="brand-logo-area">
            <SelnetLogoIcon size={30} />
            <div className="brand-titles">
              <span className="brand-wordmark">SELNET</span>
              <span className="brand-subtitle">LISTA DE PRECIOS OFICIAL</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="skeleton-shimmer skeleton-round-btn" />
        </div>
      </header>

      {/* 2. Tier Bar Skeleton */}
      <div className="demo-tier-bar">
        <div className="tier-selector-group">
          <span className="demo-label">Nivel de Precios:</span>
          <div className="tier-chips-scroll">
            {['GOLD', 'RUBY', 'PLATINUM', 'BLACK', 'DIAMOND', 'INTERNA'].map((t, idx) => (
              <div
                key={t}
                className={`demo-tier-btn skeleton-shimmer-tier ${idx === 0 ? 'active' : ''}`}
                style={{ width: `${50 + (idx % 3) * 10}px`, height: '22px' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 3. App Container with Sidebar and Main Content */}
      <div className="app-container">
        {/* Sidebar Skeleton */}
        <aside className="app-sidebar">
          <div className="sidebar-nav-scroll">
            <div className="sidebar-section-title">Catálogo Principal</div>

            <ul className="sidebar-menu">
              {brandPlaceholders.map((b, i) => (
                <li key={i} className={`sidebar-item ${i === 0 ? 'active' : ''}`}>
                  <div className="brand-name">
                    <div className="skeleton-shimmer skeleton-brand-icon" />
                    <div
                      className="skeleton-shimmer skeleton-brand-text"
                      style={{ width: `${b.width}px` }}
                    />
                  </div>
                  <span className="brand-count skeleton-shimmer-count">
                    {b.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* User Footer Skeleton */}
          <div className="sidebar-user-footer">
            <div className="sidebar-user-card">
              <div className="sidebar-user-info">
                <div className="skeleton-shimmer skeleton-user-avatar" />
                <div className="sidebar-user-text">
                  <div className="skeleton-shimmer skeleton-user-email-line" />
                  <div className="skeleton-shimmer skeleton-tier-pill-line" />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Skeleton */}
        <main className="main-content">
          {/* Filters Bar Skeleton */}
          <div className="filters-bar skeleton-filters-bar">
            <div className="filters-main-row">
              <div className="skeleton-shimmer skeleton-search-box" />
              <div className="skeleton-shimmer skeleton-select-box" />
              <div className="skeleton-quick-filters">
                <div className="skeleton-shimmer skeleton-toggle-btn" />
                <div className="skeleton-shimmer skeleton-toggle-btn" />
                <div className="skeleton-shimmer skeleton-toggle-btn" />
              </div>
              <div className="skeleton-shimmer skeleton-export-btn" />
            </div>
          </div>

          {/* Product Table Skeleton */}
          <ProductTableSkeleton rowCount={14} tier="interna" />
        </main>
      </div>
    </div>
  );
};
