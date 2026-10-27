-- ==============================================================================
-- SUPABASE MIGRATION 02: Seguridad (RLS), Triggers y Funciones RPC por Nivel
-- ==============================================================================

-- 1. Habilitar Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de Seguridad para PROFILES
-- Los usuarios autenticados solo pueden leer su propio perfil
CREATE POLICY "Usuarios pueden ver su propio perfil"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- El service_role (backend/admin) tiene control total
CREATE POLICY "Service role control total profiles"
ON public.profiles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Políticas de Seguridad para PRODUCTOS
-- El service_role puede insertar y actualizar (usado por el script de sync desde BigQuery)
CREATE POLICY "Service role control total productos"
ON public.productos FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Los usuarios autenticados pueden leer productos (pero recomendamos la función RPC que filtra columnas)
CREATE POLICY "Usuarios autenticados leen productos no internos"
ON public.productos FOR SELECT
TO authenticated
USING (
    es_interno = false OR 
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = auth.uid() AND p.tier = 'interna'
    )
);

-- 4. Trigger automático: Crear perfil cuando se registra un usuario en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, tier, empresa)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE((NEW.raw_user_meta_data->>'tier')::public.user_tier, 'gold'),
        COALESCE(NEW.raw_user_meta_data->>'empresa', '')
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 5. FUNCIÓN RPC SEGURA: get_catalogo()
-- Devuelve únicamente las columnas y marcas autorizadas según el Tier del usuario
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_catalogo(
    p_marca TEXT DEFAULT NULL,
    p_categoria TEXT DEFAULT NULL,
    p_subcategoria TEXT DEFAULT NULL,
    p_solo_nuevos BOOLEAN DEFAULT FALSE,
    p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
    id BIGINT,
    sap TEXT,
    cod_bejerman TEXT,
    modelo TEXT,
    descripcion TEXT,
    marca TEXT,
    categoria TEXT,
    subcategoria TEXT,
    precio_principal NUMERIC(12,2),
    label_precio_principal TEXT,
    precio_black NUMERIC(12,2),
    precio_ruby NUMERIC(12,2),
    precio_gold NUMERIC(12,2),
    precio_diamond NUMERIC(12,2),
    precio_platinum NUMERIC(12,2),
    pvp NUMERIC(12,2),
    epp NUMERIC(12,2),
    iva NUMERIC(6,3),
    stock INT,
    en_transito BOOLEAN,
    es_oferta TEXT,
    oferta_txt TEXT,
    es_nuevo BOOLEAN,
    es_interno BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_tier public.user_tier;
BEGIN
    -- Obtener el tier del usuario que hace la llamada
    SELECT tier INTO v_user_tier
    FROM public.profiles
    WHERE id = auth.uid() AND activo = true;

    -- Si no está logueado o inactivo, retornar vacío
    IF v_user_tier IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.sap,
        -- Cod Bejerman solo visible para nivel 'interna'
        CASE WHEN v_user_tier = 'interna' THEN p.cod_bejerman ELSE NULL END AS cod_bejerman,
        p.modelo,
        p.descripcion,
        p.marca,
        p.categoria,
        p.subcategoria,

        -- Precio principal según el nivel del usuario
        CASE 
            WHEN v_user_tier = 'diamond' THEN p.precio_diamond
            WHEN v_user_tier = 'black' THEN p.precio_black
            WHEN v_user_tier = 'platinum' THEN p.precio_platinum
            WHEN v_user_tier = 'ruby' THEN p.precio_ruby
            WHEN v_user_tier = 'gold' THEN p.precio_gold
            ELSE p.precio_gold
        END AS precio_principal,

        -- Etiqueta del precio principal
        CASE 
            WHEN v_user_tier = 'diamond' THEN 'Diamond'
            WHEN v_user_tier = 'black' THEN 'Black'
            WHEN v_user_tier = 'platinum' THEN 'Platinum'
            WHEN v_user_tier = 'ruby' THEN 'Ruby'
            WHEN v_user_tier = 'gold' THEN 'Gold gremio'
            ELSE 'Gremio'
        END AS label_precio_principal,

        -- Precios adicionales según matriz de visibilidad
        CASE WHEN v_user_tier IN ('diamond', 'black', 'interna') THEN p.precio_black ELSE NULL END AS precio_black,
        CASE WHEN v_user_tier IN ('diamond', 'black', 'ruby', 'interna') THEN p.precio_ruby ELSE NULL END AS precio_ruby,
        p.precio_gold, -- Todos ven el precio Gold de referencia
        CASE WHEN v_user_tier IN ('diamond', 'interna') THEN p.precio_diamond ELSE NULL END AS precio_diamond,
        CASE WHEN v_user_tier IN ('platinum', 'interna') THEN p.precio_platinum ELSE NULL END AS precio_platinum,
        p.pvp,
        CASE WHEN v_user_tier != 'gold' THEN p.epp ELSE NULL END AS epp,
        p.iva,

        p.stock,
        p.en_transito,
        p.es_oferta,
        -- Texto explicativo de oferta solo para interna
        CASE WHEN v_user_tier = 'interna' THEN p.oferta_txt ELSE NULL END AS oferta_txt,
        p.es_nuevo,
        p.es_interno

    FROM public.productos p
    WHERE 
        -- Restricción de marcas de incendio/alarma para no internos
        (v_user_tier = 'interna' OR p.es_interno = false)
        -- Filtros opcionales
        AND (p_marca IS NULL OR p.marca = p_marca)
        AND (p_categoria IS NULL OR p.categoria = p_categoria)
        AND (p_subcategoria IS NULL OR p.subcategoria = p_subcategoria)
        AND (NOT p_solo_nuevos OR p.es_nuevo = true)
        AND (
            p_search IS NULL OR p_search = '' OR
            to_tsvector('spanish', 
                coalesce(p.modelo, '') || ' ' || 
                coalesce(p.descripcion, '') || ' ' || 
                coalesce(p.sap, '') || ' ' || 
                coalesce(p.cod_bejerman, '') || ' ' || 
                coalesce(p.marca, '')
            ) @@ plainto_tsquery('spanish', p_search)
            OR p.modelo ILIKE '%' || p_search || '%'
            OR p.sap ILIKE '%' || p_search || '%'
            OR p.descripcion ILIKE '%' || p_search || '%'
        )
    ORDER BY p.marca, p.modelo;
END;
$$;
