import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('\n🧪 Iniciando Suite de Pruebas: Optimización del Inbox & Corrección de Renderizado de Mensajes...\n');

// 1. Verificación en ChatWindow.tsx: No auto-abrir ContactPanel
console.log('1️⃣  Verificando ChatWindow.tsx: ContactPanel cerrado por defecto y reseteado al cambiar de chat...');
const chatWindowPath = path.join(process.cwd(), 'components/chat/ChatWindow.tsx');
const chatWindowContent = fs.readFileSync(chatWindowPath, 'utf8');

assert.ok(
  chatWindowContent.includes('const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);'),
  'ChatWindow debe inicializar isRightPanelOpen en false por defecto en todos los dispositivos'
);

assert.ok(
  !chatWindowContent.includes("window.innerWidth >= 1280") ||
  !chatWindowContent.includes("setIsRightPanelOpen(true)"),
  'ChatWindow NO debe forzar apertura de panel por tamaño de pantalla'
);

assert.ok(
  chatWindowContent.includes('setIsRightPanelOpen(false);') &&
  chatWindowContent.includes('[contact.id]'),
  'ChatWindow debe resetear isRightPanelOpen a false al cambiar de contacto para evitar que se abra la ficha sobre la conversación'
);
console.log('   ✅ ChatWindow no auto-abre el panel de contacto y lo resetea al cambiar de chat.');

// 2. Verificación de renderizado de mensajes con Stale-While-Revalidate
console.log('2️⃣  Verificando ChatWindow.tsx: Renderizado de mensajes sin borrar la vista si hay mensajes en caché...');
assert.ok(
  chatWindowContent.includes('isLoadingMessages && messages.length === 0'),
  'ChatWindow solo debe mostrar skeleton si isLoadingMessages es true Y messages.length === 0'
);
assert.ok(
  chatWindowContent.includes('key={msg.id || `msg-${idx}`}'),
  'ChatWindow debe usar clave única resistente a colisiones en React.Fragment'
);
console.log('   ✅ Stale-While-Revalidate en ChatWindow verificado sin flash de pantalla vacía.');

// 3. Verificación de InboxView.tsx: Cero retraso en renderizado inicial (SSR fallback)
console.log('3️⃣  Verificando InboxView.tsx: activeMessages y contactList con fallback inmediato de SSR...');
const inboxViewPath = path.join(process.cwd(), 'components/chat/InboxView.tsx');
const inboxViewContent = fs.readFileSync(inboxViewPath, 'utf8');

assert.ok(
  inboxViewContent.includes('activeContact && selectedContactId === activeContact.id && messages && messages.length > 0'),
  'InboxView debe entregar inmediatamente los mensajes de SSR a activeMessages si el store aún no sincroniza'
);

assert.ok(
  inboxViewContent.includes('isFirstMountRef'),
  'InboxView debe proteger la primera carga con isFirstMountRef para no hacer doble-fetch de contactos'
);

assert.ok(
  inboxViewContent.includes('hasCached = Boolean(') &&
  inboxViewContent.includes('contactId === activeContact?.id && messages && messages.length > 0'),
  'openChat en InboxView debe reconocer mensajes iniciales de SSR como caché válida'
);
console.log('   ✅ SSR Fallback y prevención de doble-fetch en InboxView verificados.');

// 4. Verificación de MessageBubble.tsx: Robustez en timestamp
console.log('4️⃣  Verificando MessageBubble.tsx: parseo seguro de createdAt...');
const messageBubblePath = path.join(process.cwd(), 'components/chat/MessageBubble.tsx');
const messageBubbleContent = fs.readFileSync(messageBubblePath, 'utf8');

assert.ok(
  messageBubbleContent.includes('if (!createdAt) return \'\';'),
  'MessageBubble debe verificar !createdAt antes de invocar Date'
);
console.log('   ✅ Formateo de fecha y hora en MessageBubble seguro y verificado.');

// 5. Verificación de ContactPanel.tsx: Dimensiones fluidas
console.log('5️⃣  Verificando ContactPanel.tsx: ancho fluido w-full dentro de su contenedor...');
const contactPanelPath = path.join(process.cwd(), 'components/chat/ContactPanel.tsx');
const contactPanelContent = fs.readFileSync(contactPanelPath, 'utf8');

assert.ok(
  contactPanelContent.includes('h-full w-full flex flex-col'),
  'ContactPanel debe ocupar w-full de su contenedor para no desbordar el layout'
);
console.log('   ✅ ContactPanel responsivo verificado.');

console.log('\n🎉 ¡Todas las verificaciones de optimización del inbox pasaron exitosamente (5/5)!\n');
