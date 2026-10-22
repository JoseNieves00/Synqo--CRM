# 🏢 Guía del Usuario & Manual Operativo — Synqo CRM

> **Manual Oficial de Operaciones para Empresas y Equipos Comerciales**  
> Automatización de Ventas por WhatsApp, Cualificación con Inteligencia Artificial & Agendamiento

---

## 1. Primer Acceso y Seguridad de tu Cuenta

Bienvenido a **Synqo CRM**. Para garantizar la privacidad de tus conversaciones y la seguridad de tu base de clientes:

1. **Ingreso Inicial:**
   - Accede con el correo corporativo y la contraseña temporal que te proporcionó tu asesor de Synqo.
2. **Cambio de Contraseña Obligatorio:**
   - En tu primer inicio de sesión, el sistema te solicitará de manera obligatoria establecer una **nueva contraseña personal y privada** (mínimo 8 caracteres).
3. **Actualización Segura de Contraseña:**
   - En cualquier momento puedes hacer clic en tu nombre en la esquina inferior izquierda de la pantalla para editar tu nombre o cambiar tu contraseña.
   - **Por seguridad empresarial:** El sistema te exigirá validar tu **Contraseña Actual** antes de confirmar la nueva clave.
4. **Cadena de Recuperación de Acceso:**
   - Si no recuerdas tu contraseña, la recuperación se realiza mediante la jerarquía de tu organización:
     - **Si eres Asesor o Agente:** Solicita al Administrador de tu empresa que regenere tu clave temporal en 1 clic desde la pestaña *Equipo & Asientos*.
     - **Si eres Administrador:** Comunícate con el Super Admin de Synqo (`admin@synqo.dev`) para regenerar tu acceso temporal de inmediato.

---

## 2. Configuración Inicial del Negocio (`/settings`)

Como Administrador de tu empresa, puedes configurar tus canales de atención y la inteligencia de tu asistente virtual:

### A. Conectar tu Línea Comercial de WhatsApp (Meta Cloud API)
1. Ingresa a la pestaña **Integraciones & IA**.
2. Completa los dos campos requeridos:
   - **Phone Number ID:** Identificador único de tu número en WhatsApp Business.
   - **WhatsApp Permanent Access Token:** Clave de acceso permanente de tu línea.
3. Pulsa el botón **"Probar Conexión WhatsApp"**:
   - El sistema validará instantáneamente la línea y te mostrará una confirmación verde con el nombre oficial registrado de tu empresa y la calidad de la línea.

