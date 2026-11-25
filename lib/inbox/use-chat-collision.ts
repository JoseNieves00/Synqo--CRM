'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Suscripción Realtime Broadcast por conversación para detectar colisiones de tipeo entre asesores.
 */
export function useChatCollision(contactId: string, myName: string) {
  const [otherTyping, setOtherTyping] = useState<string | null>(null);
  const broadcastChannelRef = useRef<any>(null);
  const lastTypingBroadcastRef = useRef<number>(0);

  useEffect(() => {
    if (!contactId) return;
    const supabase = createClient();
    let typingTimeout: NodeJS.Timeout | null = null;

    const channel = supabase.channel(`chat-collision-${contactId}`, {
      config: { broadcast: { self: false } },
    });

    broadcastChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const typingUser = payload?.payload?.userName;
        if (typingUser) {
          setOtherTyping(typingUser);
          if (typingTimeout) clearTimeout(typingTimeout);
          typingTimeout = setTimeout(() => {
            setOtherTyping(null);
          }, 3500);
        }
      })
      .subscribe();

    return () => {
      broadcastChannelRef.current = null;
      supabase.removeChannel(channel);
      if (typingTimeout) clearTimeout(typingTimeout);
    };
  }, [contactId]);

  const broadcastTyping = useCallback(() => {
    if (!contactId) return;
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current < 3500) {
      return;
    }
    lastTypingBroadcastRef.current = now;

    const channel =
      broadcastChannelRef.current ||
      createClient().channel(`chat-collision-${contactId}`, {
        config: { broadcast: { self: false } },
      });

    channel
      .send({
        type: 'broadcast',
        event: 'typing',
        payload: { userName: myName || 'Un asesor' },
      })
      .catch(() => {});
  }, [contactId, myName]);

  return { otherTyping, broadcastTyping };
}
