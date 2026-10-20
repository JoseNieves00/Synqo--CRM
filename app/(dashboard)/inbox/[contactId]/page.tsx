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

  // 1. Consultar todos los contactos de la organización para la lista lateral
  const { data: contacts } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields')
    .eq('organization_id', current.organization.id)
    .order('last_interaction_at', { ascending: false })
    .limit(50);

  const contactList = contacts || [];

  // 2. Consultar el contacto seleccionado específicamente asegurando tenant isolation
  const activeContact = contactList.find((c: any) => c.id === contactId) || (
    await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields')
      .eq('id', contactId)
      .eq('organization_id', current.organization.id)
      .single()
  ).data;

  if (!activeContact) {
    notFound();
  }

  // 3. Consultar mensajes del contacto
  const { data: messages } = await (supabaseAdmin.from('messages') as any)
    .select('id, sender_type, content, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true });

  return (
    <InboxView
      contacts={contactList}
      activeContact={activeContact}
      messages={messages || []}
    />
  );
}
