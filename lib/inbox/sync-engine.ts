import { SupabaseClient } from '@supabase/supabase-js';
import { useInboxStore, ContactItem, MessageItem } from './use-inbox-store';
import { getInboxCounts } from '@/app/actions/chat';

let syncChannel: any = null;
let currentOrgId: string | null = null;
let debounceCountsTimer: NodeJS.Timeout | null = null;
let isSyncingDelta = false;

/**
 * Solicita los contadores reales al servidor con debounce de 1 segundo
 * para evitar colapsar la cola de server actions cuando entran ráfagas de mensajes.
 */
export function scheduleDebouncedCountsRefresh() {
  if (typeof window === 'undefined') return;
  if (debounceCountsTimer) {
    clearTimeout(debounceCountsTimer);
  }
  debounceCountsTimer = setTimeout(async () => {
    try {
      const counts = await getInboxCounts();
      useInboxStore.getState().setCounts(counts);
    } catch (err) {
      console.warn('[SyncEngine] Error refrescando contadores debounced:', err);
    }
  }, 1000);
}

/**
 * Resync delta inteligente:
 * Trae solo los contactos modificados y mensajes recibidos mientras el equipo estuvo
 * suspendido o sin conexión, sin recargar toda la página.
 */
export async function performDeltaSync(supabase: any) {
  if (isSyncingDelta) return;
  isSyncingDelta = true;

  const state = useInboxStore.getState();
  const orgId = state.organizationId;
  const lastSync = state.lastSyncAt;

  if (!orgId || !lastSync) {
    isSyncingDelta = false;
    return;
  }

  try {
    // 1. Consultar contactos modificados desde lastSync
    const { data: updatedContacts } = await (supabase.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, deal_value, is_ai_active, last_interaction_at, updated_at, custom_fields, assigned_to, channel, instagram_username, instagram_id, unread_count, last_message, last_message_sender, last_message_preview, waiting_since, conversation_status, ai_snooze_until')
      .eq('organization_id', orgId)
      .gt('updated_at', lastSync)
      .is('deleted_at', null);

    if (updatedContacts && updatedContacts.length > 0) {
      updatedContacts.forEach((c: ContactItem) => {
        state.upsertContact(c);
      });
    }

    // 2. Consultar mensajes nuevos para todos los chats que actualmente tienen mensajes en caché
    const cachedContactIds = Object.keys(state.messagesByContact);
    if (cachedContactIds.length > 0) {
      const { data: newMessages } = await (supabase.from('messages') as any)
        .select('id, contact_id, sender_type, content, created_at, status, reply_to_message_id, reactions, meta_message_id')
        .in('contact_id', cachedContactIds)
        .gt('created_at', lastSync)
        .order('created_at', { ascending: true });

      if (newMessages && newMessages.length > 0) {
        newMessages.forEach((m: any) => {
          state.upsertMessage(m);
        });
      }
    }

    // 3. Recalcular contadores y actualizar timestamp de sincronización
    scheduleDebouncedCountsRefresh();
    state.setLastSyncAt(new Date().toISOString());
    state.setOnline(true);
  } catch (err) {
    console.error('[SyncEngine] Error en delta resync:', err);
  } finally {
    isSyncingDelta = false;
  }
}

/**
 * Inicializa el Sync Engine con 1 solo canal persistente para toda la aplicación.
 */
export function initSyncEngine(supabase: any, organizationId: string) {
  if (syncChannel && currentOrgId === organizationId) {
    return () => {};
  }

  // Si había un canal previo para otra org, cerrarlo
  if (syncChannel) {
    supabase.removeChannel(syncChannel);
    syncChannel = null;
  }

  currentOrgId = organizationId;
  const store = useInboxStore.getState();

  // 1. Montar canal único con suscripción a contacts y messages
  syncChannel = supabase
    .channel(`inbox_sync_${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'contacts',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload: any) => {
        if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            store.removeContact(payload.old.id);
          }
        } else if (payload.new) {
          store.upsertContact(payload.new as ContactItem);
        }
        scheduleDebouncedCountsRefresh();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
      },
      (payload: any) => {
        const currentStore = useInboxStore.getState();
        const msg = payload.new as (MessageItem & { contact_id: string; organization_id?: string });
        if (!msg || !msg.contact_id) return;

        // Validar pertenencia por organization_id (si la columna ya existe) o por caché de contactos
        const belongsToOrg = !msg.organization_id || msg.organization_id === organizationId || Boolean(currentStore.contactsById[msg.contact_id]);
        if (!belongsToOrg) return;

        if (payload.eventType === 'UPDATE') {
          currentStore.updateMessageStatus(msg.id, msg.contact_id, msg.status || 'sent', msg.meta_message_id);
          if (msg.reactions !== undefined) {
            currentStore.updateMessageReaction(msg.id, msg.contact_id, msg.reactions);
          }
          return;
        }

        if (payload.eventType === 'INSERT') {
          currentStore.upsertMessage(msg);
          scheduleDebouncedCountsRefresh();

          // Si es un relevo humano (handoff) y el chat no está abierto, disparar aviso sonoro/push
          if (msg.sender_type === 'lead') {
            const contact = currentStore.contactsById[msg.contact_id];
            if (contact && !contact.is_ai_active && currentStore.activeContactId !== msg.contact_id) {
              window.dispatchEvent(
                new CustomEvent('synqo-inbox-handoff-alert', {
                  detail: {
                    id: contact.id,
                    name: contact.name || contact.phone,
                    phone: contact.phone,
                    lastMessage: msg.content,
                  },
                })
              );
            }
          }
        }
      }
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        store.setOnline(true);
        // Si nos reconectamos tras una desconexión, hacer resync delta
        if (store.lastSyncAt) {
          performDeltaSync(supabase);
        }
      } else if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        store.setOnline(false);
      }
    });

  // 2. Manejo de ciclo de vida del navegador (Online / Offline / Pestaña visible)
  const handleOnline = () => {
    store.setOnline(true);
    performDeltaSync(supabase);
  };

  const handleOffline = () => {
    store.setOnline(false);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      performDeltaSync(supabase);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // Función de limpieza
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (syncChannel) {
      supabase.removeChannel(syncChannel);
      syncChannel = null;
      currentOrgId = null;
    }
    if (debounceCountsTimer) {
      clearTimeout(debounceCountsTimer);
      debounceCountsTimer = null;
    }
  };
}
