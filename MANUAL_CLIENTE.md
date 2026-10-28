# 🏢 Guía del Usuario & Manual Operativo — Synqo CRM

> **Manual Oficial de Operaciones para Empresas y Equipos Comerciales**  
> Versión: 2.0 — Automatización de WhatsApp, Agenda Nativa Multi-Profesional, Portal de Colaboradores & Protocolo de Ventas

---

## 1. Primer Acceso y Seguridad de tu Cuenta

Bienvenido a **Synqo CRM**. Para garantizar la privacidad de tus conversaciones y la seguridad de tu base de clientes:

1. **Ingreso Inicial:**
   - Accede a `https://tudominio.com/login` con el correo corporativo y la contraseña temporal que te proporcionó el equipo de soporte.
2. **Código de Empresa (`company_code`):**
   - En tu bienvenida recibirás el identificador único de tu negocio (ej. `EMPR1457`). Guárdalo, ya que este código permite a tus colaboradores acceder a su portal móvil de forma inmediata mediante un PIN personal.
3. **Cambio de Contraseña Obligatorio:**
   - En tu primer inicio de sesión, el sistema te solicitará de manera obligatoria establecer una **nueva contraseña personal y privada** (mínimo 8 caracteres).
4. **Actualización Segura de Contraseña:**
   - En cualquier momento puedes hacer clic en tu nombre en la esquina inferior izquierda de la pantalla para editar tu perfil o cambiar tu clave.
   - **Por seguridad empresarial:** El sistema te exigirá validar tu **Contraseña Actual** antes de confirmar la nueva clave.
5. **Cadena de Recuperación de Acceso:**
   - **Si eres Asesor o Colaborador:** Solicita al Administrador de tu empresa que regenere tu clave o PIN temporal en 1 clic desde la pestaña *Equipo & Usuarios*.
   - **Si eres Administrador:** Comunícate con el Super Admin de Synqo (`admin@synqo.dev`) para regenerar tu acceso temporal de inmediato.

---

## 2. Configuración Inicial del Negocio (`/settings`)

Como Administrador de tu empresa, puedes configurar tus canales de atención, la inteligencia del asistente y la agenda propia:

