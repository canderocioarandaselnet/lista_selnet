'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface OnboardingScreenProps {
  userEmail: string;
  onRefresh: () => void;
}

export default function OnboardingScreen({ userEmail, onRefresh }: OnboardingScreenProps) {
  const [checking, setChecking] = useState(false);
  const supabase = createClient();

  const handleCheckStatus = async () => {
    setChecking(true);
    await onRefresh();
    setTimeout(() => setChecking(false), 800);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        {/* Header con Isotipo Selnet */}
        <div className="onboarding-header">
          <div className="onboarding-icon-wrapper">
            <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="50" fill="var(--selnet-red)" />
              <path
                d="M 50,15 A 35,35 0 0,1 85,50 A 17.5,17.5 0 0,1 67.5,67.5 A 17.5,17.5 0 0,1 50,50 A 17.5,17.5 0 0,0 32.5,32.5 A 17.5,17.5 0 0,0 15,50 A 35,35 0 0,1 50,15 Z"
                fill="#ffffff"
              />
            </svg>
          </div>
          <span className="badge-pending">Cuenta en Revisión</span>
          <h1 className="onboarding-title">Solicitud de Acceso Pendiente</h1>
          <p className="onboarding-user-email">{userEmail}</p>
        </div>

        {/* Mensaje Explicativo */}
        <div className="onboarding-body">
          <div className="onboarding-info-box">
            <div className="info-icon">⏳</div>
            <div className="info-text">
              <h3>Tu cuenta fue registrada con éxito</h3>
              <p>
                Para resguardar las políticas de precios mayoristas de Selnet, nuestro equipo comercial está
                verificando tu empresa para asignarte tu nivel de precios correspondiente (
                <strong>Gold, Ruby, Platinum, Black o Diamond</strong>).
              </p>
            </div>
          </div>

          <p className="onboarding-note">
            Apenas un administrador apruebe tu solicitud desde el panel de control, podrás acceder inmediatamente a
            todo el catálogo y consultar stock y precios oficiales.
          </p>
        </div>

        {/* Acciones */}
        <div className="onboarding-actions">
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={checking}
            className="btn-refresh-status"
          >
            {checking ? 'Comprobando estado...' : '🔄 Comprobar si ya fue aprobado'}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="btn-logout-link"
          >
            Cerrar Sesión / Usar otra cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
