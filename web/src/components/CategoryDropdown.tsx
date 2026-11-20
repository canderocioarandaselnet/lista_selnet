'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check, Tag, Layers } from 'lucide-react';
import { getCategoryColorClass } from '@/lib/categoryColors';

interface CategoryDropdownProps {
  value: string | null;
  options: string[];
  placeholder: string;
  onChange: (val: string | null) => void;
  type?: 'category' | 'subcategory' | 'brand';
  isSubcategory?: boolean;
}

export const CategoryDropdown: React.FC<CategoryDropdownProps> = ({
  value,
  options,
  placeholder,
  onChange,
  type = 'category',
  isSubcategory = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isBrandType = type === 'brand';
  const isSubcatType = type === 'subcategory' || isSubcategory;

  // Cerrar al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Enfocar buscador al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  const handleSelect = (val: string | null) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const getSearchPlaceholder = () => {
    if (isBrandType) return `Buscar entre ${options.length} marcas...`;
    if (isSubcatType) return `Buscar entre ${options.length} subcategorías...`;
    return `Buscar entre ${options.length} categorías...`;
  };

  const getAllLabel = () => {
    if (isBrandType) return 'Todas las Marcas';
    if (isSubcatType) return 'Todas las Subcategorías';
    return 'Todas las Categorías';
  };

  const isDisabled = options.length === 0 && !value;

  return (
    <div className={`custom-dropdown-container ${isDisabled ? 'is-disabled' : ''}`} ref={containerRef}>
      {/* Botón Trigger */}
      <button
        type="button"
        disabled={isDisabled}
        className={`custom-dropdown-trigger ${value ? 'has-value' : ''} ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="trigger-left">
          {isBrandType ? (
            <Layers size={13} className="trigger-icon" />
          ) : (
            <Tag size={13} className="trigger-icon" />
          )}

          {value ? (
            isBrandType ? (
              <span className="brand-tag trigger-brand-tag" title={value}>
                {value}
              </span>
            ) : isSubcatType ? (
              <span
                className={`subcat-pill trigger-cat-pill ${getCategoryColorClass(value)}`}
                title={value}
              >
                {value}
              </span>
            ) : (
              <span
                className={`cat-pill trigger-cat-pill ${getCategoryColorClass(value)}`}
                title={value}
              >
                {value}
              </span>
            )
          ) : (
            <span className="trigger-placeholder">
              {placeholder}
              {options.length > 0 && (
                <span className="options-count-badge">({options.length})</span>
              )}
            </span>
          )}
        </div>

        <div className="trigger-actions">
          {value && (
            <span
              role="button"
              tabIndex={0}
              className="trigger-clear-btn"
              onClick={handleClear}
              onKeyDown={(e) => e.key === 'Enter' && handleClear(e as any)}
              title="Quitar filtro"
              aria-label="Quitar filtro"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`trigger-chevron ${isOpen ? 'rotated' : ''}`}
          />
        </div>
      </button>

      {/* Menú Flotante */}
      {isOpen && !isDisabled && (
        <div className="custom-dropdown-panel" role="listbox">
          {/* Cabecera con Buscador */}
          <div className="dropdown-search-wrap">
            <Search size={14} className="dropdown-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={getSearchPlaceholder()}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="dropdown-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="dropdown-search-clear"
                onClick={() => setSearchTerm('')}
                title="Limpiar búsqueda"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Lista de Opciones */}
          <div className="dropdown-options-scroll">
            {/* Opción 'Todas' */}
            <div
              className={`dropdown-option-item ${value === null ? 'selected' : ''}`}
              onClick={() => handleSelect(null)}
              role="option"
              aria-selected={value === null}
            >
              <div className="option-name-wrap">
                <span className="option-dot all-dot" />
                <span className="option-text">
                  {getAllLabel()}
                </span>
              </div>
              {value === null && <Check size={14} className="option-check" />}
            </div>

            {/* Opciones filtradas */}
            {filteredOptions.length === 0 ? (
              <div className="dropdown-empty-state">
                <span>No se encontraron coincidencias</span>
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value === opt;
                const colorClass = getCategoryColorClass(opt);

                return (
                  <div
                    key={opt}
                    className={`dropdown-option-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(opt)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="option-name-wrap">
                      {isBrandType ? (
                        <span className="brand-tag option-brand-tag">
                          {opt}
                        </span>
                      ) : isSubcatType ? (
                        <span className={`subcat-pill option-cat-pill ${colorClass}`}>
                          {opt}
                        </span>
                      ) : (
                        <span className={`cat-pill option-cat-pill ${colorClass}`}>
                          {opt}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="option-check" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
