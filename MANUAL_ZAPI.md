# 📱 Manual Operativo Z-API & WhatsApp Express — Synqo CRM

> **Documento Oficial de Configuración, Vinculación y Blindaje Anti-Baneo**  
> Versión: 2.0 (Motor Dual WhatsApp & Emulación Web Segura)  
> Plataforma: **Synqo CRM (`crm.synqo.dev`)**

---

## 1. Visión General del Motor Z-API en Synqo CRM

Synqo CRM cuenta con un **Motor Dual de Mensajería**. Mientras que Meta Cloud API (WABA) es el canal corporativo oficial, **Z-API** es la solución de conexión rápida mediante emulación WebSocket de WhatsApp Web.

### Ventajas de Z-API en Synqo CRM
* **Sin Ventana Restrictiva de 24 Horas:** Puedes responderle a tus clientes sin importar cuándo hayan escrito su último mensaje, sin costo por plantilla HSM.
* **Vinculación en Menos de 1 Minuto:** Tu cliente vincula su línea escaneando un código QR o digitando un código de 8 caracteres directamente en su app de WhatsApp.
* **Relevo Humano Automático:** Si tú o tu equipo responden directamente desde la app de WhatsApp en el celular, el CRM detecta el mensaje, lo sincroniza en vivo en el Inbox y **pausa automáticamente la IA durante 45 minutos** para no interrumpir tu atención humana.
* **Sincronización de Chats Previos:** Importa las últimas 50 conversaciones para no perder el hilo comercial.

---

## 2. Creación y Configuración de la Instancia en Z-API

