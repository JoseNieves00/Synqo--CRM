import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { InboxView } from '@/components/chat/InboxView';
import { NewLeadModal } from '@/components/pipeline/NewLeadModal';
import { MessageSquare } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const supabase = createServerSupabaseClient();

  // Consultar contactos reales de la organización
  const { data: contacts } = await (supabase.from('contacts') as any)
    .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields')
    .order('last_interaction_at', { ascending: false })
    .limit(50);

  const contactList = contacts || [];

  if (contactList.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center max-w-lg mx-auto shadow-sm my-8">
        <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-gray-900">Bandeja de Entrada Vacía</h3>
        <p className="text-xs text-gray-500 mt-1 mb-6 leading-relaxed">
          No hay chats activos registrados para tu organización. Puedes registrar un lead manualmente para iniciar una conversación o vincular tu número de WhatsApp de Meta en Ajustes.
        </p>
        <NewLeadModal buttonLabel="Registrar Primer Lead" />
      </div>
    );
  }

  const activeContact = contactList[0];

  // Consultar mensajes del contacto seleccionado
  const { data: messages } = await (supabase.from('messages') as any)
    .select('id, sender_type, content, created_at')
    .eq('contact_id', activeContact.id)
    .order('created_at', { ascending: true });

  return (
    <InboxView
      contacts={contactList}
      activeContact={activeContact}
      messages={messages || []}
    />
  );
}
