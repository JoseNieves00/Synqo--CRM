import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { getKnowledgeGapsCount } from '@/app/actions/knowledge-gaps';
import { listInbox, getInboxCounts, InboxViewType } from '@/app/actions/chat';
import { getOrganizationPaymentAccounts, getOrganizationCatalogGallery } from '@/app/actions/settings';
import { redirect } from 'next/navigation';
import { InboxView } from '@/components/chat/InboxView';
import { NewLeadModal } from '@/components/pipeline/NewLeadModal';
import { MessageSquare } from 'lucide-react';

interface InboxPageProps {
  searchParams?: {
    view?: string;
    c?: string;
    ch?: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  const activeView: InboxViewType = (searchParams?.view as InboxViewType) || 'por_responder';
  const channelFilter = (searchParams?.ch as any) || 'all';

  // Consultar contactos, contadores, miembros, catálogo y cuentas de pago en paralelo (cero saltos visuales)
  const [inboxRes, initialCounts, { data: teamMembers }, gapsCount, paymentAccounts, catalogItems] = await Promise.all([
    listInbox({
      view: activeView,
      channel: channelFilter,
      search: '',
      offset: 0,
      limit: 30,
    }).catch(() => ({ contacts: [], totalCount: 0 })),
    getInboxCounts().catch(() => ({
      por_responder: 0,
      mis_abiertos: 0,
      ia_atendiendo: 0,
      seguimiento: 0,
      cerrados: 0,
    })),
    (supabaseAdmin.from('profiles') as any)
      .select('id, full_name, email, role')
      .eq('organization_id', current.organization.id)
      .order('full_name', { ascending: true }),
    getKnowledgeGapsCount(),
    getOrganizationPaymentAccounts().catch(() => []),
    getOrganizationCatalogGallery().catch(() => []),
  ]);

  const contactList = inboxRes.contacts || [];
  const targetContactId = searchParams?.c;
  let activeContact = targetContactId
    ? contactList.find((c: any) => c.id === targetContactId) || null
    : contactList.length > 0 ? contactList[0] : null;

  if (targetContactId && !activeContact) {
    const { data: singleContact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, updated_at, custom_fields, assigned_to, channel, instagram_username, instagram_id, unread_count, last_message, last_message_sender, last_message_preview, waiting_since, conversation_status, ai_snooze_until')
      .eq('id', targetContactId)
      .eq('organization_id', current.organization.id)
      .is('deleted_at', null)
      .maybeSingle();
    activeContact = singleContact;
  }

  // Consultar los 50 mensajes más recientes del contacto activo si existe
  let messages: any[] = [];
  if (activeContact) {
    const { data: msgs } = await (supabaseAdmin.from('messages') as any)
      .select('id, sender_type, content, created_at, status, reply_to_message_id, reactions')
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
      initialCounts={initialCounts}
      paymentAccounts={paymentAccounts || []}
      catalogItems={catalogItems || []}
      initialView={activeView}
      customTemplates={(current.organization as any)?.whatsapp_templates || []}
      whatsappProvider={(current.organization as any)?.whatsapp_provider || ((current.organization as any)?.evolution_instance_name ? 'evolution' : 'meta')}
      currentUserId={current.user.id}
      currentUserRole={current.profile?.role || 'agent'}
      teamMembers={teamMembers || []}
      pendingGapsCount={gapsCount || 0}
    />
  );
}
