import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { getKnowledgeGapsCount } from '@/app/actions/knowledge-gaps';
import { redirect } from 'next/navigation';
import { InboxView } from '@/components/chat/InboxView';
import { NewLeadModal } from '@/components/pipeline/NewLeadModal';
import { MessageSquare } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  // Consultar contactos reales de la organización, miembros del equipo y conteo de vacíos de IA
  const [{ data: contacts }, { data: teamMembers }, gapsCount] = await Promise.all([
    (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, updated_at, custom_fields, assigned_to, channel, instagram_username, instagram_id, unread_count, last_message, ai_snooze_until')
      .eq('organization_id', current.organization.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(50),
    (supabaseAdmin.from('profiles') as any)
      .select('id, full_name, email, role')
      .eq('organization_id', current.organization.id)
      .order('full_name', { ascending: true }),
    getKnowledgeGapsCount(),
  ]);

  const contactList = contacts || [];
  const activeContact = contactList.length > 0 ? contactList[0] : null;

  // Consultar los 50 mensajes más recientes del primer contacto si existe
  let messages: any[] = [];
  if (activeContact) {
    const { data: msgs } = await (supabaseAdmin.from('messages') as any)
      .select('id, sender_type, content, created_at, status, reply_to_message_id')
      .eq('contact_id', activeContact.id)
      .order('created_at', { ascending: false })
      .limit(50);
    messages = (msgs || []).reverse();
  }

  return (
    <InboxView
      organizationId={current.organization.id}
      contacts={contactList}
      activeContact={activeContact}
      messages={messages}
      customTemplates={(current.organization as any)?.whatsapp_templates || []}
      whatsappProvider={(current.organization as any)?.whatsapp_provider || ((current.organization as any)?.evolution_instance_name ? 'evolution' : 'meta')}
      currentUserId={current.user.id}
      currentUserRole={current.profile?.role || 'agent'}
      teamMembers={teamMembers || []}
      pendingGapsCount={gapsCount || 0}
    />
  );
}
