import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ADMIN_EMAILS = [
  'canderocioaranda.selnet@gmail.com',
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
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 });
    }

    const admin = createAdminClient();

    // 1. Usuarios pendientes de aprobación
    const { data: pendientes, error: pendErr } = await admin
      .from('profiles')
      .select('id, email, creado_el, rol, estado, empresa, cuit, nombre, apellido, nombre_contacto')
      .eq('estado', 'pendiente')
      .order('creado_el', { ascending: false });

    if (pendErr) {
      console.error('Error fetching pendientes:', pendErr);
    }

    // 2. Registros y logins recientes desde login_logs
    const { data: logs, error: logsErr } = await admin
      .from('login_logs')
      .select('id, email, evento, creado_el, detalles')
      .order('creado_el', { ascending: false })
      .limit(12);

    if (logsErr && logsErr.code !== '42P01') {
      console.warn('Error fetching login_logs:', logsErr);
    }

    const pendingList = pendientes || [];
    const recentLogs = logs || [];

    return NextResponse.json({
      ok: true,
      pendingCount: pendingList.length,
      pendientes: pendingList,
      logs: recentLogs,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error in /api/admin/notificaciones:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