Sigue estos pasos en la plataforma de [z-api.io](https://z-api.io) para aprovisionar una nueva instancia:

### Paso 1: Crear la Instancia
1. Inicia sesión en tu consola de administración de Z-API ([admin.z-api.io](https://admin.z-api.io)).
2. Haz clic en el botón **"+ Criar Instância"** (o Crear Instancia).
3. Asígnale un nombre identificable para el negocio (ej. `Clinica-Dental-Sonrisas` o `Barberia-Elite`).
4. Selecciona el plan contratado.

### Paso 2: Obtener las 3 Credenciales Obligatorias
Dentro del panel de la instancia creada, copia y ten a mano los siguientes 3 valores:

| Credencial | Dónde encontrarla en Z-API | Uso en Synqo CRM |
| :--- | :--- | :--- |
| **Instance ID** | En el encabezado de la instancia (ej. `3B8F2A109C...`) | Identificador único del canal |
| **Instance Token** | En la pestaña *Credenciales* o bajo el ID (ej. `D7E84210...`) | Token de autenticación de la instancia |
| **Client-Token** | En la parte superior de tu cuenta de Z-API (icono de perfil / cuenta) | Clave maestra de seguridad de tu cuenta |

---

## 3. Configuración de Webhooks en Z-API

Para que Synqo CRM reciba los mensajes en tiempo real y la IA procese respuestas, los eventos de Z-API deben apuntar a tu servidor.

### URL Oficial del Webhook:
```text
https://crm.synqo.dev/api/webhooks/whatsapp/zapi
```
*(Si tienes un dominio personalizado, reemplaza `crm.synqo.dev` por tu dominio oficial).*

### Los 4 Eventos Esenciales:
En el panel de tu instancia en Z-API, ve a **Webhooks** y asegúrate de que los siguientes 4 eventos tengan configurada la URL anterior:

1. **Ao receber mensagem (`received`):**  
   * **Endpoint Z-API:** `/update-webhook-received`  
   * **Función:** Envía los mensajes entrantes de los clientes al Inbox del CRM y despierta el agente de IA autónomo.
2. **Ao conectar (`connected`):**  
   * **Endpoint Z-API:** `/update-webhook-connected`  
   * **Función:** Notifica a Synqo cuando el QR o código fue aceptado, cerrando el modal de vinculación y cambiando el estado a *«Conectado»*.
3. **Ao desconectar (`disconnected`):**  
   * **Endpoint Z-API:** `/update-webhook-disconnected`  
   * **Función:** Alerta de inmediato al administrador si el teléfono se apagó, perdió internet o cerró la sesión.
4. **Status da mensagem (`delivery`):**  
   * **Endpoint Z-API:** `/update-webhook-delivery`  
   * **Función:** Registra los estados de confirmación (un check gris, doble check gris, doble check azul de lectura).

> [!TIP]
> **Autoconfiguración desde Synqo:**  
> Cuando el cliente ingresa su `Instance ID` y `Token` en la pantalla de **Ajustes $\rightarrow$ Integraciones**, Synqo CRM ejecuta automáticamente una llamada a la API de Z-API para registrar estos 4 webhooks de forma transparente. Aun así, se recomienda verificar en el panel de Z-API que la URL se haya guardado correctamente.

---

## 4. Métodos de Vinculación en Synqo CRM

Tu cliente puede vincular su línea comercial desde **Configuración (`/settings`) $\rightarrow$ Integraciones & IA** utilizando cualquiera de estos dos métodos:

### Método A: Código QR Dinámico (Cámara)
1. Pulsa el botón **«Vincular WhatsApp»**.
2. En la pestaña **Código QR**, verás el código QR en pantalla (se refresca cada 20 segundos por seguridad).
3. Abre WhatsApp en el celular comercial $\rightarrow$ **Ajustes / Configuración $\rightarrow$ Dispositivos vinculados $\rightarrow$ Vincular un dispositivo**.
4. Apunta la cámara del celular a la pantalla.
5. En 3 a 5 segundos, la tarjeta se actualizará a color verde con el mensaje: **«WhatsApp Conectado Exitosamente»**.

### Método B: Pairing Code / Código de Teléfono (Sin Cámara)
*Ideal para cuando el cliente está abriendo el CRM desde el mismo teléfono celular o no tiene otra pantalla para escanear.*

1. Pulsa **«Vincular WhatsApp»** y selecciona la pestaña **Código de Teléfono**.
2. Escribe el número de teléfono con código de país (ej. `573001234567`).
3. Haz clic en **"Generar Código de 8 Dígitos"**.
4. Aparecerá un código alfanumérico destacado en pantalla (ej. `WXYZ-1234`) con botón de copiado en 1 clic.
5. Abre WhatsApp en el celular $\rightarrow$ **Dispositivos vinculados $\rightarrow$ Vincular con el número de teléfono**.
6. Digita el código de 8 dígitos o toca la notificación push recibida en el celular.
7. ¡Listo! El sistema confirmará la conexión inmediatamente.

---

## 5. Protocolo Estricto de Blindaje Anti-Baneo de WhatsApp (Meta)

Dado que Z-API se conecta como un dispositivo web complementario, Meta cuenta con algoritmos que buscan patrones no humanos o envíos de spam. **Para garantizar que la línea nunca sea suspendida, sigue estrictamente estas directrices:**

### Regla 1: Prohibido Usar Números Nuevos sin Calentar (Chips Vírgenes)
* ⚠️ **Riesgo Crítico:** Un chip comprado el mismo día que empiece a responder a 30 personas desconocidas será bloqueado en menos de 24 horas.
* **Requisito:** El número de WhatsApp debe tener **al menos 2 a 4 semanas de uso humano real** previo (conversaciones personales, llamadas, participación en grupos).

### Regla 2: Protocolo de Calentamiento Progresivo (Warm-Up)
Si vas a migrar una línea nueva a Z-API, respeta el ritmo gradual:
* **Semana 1:** Atender un máximo de **20 a 30 conversaciones entrantes por día**.
* **Semana 2:** Escalar a **50 a 80 conversaciones por día**.
* **Semana 3 en adelante:** Operación normal sin restricciones artificiales.

### Regla 3: Tráfico Entrante (Inbound) vs Cero Spam Frío
* ✅ **Permitido y Seguro:** Atender a personas que **escriben primero a tu negocio** (clientes referidos, clics en anuncios de Instagram/Facebook "Click-to-WhatsApp", enlaces en tu sitio web o Google Maps).
* ❌ **Estrictamente Prohibido:** Subir una base de datos de 500 prospectos fríos que nunca te han hablado y dispararles mensajes masivos.  
  * *Razón:* Si 3 a 5 personas presionan el botón rojo **"Reportar y Bloquear"** de WhatsApp, los algoritmos de Meta marcan la cuenta como spam y la bloquean preventivamente.

### Regla 4: Cadencia Humana Orgánica Integrada en Synqo
Synqo CRM incorpora un motor anti-baneo a nivel de software que opera de forma autónoma:
1. **Simulación de Tipeo (`delayTyping`):** La API envía a WhatsApp el estado *"Escribiendo..."* durante un intervalo proporcional a la longitud de la respuesta (entre 2 y 14 segundos).
2. **Pausas Biológicas (Jitter):** Antes de responder, el sistema calcula una pausa cognitiva aleatoria de lectura (1.2 a 2.8 segundos), simulando el tiempo que un humano tarda en leer el mensaje recibido.
3. **Variación de Caracteres:** La velocidad de digitación oscila entre 35ms y 55ms por carácter con pausas extra en signos de puntuación (`.` `,` `?` `!`).

---

## 6. Mantenimiento y Estabilidad del Teléfono Físico

Para evitar desconexiones intermitentes de la instancia:

1. **Alimentación y Conectividad:**
   * El teléfono comercial debe permanecer encendido, con batería suficiente y conectado a una red Wi-Fi estable.
2. **Desactivar el Ahorro de Batería (Android):**
   * Muchos teléfonos Android "duermen" o cierran aplicaciones en segundo plano para ahorrar batería, lo cual desconecta WhatsApp Web.
   * Ve a: **Ajustes $\rightarrow$ Aplicaciones $\rightarrow$ WhatsApp $\rightarrow$ Batería $\rightarrow$ Seleccionar "Sin restricciones"** (u Optimización desactivada).
3. **Límite de Dispositivos Vinculados:**
   * WhatsApp permite un máximo de **4 dispositivos vinculados** a la vez. Si el cliente ya tiene 4 computadores abiertos con WhatsApp Web, la vinculación de Z-API fallará. Debe cerrar sesiones antiguas antes de escanear.

---

## 7. Preguntas Frecuentes & Resolución de Problemas (Troubleshooting)

### Q: ¿El código QR no aparece o dice "Already Connected"?
* **Causa:** La instancia de Z-API ya tiene una sesión iniciada con otro teléfono o se quedó en caché.
* **Solución:** Pulsa el botón *"Desconectar"* en la tarjeta de Ajustes de Synqo CRM para forzar el cierre de sesión, espera 5 segundos y vuelve a pulsar *"Vincular WhatsApp"*.

### Q: ¿Qué pasa si respondo desde el WhatsApp físico de mi celular?
* Synqo detectará tu mensaje inmediatamente en el Inbox. Para evitar que la Inteligencia Artificial contradiga lo que acabas de escribir, **la IA se pausará automáticamente durante 45 minutos** en esa conversación. Puedes reanudarla en cualquier momento activando el interruptor verde en el chat.

### Q: ¿Qué hago si WhatsApp suspende temporalmente el número?
1. Si llega a ocurrir un bloqueo temporal, ingresa a la app de WhatsApp en el celular y pulsa **"Solicitar Revisión"**.
2. Escribe un mensaje cordial explicando que es una línea de atención al cliente de un negocio formal y que atiendes consultas comerciales.
3. En el 90% de los casos con líneas legítimas, Meta reactiva el número en un plazo de 6 a 24 horas.
4. Al reactivarse, reduce el volumen durante 3 días para estabilizar la reputación de la línea.

---

## 8. Checklist Rápido para Crear una Nueva Instancia Z-API

- [ ] Instancia creada en el panel de Z-API con nombre del cliente.
- [ ] Copiados `Instance ID`, `Instance Token` y `Client-Token`.
- [ ] Verificado que el número tenga más de 2 semanas de antigüedad real.
- [ ] Desactivada la optimización de batería agresiva en el teléfono comercial.
- [ ] Verificada la URL de webhook: `https://crm.synqo.dev/api/webhooks/whatsapp/zapi`.
- [ ] Eventos de webhook activos (`received`, `connected`, `disconnected`, `delivery`).
- [ ] Vinculado exitosamente vía QR o código de 8 dígitos en Synqo CRM.
- [ ] Mensaje de prueba enviado desde otro número con respuesta fluida en el Inbox.

