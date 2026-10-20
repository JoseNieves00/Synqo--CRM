import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MessageSender } from '@/lib/supabase/types';

interface InboxDetailPageProps {
  params: {
    contactId: string;
  };
}

interface ContactView {
  id: string;
  name: string | null;
  phone: string;
  pipeline_stage: any;
  is_ai_active: boolean;
  last_interaction_at: string;
}

export default async function InboxDetailPage({ params }: InboxDetailPageProps) {
  const { contactId } = params;
  const supabase = createServerSupabaseClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at')
    .eq('id', contactId)
    .single();

  let targetContact: ContactView | null = contact as ContactView | null;
  let targetMessages: { id: string; sender_type: MessageSender; content: string; created_at: string }[] = [];

  if (!targetContact) {
    // Si no está en BD (por ejemplo lead de demostración), proveer fallback
    if (contactId === 'demo-lead-1' || contactId === 'demo-lead-2') {
      targetContact = {
        id: contactId,
        name: contactId === 'demo-lead-1' ? 'Carlos Mendoza' : 'Mariana Gómez',
        phone: contactId === 'demo-lead-1' ? '+52 55 1234 5678' : '+54 9 11 9876 5432',
        pipeline_stage: contactId === 'demo-lead-1' ? 'calificado' : 'cita_agendada',
        is_ai_active: contactId === 'demo-lead-1',
        last_interaction_at: contactId === 'demo-lead-1'
          ? new Date(Date.now() - 2 * 3600 * 1000).toISOString()
          : new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
      };
      targetMessages = [
        {
          id: 'dm-1',
          sender_type: 'lead',
          content: 'Hola, me gustaría agendar una cita para conocer más sobre Synqo.',
          created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        },
        {
          id: 'dm-2',
          sender_type: 'ai',
          content: '¡Excelente! Tenemos espacios este jueves a las 10:00 AM o viernes a las 3:00 PM. ¿Cuál prefieres?',
          created_at: new Date(Date.now() - 2 * 3600 * 1000 + 3000).toISOString(),
        },
      ];
    } else {
      notFound();
    }
  } else {
    const { data: messages } = await supabase
      .from('messages')
      .select('id, sender_type, content, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });

    targetMessages = (messages as any[]) || [];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/inbox"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-black font-medium transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a todas las conversaciones
        </Link>
      </div>

      <ChatWindow contact={targetContact} messages={targetMessages} />
    </div>
  );
}

