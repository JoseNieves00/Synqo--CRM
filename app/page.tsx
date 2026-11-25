import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SynqoLandingClient } from '@/components/landing/SynqoLandingClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect('/dashboard');
    }
  } catch {
    // Mostrar landing pública si no hay sesión activa
  }

  return <SynqoLandingClient />;
}
