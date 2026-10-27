'use client';

import React from 'react';
import { Producto, SortConfig, UserTier } from '@/types';
import { ArrowUpDown, ArrowUp, ArrowDown, Package, Plane, Flame, Sparkles } from 'lucide-react';

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
      return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    }
    return sort.direction === 'asc' ? <ArrowUp size={13} color="#60a5fa" /> : <ArrowDown size={13} color="#60a5fa" />;
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
              <th style={{ width: '40px', textAlign: 'center' }}></th>
              <th className="sortable" onClick={() => onSort('marca')} style={{ width: '110px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Marca {renderSortIcon('marca')}
                </span>
              </th>
              <th className="sortable" onClick={() => onSort('sap')} style={{ width: '120px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  SAP {renderSortIcon('sap')}
                </span>
              </th>
              {tier === 'interna' && (
                <th className="sortable" onClick={() => onSort('cod_bejerman')} style={{ width: '130px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Cód Bejerman {renderSortIcon('cod_bejerman')}
                  </span>
                </th>
              )}
              <th className="sortable" onClick={() => onSort('modelo')} style={{ width: '220px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Modelo {renderSortIcon('modelo')}
                </span>
              </th>
              <th className="sortable" onClick={() => onSort('stock')} style={{ width: '90px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Stock {renderSortIcon('stock')}
                </span>
              </th>
              <th style={{ minWidth: '380px' }}>Descripción</th>
              <th className="sortable" onClick={() => onSort('categoria')} style={{ width: '140px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Categoría {renderSortIcon('categoria')}
                </span>
              </th>
              <th className="sortable" onClick={() => onSort('subcategoria')} style={{ width: '140px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Subcategoría {renderSortIcon('subcategoria')}
                </span>
              </th>

              {/* Precio Principal según Tier */}
              <th className="sortable" onClick={() => onSort('precio_principal')} style={{ width: '120px', color: '#60a5fa' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Tu Precio ({tier.toUpperCase()}) {renderSortIcon('precio_principal')}
                </span>
              </th>

              {/* Columnas Adicionales de Precios según Tier */}
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

              {/* Gold Gremio y PVP */}
              <th style={{ width: '100px' }}>Gremio</th>
              <th style={{ width: '100px' }}>PVP</th>
              {tier !== 'gold' && <th style={{ width: '90px' }}>EPP</th>}
              <th style={{ width: '80px' }}>IVA</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Tránsito</th>
              {tier === 'interna' && <th style={{ width: '140px' }}>Oferta</th>}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={18} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No se encontraron productos con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={`${p.marca}-${p.modelo}`} className={p._selected ? 'selected' : ''}>
                  {/* Checkbox */}
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!p._selected}
                      onChange={() => onToggleSelect(p.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>

                  {/* Marca */}
                  <td>
                    <span style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {p.marca}
                    </span>
                  </td>

                  {/* SAP */}
                  <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-dim)' }}>
                    {p.sap || '-'}
                  </td>

                  {/* Cod Bejerman (solo interna) */}
                  {tier === 'interna' && (
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#c084fc' }}>
                      {p.cod_bejerman || '-'}
                    </td>
                  )}

                  {/* Modelo + Badges */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text-main)' }}>{p.modelo}</strong>
                      {p.es_nuevo && (
                        <span className="pill pill-new" title="Producto Nuevo / Lanzamiento">
                          <Sparkles size={11} /> Nuevo
                        </span>
                      )}
                      {p.es_oferta && (
                        <span className="pill pill-offer" title="Precio en Oferta">
                          <Flame size={11} /> Oferta
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Stock */}
                  <td>
                    {p.stock > 0 ? (
                      <span className="pill pill-stock">
                        <Package size={11} /> {p.stock}
                      </span>
                    ) : (
                      <span className="pill pill-nostock">0</span>
                    )}
                  </td>

                  {/* Descripción */}
                  <td style={{ color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: '1.4' }}>
                    {p.descripcion || '-'}
                  </td>

                  {/* Categoría y Subcategoría */}
                  <td style={{ fontSize: '12px' }}>{p.categoria || '-'}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{p.subcategoria || '-'}</td>

                  {/* Precio Principal del Tier */}
                  <td className="price-cell price-main">
                    {formatPrice(p.precio_principal)}
                  </td>

                  {/* Precios adicionales según Tier */}
                  {['diamond', 'black', 'interna'].includes(tier) && (
                    <td className="price-cell">{formatPrice(p.precio_black)}</td>
                  )}
                  {['diamond', 'black', 'ruby', 'interna'].includes(tier) && (
                    <td className="price-cell">{formatPrice(p.precio_ruby)}</td>
                  )}
                  {['platinum', 'interna'].includes(tier) && (
                    <td className="price-cell">{formatPrice(p.precio_platinum)}</td>
                  )}
                  {tier === 'interna' && (
                    <td className="price-cell">{formatPrice(p.precio_diamond)}</td>
                  )}

                  {/* Gremio y PVP */}
                  <td className="price-cell" style={{ color: 'var(--text-muted)' }}>
                    {formatPrice(p.precio_gold)}
                  </td>
                  <td className="price-cell" style={{ color: 'var(--text-dim)' }}>
                    {formatPrice(p.pvp)}
                  </td>
                  {tier !== 'gold' && (
                    <td className="price-cell" style={{ color: 'var(--text-dim)' }}>
                      {formatPrice(p.epp)}
                    </td>
                  )}

                  {/* IVA */}
                  <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    {p.iva !== undefined ? `${(p.iva * 100).toFixed(1)}%` : '-'}
                  </td>

                  {/* Tránsito */}
                  <td style={{ textAlign: 'center' }}>
                    {p.en_transito ? (
                      <span className="pill pill-transit" title="En tránsito / Importación">
                        <Plane size={11} /> Sí
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No</span>
                    )}
                  </td>

                  {/* Detalle Oferta (solo interna) */}
                  {tier === 'interna' && (
                    <td style={{ fontSize: '11px', color: '#fb923c' }}>
                      {p.oferta_txt || '-'}
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
