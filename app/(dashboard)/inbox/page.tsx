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
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, updated_at, custom_fields, assigned_to')
      .eq('organization_id', current.organization.id)
      .order('updated_at', { ascending: false })
      .limit(50),
    (supabaseAdmin.from('profiles') as any)
      .select('id, full_name, email, role')
      .eq('organization_id', current.organization.id)
      .order('full_name', { ascending: true }),
    getKnowledgeGapsCount(),
  ]);

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

  // Consultar mensajes del contacto seleccionado con límite
  const { data: messages } = await (supabaseAdmin.from('messages') as any)
    .select('id, sender_type, content, created_at')
    .eq('contact_id', activeContact.id)
    .order('created_at', { ascending: true })
    .limit(100);

  return (
    <InboxView
      contacts={contactList}
      activeContact={activeContact}
      messages={messages || []}
      customTemplates={(current.organization as any)?.whatsapp_templates || []}
      currentUserId={current.user.id}
      currentUserRole={current.profile?.role || 'agent'}
      teamMembers={teamMembers || []}
      pendingGapsCount={gapsCount || 0}
    />
  );
}
