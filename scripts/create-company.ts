import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar definidos en .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws as any },
});

interface CreateCompanyOptions {
  companyName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planType?: 'core' | 'pro' | 'enterprise';
  subscriptionStatus?: 'active' | 'trialing';
}

export async function provisionCompany({
  companyName,
  adminName,
  adminEmail,
  adminPassword,
  planType = 'core',
  subscriptionStatus = 'active',
}: CreateCompanyOptions) {
  console.log(`\n🏢 [SUPER ADMIN] Provisionando organización: "${companyName}"...`);

  // 1. Crear Organización en la base de datos
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: companyName.trim(),
      subscription_status: subscriptionStatus,
      plan_type: planType,
      system_prompt: `Eres un asesor comercial experto y empático de ${companyName}. Responde con cortesía en español, resuelve dudas sobre nuestros servicios y guía al cliente a agendar una cita mediante el calendario.`,
    })
    .select('id, name, subscription_status, plan_type')
    .single();

  if (orgError || !org) {
    console.error('❌ Error creando organización:', orgError?.message);
    throw orgError;
  }

  console.log(`✅ Organización creada con ID: ${org.id}`);

  // 2. Crear Usuario en Supabase Auth con confirmación automática
  console.log(`👤 Creando usuario administrador: ${adminEmail}...`);
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: adminEmail.trim(),
    password: adminPassword,
    email_confirm: true,
    user_metadata: {
      full_name: adminName.trim(),
      company_id: org.id,
      company_name: org.name,
    },
  });

  if (authError || !authUser.user) {
    console.error('❌ Error creando usuario en Supabase Auth:', authError?.message);
    // Limpieza de rollback
    await supabase.from('organizations').delete().eq('id', org.id);
    throw authError;
  }

  const userId = authUser.user.id;
  console.log(`✅ Usuario creado en Auth con UID: ${userId}`);

  // 3. Crear Perfil vinculado en profiles con rol 'admin'
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    organization_id: org.id,
    email: adminEmail.trim(),
    full_name: adminName.trim(),
    role: 'admin',
  });

  if (profileError) {
    console.error('❌ Error creando perfil en profiles:', profileError.message);
    throw profileError;
  }

  console.log('✅ Perfil de administrador vinculado en profiles.');
  console.log('\n🎉 ¡EMPRESA PROVISIONADA EXITOSAMENTE POR SUPER ADMIN!');
  console.log('----------------------------------------------------');
  console.log(`🏢 Empresa:       ${org.name} (ID: ${org.id})`);
  console.log(`👑 Admin:         ${adminName} (${adminEmail})`);
  console.log(`🔑 Contraseña:    ${adminPassword}`);
  console.log(`💳 Suscripción:   ${org.subscription_status} (Plan ${org.plan_type})`);
  console.log('----------------------------------------------------');
  console.log('El cliente ya puede iniciar sesión en /login con estas credenciales.\n');

  return { org, user: authUser.user };
}

// Ejecución interactiva / CLI
async function main() {
  const args = process.argv.slice(2);

  // Parámetros por defecto o desde flags CLI
  const companyName = args.find((a) => a.startsWith('--company='))?.split('=')[1] || 'Empresa Synqo Demo';
  const adminName = args.find((a) => a.startsWith('--name='))?.split('=')[1] || 'Administrador Demo';
  const adminEmail = args.find((a) => a.startsWith('--email='))?.split('=')[1] || 'admin@synqo.dev';
  const adminPassword = args.find((a) => a.startsWith('--password='))?.split('=')[1] || 'Synqo123456!';
  const planType = (args.find((a) => a.startsWith('--plan='))?.split('=')[1] as any) || 'core';

  await provisionCompany({
    companyName,
    adminName,
    adminEmail,
    adminPassword,
    planType,
    subscriptionStatus: 'active',
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error durante el aprovisionamiento:', err);
    process.exit(1);
  });
}
