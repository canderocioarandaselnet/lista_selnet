-- ==============================================================================
-- SUPABASE MIGRATION 03: Sistema de Autenticación, Multinivel y Gestión de Accesos
-- ==============================================================================

-- 1. Ampliar la tabla de perfiles (public.profiles)
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('admin', 'cliente')),
    ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('activo', 'pendiente', 'inactivo')),
    ADD COLUMN IF NOT EXISTS niveles TEXT[] NOT NULL DEFAULT ARRAY['gold']::TEXT[],
    ADD COLUMN IF NOT EXISTS nivel_activo TEXT NOT NULL DEFAULT 'gold',
    ADD COLUMN IF NOT EXISTS primer_login TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS nivel_asignado_el TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS asignado_por TEXT;

-- Índices en profiles
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON public.profiles(estado);
CREATE INDEX IF NOT EXISTS idx_profiles_rol ON public.profiles(rol);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 2. Tabla de accesos precargados (Semilla desde BigQuery y precargas manuales desde la app)
CREATE TABLE IF NOT EXISTS public.accesos_precargados (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    niveles TEXT[] NOT NULL DEFAULT ARRAY['gold']::TEXT[],
    rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('admin', 'cliente')),
    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'pendiente', 'inactivo')),
    notas TEXT,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_el TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_precargados_email ON public.accesos_precargados(email);

-- 3. Tabla de auditoría histórica de inicios de sesión y cambios de acceso
CREATE TABLE IF NOT EXISTS public.login_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    evento TEXT NOT NULL, -- 'REGISTRO', 'LOGIN_GOOGLE', 'LOGIN_EMAIL', 'CAMBIO_NIVEL', 'APROBACION', 'ESTADO_MODIFICADO'
    detalles JSONB DEFAULT '{}'::jsonb,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_email ON public.login_logs(email);
CREATE INDEX IF NOT EXISTS idx_login_logs_creado ON public.login_logs(creado_el DESC);

-- 4. Trigger automático al registrar un nuevo usuario en Supabase Auth
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
BEGIN
    v_email := LOWER(TRIM(NEW.email));
    v_metodo := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');

    -- Caso 1: Administrador Propietario
    IF v_email = 'canderocioaranda.selnet@gmail.com' THEN
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
            v_niveles := ARRAY[]::TEXT[];
            v_nivel_activo := NULL;
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
        NOW(),
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
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
            'niveles_asignados', v_niveles
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

-- 5. Función RPC: registrar_login() para actualizar la hora exacta de cada login
CREATE OR REPLACE FUNCTION public.registrar_login(p_metodo TEXT DEFAULT 'email')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    v_profile RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    -- Obtener email del usuario
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

    -- Actualizar ultimo_login
    UPDATE public.profiles
    SET ultimo_login = NOW(),
        actualizado_el = NOW()
    WHERE id = v_user_id
    RETURNING * INTO v_profile;

    -- Registrar log
    INSERT INTO public.login_logs (user_id, email, evento, detalles)
    VALUES (v_user_id, v_email, 'LOGIN', jsonb_build_object('metodo', p_metodo));

    RETURN jsonb_build_object(
        'id', v_profile.id,
        'email', v_profile.email,
        'rol', v_profile.rol,
        'estado', v_profile.estado,
        'niveles', v_profile.niveles,
        'nivel_activo', v_profile.nivel_activo,
        'primer_login', v_profile.primer_login,
        'ultimo_login', v_profile.ultimo_login
    );
END;
$$;

