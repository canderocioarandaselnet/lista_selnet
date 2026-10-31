import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Profile, UserTier } from '@/types';

const ADMIN_EMAILS = [
  'canderocioaranda.selnet@gmail.com',
  'mhmolesini@gmail.com',
];

const ALL_TIERS: UserTier[] = ['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna'];

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ authenticated: false });
    }

    const email = (user.email || '').trim().toLowerCase();
    const admin = createAdminClient();

    // 1. Buscar perfil existente
    const { data: profileData, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileData) {
      // Si es admin conocido, forzar permisos completos
      const isAdmin = ADMIN_EMAILS.includes(email) || profileData.rol === 'admin';
      const niveles: UserTier[] = isAdmin
        ? ALL_TIERS
        : (profileData.niveles && profileData.niveles.length > 0
            ? profileData.niveles
            : [profileData.tier || 'gold']);

      const nivelActivo: UserTier = profileData.nivel_activo || niveles[0] || 'gold';

      const safeProfile: Profile = {
        id: profileData.id,
        email: profileData.email,
        rol: isAdmin ? 'admin' : (profileData.rol || 'cliente'),
        estado: isAdmin ? 'activo' : (profileData.estado || 'activo'),
        niveles,
        nivel_activo: nivelActivo,
        primer_login: profileData.primer_login,
        ultimo_login: profileData.ultimo_login,
        nivel_asignado_el: profileData.nivel_asignado_el,
        asignado_por: profileData.asignado_por,
        empresa: profileData.empresa,
        nombre_contacto: profileData.nombre_contacto,
        telefono: profileData.telefono,
        creado_el: profileData.creado_el,
      };

      return NextResponse.json({ authenticated: true, user: safeProfile });
    }

    // 2. Si no tiene perfil aún (primer login post-oauth), resolverlo
    const isAdmin = ADMIN_EMAILS.includes(email);
    let rol: 'admin' | 'cliente' = isAdmin ? 'admin' : 'cliente';
    let estado: 'activo' | 'pendiente' | 'inactivo' = isAdmin ? 'activo' : 'pendiente';
    let niveles: UserTier[] = isAdmin ? ALL_TIERS : [];
    let nivelActivo: UserTier = isAdmin ? 'interna' : 'gold';

    // Chequear si existe en accesos_precargados
    const { data: precargado } = await admin
      .from('accesos_precargados')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (precargado) {
      rol = precargado.rol || rol;
      estado = precargado.estado || 'activo';
      niveles = precargado.niveles && precargado.niveles.length > 0 ? precargado.niveles : ['gold'];
      nivelActivo = niveles[0];
    }

    const now = new Date().toISOString();
    const newProfile = {
      id: user.id,
      email,
      rol,
      estado,
      niveles,
      nivel_activo: nivelActivo,
      primer_login: now,
      ultimo_login: now,
      creado_el: now,
      actualizado_el: now,
    };

    await admin.from('profiles').upsert(newProfile, { onConflict: 'id' });

    // Registrar en login_logs
    await admin.from('login_logs').insert({
      user_id: user.id,
      email,
      evento: 'LOGIN',
      detalles: { metodo: user.app_metadata?.provider || 'email' },
    });

    return NextResponse.json({ authenticated: true, user: newProfile });
  } catch (error: any) {
    console.error('Error en /api/auth/me:', error);
    return NextResponse.json({ authenticated: false, error: error.message }, { status: 500 });
  }
}
