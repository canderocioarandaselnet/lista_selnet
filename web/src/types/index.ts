export type UserTier = 'diamond' | 'black' | 'platinum' | 'ruby' | 'gold' | 'interna';

export interface Profile {
  id: string;
  email: string;
  tier: UserTier;
  empresa?: string;
  nombre_contacto?: string;
  telefono?: string;
  activo: boolean;
  creado_el: string;
}

export interface Producto {
  id: number;
  sap?: string;
  cod_bejerman?: string;
  modelo: string;
  descripcion?: string;
  marca: string;
  categoria?: string;
  subcategoria?: string;

  // Precios
  precio_principal?: number;
  label_precio_principal?: string;
  precio_diamond?: number;
  precio_black?: number;
  precio_platinum?: number;
  precio_ruby?: number;
  precio_gold?: number;
  pvp?: number;
  epp?: number;
  iva?: number;

  // Stock y Disponibilidad
  stock: number;
  en_transito: boolean;

  // Banderas
  es_oferta?: string;
  oferta_txt?: string;
  es_nuevo: boolean;
  es_interno: boolean;

  _selected?: boolean;
}

export interface CatalogoFilters {
  search: string;
  marca: string | null;
  categoria: string | null;
  subcategoria: string | null;
  soloStock: boolean;
  soloOfertas: boolean;
  soloNuevos: boolean;
}

export interface SortConfig {
  key: keyof Producto | 'precio_principal';
  direction: 'asc' | 'desc' | 'none';
}