### B. Conectar tu Calendario de Citas (Cal.com)
1. **Generar tu API Key en Cal.com:**
   - Inicia sesión en [app.cal.com](https://app.cal.com).
   - Ve a **Settings** (Ajustes) en la esquina inferior izquierda $\rightarrow$ **Developer** $\rightarrow$ **API Keys**.
   - Haz clic en **+ Add New Key** (ej. nombre: *"Synqo CRM"*) y copia la clave generada (empieza por `cal_live_`).
2. **Vincular en Synqo CRM:**
   - Pega tu clave en **Cal.com API Key**.
   - En **Tipo de Evento o Enlace Cal.com**:
     - Puedes escribir el nombre de tu evento (ej. `cita-comercial`).
     - O pegar tu enlace directo de Cal.com (ej. `https://cal.com/jose-rm6umc/cita-comercial` o el enlace privado `/d/...`).
     - **O dejarlo vacío:** Al dejarlo en blanco y pulsar **"Probar Conexión Cal.com"**, el CRM consultará tu cuenta por API v2 y **detectará y completará el ID automáticamente**.
3. Pulsa el botón **"Probar Conexión Cal.com"**:
   - El sistema confirmará que el calendario está listo con un mensaje verde, mostrando el nombre de tu evento verificado.
4. Haz clic en **"Guardar Configuración"**. A partir de este momento, cuando un lead calificado converse con el bot en WhatsApp, la IA consultará tus horas libres reales y agendará la reunión directamente en tu Google Calendar / Cal.com sin intervención humana.

### C. Personalizar tu Asesor de Inteligencia Artificial
En el cuadro **Instrucciones y Objetivos del Asesor IA**, define con tus propias palabras:
- Qué servicios o productos ofrece tu empresa.
- Precios de referencia o paquetes disponibles.
- El tono de conversación deseado (ej. *empático, profesional, directo, cercano*).
- La directriz de invitar al prospecto a agendar una cita una vez calificado su interés.

---

## 3. Gestión de tu Equipo Comercial (Pestaña "Equipo & Asientos")

1. **Invitar Nuevos Asesores:**
   - Haz clic en **"+ Agregar Miembro"**.
   - Ingresa el nombre del asesor, su correo electrónico y asígnale una contraseña temporal inicial.
   - Selecciona su rol: **Agente** (atención comercial) o **Supervisor**.
2. **Control de Cupos:**
   - La barra de asientos te muestra cuántos usuarios tienes activos y cuántos tienes disponibles según tu plan.
3. **Regenerar Contraseña Temporal:**
   - Si un asesor olvida su clave, el administrador puede presionar el botón de reinicio junto a su nombre. El sistema generará una nueva clave temporal con botón de copiado rápido, y el asesor deberá cambiarla al ingresar.
4. **Revocación Inmediata de Acceso:**
   - Al dar de baja a un colaborador, pulsa el botón de eliminar para revocar su acceso a las conversaciones de inmediato.

---

## 4. Bandeja de Entrada Unificada de WhatsApp (`/inbox`)

La bandeja de entrada organiza todas las conversaciones entrantes en dos columnas:

```
┌────────────────────────────────┬──────────────────────────────────────────┐
│  LISTA DE CHATS EN VIVO        │  VENTANA DE CONVERSACIÓN ACTIVA          │
│  • Buscador reactivo           │  • Mensajes en tiempo real               │
│  • Filtros: Todos / IA / Humano│  • Switch IA (Pausar / Reanudar bot)     │
│  • Badge de estado de atención │  • Ficha lateral: Notas & Etapa          │
└────────────────────────────────┴──────────────────────────────────────────┘
```

### Funciones Clave en el Chat:
- **Sincronización en Tiempo Real:** Los mensajes entrantes aparecen instantáneamente en la pantalla sin necesidad de recargar la página.
- **Alternar Control entre IA y Humano (Switch de IA):**
  - **Modo IA Activa (Verde):** El bot responde con cortesía, resuelve dudas técnicas o de precios y orienta al cliente a agendar reunión.
  - **Intervención Humana (Ámbar):** En cuanto un asesor escribe un mensaje manual en el chat, **la IA se pausa automáticamente** para permitir una conversación humana fluida sin interrupciones del bot.
  - El asesor puede volver a activar la IA en cualquier momento reactivando el interruptor superior.
- **Ficha del Prospecto (Drawer Lateral):**
  - Haz clic en **"Ver Ficha"** en la esquina superior derecha del chat para editar el nombre del contacto, cambiar su etapa en el embudo y guardar notas internas (presupuesto, requerimientos especiales o historial de acuerdos).
- **Ventana de 24 Horas de Meta:**
  - WhatsApp permite enviar mensajes de texto libre dentro de las 24 horas posteriores al último mensaje del cliente. Si la ventana expira, el sistema te ofrecerá plantillas comerciales pre-aprobadas para reactivar la conversación con un clic.

---

## 5. Pipeline Comercial Kanban (`/pipeline`)

Visualiza la progresión de tus prospectos en un embudo comercial ágil:

1. **Etapas del Embudo:**
   - `Nuevo Lead` → `Calificado` → `Cita Agendada` → `Venta Ganada` → `Perdido / Descarte`.
2. **Arrastrar y Soltar (Drag & Drop):**
   - Puedes arrastrar las tarjetas de los prospectos entre columnas para actualizar su fase comercial con persistencia instantánea.
3. **Actualización Autónoma por IA:**
   - Cuando un prospecto confirma una cita en Cal.com a través de WhatsApp, **el Asistente IA mueve la tarjeta automáticamente a la columna "Cita Agendada"**.
4. **Buscador y Filtros:**
   - Filtra tarjetas por nombre, teléfono o estado de atención (leads atendidos por IA vs. atendidos por agentes humanos).
5. **Exportación Masiva a Excel / CSV:**
   - En la barra de filtros del Pipeline encontrarás el botón **"Exportar CSV"**. Con un solo clic puedes descargar la lista de tus prospectos con nombre, teléfono WhatsApp, etapa del embudo, estado del bot y fecha de última interacción, formateado con compatibilidad nativa para Microsoft Excel y herramientas de analítica.

---

## 6. Sistema de Alertas Sonoras y Relevo Humano

- **Campana Sonora:** Cuando un prospecto solicita expresamente hablar con un asesor humano o requiere atención manual, escucharás una campana melódica suave en el CRM.
- **Notificación de Escritorio:** Recibirás una notificación push en tu computadora para que no pierdas ningún lead de alta prioridad aunque tengas la pestaña minimizada.
- **Tarjeta Flotante Interactiva:** Al pie de la pantalla aparecerá un aviso con el nombre del cliente y el botón directo **"Atender en Inbox"**.

---

## 7. Buenas Prácticas para WhatsApp Business

1. **Tiempo de Respuesta:** Mantén la IA activa fuera de horarios laborales para no perder prospectos que escriben de noche o los fines de semana.
2. **Tono de Marca:** Revisa periódicamente el cuadro de instrucciones en Ajustes para incorporar nuevas promociones o respuestas a preguntas frecuentes.
3. **Cuidado de Calidad de Línea:** Evita enviar mensajes promocionales no solicitados a personas que no hayan iniciado conversación para mantener la calidad de tu línea en verde.

