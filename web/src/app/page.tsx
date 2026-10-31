'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Producto, UserTier, CatalogoFilters, SortConfig } from '@/types';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { FiltersBar } from '@/components/FiltersBar';
import { ProductTable } from '@/components/ProductTable';
import AuthScreen from '@/components/AuthScreen';
import OnboardingScreen from '@/components/OnboardingScreen';
import AdminAccessModal from '@/components/AdminAccessModal';
import { AppSkeleton } from '@/components/AppSkeleton';
import { ProductTableSkeleton } from '@/components/ProductTableSkeleton';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauthenticated' | 'pending_approval' | 'ready'>('checking');
  const [products, setProducts] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTier, setUserTier] = useState<UserTier>('gold');
  const [authorizedTiers, setAuthorizedTiers] = useState<UserTier[]>(['gold']);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  const [filters, setFilters] = useState<CatalogoFilters>({
    search: '',
    marca: null,
    categoria: null,
    subcategoria: null,
    soloStock: false,
    soloOfertas: false,
    soloNuevos: false,
  });

  const [sort, setSort] = useState<SortConfig>({
    key: 'modelo',
    direction: 'asc',
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const supabase = createClient();

  // Función para cargar catálogo para un nivel específico
  const loadCatalogo = useCallback(async (tierToLoad?: UserTier) => {
    try {
      setLoading(true);
      const url = tierToLoad ? `/api/catalogo?tier=${tierToLoad}` : '/api/catalogo';
      const res = await fetch(url);
      const json = await res.json();

      if (json.require_auth) {
        setAuthStatus('unauthenticated');
        return;
      }

      if (json.estado === 'pendiente') {
        setAuthStatus('pending_approval');
        return;
      }

      if (json.ok) {
        setProducts((json.data || []).map((p: Producto) => ({ ...p, _selected: false })));
        if (json.tier) setUserTier(json.tier);
        if (json.niveles) setAuthorizedTiers(json.niveles);
        if (json.isAdmin !== undefined) setIsAdmin(json.isAdmin);
        if (json.email) setUserEmail(json.email);
        setAuthStatus('ready');
      }
    } catch (err) {
      console.error('Error al cargar catálogo:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Verificar sesión y perfil de usuario
  const checkAuth = useCallback(async () => {
    try {
      setAuthStatus('checking');
      const res = await fetch('/api/auth/me');
      const json = await res.json();

      if (!json.authenticated) {
        setAuthStatus('unauthenticated');
        return;
      }

      const u = json.user;
      setUserEmail(u.email);

      if (u.estado === 'pendiente') {
        setAuthStatus('pending_approval');
        return;
      }

      const isUserAdmin = u.rol === 'admin' || u.email === 'canderocioaranda.selnet@gmail.com';
      setIsAdmin(isUserAdmin);

      const tiers: UserTier[] = isUserAdmin
        ? ['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']
        : (u.niveles && u.niveles.length > 0 ? u.niveles : ['gold']);

      setAuthorizedTiers(tiers);
      const activeTier: UserTier = u.nivel_activo || tiers[0] || 'gold';
      setUserTier(activeTier);
      setAuthStatus('ready');

      // Cargar productos
      loadCatalogo(activeTier);
    } catch (err) {
      console.error('Error en checkAuth:', err);
      setAuthStatus('unauthenticated');
    }
  }, [loadCatalogo]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Cambiar entre los niveles autorizados
  const handleSwitchTier = async (newTier: UserTier) => {
    setUserTier(newTier);
    loadCatalogo(newTier);

    // Persistir nivel activo en Supabase
    try {
      await fetch('/api/auth/switch-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: newTier }),
      });
    } catch (e) {
      console.warn('Error al guardar switch-tier:', e);
    }
  };

  // Cerrar Sesión
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserEmail('');
    setIsAdmin(false);
    setProducts([]);
    setAuthStatus('unauthenticated');
  };

  // Marcas y conteos
  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      counts[p.marca] = (counts[p.marca] || 0) + 1;
    });
    return counts;
  }, [products]);

  // Categorías disponibles según la marca seleccionada
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (!filters.marca || p.marca === filters.marca) {
        if (p.categoria) set.add(p.categoria);
      }
    });
    return Array.from(set).sort();
  }, [products, filters.marca]);

  // Subcategorías disponibles según la categoría seleccionada
  const subcategories = useMemo(() => {
    if (!filters.categoria) return [];
    const set = new Set<string>();
    products.forEach((p) => {
      if ((!filters.marca || p.marca === filters.marca) && p.categoria === filters.categoria) {
        if (p.subcategoria) set.add(p.subcategoria);
      }
    });
    return Array.from(set).sort();
  }, [products, filters.marca, filters.categoria]);

  // Filtrado reactivo en memoria
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (filters.marca && p.marca !== filters.marca) return false;
      if (filters.categoria && p.categoria !== filters.categoria) return false;
      if (filters.subcategoria && p.subcategoria !== filters.subcategoria) return false;
      if (filters.soloStock && p.stock <= 0) return false;
      if (filters.soloOfertas && !p.es_oferta) return false;
      if (filters.soloNuevos && !p.es_nuevo) return false;

      if (filters.search.trim()) {
        const q = filters.search.toLowerCase().trim();
        const inModelo = p.modelo.toLowerCase().includes(q);
        const inDesc = p.descripcion?.toLowerCase().includes(q) || false;
        const inSap = p.sap?.toLowerCase().includes(q) || false;
        const inBej = p.cod_bejerman?.toLowerCase().includes(q) || false;
        const inMarca = p.marca.toLowerCase().includes(q);
        if (!inModelo && !inDesc && !inSap && !inBej && !inMarca) return false;
      }

      return true;
    });
  }, [products, filters]);

  // Ordenamiento
  const sortedProducts = useMemo(() => {
    if (sort.direction === 'none') return filteredProducts;
    return [...filteredProducts].sort((a, b) => {
      let valA = a[sort.key as keyof Producto];
      let valB = b[sort.key as keyof Producto];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sort.direction === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sort.direction === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredProducts, sort]);

  const handleSort = (key: keyof Producto | 'precio_principal') => {
    setSort((prev) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return { key, direction: 'none' };
        return { key, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleToggleSelect = (id: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, _selected: !p._selected } : p))
    );
  };

  const handleSelectAll = () => {
    const visibleIds = new Set(filteredProducts.map((p) => p.id));
    setProducts((prev) =>
      prev.map((p) => (visibleIds.has(p.id) ? { ...p, _selected: true } : p))
    );
  };

  const handleDeselectAll = () => {
    setProducts((prev) => prev.map((p) => ({ ...p, _selected: false })));
  };

  const selectedCount = products.filter((p) => p._selected).length;

  // 1. Pantalla de carga inicial (Skeleton completo)
  if (authStatus === 'checking') {
    return <AppSkeleton />;
  }

  // 2. Pantalla de Autenticación (si no está logueado)
  if (authStatus === 'unauthenticated') {
    return <AuthScreen onSuccess={checkAuth} />;
  }

  // 3. Pantalla de Onboarding (si está registrado pero pendiente de asignación de nivel)
  if (authStatus === 'pending_approval') {
    return <OnboardingScreen userEmail={userEmail} onRefresh={checkAuth} />;
  }

  // 4. Portal Principal (Usuario activo con niveles autorizados)
  return (
    <div className="main-wrapper">
      {/* Header Corporativo */}
      <Header
        onLogout={handleLogout}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        selectedMarca={filters.marca}
      />

      {/* Selector Dinámico de Niveles Autorizados */}
      <div className="demo-tier-bar">
        <div className="tier-selector-group">
          <span className="demo-label">Nivel de Precios:</span>
          <div className="tier-chips-scroll">
            {authorizedTiers.map((t) => (
              <button
                key={t}
                onClick={() => handleSwitchTier(t)}
                className={`demo-tier-btn ${userTier === t ? 'active' : ''}`}
                title={`Ver precios correspondientes a nivel ${t.toUpperCase()}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cuerpo principal con Sidebar y Tabla de Productos */}
      <div className="app-container">
        <Sidebar
          selectedMarca={filters.marca}
          onSelectMarca={(m) => setFilters((prev) => ({ ...prev, marca: m, categoria: null, subcategoria: null }))}
          brandCounts={brandCounts}
          tier={userTier}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          userEmail={userEmail}
          isAdmin={isAdmin}
          onOpenAdmin={() => setIsAdminModalOpen(true)}
          onLogout={handleLogout}
        />

        <main className="main-content">
          <FiltersBar
            filters={filters}
            onChangeFilters={setFilters}
            categories={categories}
            subcategories={subcategories}
            totalHits={filteredProducts.length}
            selectedCount={selectedCount}
            allProducts={products}
            filteredProducts={filteredProducts}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            tier={userTier}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />

          {loading ? (
            <ProductTableSkeleton tier={userTier} rowCount={14} />
          ) : (
            <ProductTable
              products={sortedProducts}
              tier={userTier}
              sort={sort}
              onSort={handleSort}
              onToggleSelect={handleToggleSelect}
            />
          )}
        </main>
      </div>

      {/* Modal de Gestión Centralizada de Accesos (Solo para Admins) */}
      {isAdmin && (
        <AdminAccessModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          currentUserEmail={userEmail}
        />
      )}
    </div>
  );
}
