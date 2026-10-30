'use client';

import React from 'react';
import { CatalogoFilters, Producto, UserTier } from '@/types';
import {
  Search,
  Download,
  CheckSquare,
  Square,
  X,
  Filter,
  LayoutGrid,
  Table as TableIcon,
  Flame,
  Sparkles,
  Package,
  Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface FiltersBarProps {
  filters: CatalogoFilters;
  onChangeFilters: (newFilters: CatalogoFilters) => void;
  categories: string[];
  subcategories: string[];
  totalHits: number;
  selectedCount: number;
  allProducts: Producto[];
  filteredProducts: Producto[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  tier: UserTier;
  onOpenSidebar?: () => void;
}

export const FiltersBar: React.FC<FiltersBarProps> = ({
  filters,
  onChangeFilters,
  categories,
  subcategories,
  totalHits,
  selectedCount,
  allProducts,
  filteredProducts,
  onSelectAll,
  onDeselectAll,
  tier,
  onOpenSidebar,
}) => {
  const handleExportExcel = () => {
    const itemsToExport = selectedCount > 0
      ? allProducts.filter((p) => p._selected)
      : filteredProducts;

    if (itemsToExport.length === 0) {
      alert('No hay productos para exportar.');
      return;
    }

    const exportRows = itemsToExport.map((p) => {
      const row: Record<string, string | number> = {
        'Marca': p.marca,
        'SAP / Hik Code': p.sap || '',
        'Modelo': p.modelo,
        'Descripción': p.descripcion || '',
        'Categoría': p.categoria || '',
        'Subcategoría': p.subcategoria || '',
        'Stock': p.stock,
        'En Tránsito': p.en_transito ? 'Sí' : 'No',
        'Precio Principal': p.precio_principal ? `$${p.precio_principal.toFixed(2)}` : '',
        'Nivel': p.label_precio_principal || '',
      };

      if (['diamond', 'black', 'interna'].includes(tier) && p.precio_black !== undefined) {
        row['Precio Black'] = p.precio_black ? `$${p.precio_black.toFixed(2)}` : '';
      }
      if (['diamond', 'black', 'ruby', 'interna'].includes(tier) && p.precio_ruby !== undefined) {
        row['Precio Ruby'] = p.precio_ruby ? `$${p.precio_ruby.toFixed(2)}` : '';
      }
      if (['diamond', 'interna'].includes(tier) && p.precio_diamond !== undefined) {
        row['Precio Diamond'] = p.precio_diamond ? `$${p.precio_diamond.toFixed(2)}` : '';
      }
      if (['platinum', 'interna'].includes(tier) && p.precio_platinum !== undefined) {
        row['Precio Platinum'] = p.precio_platinum ? `$${p.precio_platinum.toFixed(2)}` : '';
      }
      if (p.precio_gold !== undefined) {
        row['Precio Gold Gremio'] = p.precio_gold ? `$${p.precio_gold.toFixed(2)}` : '';
      }
      if (p.pvp !== undefined) {
        row['PVP'] = p.pvp ? `$${p.pvp.toFixed(2)}` : '';
      }
      if (tier !== 'gold' && p.epp !== undefined) {
        row['EPP'] = p.epp ? `$${p.epp.toFixed(2)}` : '';
      }
      if (p.iva !== undefined) {
        row['IVA'] = `${(p.iva * 100).toFixed(1)}%`;
      }
      if (tier === 'interna' && p.cod_bejerman) {
        row['Cód Bejerman'] = p.cod_bejerman;
      }
      if (tier === 'interna' && p.oferta_txt) {
        row['Detalle Oferta'] = p.oferta_txt;
      }

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lista de Precios');

    const filename = `Selnet_${tier.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  const handleClear = () => {
    onChangeFilters({
      search: '',
      marca: null,
      categoria: null,
      subcategoria: null,
      soloStock: false,
      soloOfertas: false,
      soloNuevos: false,
    });
  };

  const hasActiveFilters =
    Boolean(filters.search.trim()) ||
    Boolean(filters.marca) ||
    Boolean(filters.categoria) ||
    Boolean(filters.subcategoria) ||
    filters.soloStock ||
    filters.soloOfertas ||
    filters.soloNuevos;

  return (
    <div className="filters-bar">
      {/* Search and Brand row */}
      <div className="filters-main-row">
        {/* Buscador */}
        <div className="search-box">
          <Search className="search-icon" size={16} />
          <input
            type="text"
            placeholder="Buscar por modelo, descripción, SAP..."
            value={filters.search}
            onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
          />
          {filters.search && (
            <button
              className="search-clear-btn"
              onClick={() => onChangeFilters({ ...filters, search: '' })}
              title="Borrar búsqueda"
              aria-label="Borrar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Brand Chip / Button on Mobile */}
        {filters.marca ? (
          <div className="active-brand-chip">
            <span className="brand-chip-label" onClick={onOpenSidebar} title="Cambiar marca">
              <Layers size={13} />
              <span>{filters.marca}</span>
            </span>
            <button
              className="brand-chip-close"
              onClick={() => onChangeFilters({ ...filters, marca: null, categoria: null, subcategoria: null })}
              title="Quitar filtro de marca"
              aria-label="Quitar filtro de marca"
            >
              <X size={13} />
            </button>
          </div>
        ) : onOpenSidebar ? (
          <button
            className="btn btn-outline mobile-filter-brand-btn"
            onClick={onOpenSidebar}
            title="Filtrar por marca"
          >
            <Layers size={14} />
            <span>Marcas</span>
          </button>
        ) : null}
      </div>

      {/* Selects & Toggles row */}
      <div className="filters-secondary-row">
        {/* Dropdowns de categoría */}
        <div className="dropdowns-group">
          <select
            className="select-input"
            value={filters.categoria || ''}
            onChange={(e) =>
              onChangeFilters({
                ...filters,
                categoria: e.target.value || null,
                subcategoria: null,
              })
            }
          >
            <option value="">Todas las Categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {subcategories.length > 0 && (
            <select
              className="select-input"
              value={filters.subcategoria || ''}
              onChange={(e) =>
                onChangeFilters({ ...filters, subcategoria: e.target.value || null })
              }
            >
              <option value="">Todas las Subcategorías</option>
              {subcategories.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Quick Chip Toggles */}
        <div className="chip-toggles-group">
          <button
            type="button"
            className={`filter-chip ${filters.soloStock ? 'active' : ''}`}
            onClick={() => onChangeFilters({ ...filters, soloStock: !filters.soloStock })}
          >
            <Package size={13} />
            <span>En Stock</span>
          </button>

          <button
            type="button"
            className={`filter-chip ${filters.soloOfertas ? 'active' : ''}`}
            onClick={() => onChangeFilters({ ...filters, soloOfertas: !filters.soloOfertas })}
          >
            <Flame size={13} />
            <span>Ofertas</span>
          </button>

          <button
            type="button"
            className={`filter-chip ${filters.soloNuevos ? 'active' : ''}`}
            onClick={() => onChangeFilters({ ...filters, soloNuevos: !filters.soloNuevos })}
          >
            <Sparkles size={13} />
            <span>Nuevos</span>
          </button>
        </div>
      </div>

      {/* Actions and counters bottom row */}
      <div className="filters-actions-row">
        {/* Contadores */}
        <div className="hits-counter">
          <span>
            Filas: <strong>{totalHits.toLocaleString()}</strong>
          </span>
          {selectedCount > 0 && (
            <span className="selected-badge">
              ({selectedCount} sel.)
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="actions-group">
          {/* Selección múltiple */}
          <button
            type="button"
            className="btn btn-icon"
            onClick={onSelectAll}
            title="Seleccionar todos los visibles"
            aria-label="Seleccionar todos"
          >
            <CheckSquare size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={onDeselectAll}
            title="Deseleccionar todos"
            aria-label="Deseleccionar todos"
          >
            <Square size={15} />
          </button>

          {/* Limpiar */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-icon"
              onClick={handleClear}
              title="Restablecer todos los filtros"
              aria-label="Limpiar filtros"
            >
              <X size={15} />
            </button>
          )}

          {/* Exportar a Excel */}
          <button
            type="button"
            className="btn btn-success export-btn"
            onClick={handleExportExcel}
            title="Descargar tabla en formato Excel (.xlsx)"
          >
            <Download size={14} />
            <span className="export-text">Exportar Excel</span>
            <span className="export-text-mobile">Excel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
