import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/lib/notifications/resend';

export async function POST(request: NextRequest) {
  // Verificación de secreto del webhook de Supabase para evitar llamadas no autorizadas
  const secretHeader = request.headers.get('x-supabase-webhook-secret');
  const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return new NextResponse('Unauthorized: Invalid or missing webhook secret', { status: 401 });
  }

  try {
    const payload = await request.json();
    const { record, old_record, type } = payload;

    if (type === 'UPDATE' && record && old_record) {
      // 1. Obtener email del administrador de la organización
      const { data: adminProfile } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('organization_id', record.organization_id)
        .eq('role', 'admin')
        .single();

      const adminEmail = adminProfile?.email;
      if (!adminEmail) {
        return NextResponse.json({ status: 'no_admin_found' }, { status: 200 });
      }

      // 2. Disparador 1: is_ai_active cambió de true a false (Relevo humano requerido)
      if (old_record.is_ai_active === true && record.is_ai_active === false) {
        await NotificationService.sendHumanHandoffAlert({
          adminEmail,
          leadName: record.name || 'Cliente WhatsApp',
          leadPhone: record.phone,
          reason: 'Un agente humano tomó el control o el usuario solicitó asistencia manual.',
        });
      }

      // 3. Disparador 2: cambio de pipeline a cita_agendada
      if (old_record.pipeline_stage !== 'cita_agendada' && record.pipeline_stage === 'cita_agendada') {
        await NotificationService.sendAppointmentBookedAlert({
          adminEmail,
          leadName: record.name || 'Cliente WhatsApp',
          leadPhone: record.phone,
          bookingTime: record.updated_at || new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ status: 'handled' }, { status: 200 });
  } catch (error: any) {
    console.error('[SUPABASE WEBHOOK HANDOFF ERROR]', error);
    return NextResponse.json({ error: error?.message || 'Error processing webhook' }, { status: 500 });
  }
}

