'use client';

import React from 'react';
import { UserTier } from '@/types';

interface ProductTableSkeletonProps {
  tier?: UserTier;
  rowCount?: number;
}

export const ProductTableSkeleton: React.FC<ProductTableSkeletonProps> = ({
  tier = 'gold',
  rowCount = 12,
}) => {
  const rows = Array.from({ length: rowCount });

  return (
    <div className="table-container skeleton-table-container">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-sticky col-check" style={{ width: '44px', textAlign: 'center' }}>
                <div className="skeleton-shimmer skeleton-check" />
              </th>
              <th className="col-sticky col-modelo" style={{ minWidth: '200px' }}>
                <span className="th-content">Modelo</span>
              </th>
              <th style={{ width: '110px' }}>
                <span className="th-content">Marca</span>
              </th>
              <th style={{ width: '120px' }}>
                <span className="th-content">SAP</span>
              </th>
              {tier === 'interna' && (
                <th style={{ width: '130px' }}>
                  <span className="th-content">Bejerman</span>
                </th>
              )}
              <th style={{ width: '95px' }}>
                <span className="th-content">Stock</span>
              </th>
              <th className="col-price-featured" style={{ width: '135px' }}>
                <span className="th-content">Tu Precio ({tier.toUpperCase()})</span>
              </th>
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
              <th style={{ width: '100px' }}>Gremio</th>
              <th style={{ width: '100px' }}>PVP Sug.</th>
              {tier !== 'gold' && <th style={{ width: '90px' }}>EPP</th>}
              <th style={{ width: '80px' }}>IVA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((_, idx) => {
              const modelWidth = 110 + (idx % 4) * 28;
              const hasBadge = idx % 3 === 0;

              return (
                <tr key={idx} className="skeleton-product-row">
                  {/* Checkbox */}
                  <td className="col-sticky col-check" style={{ textAlign: 'center' }}>
                    <div className="skeleton-shimmer skeleton-check-box" />
                  </td>

                  {/* Modelo */}
                  <td className="col-sticky col-modelo">
                    <div className="skeleton-modelo-wrap">
                      <div
                        className="skeleton-shimmer skeleton-modelo-line"
                        style={{ width: `${modelWidth}px` }}
                      />
                      {hasBadge && (
                        <div className="skeleton-shimmer skeleton-badge-mini" />
                      )}
                    </div>
                  </td>

                  {/* Marca */}
                  <td>
                    <div className="skeleton-shimmer skeleton-brand-pill" />
                  </td>

                  {/* SAP */}
                  <td>
                    <div className="skeleton-shimmer skeleton-code" style={{ width: '75px' }} />
                  </td>

                  {/* Bejerman */}
                  {tier === 'interna' && (
                    <td>
                      <div className="skeleton-shimmer skeleton-code" style={{ width: '85px' }} />
                    </td>
                  )}

                  {/* Stock */}
                  <td>
                    <div className="skeleton-stock-cell">
                      <div className="skeleton-shimmer skeleton-stock-dot" />
                      <div className="skeleton-shimmer skeleton-stock-val" />
                    </div>
                  </td>

                  {/* Tu Precio (Destacado) */}
                  <td className="col-price-featured">
                    <div className="skeleton-shimmer skeleton-price-featured" />
                  </td>

                  {/* Precios adicionales según Tier */}
                  {['diamond', 'black', 'interna'].includes(tier) && (
                    <td>
                      <div className="skeleton-shimmer skeleton-price" />
                    </td>
                  )}
                  {['diamond', 'black', 'ruby', 'interna'].includes(tier) && (
                    <td>
                      <div className="skeleton-shimmer skeleton-price" />
                    </td>
                  )}
                  {['platinum', 'interna'].includes(tier) && (
                    <td>
                      <div className="skeleton-shimmer skeleton-price" />
                    </td>
                  )}
                  {tier === 'interna' && (
                    <td>
                      <div className="skeleton-shimmer skeleton-price" />
                    </td>
                  )}

                  {/* Precios Base */}
                  <td>
                    <div className="skeleton-shimmer skeleton-price" />
                  </td>
                  <td>
                    <div className="skeleton-shimmer skeleton-price" />
                  </td>
                  {tier !== 'gold' && (
                    <td>
                      <div className="skeleton-shimmer skeleton-price" />
                    </td>
                  )}
                  <td>
                    <div className="skeleton-shimmer skeleton-iva" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
