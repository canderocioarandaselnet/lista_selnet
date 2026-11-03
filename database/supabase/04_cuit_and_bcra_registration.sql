-- ==============================================================================
-- SUPABASE MIGRATION 04: Soporte para CUIT, BCRA y Datos de Empresa en Registro
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Asegurar columnas de CUIT, Nombre, Apellido, Empresa y Contacto en public.profiles
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS cuit TEXT,
    ADD COLUMN IF NOT EXISTS nombre TEXT,
    ADD COLUMN IF NOT EXISTS apellido TEXT,
    ADD COLUMN IF NOT EXISTS empresa TEXT,
    ADD COLUMN IF NOT EXISTS nombre_contacto TEXT,
    ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'cliente',
    ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS niveles TEXT[] NOT NULL DEFAULT ARRAY['gold']::TEXT[],
    ADD COLUMN IF NOT EXISTS nivel_activo TEXT DEFAULT 'gold',
    ADD COLUMN IF NOT EXISTS primer_login TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS nivel_asignado_el TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS asignado_por TEXT;

-- Permitir que nivel_activo sea nullable o tenga default
ALTER TABLE public.profiles ALTER COLUMN nivel_activo DROP NOT NULL;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_profiles_cuit ON public.profiles(cuit);
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON public.profiles(estado);
CREATE INDEX IF NOT EXISTS idx_profiles_rol ON public.profiles(rol);

-- 2. Trigger automático al registrar un nuevo usuario en Supabase Auth
-- Guarda automáticamente cuit, nombre, apellido, empresa y nombre_contacto
-- provenientes de NEW.raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_email TEXT;
    v_precargado RECORD;
    v_rol TEXT := 'cliente';
    v_estado TEXT := 'pendiente';
    v_niveles TEXT[] := ARRAY[]::TEXT[];
    v_nivel_activo TEXT := NULL;
    v_metodo TEXT;
    v_cuit TEXT := NULL;
    v_nombre TEXT := NULL;
    v_apellido TEXT := NULL;
    v_empresa TEXT := NULL;
    v_nombre_contacto TEXT := NULL;
BEGIN
    v_email := LOWER(TRIM(NEW.email));
    v_metodo := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');

    -- Extraer metadatos enviados desde el formulario o provider OAuth
    IF NEW.raw_user_meta_data IS NOT NULL THEN
        v_cuit := NULLIF(TRIM(NEW.raw_user_meta_data->>'cuit'), '');
        v_nombre := NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), '');
        v_apellido := NULLIF(TRIM(NEW.raw_user_meta_data->>'apellido'), '');
        v_empresa := NULLIF(TRIM(NEW.raw_user_meta_data->>'empresa'), '');
        v_nombre_contacto := NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre_contacto'), '');

        -- Si no vino nombre explícito pero viene de Google OAuth
        IF v_nombre IS NULL AND NEW.raw_user_meta_data->>'given_name' IS NOT NULL THEN
            v_nombre := NEW.raw_user_meta_data->>'given_name';
        END IF;
        IF v_apellido IS NULL AND NEW.raw_user_meta_data->>'family_name' IS NOT NULL THEN
            v_apellido := NEW.raw_user_meta_data->>'family_name';
        END IF;

        -- Armar nombre_contacto si quedó vacío
        IF v_nombre_contacto IS NULL THEN
            IF v_nombre IS NOT NULL OR v_apellido IS NOT NULL THEN
                v_nombre_contacto := TRIM(CONCAT(COALESCE(v_nombre, ''), ' ', COALESCE(v_apellido, '')));
            ELSIF NEW.raw_user_meta_data->>'full_name' IS NOT NULL THEN
                v_nombre_contacto := NEW.raw_user_meta_data->>'full_name';
            END IF;
        END IF;
    END IF;

    -- Caso 1: Administradores Propietarios
    IF v_email IN ('canderocioaranda.selnet@gmail.com') THEN
        v_rol := 'admin';
        v_estado := 'activo';
        v_niveles := ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna'];
        v_nivel_activo := 'interna';
    ELSE
        -- Caso 2: Buscar en la lista de accesos precargados
        SELECT * INTO v_precargado 
        FROM public.accesos_precargados 
        WHERE LOWER(email) = v_email;

        IF FOUND THEN
            v_rol := v_precargado.rol;
            v_estado := v_precargado.estado;
            v_niveles := v_precargado.niveles;
            IF array_length(v_niveles, 1) > 0 THEN
                v_nivel_activo := v_niveles[1];
            ELSE
                v_nivel_activo := 'gold';
            END IF;
        ELSE
            -- Caso 3: Usuario nuevo desconocido -> Queda en estado PENDIENTE de onboarding
            v_rol := 'cliente';
            v_estado := 'pendiente';
            v_niveles := ARRAY['gold']::TEXT[];
            v_nivel_activo := 'gold';
        END IF;
    END IF;

    -- Insertar o actualizar perfil en public.profiles
    INSERT INTO public.profiles (
        id, 
        email, 
        rol, 
        estado, 
        niveles, 
        nivel_activo, 
        cuit,
        nombre,
        apellido,
        empresa,
        nombre_contacto,
        primer_login, 
        ultimo_login, 
        creado_el, 
        actualizado_el
    )
    VALUES (
        NEW.id,
        v_email,
        v_rol,
        v_estado,
        v_niveles,
        v_nivel_activo,
        v_cuit,
        v_nombre,
        v_apellido,
        v_empresa,
        v_nombre_contacto,
        NOW(),
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        cuit = COALESCE(EXCLUDED.cuit, profiles.cuit),
        nombre = COALESCE(EXCLUDED.nombre, profiles.nombre),
        apellido = COALESCE(EXCLUDED.apellido, profiles.apellido),
        empresa = COALESCE(EXCLUDED.empresa, profiles.empresa),
        nombre_contacto = COALESCE(EXCLUDED.nombre_contacto, profiles.nombre_contacto),
        ultimo_login = NOW(),
        actualizado_el = NOW();

    -- Registrar evento en login_logs
    INSERT INTO public.login_logs (user_id, email, evento, detalles)
    VALUES (
        NEW.id, 
        v_email, 
        'REGISTRO', 
        jsonb_build_object(
            'metodo', v_metodo, 
            'estado_inicial', v_estado, 
            'niveles_asignados', v_niveles,
            'cuit', v_cuit,
            'empresa', v_empresa
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-vincular trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
