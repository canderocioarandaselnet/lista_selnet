import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { UserTier } from '@/types';

const ALL_TIERS: UserTier[] = ['gold', 'ruby', 'platinum', 'black', 'diamond', 'interna'];
const ADMIN_EMAILS = [
  'canderocioaranda.selnet@gmail.com',
  'mhmolesini@gmail.com',
];

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    const { tier } = await request.json();
    const targetTier = (tier || '').toLowerCase().trim() as UserTier;

    if (!ALL_TIERS.includes(targetTier)) {
      return NextResponse.json({ ok: false, error: 'Nivel no válido' }, { status: 400 });
    }

    const email = (user.email || '').trim().toLowerCase();
    const admin = createAdminClient();

    // Consultar perfil actual
    const { data: profile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ ok: false, error: 'Perfil no encontrado' }, { status: 404 });
    }

    const isAdmin = ADMIN_EMAILS.includes(email) || profile.rol === 'admin';
    const isInterna = (profile.niveles || []).includes('interna') || profile.tier === 'interna';
    const hasTier = (profile.niveles || []).includes(targetTier) || profile.tier === targetTier;

    if (!isAdmin && !isInterna && !hasTier) {
      return NextResponse.json({ ok: false, error: 'No tienes permisos para este nivel' }, { status: 403 });
    }

    // Actualizar nivel activo
    await admin
      .from('profiles')
      .update({
        nivel_activo: targetTier,
        actualizado_el: new Date().toISOString(),
      })
      .eq('id', user.id);

    return NextResponse.json({ ok: true, nivel_activo: targetTier });
  } catch (error: any) {
    console.error('Error en /api/auth/switch-tier:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
