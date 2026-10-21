import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Error: Variables NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY no encontradas en .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws as any },
});

const SUPER_ADMIN_EMAIL = 'admin@synqo.dev';

async function resetSuperAdmin() {
  console.log('🔄 Iniciando reseteo y regeneración del Super Admin...');

  // 1. Obtener la contraseña deseada del argumento o usar una segura por defecto
  const customPassword = process.argv[2] || 'Synqo2026!AdminMaster';

  // 2. Buscar si ya existe el perfil
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('email', SUPER_ADMIN_EMAIL)
    .maybeSingle();

  // 3. Buscar si existe el usuario en Supabase Auth
  const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
  const existingAuthUser = usersList.users.find(
    (u) => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
  );

  let userId = existingAuthUser?.id || profile?.id;
  let organizationId = profile?.organization_id;

  // Si no hay organización asociada, buscar la primera o crear una demo
  if (!organizationId) {
    const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
    if (orgs && orgs.length > 0) {
      organizationId = orgs[0].id;
    } else {
      const { data: newOrg } = await supabaseAdmin
        .from('organizations')
        .insert({
          name: 'Synqo HQ',
          subscription_status: 'active',
          plan_type: 'enterprise',
          max_users: 50,
        })
        .select('id')
        .single();
      organizationId = newOrg?.id;
    }
  }

  // 4. Si el usuario existe en Auth, actualizar su contraseña y limpiar la bandera de bloqueo
  if (existingAuthUser) {
    console.log(`👤 Usuario encontrado en Supabase Auth (UID: ${existingAuthUser.id}). Actualizando credenciales...`);
    
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
      password: customPassword,
      email_confirm: true,
      user_metadata: {
        ...(existingAuthUser.user_metadata || {}),
        full_name: 'Super Administrador',
        must_change_password: false, // 🔓 Quitar forzado de clave temporal
      },
    });

    if (updateError) {
      throw new Error(`Error actualizando auth.users: ${updateError.message}`);
    }
    userId = existingAuthUser.id;
  } else {
    // Si no existía, crearlo desde cero
    console.log(`✨ Creando nuevo usuario Super Admin en Supabase Auth (${SUPER_ADMIN_EMAIL})...`);
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: SUPER_ADMIN_EMAIL,
      password: customPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Super Administrador',
        must_change_password: false,
      },
    });

    if (createError || !newUser?.user) {
      throw new Error(`Error creando auth user: ${createError?.message}`);
    }
    userId = newUser.user.id;
  }

  // 5. Asegurar que en profiles tenga is_super_admin: true y rol admin
  console.log(`🛡️ Configurando privilegios de Super Admin en public.profiles...`);
  const { error: profileUpsertError } = await supabaseAdmin.from('profiles').upsert(
    {
      id: userId,
      organization_id: organizationId,
      email: SUPER_ADMIN_EMAIL,
      full_name: 'Super Administrador',
      role: 'admin',
      is_super_admin: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (profileUpsertError) {
    throw new Error(`Error en profiles: ${profileUpsertError.message}`);
  }

  console.log('\n🎉 ¡SUPER ADMIN REGENERADO Y CONFIGURADO CON ÉXITO!');
  console.log('────────────────────────────────────────────────────────');
  console.log(`📧 Correo:        ${SUPER_ADMIN_EMAIL}`);
  console.log(`🔑 Contraseña:    ${customPassword}`);
  console.log(`🛡️ Rol:           Super Admin (is_super_admin: true)`);
  console.log(`🔓 Clave Forzada: Desactivada (Acceso directo sin bloqueos)`);
  console.log('────────────────────────────────────────────────────────');
  console.log('Puedes ingresar ahora mismo en: http://localhost:3000/login\n');
}

resetSuperAdmin().catch((err) => {
  console.error('❌ Error durante el reseteo:', err);
  process.exit(1);
});
