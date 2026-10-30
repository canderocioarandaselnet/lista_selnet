'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Producto, UserTier, CatalogoFilters, SortConfig } from '@/types';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { FiltersBar } from '@/components/FiltersBar';
import { ProductTable } from '@/components/ProductTable';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const [products, setProducts] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTier, setUserTier] = useState<UserTier>('gold');
  const [userEmail, setUserEmail] = useState<string>('usuario@selnet.com.ar');

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

  // Cargar catálogo inicial desde el API
  useEffect(() => {
    async function loadCatalogo() {
      try {
        setLoading(true);
        const res = await fetch('/api/catalogo');
        const json = await res.json();
        if (json.ok) {
          setProducts((json.data || []).map((p: Producto) => ({ ...p, _selected: false })));
          if (json.tier) setUserTier(json.tier);
          if (json.email) setUserEmail(json.email);
        }
      } catch (err) {
        console.error('Error al cargar catálogo:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCatalogo();
  }, []);

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
      // Filtro marca
      if (filters.marca && p.marca !== filters.marca) return false;
      // Filtro categoría
      if (filters.categoria && p.categoria !== filters.categoria) return false;
      // Filtro subcategoría
      if (filters.subcategoria && p.subcategoria !== filters.subcategoria) return false;
      // Solo en stock
      if (filters.soloStock && p.stock <= 0) return false;
      // Solo ofertas
      if (filters.soloOfertas && !p.es_oferta) return false;
      // Solo nuevos
      if (filters.soloNuevos && !p.es_nuevo) return false;

      // Búsqueda de texto
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

  // Manejo de ordenamiento
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

  // Manejo de selecciones
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

  return (
    <div className="main-wrapper">
      {/* Header */}
      <Header
        email={userEmail}
        tier={userTier}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        selectedMarca={filters.marca}
      />

      {/* Selector de Nivel de Prueba / Demo */}
      <div className="demo-tier-bar">
        <div className="tier-selector-group">
          <span className="demo-label">Nivel:</span>
          <div className="tier-chips-scroll">
            {(['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna'] as UserTier[]).map((t) => (
              <button
                key={t}
                onClick={() => setUserTier(t)}
                className={`demo-tier-btn ${userTier === t ? 'active' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="demo-arch-info">
          <span>Supabase + Vercel | BigQuery Live</span>
        </div>
      </div>

      {/* Cuerpo principal con Sidebar y Tabla/Cards */}
      <div className="app-container">
        <Sidebar
          selectedMarca={filters.marca}
          onSelectMarca={(m) => setFilters((prev) => ({ ...prev, marca: m, categoria: null, subcategoria: null }))}
          brandCounts={brandCounts}
          tier={userTier}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
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
            <div className="loading-state">
              <Loader2 className="animate-spin" size={32} color="var(--primary)" />
              <span>Cargando catálogo en tiempo real...</span>
            </div>
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
    </div>
  );
}
