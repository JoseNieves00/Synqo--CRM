import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
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

  // Consultar contactos y mensajes en paralelo para máxima velocidad
  const [contactsRes, messagesRes] = await Promise.all([
    (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, updated_at, custom_fields')
      .eq('organization_id', current.organization.id)
      .order('updated_at', { ascending: false })
      .limit(50),
    (supabaseAdmin.from('messages') as any)
      .select('id, sender_type, content, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(100),
  ]);

  const contactList = contactsRes.data || [];

  // Obtener el contacto activo de la lista precargada o consulta puntual si no estuviera en los 50 recientes
  let activeContact = contactList.find((c: any) => c.id === contactId);

  if (!activeContact) {
    const { data: singleContact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields')
      .eq('id', contactId)
      .eq('organization_id', current.organization.id)
      .single();

    activeContact = singleContact;
  }

  if (!activeContact) {
    notFound();
  }

  const messages = messagesRes.data || [];

  return (
    <InboxView
      contacts={contactList}
      activeContact={activeContact}
      messages={messages || []}
      customTemplates={(current.organization as any)?.whatsapp_templates || []}
    />
  );
}
