'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Building2, User, ShieldAlert } from 'lucide-react';
import { UsuarioAdminItem, UserTier, UserRole, UserStatus } from '@/types';

interface AdminAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail: string;
}

interface PendingTierConfirmation {
  usuario: UsuarioAdminItem;
  tier: { id: UserTier; label: string; color: string };
  isRemoving: boolean;
  resultingNiveles: UserTier[];
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
  const [filterTab, setFilterTab] = useState<'todos' | 'en_linea' | 'pendientes' | 'activos' | 'inactivos'>('todos');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal para crear nuevo acceso
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNiveles, setNewNiveles] = useState<UserTier[]>(['gold']);
  const [newRol, setNewRol] = useState<UserRole>('cliente');
  const [newNotas, setNewNotas] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Modal para confirmar asignación/remoción de nivel
  const [pendingTierConfirm, setPendingTierConfirm] = useState<PendingTierConfirmation | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Cargar usuarios
  const fetchUsuarios = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch('/api/admin/usuarios');
      const json = await res.json();
      if (json.ok) {
        setUsuarios(json.usuarios || []);
      }
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchUsuarios();

    // Auto-refrescar cada 20 segundos para ver en tiempo real quién entra o sale
    const timer = setInterval(() => {
      fetchUsuarios(true);
    }, 20000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Formateador de presencia y actividad en tiempo real
  const formatActivity = (u: UsuarioAdminItem) => {
    if (u.en_linea) {
      return (
        <span className="online-presence-badge" title="Navegando el catálogo ahora mismo">
          <span className="dot-pulse-green"></span>
          <span>En línea</span>
        </span>
      );
    }

    if (!u.primer_login || !u.ultima_actividad) {
      return <span className="presence-never">— Sin ingresos</span>;
    }

    const date = new Date(u.ultima_actividad);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeAgo = '';
    if (diffMins < 1) timeAgo = 'Recién';
    else if (diffMins < 60) timeAgo = `Hace ${diffMins}m`;
    else if (diffHours < 24) timeAgo = `Hace ${diffHours}h`;
    else if (diffDays === 1) timeAgo = 'Ayer';
    else if (diffDays < 7) timeAgo = `Hace ${diffDays}d`;
    else timeAgo = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

    const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    return (
      <div className="activity-cell" title={`Última actividad: ${date.toLocaleString('es-AR')}`}>
        <span className="activity-time-ago">{timeAgo}</span>
        <span className="activity-time-exact">{timeStr}</span>
      </div>
    );
  };

  // Solicitar confirmación para modificar niveles de un usuario
  const onRequestToggleTier = (usuario: UsuarioAdminItem, tierInfo: { id: UserTier; label: string; color: string }) => {
    const isCurrentlyActive = usuario.niveles.includes(tierInfo.id);
    let updatedNiveles: UserTier[];

    if (isCurrentlyActive) {
      // Si ya tiene ese nivel, removerlo (pero no dejarlo vacío)
      updatedNiveles = usuario.niveles.filter((t) => t !== tierInfo.id);
      if (updatedNiveles.length === 0) {
        updatedNiveles = ['gold'];
      }
    } else {
      updatedNiveles = [...usuario.niveles, tierInfo.id];
    }

    setPendingTierConfirm({
      usuario,
      tier: tierInfo,
      isRemoving: isCurrentlyActive,
      resultingNiveles: updatedNiveles,
    });
  };

  // Confirmar y aplicar cambio de nivel vía PATCH
  const handleConfirmTierChange = async () => {
    if (!pendingTierConfirm) return;
    const { usuario, resultingNiveles } = pendingTierConfirm;

    // Actualización optimista local
    setUsuarios((prev) =>
      prev.map((u) => (u.email === usuario.email ? { ...u, niveles: resultingNiveles } : u))
    );

    try {
      setConfirmLoading(true);
      setActionLoading(usuario.email);
      await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: usuario.id,
          email: usuario.email,
          niveles: resultingNiveles,
        }),
      });
      setPendingTierConfirm(null);
    } catch (err) {
      console.error('Error al actualizar niveles:', err);
      fetchUsuarios();
    } finally {
      setConfirmLoading(false);
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

  const isSearching = search.trim().length > 0;

  // Métricas totales generales
  const totalStats = useMemo(() => {
    return {
      total: usuarios.length,
      activos: usuarios.filter((u) => u.estado === 'activo').length,
      pendientes: usuarios.filter((u) => u.estado === 'pendiente').length,
      inactivos: usuarios.filter((u) => u.estado === 'inactivo').length,
      en_linea: usuarios.filter((u) => u.en_linea).length,
    };
  }, [usuarios]);

  // Usuarios que coinciden con el término de búsqueda (independientemente de la pestaña)
  const searchMatchedUsers = useMemo(() => {
    if (!isSearching) return usuarios;
    const s = search.toLowerCase().trim();
    const cleanS = s.replace(/\D/g, '');

    return usuarios.filter((u) => {
      const emailMatch = u.email.toLowerCase().includes(s);
      const empresaMatch = (u.empresa || '').toLowerCase().includes(s);
      const nombreMatch = (u.nombre || '').toLowerCase().includes(s);
      const apellidoMatch = (u.apellido || '').toLowerCase().includes(s);
      const contactoMatch = (u.nombre_contacto || '').toLowerCase().includes(s);
      const fullName = `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase();
      const fullNameMatch = fullName.includes(s);
      const cuitClean = (u.cuit || '').replace(/\D/g, '');
      const cuitMatch = cleanS.length >= 3 && cuitClean.includes(cleanS);
      const notasMatch = (u.notas || '').toLowerCase().includes(s);

      return (
        emailMatch ||
        empresaMatch ||
        nombreMatch ||
        apellidoMatch ||
        contactoMatch ||
        fullNameMatch ||
        cuitMatch ||
        notasMatch
      );
    });
  }, [usuarios, search, isSearching]);

  // Métricas filtradas por el buscador
  const filteredStats = useMemo(() => {
    return {
      total: searchMatchedUsers.length,
      activos: searchMatchedUsers.filter((u) => u.estado === 'activo').length,
      pendientes: searchMatchedUsers.filter((u) => u.estado === 'pendiente').length,
      inactivos: searchMatchedUsers.filter((u) => u.estado === 'inactivo').length,
      en_linea: searchMatchedUsers.filter((u) => u.en_linea).length,
    };
  }, [searchMatchedUsers]);

  // Filtrado final considerando la pestaña seleccionada y ordenando
  const filteredUsers = useMemo(() => {
    const list = searchMatchedUsers.filter((u) => {
      // Filtro pestaña
      if (filterTab === 'en_linea' && !u.en_linea) return false;
      if (filterTab === 'pendientes' && u.estado !== 'pendiente') return false;
      if (filterTab === 'activos' && u.estado !== 'activo') return false;
      if (filterTab === 'inactivos' && u.estado !== 'inactivo') return false;
      return true;
    });

    // Ordenar usuarios "En línea" al principio
    return list.sort((a, b) => {
      if (a.en_linea && !b.en_linea) return -1;
      if (!a.en_linea && b.en_linea) return 1;
      return 0;
    });
  }, [searchMatchedUsers, filterTab]);

  // Renderizador de valores en las tarjetas métricas (soporta valor filtrado / total)
  const renderMetric = (filteredVal: number, totalVal: number) => {
    if (loading) return <span className="skeleton-shimmer skeleton-metric-val" />;
    if (isSearching) {
      return (
        <span className="metric-value-split" title={`${filteredVal} filtrados de ${totalVal} en total`}>
          <span className="metric-val-main">{filteredVal}</span>
          <span className="metric-val-total"> / {totalVal}</span>
        </span>
      );
    }
    return totalVal;
  };

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
              <p>Monitorea clientes en vivo, asigna niveles comerciales multinivel y aprueba nuevos registros.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-close-modal">
            ✕
          </button>
        </div>

        {/* Métricas rápidas */}
        <div className="admin-metrics-bar">
          <div
            className={`metric-card online ${filterTab === 'en_linea' ? 'selected' : ''}`}
            onClick={() => setFilterTab('en_linea')}
            title="Ver clientes navegando la lista de precios en este momento"
          >
            <span className="metric-label">🟢 En Línea Ahora</span>
            <span className="metric-value">
              {renderMetric(filteredStats.en_linea, totalStats.en_linea)}
            </span>
            {!loading && totalStats.en_linea > 0 && <span className="metric-pill-badge online-pill">En vivo</span>}
          </div>

          <div
            className={`metric-card ${filterTab === 'todos' ? 'selected' : ''}`}
            onClick={() => setFilterTab('todos')}
          >
            <span className="metric-label">Total Usuarios</span>
            <span className="metric-value">
              {renderMetric(filteredStats.total, totalStats.total)}
            </span>
          </div>

          <div
            className={`metric-card warning ${filterTab === 'pendientes' ? 'selected' : ''}`}
            onClick={() => setFilterTab('pendientes')}
          >
            <span className="metric-label">Pendientes</span>
            <span className="metric-value">
              {renderMetric(filteredStats.pendientes, totalStats.pendientes)}
            </span>
            {!loading && totalStats.pendientes > 0 && <span className="metric-pill-badge">Requiere acción</span>}
          </div>

          <div
            className={`metric-card success ${filterTab === 'activos' ? 'selected' : ''}`}
            onClick={() => setFilterTab('activos')}
          >
            <span className="metric-label">Activos</span>
            <span className="metric-value">
              {renderMetric(filteredStats.activos, totalStats.activos)}
            </span>
          </div>

          <div
            className={`metric-card muted ${filterTab === 'inactivos' ? 'selected' : ''}`}
            onClick={() => setFilterTab('inactivos')}
          >
            <span className="metric-label">Inactivos</span>
            <span className="metric-value">
              {renderMetric(filteredStats.inactivos, totalStats.inactivos)}
            </span>
          </div>
        </div>

        {/* Barra de Controles y Búsqueda */}
        <div className="admin-controls-bar">
          <div className="admin-search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar por correo, empresa, contacto o CUIT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {isSearching && (
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setSearch('')}
                title="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {isSearching && (
            <div className="search-feedback-indicator">
              <span>Filtrados:</span>
              <strong>{filteredUsers.length}</strong>
              <span>de {usuarios.length}</span>
            </div>
          )}

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
                    <th>Usuario / Empresa / Contacto</th>
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
                  <th>Usuario / Empresa / Contacto</th>
                  <th>Estado</th>
                  <th>Niveles Autorizados (Haz clic para alternar)</th>
                  <th>Primer Login</th>
                  <th>Actividad / Presencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = u.email === currentUserEmail.toLowerCase();
                  return (
                    <tr key={u.id} className={`admin-row-${u.estado}`}>
                      {/* Correo, Empresa, CUIT y Contacto */}
                      <td className="col-user-info">
                        <div className="user-email-wrap">
                          <span className="user-email-text">{u.email}</span>
                          {u.rol === 'admin' && <span className="badge-admin">ADMIN</span>}
                          {u.is_precargado && <span className="badge-precargado">Importado BQ</span>}
                        </div>

                        {u.empresa && (
                          <div className="user-company-badge-row">
                            <span className="user-company-badge">
                              <Building2 size={12} className="user-meta-icon" />
                              <span>{u.empresa}</span>
                            </span>
                            {u.cuit && (
                              <span className="user-cuit-pill">
                                CUIT: {u.cuit.length === 11 ? `${u.cuit.slice(0, 2)}-${u.cuit.slice(2, 10)}-${u.cuit.slice(10)}` : u.cuit}
                              </span>
                            )}
                          </div>
                        )}

                        {(u.nombre || u.apellido || u.nombre_contacto) && (
                          <div className="user-contact-badge-row">
                            <span className="user-contact-text">
                              <User size={11} className="user-meta-icon" />
                              {u.nombre && u.apellido
                                ? `${u.nombre} ${u.apellido}`
                                : u.nombre_contacto || u.nombre || u.apellido}
                            </span>
                          </div>
                        )}

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
                                onClick={() => onRequestToggleTier(u, tier)}
                                className={`btn-tier-chip ${tier.color} ${isAuthorized ? 'active' : 'inactive'}`}
                                title={isAuthorized ? `Habilitado (Clic para configurar/quitar)` : `Inactivo (Clic para autorizar nivel)`}
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
                      <td className="col-date col-presence">
                        {formatActivity(u)}
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

        {/* Modal de confirmación para asignar o remover nivel de precios */}
        {pendingTierConfirm && (
          <div
            className="confirm-tier-overlay"
            onClick={() => !confirmLoading && setPendingTierConfirm(null)}
          >
            <div className="confirm-tier-card" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="confirm-tier-header">
                <div
                  className={`confirm-tier-icon-wrap ${
                    pendingTierConfirm.isRemoving ? 'remove' : 'add'
                  }`}
                >
                  <ShieldAlert size={22} />
                </div>
                <div className="confirm-tier-title-wrap">
                  <h3>
                    {pendingTierConfirm.isRemoving
                      ? '¿Confirmas quitar este nivel de precios?'
                      : '¿Confirmas asignar este nivel de precios?'}
                  </h3>
                  <p>Verifica los datos del cliente antes de aplicar los permisos comerciales.</p>
                </div>
                <button
                  type="button"
                  className="btn-close-confirm"
                  onClick={() => setPendingTierConfirm(null)}
                  disabled={confirmLoading}
                >
                  ✕
                </button>
              </div>

              {/* Ficha de Datos del Cliente */}
              <div className="confirm-tier-user-box">
                <div className="confirm-user-header-row">
                  <span className="confirm-user-email">{pendingTierConfirm.usuario.email}</span>
                  <span className={`status-pill ${pendingTierConfirm.usuario.estado}`}>
                    {pendingTierConfirm.usuario.estado === 'activo'
                      ? '● Activo'
                      : pendingTierConfirm.usuario.estado === 'pendiente'
                      ? '⏳ En Revisión'
                      : '✕ Inactivo'}
                  </span>
                </div>

                {pendingTierConfirm.usuario.empresa && (
                  <div className="confirm-user-meta-row">
                    <span className="confirm-meta-label">Empresa:</span>
                    <span className="confirm-meta-value company">
                      🏢 {pendingTierConfirm.usuario.empresa}
                    </span>
                    {pendingTierConfirm.usuario.cuit && (
                      <span className="user-cuit-pill">
                        CUIT:{' '}
                        {pendingTierConfirm.usuario.cuit.length === 11
                          ? `${pendingTierConfirm.usuario.cuit.slice(0, 2)}-${pendingTierConfirm.usuario.cuit.slice(2, 10)}-${pendingTierConfirm.usuario.cuit.slice(10)}`
                          : pendingTierConfirm.usuario.cuit}
                      </span>
                    )}
                  </div>
                )}

                {(pendingTierConfirm.usuario.nombre ||
                  pendingTierConfirm.usuario.apellido ||
                  pendingTierConfirm.usuario.nombre_contacto) && (
                  <div className="confirm-user-meta-row">
                    <span className="confirm-meta-label">Contacto:</span>
                    <span className="confirm-meta-value">
                      👤{' '}
                      {pendingTierConfirm.usuario.nombre && pendingTierConfirm.usuario.apellido
                        ? `${pendingTierConfirm.usuario.nombre} ${pendingTierConfirm.usuario.apellido}`
                        : pendingTierConfirm.usuario.nombre_contacto ||
                          pendingTierConfirm.usuario.nombre ||
                          pendingTierConfirm.usuario.apellido}
                    </span>
                  </div>
                )}
              </div>

              {/* Detalle de la Acción Destacada */}
              <div
                className={`confirm-tier-action-highlight ${
                  pendingTierConfirm.isRemoving ? 'remove' : 'add'
                }`}
              >
                <div className="action-highlight-top">
                  <span className="action-highlight-title">
                    {pendingTierConfirm.isRemoving ? 'Nivel a quitar:' : 'Nivel a habilitar:'}
                  </span>
                  <span className={`tier-badge-highlight ${pendingTierConfirm.tier.color}`}>
                    {pendingTierConfirm.tier.label}
                  </span>
                </div>
                <p className="action-highlight-desc">
                  {pendingTierConfirm.isRemoving
                    ? 'El cliente ya no podrá alternar a este nivel ni ver los precios asignados correspondientes.'
                    : 'El cliente podrá alternar de inmediato a este nivel en su catálogo para ver stock y precios oficiales.'}
                </p>
              </div>

              {/* Comparativa de Niveles: Antes y Después */}
              <div className="confirm-tier-comparison">
                <div className="comparison-col">
                  <span className="comparison-label">Niveles actuales:</span>
                  <div className="tiers-chips-mini">
                    {pendingTierConfirm.usuario.niveles.map((lvl) => {
                      const tInfo = ALL_TIERS.find((t) => t.id === lvl);
                      return (
                        <span key={lvl} className={`mini-tier-badge ${tInfo?.color || 'tier-gold'}`}>
                          {lvl.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="comparison-arrow">➔</div>

                <div className="comparison-col">
                  <span className="comparison-label">Niveles resultantes:</span>
                  <div className="tiers-chips-mini">
                    {pendingTierConfirm.resultingNiveles.map((lvl) => {
                      const tInfo = ALL_TIERS.find((t) => t.id === lvl);
                      const isTarget = lvl === pendingTierConfirm.tier.id;
                      return (
                        <span
                          key={lvl}
                          className={`mini-tier-badge ${tInfo?.color || 'tier-gold'} ${
                            isTarget && !pendingTierConfirm.isRemoving ? 'just-added' : ''
                          }`}
                        >
                          {lvl.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="confirm-tier-footer">
                <button
                  type="button"
                  onClick={() => setPendingTierConfirm(null)}
                  disabled={confirmLoading}
                  className="btn-cancel-confirm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmTierChange}
                  disabled={confirmLoading}
                  className={`btn-confirm-action ${
                    pendingTierConfirm.isRemoving ? 'btn-danger' : 'btn-primary'
                  }`}
                >
                  {confirmLoading ? (
                    'Guardando...'
                  ) : pendingTierConfirm.isRemoving ? (
                    `Confirmar y Quitar ${pendingTierConfirm.tier.label}`
                  ) : (
                    `Confirmar y Asignar ${pendingTierConfirm.tier.label}`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