### A. Conectar tu Línea Comercial de WhatsApp (Meta Cloud API)
1. Ingresa a la pestaña **Integraciones & IA** en Ajustes.
2. **Configurar el Webhook en Meta (30 segundos):**
   - En la tarjeta oscura superior verás tu **URL de Webhook** y tu **Token de Verificación** con botones de copiado rápido en 1 clic.
   - En tu app de [developers.facebook.com](https://developers.facebook.com/) ve a **WhatsApp $\rightarrow$ Configuración**.
   - Haz clic en **Editar Webhook**, pega la URL y el Token y pulsa *Verificar y Guardar*.
   - En la lista de campos de Webhook, haz clic en **Administrar** y activa la casilla `messages`.
3. **Ingresar tus Credenciales en Synqo:**
   - **Phone Number ID:** Identificador numérico de tu número en Meta (WhatsApp $\rightarrow$ API Setup).
   - **WhatsApp Permanent Access Token:** Clave de acceso permanente de tu línea con permisos `whatsapp_business_messaging`.
   - **Meta App Secret:** Clave secreta de tu app en Meta para blindaje criptográfico HMAC exclusivo de tu empresa.
4. Pulsa el botón **"Probar Conexión WhatsApp"**:
   - El sistema validará instantáneamente la línea y te mostrará una confirmación verde con el nombre oficial registrado de tu empresa, la calidad de la línea y el estado del secreto.

### B. Configuración de Agenda Propia (Calendario Nativo)
Synqo cuenta con su propio motor de reservas multi-profesional sin necesidad de contratar herramientas externas:
- **Días de Atención:** Marca los días de la semana en que opera tu negocio (Lunes a Domingo).
- **Horario Comercial:** Define hora de apertura y cierre (ej. 08:00 a 19:00).
- **Intervalo de Citas:** Escoge la duración de los bloques (15, 30, 45 o 60 minutos).
- **Bloqueo de Días Festivos:** Activa la opción para que el sistema consulte automáticamente el calendario oficial de festivos y no permita citas en días feriados.

*(Nota: Si tu empresa ya utilizaba **Cal.com**, puedes mantenerlo activo vinculando tu API Key y slug de evento en la misma sección).*

### C. Personalizar tu Asesor de Inteligencia Artificial
En el cuadro **Instrucciones y Objetivos del Asesor IA**, define con tus propias palabras:
- Qué servicios o productos ofrece tu empresa y sus tarifas.
- El tono de conversación deseado (ej. *cercano, respetuoso, dinámico*).
- Cómo responder ante preguntas sobre ubicación, parqueadero o métodos de pago.

### D. Pestaña "Dudas Detectadas" (Vacíos de Conocimiento)
Si un prospecto le hace una pregunta a la IA sobre un dato que no estaba en tus instrucciones (por ejemplo: *"¿Tienen servicio a domicilio en Chía?"* o *"¿Aceptan perros?"*):
1. La IA responderá con cortesía aclarando que lo validará con el equipo.
2. La pregunta quedará guardada automáticamente en la pestaña **Dudas Detectadas** en `/settings`.
3. Podrás redactar la respuesta oficial con 1 clic y el asistente aprenderá ese dato de inmediato para futuros clientes.

---

## 3. Gestión de Equipo & Especialistas (`/settings` $\rightarrow$ Equipo)

1. **Dar de Alta Asesores y Especialistas:**
   - Haz clic en **"+ Agregar Miembro"**.
   - Ingresa el nombre completo, correo electrónico y teléfono móvil de WhatsApp.
   - Asigna su rol:
     - **Administrador:** Acceso total a finanzas, configuración y reportes.
     - **Agente / Recepcionista:** Atención en Inbox, agendamiento y torre de control.
     - **Colaborador / Especialista:** Visualización de su agenda propia y portal móvil.
2. **Asignación de PIN para Acceso Móvil Rápido:**
   - Para especialistas que no usan correo (ej. barberos, entrenadores, peluqueros), asígnales un **PIN de 4 dígitos**. Podrán entrar a su agenda con solo ingresar el Código de Empresa y su PIN.
3. **Servicios y Horarios Individuales:**
   - Puedes definir qué servicios presta cada especialista y personalizar sus días libres específicos.

---

## 4. Bandeja de Entrada Unificada de WhatsApp (`/inbox`)

La bandeja de entrada centraliza todas las conversaciones entrantes de WhatsApp:

```
┌────────────────────────────────┬──────────────────────────────────────────┐
│  LISTA DE CHATS EN VIVO        │  VENTANA DE CONVERSACIÓN ACTIVA          │
│  • Buscador reactivo           │  • Mensajes en tiempo real               │
│  • Filtros: Todos / IA / Humano│  • Switch IA (Pausar / Reanudar bot)     │
│  • Badge de estado de atención │  • Ficha lateral: Notas & Etapa          │
└────────────────────────────────┴──────────────────────────────────────────┘
```

### Funciones Clave en el Chat:
- **Sincronización en Tiempo Real:** Los mensajes aparecen instantáneamente sin recargar la pantalla.
- **Alternar Control entre IA y Humano (Switch de IA):**
  - **Modo IA Activa (Verde):** El bot responde con cortesía, resuelve dudas de servicios o precios y orienta al cliente a reservar cita.
  - **Intervención Humana (Ámbar):** En cuanto un asesor escribe un mensaje manual, **la IA se pausa automáticamente** para permitir una conversación humana sin interrupciones del bot.
- **Protocolo Anti-Fraude en Pagos y Comprobantes:**
  - Cuando un cliente envía una imagen o comprobante de transferencia (Nequi, Daviplata o Bancolombia), **la IA tiene estrictamente prohibido validar la transacción**.
  - La IA responderá de forma natural y cálida: *"Listo, recibido. Ya lo chequeo aquí y te confirmo."*
  - Inmediatamente se silencia y solicita relevo humano.
  - El asesor humano debe verificar en su propia aplicación bancaria que los fondos ingresaron efectivamente a la cuenta y luego marcar en el CRM **`[✓ Pago Verificado]`**.
- **Ventana de 24 Horas de Meta:**
  - WhatsApp permite enviar mensajes de texto libre dentro de las 24 horas posteriores al último mensaje del cliente. Si la ventana expira, el sistema te ofrecerá plantillas aprobadas para reactivar la conversación con 1 clic.

---

## 5. Agenda & Calendario Nativo (`/calendar`)

Synqo incluye un sistema de agenda completo adaptado para operaciones de alto flujo:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [📅 Día]   [📆 Semana]   [📋 Lista]   [👥 Colaboradores (Torre Control)] │
├────────────────────────────────────────────────────────────────────────┤
│  AGENDA MULTI-PROFESIONAL CON DETECCIÓN ATÓMICA DE COLISIONES          │
└────────────────────────────────────────────────────────────────────────┘
```

### Vistas Disponibles:
1. **Vista Día:** Visualiza la parrilla horaria de la jornada, ideal para recepcionistas que coordinan el minuto a minuto.
2. **Vista Semana:** Panorama completo de ocupación de lunes a domingo.
3. **Vista Lista:** Tabla ordenada cronológicamente con filtros por especialista, estado de pago y tipo de servicio.
4. **Vista Colaboradores (Torre de Control de Recepción):** Vista de columnas paralelas donde cada colaborador tiene su propia tarjeta con su estado en vivo y su cola de turnos del día.

### Creación de Citas Manuales:
- Pulsa **"+ Nueva Cita"**.
- Selecciona el cliente (o crea uno nuevo con su número de WhatsApp).
- Escoge el servicio, el especialista asignado y la fecha/hora.
- Si el negocio cuenta con salas físicas o cabinas, selecciona la sala asignada.
- **Blindaje Automático:** Si el especialista o la sala ya están ocupados en ese horario, el sistema bloqueará la acción impidiendo dobles reservas.

### Clases y Cursos Recurrentes (Academias y Estudios):
- Al agendar una clase, puedes activar la casilla **"Cita Recurrente"**.
- Selecciona la frecuencia (Semanal) y la duración del ciclo (**4, 8 o 12 semanas**).
- El sistema programará automáticamente todas las sesiones del curso, validando la disponibilidad de la sala y del instructor para cada fecha.
- **Campos Separados para Alumnos y Acudientes:** En academias infantiles o juveniles, puedes registrar el nombre del alumno y el nombre/teléfono del acudiente por separado para una comunicación clara.

---

## 6. Torre de Control de Recepción (Vista Colaboradores)

Diseñada específicamente para la persona en recepción o caja. Permite gestionar todo el establecimiento sin depender de que los especialistas manipulen sus teléfonos:

### Estados en Tiempo Real por Especialista:
- 🟢 **Atendiendo:** El especialista se encuentra en servicio con un cliente. La tarjeta muestra el cronómetro de tiempo transcurrido y la hora estimada de finalización.
- 🟡 **En Sala / Esperando:** El siguiente cliente ya llegó y se encuentra en sala de espera.
- ⚪ **Libre:** El especialista no tiene cliente asignado en este momento.

### Acciones Rápidas de 1 Clic:
1. **`[📍 Llegó a Recepción]` (Check-in Express):**
   - Cuando el cliente entra al local, la recepcionista pulsa este botón.
   - El estado del turno cambia inmediatamente a *En Sala*.
   - El colaborador recibe una notificación instantánea en su pantalla móvil con el nombre y servicio del cliente que lo espera.
2. **`[⏳ Avisar +15m Retraso]` (Gestión de Imprevistos):**
   - Si un servicio se alarga o surge un contratiempo, la recepcionista pulsa este botón.
   - Se ajusta la cola de turnos y se notifica al siguiente cliente para que no se impaciente.
3. **Reasignación Rápida de Especialista:**
   - Si un colaborador se ausenta o una silla está libre, la recepcionista puede reasignar la cita a otro compañero con un simple selector desplegable sin rehacer la reserva.
4. **`[📲 Enviar Agenda por WhatsApp]` (Sin Costo — $0 COP):**
   - La recepcionista puede enviar la agenda completa del día al WhatsApp personal de cada especialista en 1 clic.
   - Utiliza el enlace directo `wa.me`, por lo que **no consume saldo de la API de Meta ni genera costos adicionales**.

---

## 7. Portal Móvil para Colaboradores (`/colaborador`)

Una interfaz web móvil ultra-rápida y minimalista pensada para especialistas que trabajan con las manos ocupadas (barberos, estilistas, fisioterapeutas, entrenadores):

```
┌─────────────────────────────────────────┐
│              PORTAL MÓVIL               │
│   Hola, Carlos ✂️                        │
├─────────────────────────────────────────┤
│ 🟢 EN CURSO                             │
│ Juan Pérez — Corte Degradado + Barba    │
│ [ 00:24 / 00:45 min ]                   │
├─────────────────────────────────────────┤
│ ⏳ SIGUIENTE                            │
│ Andrés Gómez — 11:30 AM (📍 En Sala)    │
├─────────────────────────────────────────┤
│ [ + Bloquear Cliente sin Cita (30m) ]   │
└─────────────────────────────────────────┘
```

### Características del Portal Móvil:
- **Acceso Sin Correo:** Ingreso directo con el Código de Empresa (`company_code`) y su PIN de 4 dígitos.
- **Tarjeta Héroe en Vivo:** Muestra claramente el cliente actual, el tiempo restante y el cliente que ya está en recepción.
- **Filosofía 100% "Hands-Free":** Si el especialista tiene las manos mojadas o no quiere tocar el celular, **no necesita presionar ningún botón**. La recepcionista gestiona los estados desde su computadora y el móvil del colaborador se actualiza automáticamente.
- **Bloqueo Rápido de Walk-in ("Cliente sin Cita"):** Si llega un cliente de paso directamente a la silla, el colaborador puede tocar un solo botón para bloquear 30 o 45 minutos en el sistema, evitando que la IA le agende a otra persona en ese intervalo.

---

## 8. Motor Anti-No-Show y Confirmaciones Automáticas

Para combatir el ausentismo de clientes (un problema que suele costar hasta el 30% de la facturación en negocios de servicios):

1. **Recordatorio Automático a 24 Horas:**
   - Un día antes de la cita, el sistema envía un mensaje interactivo por WhatsApp con los detalles de fecha, hora y especialista.
   - Incluye botones directos: **`[Confirmar Asistencia]`** o **`[Reagendar / Cancelar]`**.
2. **Toque de Queda Nocturno de Cortesía:**
   - Si una cita es a primera hora de la mañana (ej. 8:30 AM), el sistema nunca enviará el recordatorio a las 03:00 AM.
   - El motor respeta la franja de descanso (20:00 a 08:00) y despacha los mensajes en la tarde previa antes de las 20:00.
3. **Cancelación Preventiva a 8 Horas:**
   - Si un turno no ha sido confirmado y faltan menos de 8 horas, el sistema libera automáticamente el horario para que otro cliente en lista de espera o que converse con la IA pueda tomar el cupo.

---

## 9. Pipeline Comercial Kanban (`/pipeline`)

Visualiza la progresión de tus prospectos en un embudo comercial ágil:

1. **Etapas del Embudo:**
   - `Nuevo Lead` → `Calificado` → `Cita Agendada` → `Venta Ganada` → `Perdido / Descarte`.
2. **Arrastrar y Soltar (Drag & Drop):**
   - Mueve las tarjetas de prospectos entre etapas con el cursor o el dedo.
3. **Actualización Automática por Citas:**
   - En cuanto un cliente agenda una cita en el calendario (sea asistido por la IA o manualmente), el CRM mueve su tarjeta a **"Cita Agendada"**.
4. **Exportación a Excel / CSV:**
   - En la barra de filtros encontrarás el botón **"Exportar CSV"** para descargar tu base de datos completa con nombres, números de WhatsApp, etapas y fechas de interacción.

---

## 10. Gestión de Aforos y Salas Físicas

Para negocios que imparten actividades grupales o cuentan con cabinas independientes (escuelas de yoga, artes marciales, academias de baile, consultorios médicos):
- En `/settings` puedes dar de alta tus salas físicas (ej. *Salón Principal*, *Cabina Spa 1*).
- Define la **capacidad máxima (aforo)** de cada espacio.
- El sistema sumará los alumnos agendados en cada horario y bloqueará la sala automáticamente cuando alcance el aforo máximo, impidiendo la sobrepoblación.

---

## 11. Resumen de Buenas Prácticas Comerciales

1. **Atención Nocturna con IA:** Deja el interruptor de IA encendido durante las noches y fines de semana para capturar prospectos mientras tu equipo descansa.
2. **Verificación de Pagos Real:** Nunca apruebes un pago confiando únicamente en una captura de pantalla enviada por WhatsApp; ingresa siempre a tu portal bancario para verificar el saldo.
3. **Salud de Línea en WhatsApp:** No utilices la línea para enviar mensajes publicitarios masivos en frío a personas que no te hayan contactado previamente.
4. **Uso de la Torre de Control:** Acostumbra a tu equipo de recepción a marcar `[📍 Llegó a Recepción]` apenas entra un cliente; esto genera una experiencia de servicio impecable y puntual.
