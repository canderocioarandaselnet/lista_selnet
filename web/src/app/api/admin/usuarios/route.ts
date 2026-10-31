import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { UsuarioAdminItem, UserTier } from '@/types';

const ADMIN_EMAILS = [
  'canderocioaranda.selnet@gmail.com',
  'mhmolesini@gmail.com',
];

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  const email = user.email.trim().toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return { user, email, isAdmin: true };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.rol === 'admin') return { user, email, isAdmin: true };

  return null;
}

export async function GET() {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Acceso no autorizado' }, { status: 403 });
    }

    const admin = createAdminClient();

    // 1. Obtener perfiles registrados
    const { data: profiles, error: pErr } = await admin
      .from('profiles')
      .select('*')
      .order('creado_el', { ascending: false });

    if (pErr) throw pErr;

    // 2. Obtener precargados
    const { data: precargados, error: pcErr } = await admin
      .from('accesos_precargados')
      .select('*')
      .order('creado_el', { ascending: false });

    if (pcErr && pcErr.code !== '42P01') {
      console.warn('Error accesos_precargados:', pcErr);
    }

    const registeredEmails = new Set((profiles || []).map((p: any) => p.email.toLowerCase()));
    const items: UsuarioAdminItem[] = [];

    // Perfiles registrados
    const nowMs = Date.now();
    for (const p of profiles || []) {
      const lastAct = p.ultima_actividad || p.actualizado_el || p.ultimo_login;
      let isOnline = false;

      // Un usuario está "En Línea" si ya inició sesión y tuvo actividad en los últimos 4 minutos
      if (p.primer_login && lastAct) {
        const diffMinutes = (nowMs - new Date(lastAct).getTime()) / (1000 * 60);
        isOnline = diffMinutes <= 4;
      }

      items.push({
        id: p.id,
        email: p.email,
        rol: p.rol || 'cliente',
        estado: p.estado || 'activo',
        niveles: p.niveles || (p.tier ? [p.tier] : ['gold']),
        nivel_activo: p.nivel_activo || 'gold',
        primer_login: p.primer_login,
        ultimo_login: p.ultimo_login,
        ultima_actividad: lastAct,
        en_linea: isOnline,
        creado_el: p.creado_el,
        asignado_por: p.asignado_por,
        is_precargado: false,
      });
    }

    // Precargados que aún no iniciaron sesión por primera vez
    for (const pc of precargados || []) {
      if (!registeredEmails.has(pc.email.toLowerCase())) {
        items.push({
          id: `pre_${pc.id}`,
          email: pc.email,
          rol: pc.rol || 'cliente',
          estado: pc.estado || 'activo',
          niveles: pc.niveles || ['gold'],
          creado_el: pc.creado_el,
          notas: pc.notas,
          is_precargado: true,
          en_linea: false,
        });
      }
    }

    const stats = {
      total: items.length,
      activos: items.filter((i) => i.estado === 'activo').length,
      pendientes: items.filter((i) => i.estado === 'pendiente').length,
      inactivos: items.filter((i) => i.estado === 'inactivo').length,
      en_linea: items.filter((i) => i.en_linea).length,
    };

    return NextResponse.json({ ok: true, usuarios: items, stats });
  } catch (error: any) {
    console.error('Error en GET /api/admin/usuarios:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Acceso no autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { id, email, niveles, estado, rol } = body;

    if (!email) {
      return NextResponse.json({ ok: false, error: 'Email requerido' }, { status: 400 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const cleanEmail = email.trim().toLowerCase();

    // Si es un perfil registrado en profiles
    if (id && !id.startsWith('pre_')) {
      const updateData: any = {
        actualizado_el: now,
        nivel_asignado_el: now,
        asignado_por: auth.email,
      };

      if (niveles && Array.isArray(niveles)) updateData.niveles = niveles;
      if (estado) updateData.estado = estado;
      if (rol) updateData.rol = rol;

      const { data, error } = await admin
        .from('profiles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log de auditoría
      await admin.from('login_logs').insert({
        user_id: id,
        email: cleanEmail,
        evento: 'ACCESO_MODIFICADO',
        detalles: { por: auth.email, cambios: updateData },
      });

      return NextResponse.json({ ok: true, usuario: data });
    }

    // Si es un precargado o nuevo
    const updateData: any = {
      actualizado_el: now,
    };
    if (niveles) updateData.niveles = niveles;
    if (estado) updateData.estado = estado;
    if (rol) updateData.rol = rol;

    await admin
      .from('accesos_precargados')
      .update(updateData)
      .ilike('email', cleanEmail);

    return NextResponse.json({ ok: true, email: cleanEmail });
  } catch (error: any) {
    console.error('Error en PATCH /api/admin/usuarios:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Acceso no autorizado' }, { status: 403 });
    }

    const { email, niveles, rol, estado, notas } = await request.json();

    if (!email) {
      return NextResponse.json({ ok: false, error: 'Email requerido' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanNiveles: UserTier[] = niveles && niveles.length > 0 ? niveles : ['gold'];
    const cleanRol = rol || 'cliente';
    const cleanEstado = estado || 'activo';

    const admin = createAdminClient();
    const now = new Date().toISOString();

    // 1. Insertar en accesos_precargados
    await admin.from('accesos_precargados').upsert(
      {
        email: cleanEmail,
        niveles: cleanNiveles,
        rol: cleanRol,
        estado: cleanEstado,
        notas: notas || `Creado desde app por ${auth.email}`,
        creado_el: now,
        actualizado_el: now,
      },
      { onConflict: 'email' }
    );

    // 2. Si el usuario ya se había registrado y estaba en profiles, actualizar su perfil de inmediato
    await admin
      .from('profiles')
      .update({
        niveles: cleanNiveles,
        nivel_activo: cleanNiveles[0],
        rol: cleanRol,
        estado: cleanEstado,
        nivel_asignado_el: now,
        asignado_por: auth.email,
        actualizado_el: now,
      })
      .ilike('email', cleanEmail);

    // 3. Log de auditoría
    await admin.from('login_logs').insert({
      email: cleanEmail,
      evento: 'NUEVO_ACCESO_CREADO',
      detalles: { por: auth.email, niveles: cleanNiveles, rol: cleanRol },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error en POST /api/admin/usuarios:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
