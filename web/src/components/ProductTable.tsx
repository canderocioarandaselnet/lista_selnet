'use client';

import React from 'react';
import { Producto, SortConfig, UserTier } from '@/types';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Package,
  Plane,
  Flame,
  Sparkles,
} from 'lucide-react';

interface ProductTableProps {
  products: Producto[];
  tier: UserTier;
  sort: SortConfig;
  onSort: (key: keyof Producto | 'precio_principal') => void;
  onToggleSelect: (id: number) => void;
}

export const ProductTable: React.FC<ProductTableProps> = ({
  products,
  tier,
  sort,
  onSort,
  onToggleSelect,
}) => {
  const renderSortIcon = (key: keyof Producto | 'precio_principal') => {
    if (sort.key !== key || sort.direction === 'none') {
      return <ArrowUpDown size={11} className="sort-icon-inactive" />;
    }
    return sort.direction === 'asc' ? (
      <ArrowUp size={12} className="sort-icon-active" />
    ) : (
      <ArrowDown size={12} className="sort-icon-active" />
    );
  };

  const formatPrice = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return '-';
    return `$${val.toFixed(2)}`;
  };

  return (
    <div className="table-container">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {/* Checkbox column - Sticky left */}
              <th className="col-sticky col-check" style={{ width: '44px', textAlign: 'center' }}>
                <span className="sr-only">Seleccionar</span>
              </th>

              {/* Modelo column - Sticky next to checkbox */}
              <th
                className="sortable col-sticky col-modelo"
                onClick={() => onSort('modelo')}
                style={{ minWidth: '200px' }}
              >
                <span className="th-content">
                  Modelo {renderSortIcon('modelo')}
                </span>
              </th>

              {/* Marca */}
              <th className="sortable" onClick={() => onSort('marca')} style={{ width: '110px' }}>
                <span className="th-content">
                  Marca {renderSortIcon('marca')}
                </span>
              </th>

              {/* SAP Code */}
              <th className="sortable" onClick={() => onSort('sap')} style={{ width: '120px' }}>
                <span className="th-content">
                  SAP {renderSortIcon('sap')}
                </span>
              </th>

              {/* Cod Bejerman (solo tier interna) */}
              {tier === 'interna' && (
                <th className="sortable" onClick={() => onSort('cod_bejerman')} style={{ width: '130px' }}>
                  <span className="th-content">
                    Bejerman {renderSortIcon('cod_bejerman')}
                  </span>
                </th>
              )}

              {/* Stock */}
              <th className="sortable" onClick={() => onSort('stock')} style={{ width: '95px' }}>
                <span className="th-content">
                  Stock {renderSortIcon('stock')}
                </span>
              </th>

              {/* Tu Precio (Tier Destacado) */}
              <th
                className="sortable col-price-featured"
                onClick={() => onSort('precio_principal')}
                style={{ width: '135px' }}
              >
                <span className="th-content">
                  Tu Precio ({tier.toUpperCase()}) {renderSortIcon('precio_principal')}
                </span>
              </th>

              {/* Precios adicionales según Tier */}
              {['diamond', 'black', 'interna'].includes(tier) && (
                <th style={{ width: '100px' }}>Black</th>
              )}
              {['diamond', 'black', 'ruby', 'interna'].includes(tier) && (
                <th style={{ width: '100px' }}>Ruby</th>
              )}
              {['platinum', 'interna'].includes(tier) && (
                <th style={{ width: '100px' }}>Platinum</th>
              )}
              {tier === 'interna' && (
                <th style={{ width: '100px' }}>Diamond</th>
              )}

              {/* Precios Base */}
              <th style={{ width: '100px' }}>Gremio</th>
              <th style={{ width: '100px' }}>PVP Sug.</th>
              {tier !== 'gold' && <th style={{ width: '90px' }}>EPP</th>}
              <th style={{ width: '80px' }}>IVA</th>

              {/* Categoría y Subcategoría */}
              <th className="sortable" onClick={() => onSort('categoria')} style={{ width: '130px' }}>
                <span className="th-content">
                  Categoría {renderSortIcon('categoria')}
                </span>
              </th>
              <th className="sortable" onClick={() => onSort('subcategoria')} style={{ width: '130px' }}>
                <span className="th-content">
                  Subcategoría {renderSortIcon('subcategoria')}
                </span>
              </th>

              {/* Descripción */}
              <th style={{ minWidth: '320px' }}>Descripción</th>

              {/* Tránsito */}
              <th style={{ width: '90px', textAlign: 'center' }}>Tránsito</th>

              {/* Detalle Oferta (solo interna) */}
              {tier === 'interna' && <th style={{ width: '150px' }}>Oferta Detalle</th>}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={18} className="empty-cell">
                  <div className="empty-table-wrap">
                    <Package size={36} className="empty-icon" />
                    <p>No se encontraron productos con los filtros seleccionados.</p>
                  </div>
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={`${p.marca}-${p.modelo}-${p.id}`} className={p._selected ? 'row-selected' : ''}>
                  {/* Checkbox - Sticky left */}
                  <td className="col-sticky col-check" style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!p._selected}
                      onChange={() => onToggleSelect(p.id)}
                      className="table-checkbox"
                      aria-label={`Seleccionar ${p.modelo}`}
                    />
                  </td>

                  {/* Modelo + Badges - Sticky */}
                  <td className="col-sticky col-modelo">
                    <div className="modelo-cell-wrap">
                      <span className="modelo-text">{p.modelo}</span>
                      <div className="modelo-micro-badges">
                        {p.es_nuevo && (
                          <span className="badge-micro badge-micro-new" title="Producto Nuevo">
                            <Sparkles size={10} /> Nuevo
                          </span>
                        )}
                        {p.es_oferta && (
                          <span className="badge-micro badge-micro-offer" title="Precio Oferta">
                            <Flame size={10} /> Oferta
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Marca */}
                  <td>
                    <span className="brand-tag">
                      {p.marca}
                    </span>
                  </td>

                  {/* SAP */}
                  <td>
                    <span className="code-text sap-code">
                      {p.sap || '—'}
                    </span>
                  </td>

                  {/* Cod Bejerman */}
                  {tier === 'interna' && (
                    <td>
                      <span className="code-text bejerman-code">
                        {p.cod_bejerman || '—'}
                      </span>
                    </td>
                  )}

                  {/* Stock */}
                  <td>
                    {p.stock > 0 ? (
                      <span className="stock-pill stock-available">
                        <span className="stock-dot-pulse"></span>
                        {p.stock}
                      </span>
                    ) : (
                      <span className="stock-pill stock-none">0</span>
                    )}
                  </td>

                  {/* Tu Precio (Tier Destacado) */}
                  <td className="col-price-featured">
                    <span className="featured-price-badge">
                      {formatPrice(p.precio_principal)}
                    </span>
                  </td>

                  {/* Precios adicionales de Tiers */}
                  {['diamond', 'black', 'interna'].includes(tier) && (
                    <td className="price-cell price-secondary">{formatPrice(p.precio_black)}</td>
                  )}
                  {['diamond', 'black', 'ruby', 'interna'].includes(tier) && (
                    <td className="price-cell price-secondary">{formatPrice(p.precio_ruby)}</td>
                  )}
                  {['platinum', 'interna'].includes(tier) && (
                    <td className="price-cell price-secondary">{formatPrice(p.precio_platinum)}</td>
                  )}
                  {tier === 'interna' && (
                    <td className="price-cell price-secondary">{formatPrice(p.precio_diamond)}</td>
                  )}

                  {/* Precios Base */}
                  <td className="price-cell price-gremio">{formatPrice(p.precio_gold)}</td>
                  <td className="price-cell price-pvp">{formatPrice(p.pvp)}</td>
                  {tier !== 'gold' && (
                    <td className="price-cell price-secondary">{formatPrice(p.epp)}</td>
                  )}
                  <td>
                    <span className="iva-tag">
                      {p.iva !== undefined ? `${(p.iva * 100).toFixed(1)}%` : '—'}
                    </span>
                  </td>

                  {/* Categoría y Subcategoría */}
                  <td>
                    {p.categoria ? (
                      <span className="cat-badge">{p.categoria}</span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td>
                    {p.subcategoria ? (
                      <span className="subcat-badge">{p.subcategoria}</span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>

                  {/* Descripción */}
                  <td>
                    <span className="desc-text" title={p.descripcion || ''}>
                      {p.descripcion || '—'}
                    </span>
                  </td>

                  {/* Tránsito */}
                  <td style={{ textAlign: 'center' }}>
                    {p.en_transito ? (
                      <span className="badge-transit" title="En tránsito de importación">
                        <Plane size={11} /> Sí
                      </span>
                    ) : (
                      <span className="text-dim">No</span>
                    )}
                  </td>

                  {/* Detalle Oferta (solo interna) */}
                  {tier === 'interna' && (
                    <td>
                      {p.oferta_txt ? (
                        <span className="oferta-txt-tag">{p.oferta_txt}</span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
