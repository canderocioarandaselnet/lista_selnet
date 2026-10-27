-- ==============================================================================
-- SUPABASE MIGRATION 01: Esquema Base, Tipos e Índices
-- ==============================================================================

-- 1. Tipo Enum para los niveles de clientes Selnet
CREATE TYPE user_tier AS ENUM ('diamond', 'black', 'platinum', 'ruby', 'gold', 'interna');

-- 2. Tabla de Perfiles de Usuario (vinculada a Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    tier user_tier NOT NULL DEFAULT 'gold',
    empresa TEXT,
    nombre_contacto TEXT,
    telefono TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_el TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para actualizar actualizado_el en profiles
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_el = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Tabla Maestra de Catálogo de Productos
CREATE TABLE IF NOT EXISTS public.productos (
    id BIGSERIAL PRIMARY KEY,
    sap TEXT,                               -- Código SAP / Hik code
    cod_bejerman TEXT,                      -- Código Bejerman ERP
    modelo TEXT NOT NULL,
    descripcion TEXT,
    marca TEXT NOT NULL,                    -- HIKVISION, EZVIZ, DIGIFORT, etc.
    categoria TEXT,
    subcategoria TEXT,

    -- Precios por Tier
    precio_diamond NUMERIC(12, 2),
    precio_black NUMERIC(12, 2),
    precio_platinum NUMERIC(12, 2),
    precio_ruby NUMERIC(12, 2),
    precio_gold NUMERIC(12, 2),
    pvp NUMERIC(12, 2),
    epp NUMERIC(12, 2),
    iva NUMERIC(6, 3),

    -- Stock y Tránsito
    stock INT NOT NULL DEFAULT 0,
    en_transito BOOLEAN NOT NULL DEFAULT false,

    -- Banderas
    es_oferta TEXT,                         -- Flags de oferta ('gold,pvp', etc.)
    oferta_txt TEXT,                        -- Descripción textual de la oferta
    es_nuevo BOOLEAN NOT NULL DEFAULT false,-- Producto destacado / lanzamiento
    es_interno BOOLEAN NOT NULL DEFAULT false,-- True para marcas exclusivas (Bentel, DSC, System Sensor)

    sincronizado_el TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Clave única para upsert atómico desde BigQuery
    CONSTRAINT uq_productos_marca_modelo UNIQUE (marca, modelo)
);

-- 4. Índices para acelerar búsquedas y filtros a < 10ms
CREATE INDEX IF NOT EXISTS idx_prod_marca ON public.productos(marca);
CREATE INDEX IF NOT EXISTS idx_prod_categoria ON public.productos(categoria);
CREATE INDEX IF NOT EXISTS idx_prod_subcategoria ON public.productos(categoria, subcategoria);
CREATE INDEX IF NOT EXISTS idx_prod_interno ON public.productos(es_interno);
CREATE INDEX IF NOT EXISTS idx_prod_nuevo ON public.productos(es_nuevo);
CREATE INDEX IF NOT EXISTS idx_prod_stock ON public.productos(stock);

-- Índice GIN Full-Text Search en español sobre modelo, descripción, sap y código bejerman
CREATE INDEX IF NOT EXISTS idx_prod_fts ON public.productos USING gin(
    to_tsvector('spanish', 
        coalesce(modelo, '') || ' ' || 
        coalesce(descripcion, '') || ' ' || 
        coalesce(sap, '') || ' ' || 
        coalesce(cod_bejerman, '') || ' ' ||
        coalesce(marca, '')
    )
);

-- 5. Tabla de Logs de Sincronización (Auditoría de cargas desde BigQuery)
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id BIGSERIAL PRIMARY KEY,
    origen TEXT NOT NULL DEFAULT 'bigquery',
    registros_insertados INT DEFAULT 0,
    registros_actualizados INT DEFAULT 0,
    duracion_ms INT,
    estado TEXT NOT NULL CHECK (estado IN ('SUCCESS', 'ERROR')),
    mensaje_error TEXT,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