-- 6. Función RPC: cambiar_nivel_activo() para que el usuario alterne entre sus niveles autorizados
CREATE OR REPLACE FUNCTION public.cambiar_nivel_activo(p_nuevo_nivel TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_profile RECORD;
    v_nivel_normalizado TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    v_nivel_normalizado := LOWER(TRIM(p_nuevo_nivel));

    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;

    -- Validar que el usuario tenga ese nivel permitido o sea admin / interna
    IF v_profile.rol = 'admin' OR 'interna' = ANY(v_profile.niveles) OR v_nivel_normalizado = ANY(v_profile.niveles) THEN
        UPDATE public.profiles
        SET nivel_activo = v_nivel_normalizado,
            actualizado_el = NOW()
        WHERE id = v_user_id;

        -- Registrar cambio en log
        INSERT INTO public.login_logs (user_id, email, evento, detalles)
        VALUES (v_user_id, v_profile.email, 'CAMBIO_NIVEL', jsonb_build_object('nivel_anterior', v_profile.nivel_activo, 'nuevo_nivel', v_nivel_normalizado));

        RETURN v_nivel_normalizado;
    ELSE
        RAISE EXCEPTION 'Nivel no autorizado para este usuario';
    END IF;
END;
$$;

-- 7. Habilitar RLS en las nuevas tablas
ALTER TABLE public.accesos_precargados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de accesos_precargados (Solo service_role y admin)
CREATE POLICY "Service role control total precargados"
ON public.accesos_precargados FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Políticas de login_logs (Solo service_role y admin)
CREATE POLICY "Service role control total login_logs"
ON public.login_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Usuarios ven sus propios logs"
ON public.login_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid());


-- ==============================================================================
-- 8. Precarga de los 359 accesos migrados desde BigQuery
-- ==============================================================================

INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('danielabrahamparada@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('olivia@cdmixinsumos.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('olivialazz50@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lorenzofaustopolo@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('leandro@instalnet.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cfontana@instalnet.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('abrandan60@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('kevincorti@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('srial.selnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('maxifaver@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pbogdaselnet@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('enzo.lafuente@areait.com.ar', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pablo.bogdanovich@areait.com.ar', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('diegobenitez710@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ricardobach.bessel@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('info@kintron.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('eagrasar@kintron.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('misiosoftse@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('focusseguridad@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('diegocaceras@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('artelectronica@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mhmolesini@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'admin', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cotizaciones@sialarseguridad.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lucas.castillo@dceingenieria.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('abc@gmail.com', ARRAY['black', 'gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('r02seguridad@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('nacerbo@globalzeg.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ldepasquale@globalzeg.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('instalacionesinteligentes@gmail.com', ARRAY['black', 'gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('marcelagalera2020@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gonzalodyncam@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gustavoesr95@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('abacoseguridad@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventasdyncam1@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('luis.chaves@tiendaitec.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('bodealtec@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ssole@dealtec.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('maggigiacomettidenis@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('agustinsuchur@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', 'acceso_ezviz') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('amel65@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jagambini@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jcaponte.selnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('martinezramiro.rm132@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('julitotrillini@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jskieba@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mariano@nlevel.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('hernansabotigh@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lemuel.gz18@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sicat.informatica@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pablogalvan700@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('elaguilahackers@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas@proteccionalfa.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('tecnologia@grupoasp.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('hsabotigh@lar.coop', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('evenece@gmail.com', ARRAY['gold', 'platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mego.tienda@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lic.lorenzo.n@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ariel.ramirez0622@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('carlosmetodos@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('yamilferraresi@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('benavente.wolf@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('visiontechsolucioness@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gustavocontino@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pvaldez.equipel@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('info.servilaser@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('miguelsanchezan@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('dalilasolr@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('listas@equipel.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('rociofarinab@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('canderocioaranda@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jpsrugiero.it@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('yarovidmatamoros@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('discoverymaxitelsa@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jorge.hector.marfil@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jorge.marfil@elipgo.com', ARRAY['gold', 'platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lucas.quezada@ryqservciossa.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('martin@4wardtech.com.ar', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('matimon83@gmail.com', ARRAY['gold', 'platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lucas.quezada33@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ingenieriasn@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('martinisrael78@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('eisikawa@isikawa.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cm.oliveros.986@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sergio.esterkin@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('costos@brujula-sa.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juanmanuel.gorosito@wiredsolutions.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sofiavega1998@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juanmiglierini@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('melanie.brujula@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gsuarezrojas@sps.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('almsmarin@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('patricio.macloughlin@wiredsolutions.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ivan.tricarico@proradio.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('boaz.precios.gremio@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('danielosm@clicservicios.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cssecuritynet@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('clientesblackselnet@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jesus.selnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('escaleraagustina@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juanpablogiaquinta@gmail.com', ARRAY['black', 'diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('agustinselnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('info@qumax.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('selnet.directivos@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pmcarloslagiard@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ivanrey011@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('laboratorioselnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('alharush.17@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('selnet.corporativos@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('matiober@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('danaluis2015@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cristianiammarrone@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('david@splaplata.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('electrovanguardia@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mendozad84@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('emergenciasinformaticas@eme-info.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('canderocioaranda.selnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'admin', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('activa24secgru@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('adrian.iervasi@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('aescalera.selnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('florenciaveutheyrossi@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('waltergeorge80@gmail.com', ARRAY['black', 'diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('marcmart77@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('walter.selnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sil3871p@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('danielosm@hotmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gastonadmx@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jarcomputacion@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas@activa24.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('computiendasanjuan@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('giorginimarioa@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('empleadosselnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('carlos.lagiard@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pc.soporte.ipsimple@gmail.com', ARRAY['black', 'diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gabrielradioset@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('fiona@aptecnologia.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas@intexa.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ferschober@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('aikencomp@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('renzoo@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('blockgunther@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('compras@prioridad1.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('adrian.u.boaz@gmail.com', ARRAY['black', 'gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('puerto@puertodigital.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas@zzgroup.com.ar', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jesuscaponte@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('valdezcavallerojuan@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('damian@mastecnologia.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jeronimogirado@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('martingamby@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('fechastomadas@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jordan.acosta@hotmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pabloinfoandina@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('servicioelectromisiones@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('andresradnay@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('info.tecno.one@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('arielferrero628@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('alejandrocabelier@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mariradnay@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('administracion@bunkersistemas.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('andres@comunicacionesfueguinas.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jimenamarielmereles@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('fdeandrea@electro.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mariano.balzer@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('bajocontrolmayorista@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas@tecnocom.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('guillermina@icuadrado.net', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('administracion@propiedadprotegida.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('tekno.group.ad@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('comparativaisr@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mordaumanuel@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pablomalatesta12@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('tomashamparsomian@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('teranabrahan@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gremio.roma.electronic@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('arielbalina@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('emartoccia@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('clientesdiamondselnet@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('bayron2021ad@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('securixrosario@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mariano@icuadrado.net', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('propiedadprotegidarosario@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('guillerminagutierrez@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cfventas24@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ofgoldsolucionesit@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('miguel.mza@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mendizabalmariac@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juax2000@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('alarmasdigitronics@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sergiocip@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('marianomocoroa@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('info@xibei.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('agustingamby97@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('compras@ofgold.com.ar', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lucasgrandis85@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('rafapansa@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ferre86.rf@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mariano.lufrano@togetherdevs.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('frantecster@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('compras@ecsustentable.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('enik.servicioselectricos@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('leandro@instal.net.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sistemas@munlsanmartin.gov.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('info@surseguridad.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('arandusoporte@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('nahuelmarchi44@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('info@enlineasa.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('diego.bongio@lajuniorsrl.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sebas.on@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pgadm07922@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gcoronel77@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('administracion@puntopampa.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('diegobongio@lajuniorsrl.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('herbcroissant@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('informatikasilda@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('walterguerra@atiemposeguridad.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('seba@tiendatrade.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juliantoselli@organizacionseven.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('seifiarold@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('netcamreconquista2025@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('seg.kaiser@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('nancyvioleta1954@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('clickcatamarca@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('316itproveedores@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('neocamaras@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('martinsimonato@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cctvsistemasds@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ip.compras.presupuesto@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ingrodrigosanchez@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('proyectos@instal.net.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('grimaldidamian@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('info@hilfe-it.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ti.doncasimiro@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('saftecsa@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('spreaficojm@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ddany88@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('santiago.foyth@colloquia.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ggroisman69@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jvillias@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('mailluquet@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas@nextcomputers.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('rubenexsell2013@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jb.camarasseguridad@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('colcam167@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('rodrigosoler31@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cesar.ripa@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('converger.ingenieriasrl@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sismasrl@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('melchor.leonicolas@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juaito.marsico@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('moddingc@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lucho.relly@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sotoivanfernando0@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('csanmartin@voz-datos.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pendolac@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juanlot86@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('alarmaslapaz2@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ricardo.cucurull@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('supseguridadtecnica@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juliantoselli@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('comercial.netxit@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('admin@aelix.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ezequielgauna1987@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('aryhub@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gerencia@instal.net.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('amel.esperanza@hotmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('diegobrinville@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gerencia@mc2solution.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('fersaravi@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('aripinco1515@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pdabin@enlineasa.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juan@zonainformatica.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('eltalanet@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('clientesgoldselnet@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('automatizacionessuat@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('roberto.mauro.torres@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('hernancuellar1234@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lvarenga@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('matias.ramos.cyre@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('deptotecnico@dinelec.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pablodragicevich@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('luciano.passerini@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lcampos@intellihelp.tech', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('david@togetherdevs.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('d131101m@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('alejandrocerimedo@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('matias.martorelli@wiredsolutions.com.ar', ARRAY['gold', 'ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('rbolondi@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ferminurdanga@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('julioc.paz@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('consultoria@proait.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas.cteam@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('c1rlitosrc@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juliodiaz1978@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('caguilar@ipsecurity.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('impeesaingenieria@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('waltercielen22@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('palvarado43@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('tektronv@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cferromza@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('hernanegarcia@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('tiendatrade.mos2@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('lforte@innover.com.ar', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('guillermomarsico@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('leandroarielciancio@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('selnetsolucionesintegrales@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('smuzzio@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('solanag21@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('rodricla@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('admencro@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('federicopalacioush@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gerencia@perfectto.com.ar', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventascorp@perfectto.com.ar', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('fkorovsky@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('romina.peuchot@global-risk.com.ar', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('electroavenidaseguridad@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sinergy.ingenieria@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('electrologicventas@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('clientesplatinumselnet@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('fabricioloconte@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('cctvservicios@gmail.com', ARRAY['platinum']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('daniel@nixonnet.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jaamaya1971@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('william@seguridadunica.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('leonsiomaldonado89@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('silva.sergioa94@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('vsanchez@isikawa.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('serviciosdeseguridadgpe@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('adncorp@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('arielcardenuto@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('luisspir@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('christian.damian.silva@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('felix.felixgarcia682@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('soporte@grupoarquinec.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('seguridad@isikawa.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('luisspir@lematron.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('comercial3elca@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('guillermo.sosa@globaldatainternational.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('guillermoestebansosabeltran@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas@seguridadunica.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('g.a.r.seguridadelectronica@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gestionlematron@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('pablofarina@treesa.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('elcapreventa0@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jhpalmieri@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('sergio@tecnointelcom.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('matiasspir@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('clientesrubyselnet@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('avelini@saitech.com.ar', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('williamirausquin@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gtonini.selnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('hitechsolutions.ar@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('gustaiglesias1969@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('ventas2.brujula@gmail.com', ARRAY['ruby']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('miguelziraldo@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('jvillella.selnet@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_vivotek, acceso_ezviz') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('florfolmer@gmail.com', ARRAY['black']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('juan291191@gmail.com', ARRAY['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna']::TEXT[], 'cliente', 'activo', 'acceso_ezviz, acceso_vivotek') ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('fortalezaelectricidad@gmail.com', ARRAY['diamond']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) VALUES ('err.associates09@gmail.com', ARRAY['gold']::TEXT[], 'cliente', 'activo', NULL) ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;
