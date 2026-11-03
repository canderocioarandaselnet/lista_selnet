'use client';

import React from 'react';
export const InitialLoader: React.FC = () => {
  return (
    <div className="initial-splash-wrapper">
      <div className="initial-splash-card">
        <div className="initial-splash-logo-pulse">
          <img
            src="/logo-selnet-white.png"
            alt="Selnet Soluciones Integrales"
            className="initial-splash-official-logo"
          />
        </div>
        <div className="initial-splash-titles">
          <p className="initial-splash-subtitle">Portal Mayorista y Lista de Precios Oficial</p>
        </div>
        <div className="initial-splash-loader">
          <div className="initial-splash-spinner" />
          <span className="initial-splash-text">Verificando credenciales de acceso...</span>
        </div>
      </div>
    </div>
  );
};
