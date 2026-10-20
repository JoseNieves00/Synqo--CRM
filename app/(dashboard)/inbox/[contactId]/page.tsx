import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { InboxView } from '@/components/chat/InboxView';
import { notFound } from 'next/navigation';

interface InboxDetailPageProps {
  params: {
    contactId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: InboxDetailPageProps) {
  const { contactId } = params;
  const supabase = createServerSupabaseClient();

  // 1. Consultar todos los contactos de la organización para la lista lateral
  const { data: contacts } = await (supabase.from('contacts') as any)
    .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields')
    .order('last_interaction_at', { ascending: false })
    .limit(50);

  const contactList = contacts || [];

  // 2. Consultar el contacto seleccionado específicamente
  const activeContact = contactList.find((c: any) => c.id === contactId) || (
    await (supabase.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields')
      .eq('id', contactId)
      .single()
  ).data;

  if (!activeContact) {
    notFound();
  }

  // 3. Consultar mensajes del contacto
  const { data: messages } = await (supabase.from('messages') as any)
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
