'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check, Tag } from 'lucide-react';
import { getCategoryColorClass } from '@/lib/categoryColors';

interface CategoryDropdownProps {
  value: string | null;
  options: string[];
  placeholder: string;
  onChange: (val: string | null) => void;
  isSubcategory?: boolean;
}

export const CategoryDropdown: React.FC<CategoryDropdownProps> = ({
  value,
  options,
  placeholder,
  onChange,
  isSubcategory = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="custom-dropdown-container" ref={containerRef}>
      {/* Botón Trigger */}
      <button
        type="button"
        className={`custom-dropdown-trigger ${value ? 'has-value' : ''} ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="trigger-left">
          <Tag size={13} className="trigger-icon" />
          {value ? (
            <span
              className={`cat-pill trigger-cat-pill ${getCategoryColorClass(value)}`}
              title={value}
            >
              {value}
            </span>
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
      {isOpen && (
        <div className="custom-dropdown-panel" role="listbox">
          {/* Cabecera con Buscador */}
          <div className="dropdown-search-wrap">
            <Search size={14} className="dropdown-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={`Buscar entre ${options.length} ${isSubcategory ? 'subcategorías' : 'categorías'}...`}
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
                  {isSubcategory ? 'Todas las Subcategorías' : 'Todas las Categorías'}
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
                      <span className={`cat-pill option-cat-pill ${colorClass}`}>
                        {opt}
                      </span>
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
