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
import { getCategoryColorClass } from '@/lib/categoryColors';

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

              {/* Precios según Tier (Diamond, Black, Platinum, Ruby, Gremio, PVP Sug, EPP) */}
              {(tier === 'diamond' || tier === 'interna') && (
                <th
                  className={`sortable th-price-col ${tier === 'diamond' ? 'th-price-active' : ''}`}
                  onClick={() => onSort('precio_diamond')}
                  style={{ width: '105px' }}
                >
                  <span className="th-content">
                    <span className="th-tier-pill th-tier-diamond">DIAMOND</span>
                    {renderSortIcon('precio_diamond')}
                  </span>
                </th>
              )}
              {['diamond', 'black', 'interna'].includes(tier) && (
                <th
                  className={`sortable th-price-col ${tier === 'black' ? 'th-price-active' : ''}`}
                  onClick={() => onSort('precio_black')}
                  style={{ width: '105px' }}
                >
                  <span className="th-content">
                    <span className="th-tier-pill th-tier-black">BLACK</span>
                    {renderSortIcon('precio_black')}
                  </span>
                </th>
              )}
              {['platinum', 'interna'].includes(tier) && (
                <th
                  className={`sortable th-price-col ${tier === 'platinum' ? 'th-price-active' : ''}`}
                  onClick={() => onSort('precio_platinum')}
                  style={{ width: '105px' }}
                >
                  <span className="th-content">
                    <span className="th-tier-pill th-tier-platinum">PLATINUM</span>
                    {renderSortIcon('precio_platinum')}
                  </span>
                </th>
              )}
              {['diamond', 'black', 'ruby', 'interna'].includes(tier) && (
                <th
                  className={`sortable th-price-col ${tier === 'ruby' ? 'th-price-active' : ''}`}
                  onClick={() => onSort('precio_ruby')}
                  style={{ width: '105px' }}
                >
                  <span className="th-content">
                    <span className="th-tier-pill th-tier-ruby">RUBY</span>
                    {renderSortIcon('precio_ruby')}
                  </span>
                </th>
              )}

              {/* Precios Base (Gremio, PVP Sug., EPP) */}
              <th
                className={`sortable th-price-col ${tier === 'gold' ? 'th-price-active' : ''}`}
                onClick={() => onSort('precio_gold')}
                style={{ width: '105px' }}
              >
                <span className="th-content">
                  <span className={`th-tier-pill ${tier === 'gold' ? 'th-tier-gold' : 'th-tier-gremio'}`}>
                    GREMIO
                  </span>
                  {renderSortIcon('precio_gold')}
                </span>
              </th>
              <th
                className="sortable th-price-col"
                onClick={() => onSort('pvp')}
                style={{ width: '100px' }}
              >
                <span className="th-content">
                  <span className="th-tier-pill th-tier-neutral">PVP SUG.</span>
                  {renderSortIcon('pvp')}
                </span>
              </th>
              {tier !== 'gold' && (
                <th
                  className="sortable th-price-col"
                  onClick={() => onSort('epp')}
                  style={{ width: '90px' }}
                >
                  <span className="th-content">
                    <span className="th-tier-pill th-tier-neutral">EPP</span>
                    {renderSortIcon('epp')}
                  </span>
                </th>
              )}
              <th style={{ width: '80px' }}>IVA</th>

              {/* Categoría y Subcategoría (Ancho controlado y ordenable) */}
              <th className="sortable th-col-category" onClick={() => onSort('categoria')} style={{ width: '165px', maxWidth: '175px' }}>
                <span className="th-content">
                  Categoría {renderSortIcon('categoria')}
                </span>
              </th>
              <th className="sortable th-col-subcategory" onClick={() => onSort('subcategoria')} style={{ width: '175px', maxWidth: '185px' }}>
                <span className="th-content">
                  Subcategoría {renderSortIcon('subcategoria')}
                </span>
              </th>

              {/* Descripción (Ancho controlado con clamp) */}
              <th className="th-col-description" style={{ width: '260px', maxWidth: '280px' }}>Descripción</th>

              {/* Tránsito */}
              <th style={{ width: '90px', textAlign: 'center' }}>Tránsito</th>

              {/* Detalle Oferta (solo interna) */}
              {tier === 'interna' && <th style={{ width: '150px' }}>Oferta Detalle</th>}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={20} className="empty-cell">
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

                  {/* Precios según Tier (Diamond, Black, Platinum, Ruby, Gremio, PVP Sug., EPP) */}
                  {(tier === 'diamond' || tier === 'interna') && (
                    <td className={`price-cell ${tier === 'interna' ? 'price-interna-white' : tier === 'diamond' ? 'price-cell-active' : 'price-secondary'}`}>
                      {formatPrice(p.precio_diamond)}
                    </td>
                  )}
                  {['diamond', 'black', 'interna'].includes(tier) && (
                    <td className={`price-cell ${tier === 'interna' ? 'price-interna-white' : tier === 'black' ? 'price-cell-active' : 'price-secondary'}`}>
                      {formatPrice(p.precio_black)}
                    </td>
                  )}
                  {['platinum', 'interna'].includes(tier) && (
                    <td className={`price-cell ${tier === 'interna' ? 'price-interna-white' : tier === 'platinum' ? 'price-cell-active' : 'price-secondary'}`}>
                      {formatPrice(p.precio_platinum)}
                    </td>
                  )}
                  {['diamond', 'black', 'ruby', 'interna'].includes(tier) && (
                    <td className={`price-cell ${tier === 'interna' ? 'price-interna-white' : tier === 'ruby' ? 'price-cell-active' : 'price-secondary'}`}>
                      {formatPrice(p.precio_ruby)}
                    </td>
                  )}

                  {/* Gremio */}
                  <td className={`price-cell ${tier === 'interna' ? 'price-interna-white' : tier === 'gold' ? 'price-cell-active' : 'price-secondary'}`}>
                    {formatPrice(p.precio_gold)}
                  </td>

                  {/* PVP Sug. */}
                  <td className={`price-cell ${tier === 'interna' ? 'price-interna-white' : 'price-pvp'}`}>
                    {formatPrice(p.pvp)}
                  </td>

                  {/* EPP */}
                  {tier !== 'gold' && (
                    <td className={`price-cell ${tier === 'interna' ? 'price-interna-white' : 'price-secondary'}`}>
                      {formatPrice(p.epp)}
                    </td>
                  )}
                  <td>
                    <span className="iva-tag">
                      {p.iva !== undefined ? `${(p.iva * 100).toFixed(1)}%` : '—'}
                    </span>
                  </td>

                  {/* Categoría y Subcategoría (Etiquetas Coloreadas y Anchos Acotados) */}
                  <td className="col-category">
                    {p.categoria ? (
                      <span
                        className={`cat-pill ${getCategoryColorClass(p.categoria)}`}
                        title={p.categoria}
                      >
                        {p.categoria}
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="col-subcategory">
                    {p.subcategoria ? (
                      <span
                        className={`subcat-pill ${getCategoryColorClass(p.subcategoria)}`}
                        title={p.subcategoria}
                      >
                        {p.subcategoria}
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>

                  {/* Descripción (Con clamp y tooltip) */}
                  <td className="col-description">
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
