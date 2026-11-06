import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { getKnowledgeGapsCount } from '@/app/actions/knowledge-gaps';
import { redirect, notFound } from 'next/navigation';
import { InboxView } from '@/components/chat/InboxView';

interface InboxDetailPageProps {
  params: {
    contactId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: InboxDetailPageProps) {
  const { contactId } = params;
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  // Consultar contactos, mensajes, miembros y vacíos de IA en paralelo para máxima velocidad
  const [contactsRes, messagesRes, teamRes, gapsCount] = await Promise.all([
    (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, updated_at, custom_fields, assigned_to, channel, instagram_username, instagram_id, unread_count, last_message, ai_snooze_until')
      .eq('organization_id', current.organization.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(50),
    (supabaseAdmin.from('messages') as any)
      .select('id, sender_type, content, created_at, status, reply_to_message_id')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50),
    (supabaseAdmin.from('profiles') as any)
      .select('id, full_name, email, role')
      .eq('organization_id', current.organization.id)
      .order('full_name', { ascending: true }),
    getKnowledgeGapsCount(),
  ]);

  const contactList = contactsRes.data || [];

  // Obtener el contacto activo de la lista precargada o consulta puntual si no estuviera en los 50 recientes
  let activeContact = contactList.find((c: any) => c.id === contactId);

  if (!activeContact) {
    const { data: singleContact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields, assigned_to, channel, instagram_username, instagram_id, unread_count, last_message, ai_snooze_until')
      .eq('id', contactId)
      .eq('organization_id', current.organization.id)
      .is('deleted_at', null)
      .maybeSingle();

    activeContact = singleContact;
  }

  if (!activeContact) {
    notFound();
  }

  const messages = (messagesRes.data || []).reverse();
  const teamMembers = teamRes.data || [];

  return (
    <InboxView
      organizationId={current.organization.id}
      contacts={contactList}
      activeContact={activeContact}
      messages={messages || []}
      customTemplates={(current.organization as any)?.whatsapp_templates || []}
      whatsappProvider={(current.organization as any)?.whatsapp_provider || ((current.organization as any)?.evolution_instance_name ? 'evolution' : 'meta')}
      currentUserId={current.user.id}
      currentUserRole={current.profile?.role || 'agent'}
      teamMembers={teamMembers}
      pendingGapsCount={gapsCount || 0}
    />
  );
}
