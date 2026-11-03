'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, UserPlus, LogIn, Clock, ChevronRight, RefreshCw, X, ShieldAlert } from 'lucide-react';

interface PendienteUser {
  id: string;
  email: string;
  creado_el: string;
  rol: string;
  estado: string;
  empresa?: string;
}

interface LoginLog {
  id: number;
  email: string;
  evento: string;
  creado_el: string;
  detalles?: any;
}

interface AdminNotificationsProps {
  onOpenAdminModal?: () => void;
}

function timeAgo(dateString: string): string {
  try {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Hace instantes';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return `Hace ${diffDays} d`;
  } catch {
    return 'Reciente';
  }
}

export const AdminNotifications: React.FC<AdminNotificationsProps> = ({ onOpenAdminModal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendientes, setPendientes] = useState<PendienteUser[]>([]);
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchNotificaciones = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/notificaciones');
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        setPendientes(data.pendientes || []);
        setLogs(data.logs || []);
        setPendingCount(data.pendingCount || 0);
      }
    } catch (err) {
      console.warn('Error fetching notificaciones:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotificaciones();
    // Polling cada 25 segundos
    const interval = setInterval(fetchNotificaciones, 25000);
    return () => clearInterval(interval);
  }, []);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleActionClick = () => {
    setIsOpen(false);
    if (onOpenAdminModal) {
      onOpenAdminModal();
    }
  };

  return (
    <div className="notifications-wrapper" ref={popoverRef}>
      <button
        type="button"
        className={`btn header-icon-btn notifications-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Notificaciones y solicitudes de acceso"
        aria-label="Notificaciones"
      >
        <Bell size={16} />
        {pendingCount > 0 && (
          <span className="notifications-badge" aria-label={`${pendingCount} solicitudes pendientes`}>
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notifications-popover">
          {/* Header del popover */}
          <div className="notif-header">
            <div className="notif-header-title">
              <Bell size={15} className="notif-icon-primary" />
              <span>Notificaciones</span>
              {pendingCount > 0 && (
                <span className="notif-badge-pill">{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="notif-header-actions">
              <button
                type="button"
                className="notif-btn-refresh"
                onClick={fetchNotificaciones}
                title="Actualizar notificaciones"
                disabled={loading}
              >
                <RefreshCw size={13} className={loading ? 'spin-anim' : ''} />
              </button>
              <button
                type="button"
                className="notif-btn-close"
                onClick={() => setIsOpen(false)}
                title="Cerrar"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="notif-body">
            {/* Sección: Solicitudes de acceso pendientes */}
            <div className="notif-section">
              <div className="notif-section-header">
                <ShieldAlert size={13} className="text-amber" />
                <span>Solicitudes de Acceso</span>
              </div>

              {pendientes.length === 0 ? (
                <div className="notif-empty-state">
                  <span className="notif-empty-check">✓</span>
                  <span>Sin solicitudes pendientes. Todos los clientes tienen acceso asignado.</span>
                </div>
              ) : (
                <div className="notif-list">
                  {pendientes.map((user) => (
                    <div key={user.id} className="notif-item notif-item-pending">
                      <div className="notif-item-icon pending-icon">
                        <UserPlus size={15} />
                      </div>
                      <div className="notif-item-content">
                        <div className="notif-item-top">
                          <span className="notif-user-email" title={user.email}>
                            {user.email}
                          </span>
                          <span className="notif-time">{timeAgo(user.creado_el)}</span>
                        </div>
                        <p className="notif-item-desc">
                          {user.empresa ? `${user.empresa} • ` : ''}Esperando asignación de nivel
                        </p>
                        <button
                          type="button"
                          className="notif-action-btn"
                          onClick={handleActionClick}
                        >
                          <span>Asignar Nivel</span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sección: Actividad reciente */}
            {logs.length > 0 && (
              <div className="notif-section" style={{ marginTop: '12px' }}>
                <div className="notif-section-header">
                  <Clock size={13} />
                  <span>Actividad Reciente</span>
                </div>
                <div className="notif-list notif-logs-list">
                  {logs.slice(0, 6).map((log) => (
                    <div key={log.id} className="notif-log-row">
                      <div className="notif-log-indicator">
                        {log.evento === 'REGISTRO' ? (
                          <UserPlus size={11} className="text-amber" />
                        ) : (
                          <LogIn size={11} className="text-green" />
                        )}
                      </div>
                      <div className="notif-log-details">
                        <span className="notif-log-email" title={log.email}>{log.email}</span>
                        <span className="notif-log-desc">
                          {log.evento === 'REGISTRO' ? 'se registró' : 'inició sesión'}
                        </span>
                      </div>
                      <span className="notif-log-time">{timeAgo(log.creado_el)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer del popover */}
          <div className="notif-footer">
            <button
              type="button"
              className="notif-footer-btn"
              onClick={handleActionClick}
            >
              <span>Abrir Gestión de Accesos</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
