'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { initSyncEngine } from '@/lib/inbox/sync-engine';

interface InboxSyncProviderProps {
  organizationId?: string | null;
  currentUserId?: string | null;
}

export function InboxSyncProvider({ organizationId }: InboxSyncProviderProps) {
  useEffect(() => {
    if (!organizationId) return;
    const supabase = createClient();
    const cleanup = initSyncEngine(supabase, organizationId);
    return () => {
      cleanup();
    };
  }, [organizationId]);

  return null;
}
