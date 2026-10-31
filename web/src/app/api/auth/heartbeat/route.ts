import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Intentar actualizar ultima_actividad y actualizado_el
    const { error } = await admin
      .from('profiles')
      .update({
        ultima_actividad: now,
        actualizado_el: now,
      })
      .eq('id', user.id);

    // Si la columna ultima_actividad aún no existiera en schema cache, actualizar al menos actualizado_el
    if (error) {
      await admin
        .from('profiles')
        .update({
          actualizado_el: now,
        })
        .eq('id', user.id);
    }

    return NextResponse.json({ ok: true, timestamp: now });
  } catch (error: any) {
    console.error('Error en heartbeat:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
