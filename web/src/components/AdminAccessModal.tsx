'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { UsuarioAdminItem, UserTier, UserRole, UserStatus } from '@/types';

interface AdminAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail: string;
}

const ALL_TIERS: { id: UserTier; label: string; color: string }[] = [
  { id: 'gold', label: 'GOLD', color: 'tier-gold' },
  { id: 'ruby', label: 'RUBY', color: 'tier-ruby' },
  { id: 'platinum', label: 'PLATINUM', color: 'tier-platinum' },
  { id: 'black', label: 'BLACK', color: 'tier-black' },
  { id: 'diamond', label: 'DIAMOND', color: 'tier-diamond' },
  { id: 'interna', label: 'INTERNA', color: 'tier-interna' },
];

export default function AdminAccessModal({ isOpen, onClose, currentUserEmail }: AdminAccessModalProps) {
  const [usuarios, setUsuarios] = useState<UsuarioAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'todos' | 'pendientes' | 'activos' | 'inactivos'>('todos');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal para crear nuevo acceso
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNiveles, setNewNiveles] = useState<UserTier[]>(['gold']);
  const [newRol, setNewRol] = useState<UserRole>('cliente');
  const [newNotas, setNewNotas] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Cargar usuarios
  const fetchUsuarios = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/usuarios');
      const json = await res.json();
      if (json.ok) {
        setUsuarios(json.usuarios || []);
      }
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsuarios();
    }
  }, [isOpen]);

  // Modificar niveles de un usuario (tildar/destildar en tiempo real)
  const handleToggleTier = async (usuario: UsuarioAdminItem, tier: UserTier) => {
    const isCurrentlyActive = usuario.niveles.includes(tier);
    let updatedNiveles: UserTier[];

    if (isCurrentlyActive) {
      // Si ya tiene ese nivel, removerlo (pero no dejarlo vacío)
      updatedNiveles = usuario.niveles.filter((t) => t !== tier);
      if (updatedNiveles.length === 0) {
        updatedNiveles = ['gold'];
      }
    } else {
      updatedNiveles = [...usuario.niveles, tier];
    }

    // Actualización optimista local
    setUsuarios((prev) =>
      prev.map((u) => (u.email === usuario.email ? { ...u, niveles: updatedNiveles } : u))
    );

    try {
      setActionLoading(usuario.email);
      await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: usuario.id,
          email: usuario.email,
          niveles: updatedNiveles,
        }),
      });
    } catch (err) {
      console.error('Error al actualizar niveles:', err);
      fetchUsuarios();
    } finally {
      setActionLoading(null);
    }
  };

  // Cambiar estado (Aprobar / Activar / Pausar)
  const handleToggleStatus = async (usuario: UsuarioAdminItem, newStatus: UserStatus) => {
    setUsuarios((prev) =>
      prev.map((u) => (u.email === usuario.email ? { ...u, estado: newStatus } : u))
    );

    try {
      setActionLoading(usuario.email);
      await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: usuario.id,
          email: usuario.email,
          estado: newStatus,
          niveles: usuario.niveles.length > 0 ? usuario.niveles : ['gold'],
        }),
      });
    } catch (err) {
      console.error('Error al cambiar estado:', err);
      fetchUsuarios();
    } finally {
      setActionLoading(null);
    }
  };

  // Crear o preautorizar nuevo usuario
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    try {
      setCreateLoading(true);
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          niveles: newNiveles,
          rol: newRol,
          estado: 'activo',
          notas: newNotas,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setShowCreateModal(false);
        setNewEmail('');
        setNewNiveles(['gold']);
        setNewNotas('');
        fetchUsuarios();
      }
    } catch (err) {
      console.error('Error al crear usuario:', err);
    } finally {
      setCreateLoading(false);
    }
  };

  // Métricas
  const stats = useMemo(() => {
    return {
      total: usuarios.length,
      activos: usuarios.filter((u) => u.estado === 'activo').length,
      pendientes: usuarios.filter((u) => u.estado === 'pendiente').length,
      inactivos: usuarios.filter((u) => u.estado === 'inactivo').length,
    };
  }, [usuarios]);

  // Filtrado
  const filteredUsers = useMemo(() => {
    return usuarios.filter((u) => {
      // Filtro pestaña
      if (filterTab === 'pendientes' && u.estado !== 'pendiente') return false;
      if (filterTab === 'activos' && u.estado !== 'activo') return false;
      if (filterTab === 'inactivos' && u.estado !== 'inactivo') return false;

      // Filtro búsqueda
      if (search) {
        const s = search.toLowerCase();
        return u.email.toLowerCase().includes(s) || (u.notas || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [usuarios, filterTab, search]);

  if (!isOpen) return null;

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal-container">
        {/* Header */}
        <div className="admin-modal-header">
          <div className="admin-header-title">
            <div className="admin-icon-shield">⚙️</div>
            <div>
              <h2>Gestión Centralizada de Accesos</h2>
              <p>Administra clientes, asigna niveles comerciales multinivel y aprueba nuevos registros.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-close-modal">
            ✕
          </button>
        </div>

        {/* Métricas rápidas */}
        <div className="admin-metrics-bar">
          <div
            className={`metric-card ${filterTab === 'todos' ? 'selected' : ''}`}
            onClick={() => setFilterTab('todos')}
          >
            <span className="metric-label">Total Usuarios</span>
            <span className="metric-value">
              {loading ? <span className="skeleton-shimmer skeleton-metric-val" /> : stats.total}
            </span>
          </div>

          <div
            className={`metric-card warning ${filterTab === 'pendientes' ? 'selected' : ''}`}
            onClick={() => setFilterTab('pendientes')}
          >
            <span className="metric-label">Pendientes de Aprobación</span>
            <span className="metric-value">
              {loading ? <span className="skeleton-shimmer skeleton-metric-val" /> : stats.pendientes}
            </span>
            {!loading && stats.pendientes > 0 && <span className="metric-pill-badge">Requiere acción</span>}
          </div>

          <div
            className={`metric-card success ${filterTab === 'activos' ? 'selected' : ''}`}
            onClick={() => setFilterTab('activos')}
          >
            <span className="metric-label">Activos</span>
            <span className="metric-value">
              {loading ? <span className="skeleton-shimmer skeleton-metric-val" /> : stats.activos}
            </span>
          </div>

          <div
            className={`metric-card muted ${filterTab === 'inactivos' ? 'selected' : ''}`}
            onClick={() => setFilterTab('inactivos')}
          >
            <span className="metric-label">Inactivos</span>
            <span className="metric-value">
              {loading ? <span className="skeleton-shimmer skeleton-metric-val" /> : stats.inactivos}
            </span>
          </div>
        </div>

        {/* Barra de Controles y Búsqueda */}
        <div className="admin-controls-bar">
          <div className="admin-search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar por correo electrónico o empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn-create-access"
          >
            + Preautorizar Nuevo Correo
          </button>
        </div>

        {/* Lista / Tabla de Usuarios */}
        <div className="admin-table-container">
          {loading ? (
            <div className="admin-skeleton-table">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Usuario / Correo</th>
                    <th>Estado</th>
                    <th>Niveles Autorizados</th>
                    <th>Primer Login</th>
                    <th>Último Ingreso</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="admin-skeleton-row">
                      <td className="col-user-info">
                        <div className="user-email-wrap" style={{ gap: '8px' }}>
                          <div
                            className="skeleton-shimmer"
                            style={{ width: `${140 + (i % 3) * 35}px`, height: '14px', borderRadius: '4px' }}
                          />
                          {i === 0 && (
                            <div
                              className="skeleton-shimmer"
                              style={{ width: '45px', height: '14px', borderRadius: '4px' }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="col-status">
                        <div
                          className="skeleton-shimmer"
                          style={{ width: '80px', height: '20px', borderRadius: '12px' }}
                        />
                      </td>
                      <td className="col-tiers">
                        <div className="tiers-chips-group">
                          {Array.from({ length: 4 }).map((_, chipIdx) => (
                            <div
                              key={chipIdx}
                              className="skeleton-shimmer"
                              style={{ width: '52px', height: '20px', borderRadius: '4px' }}
                            />
                          ))}
                        </div>
                      </td>
                      <td>
                        <div
                          className="skeleton-shimmer"
                          style={{ width: '75px', height: '12px', borderRadius: '3px' }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton-shimmer"
                          style={{ width: '75px', height: '12px', borderRadius: '3px' }}
                        />
                      </td>
                      <td className="col-actions">
                        <div
                          className="skeleton-shimmer"
                          style={{ width: '65px', height: '24px', borderRadius: '4px' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="admin-empty">No se encontraron usuarios con los filtros aplicados.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuario / Correo</th>
                  <th>Estado</th>
                  <th>Niveles Autorizados (Haz clic para alternar)</th>
                  <th>Primer Login</th>
                  <th>Último Ingreso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = u.email === currentUserEmail.toLowerCase();
                  return (
                    <tr key={u.id} className={`admin-row-${u.estado}`}>
                      {/* Correo y badges */}
                      <td className="col-user-info">
                        <div className="user-email-wrap">
                          <span className="user-email-text">{u.email}</span>
                          {u.rol === 'admin' && <span className="badge-admin">ADMIN</span>}
                          {u.is_precargado && <span className="badge-precargado">Importado BQ</span>}
                        </div>
                        {u.notas && <span className="user-notas-text">{u.notas}</span>}
                      </td>

                      {/* Estado */}
                      <td className="col-status">
                        <span className={`status-pill ${u.estado}`}>
                          {u.estado === 'activo'
                            ? '● Activo'
                            : u.estado === 'pendiente'
                            ? '⏳ En Revisión'
                            : '✕ Inactivo'}
                        </span>
                      </td>

                      {/* Niveles Multinivel interactivos */}
                      <td className="col-tiers">
                        <div className="tiers-chips-group">
                          {ALL_TIERS.map((tier) => {
                            const isAuthorized = u.niveles.includes(tier.id);
                            return (
                              <button
                                key={tier.id}
                                type="button"
                                disabled={actionLoading === u.email || (isSelf && tier.id === 'interna')}
                                onClick={() => handleToggleTier(u, tier.id)}
                                className={`btn-tier-chip ${tier.color} ${isAuthorized ? 'active' : 'inactive'}`}
                                title={isAuthorized ? `Habilitado (Clic para quitar)` : `Inactivo (Clic para otorgar)`}
                              >
                                {tier.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Fechas de trazabilidad */}
                      <td className="col-date">
                        {u.primer_login
                          ? new Date(u.primer_login).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="col-date">
                        {u.ultimo_login
                          ? new Date(u.ultimo_login).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>

                      {/* Acciones */}
                      <td className="col-actions">
                        {u.estado === 'pendiente' ? (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u, 'activo')}
                            className="btn-action-approve"
                          >
                            ✓ Aprobar Acceso
                          </button>
                        ) : u.estado === 'activo' ? (
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => handleToggleStatus(u, 'inactivo')}
                            className="btn-action-pause"
                          >
                            Pausar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u, 'activo')}
                            className="btn-action-activate"
                          >
                            Reactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal interno para crear nuevo acceso */}
        {showCreateModal && (
          <div className="create-access-overlay">
            <div className="create-access-card">
              <div className="create-access-header">
                <h3>Preautorizar Nuevo Correo en Selnet</h3>
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="create-access-form">
                <div className="form-group">
                  <label>Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    placeholder="cliente@empresa.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Niveles Comerciales Autorizados</label>
                  <div className="tier-checkboxes-grid">
                    {ALL_TIERS.map((t) => (
                      <label key={t.id} className="tier-checkbox-item">
                        <input
                          type="checkbox"
                          checked={newNiveles.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewNiveles([...newNiveles, t.id]);
                            } else {
                              const filtered = newNiveles.filter((x) => x !== t.id);
                              setNewNiveles(filtered.length > 0 ? filtered : ['gold']);
                            }
                          }}
                        />
                        <span className={`tier-badge-label ${t.color}`}>{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Rol de Usuario</label>
                  <select value={newRol} onChange={(e) => setNewRol(e.target.value as UserRole)}>
                    <option value="cliente">Cliente Mayorista</option>
                    <option value="admin">Administrador (Control total)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Notas / Empresa (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. Distribuidor Córdoba / Instalaciones SRL"
                    value={newNotas}
                    onChange={(e) => setNewNotas(e.target.value)}
                  />
                </div>

                <div className="create-access-footer">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-cancel"
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={createLoading} className="btn-submit-create">
                    {createLoading ? 'Guardando...' : 'Autorizar y Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
