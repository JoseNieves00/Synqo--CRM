import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { MessageSender } from '@/lib/supabase/types';
import Link from 'next/link';
import { MessageSquare, User, Bot } from 'lucide-react';

export default async function InboxPage() {
  const supabase = createServerSupabaseClient();

  // Obtener contactos de la organización
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at')
    .order('last_interaction_at', { ascending: false })
    .limit(20);

  // Datos mock para visualización inicial si la base de datos está vacía
  const defaultContacts = contacts && contacts.length > 0 ? contacts : [
    {
      id: 'demo-lead-1',
      name: 'Carlos Mendoza',
      phone: '+52 55 1234 5678',
      pipeline_stage: 'calificado' as const,
      is_ai_active: true,
      last_interaction_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2h atrás (dentro de 24h)
    },
    {
      id: 'demo-lead-2',
      name: 'Mariana Gómez',
      phone: '+54 9 11 9876 5432',
      pipeline_stage: 'cita_agendada' as const,
      is_ai_active: false,
      last_interaction_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString(), // 26h atrás (expirado >24h)
    },
  ];

  const activeContact = defaultContacts[0];

  // Mensajes de demostración o del contacto seleccionado
  const demoMessages = [
    {
      id: 'm1',
      sender_type: 'lead' as MessageSender,
      content: 'Hola, vi sus servicios de automatización de WhatsApp en synqo.dev y quisiera más información sobre planes para mi clínica.',
      created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'm2',
      sender_type: 'ai' as MessageSender,
      content: '¡Hola Carlos! Un gusto saludarte. En Synqo ofrecemos automatización completa con IA conectada a tu calendario para clínicas y negocios. ¿Te gustaría agendar una llamada breve de 15 minutos esta semana para revisar una demo personalizada?',
      created_at: new Date(Date.now() - 2 * 3600 * 1000 + 4000).toISOString(),
    },
    {
      id: 'm3',
      sender_type: 'lead' as MessageSender,
      content: 'Sí, me vendría bien el jueves por la mañana, ¿qué horarios tienen libres?',
      created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      {/* Lista lateral de Leads */}
      <div className="lg:col-span-4 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col shadow-xs">
        <div className="p-4 border-b border-gray-200 bg-gray-50/50">
          <h3 className="font-semibold text-gray-900 text-sm">Conversaciones de WhatsApp</h3>
          <p className="text-xs text-gray-500 mt-0.5">Leads conectados en tiempo real</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {defaultContacts.map((c) => (
            <Link
              key={c.id}
              href={`/inbox/${c.id}`}
              className={`p-4 block hover:bg-slate-50 transition ${
                c.id === activeContact.id ? 'bg-slate-100/70 border-l-4 border-l-black' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-900">{c.name || 'Sin nombre'}</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    c.is_ai_active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {c.is_ai_active ? 'IA Activa' : 'Humano'}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono">{c.phone}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Ventana de Chat Principal */}
      <div className="lg:col-span-8">
        <ChatWindow contact={activeContact} messages={demoMessages} />
      </div>
    </div>
  );
}

