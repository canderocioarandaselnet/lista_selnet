'use client';

import React from 'react';
import { CatalogoFilters, Producto, UserTier } from '@/types';
import { Search, Download, CheckSquare, Square, X, Filter } from 'lucide-react';
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
}) => {
  const handleExportExcel = () => {
    // Si hay seleccionados exporta los seleccionados, sino exporta todos los filtrados
    const itemsToExport = selectedCount > 0
      ? allProducts.filter(p => p._selected)
      : filteredProducts;

    if (itemsToExport.length === 0) {
      alert('No hay productos para exportar.');
      return;
    }

    const exportRows = itemsToExport.map(p => {
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

      // Columnas extras según Tier
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
      marca: filters.marca, // mantiene la marca activa del sidebar
      categoria: null,
      subcategoria: null,
      soloStock: false,
      soloOfertas: false,
      soloNuevos: false,
    });
  };

  return (
    <div className="filters-bar">
      <div className="filters-left">
        {/* Buscador */}
        <div className="search-box">
          <Search className="search-icon" size={16} />
          <input
            type="text"
            placeholder="Buscar por modelo, descripción, SAP..."
            value={filters.search}
            onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
          />
        </div>

        {/* Filtro Categoría */}
        <select
          className="select-input"
          value={filters.categoria || ''}
          onChange={(e) => onChangeFilters({
            ...filters,
            categoria: e.target.value || null,
            subcategoria: null // reset subcategoría al cambiar categoría
          })}
        >
          <option value="">Todas las Categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Filtro Subcategoría */}
        {subcategories.length > 0 && (
          <select
            className="select-input"
            value={filters.subcategoria || ''}
            onChange={(e) => onChangeFilters({ ...filters, subcategoria: e.target.value || null })}
          >
            <option value="">Todas las Subcategorías</option>
            {subcategories.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Quick Toggles */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={filters.soloStock}
            onChange={(e) => onChangeFilters({ ...filters, soloStock: e.target.checked })}
          />
          En Stock
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={filters.soloOfertas}
            onChange={(e) => onChangeFilters({ ...filters, soloOfertas: e.target.checked })}
          />
          Ofertas
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={filters.soloNuevos}
            onChange={(e) => onChangeFilters({ ...filters, soloNuevos: e.target.checked })}
          />
          Nuevos
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Contadores */}
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
          Filas: <strong style={{ color: 'var(--text-main)' }}>{totalHits}</strong>
          {selectedCount > 0 && (
            <span style={{ marginLeft: '6px', color: '#60a5fa' }}>
              ({selectedCount} seleccionados)
            </span>
          )}
        </div>

        {/* Selección múltiple */}
        <button
          className="btn"
          onClick={onSelectAll}
          title="Seleccionar todos los visibles"
          style={{ padding: '6px 10px' }}
        >
          <CheckSquare size={15} />
        </button>
        <button
          className="btn"
          onClick={onDeselectAll}
          title="Deseleccionar todos"
          style={{ padding: '6px 10px' }}
        >
          <Square size={15} />
        </button>

        {/* Limpiar */}
        <button
          className="btn"
          onClick={handleClear}
          title="Limpiar filtros"
          style={{ padding: '6px 10px' }}
        >
          <X size={15} />
        </button>

        {/* Exportar a Excel */}
        <button
          className="btn btn-success"
          onClick={handleExportExcel}
          title="Descargar tabla en formato Excel (.xlsx)"
        >
          <Download size={15} />
          <span>Exportar Excel</span>
        </button>
      </div>
    </div>
  );
};
