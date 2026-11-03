'use client';

import React from 'react';
import { SelnetLogoIcon } from './Header';

export const InitialLoader: React.FC = () => {
  return (
    <div className="initial-splash-wrapper">
      <div className="initial-splash-card">
        <div className="initial-splash-logo-pulse">
          <SelnetLogoIcon size={58} />
        </div>
        <div className="initial-splash-titles">
          <h1 className="initial-splash-wordmark">SELNET</h1>
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
