# 🚀 Guía de Despliegue de Evolution API v2 en tu VPS & Empalme con Synqo CRM

Esta guía contiene la configuración exacta paso a paso para poner en marcha **Evolution API v2** en tu VPS en menos de 5 minutos y conectarlo de inmediato con **Synqo CRM**.

---

## 📋 Requisitos Previos del VPS

* **Sistema Operativo:** Ubuntu 22.04 LTS o 24.04 LTS (recomendado).
* **Recursos Mínimos:** 1 vCPU, 2 GB de RAM (o 1 GB con 2 GB de swap).
* **Puertos Abiertos:** `80` (HTTP), `443` (HTTPS), y opcionalmente `8080` (si pruebas sin proxy inverso).
* **Dominio / Subdominio (Recomendado):** e.g., `evolution.tudominio.com` apuntando a la IP de tu VPS (o la IP directa del VPS si estás en pruebas).

---

## ⚡ Paso 1: Instalar Docker y Docker Compose en tu VPS

Conéctate por SSH a tu VPS y ejecuta:

```bash
# 1. Actualizar repositorios
sudo apt update && sudo apt upgrade -y

# 2. Instalar Docker con el instalador oficial
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 3. Habilitar y arrancar Docker
sudo systemctl enable docker
sudo systemctl start docker

# 4. Verificar instalación
docker --version
docker compose version
```

---

## 📦 Paso 2: Crear la Carpeta de Evolution API y su `docker-compose.yml`

Ejecuta en tu terminal SSH:

```bash
mkdir -p /root/evolution-api
cd /root/evolution-api
```

Crea el archivo `docker-compose.yml`:

```bash
nano docker-compose.yml
```

Pega la siguiente configuración optimizada y ligera con base de datos PostgreSQL y Redis:

```yaml
version: '3.8'

services:
  evolution-api:
    image: atendai/evolution-api:v2.1.2
    container_name: evolution_api
    restart: always
    ports:
      - "8080:8080"
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - evolution_instances:/evolution/instances

  postgres:
    image: postgres:15-alpine
    container_name: evolution_postgres
    restart: always
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: TuPasswordSeguroPostgres123!
      POSTGRES_DB: evolution_db
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U evolution -d evolution_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: evolution_redis
    restart: always
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data

volumes:
  evolution_instances:
  postgres_data:
  redis_data:
```

---

## ⚙️ Paso 3: Crear el Archivo `.env` en el VPS

Crea el archivo `.env`:

```bash
nano .env
```

Pega la siguiente configuración (recuerda cambiar `AUTHENTICATION_API_KEY` por una clave secreta fuerte):

```env
# ==============================================================
# EVOLUTION API v2 - VARIABLES DE ENTORNO OFICIALES
# ==============================================================
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://evolution.tudominio.com

# 🛡️ CLAVE MAESTRA DE SEGURIDAD (Copia esta clave, la usarás en Synqo CRM)
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=SynqoEvoMasterKey_CambiarPorUnaClaveSegura2026!
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

# 🗄️ BASE DE DATOS (PostgreSQL)
DATABASE_ENABLED=true
DATABASE_CONNECTION_URI=postgresql://evolution:TuPasswordSeguroPostgres123!@postgres:5432/evolution_db
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true

# ⚡ REDIS (Caché de Sockets y Estados)
REDIS_ENABLED=true
REDIS_URI=redis://redis:6379

# 🔗 WEBHOOK GLOBAL (Synqo CRM autoconfigura por instancia, pero puedes dejar el fallback)
WEBHOOK_GLOBAL_ENABLED=false
WEBHOOK_GLOBAL_URL=https://synqo.dev/api/webhooks/whatsapp/evolution

# 💬 PARÁMETROS DE BAILEYS / WHATSAPP
CONFIG_SESSION_PHONE_VERSION=true
DEL_INSTANCE=false
```

Guarda los cambios con `Ctrl + O`, `Enter` y sal con `Ctrl + X`.

---

## 🚀 Paso 4: Iniciar el Servicio

Dentro de `/root/evolution-api`:

```bash
docker compose up -d
```

Verifica que los contenedores estén corriendo:

```bash
docker compose ps
docker logs -f evolution_api
```

Deberías ver:
```text
Evolution API running on port 8080
Database connected successfully
```

Prueba la conectividad local:

```bash
curl http://localhost:8080
```
*(Debe responder un JSON con el estado de la API).*

---

## 🔒 Paso 5: Proxy Inverso con SSL (Nginx o Caddy)

Para que Synqo CRM (en Vercel) y WhatsApp se comuniquen de forma segura con tu VPS, debes habilitar HTTPS.

### Opción Rápida con Caddy (SSL automático en 1 minuto):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

Edita `/etc/caddy/Caddyfile`:

```caddy
evolution.tudominio.com {
    reverse_proxy localhost:8080
}
```

Reinicia Caddy:
```bash
sudo systemctl restart caddy
```
¡Listo! Caddy emitirá automáticamente un certificado SSL gratuito de Let's Encrypt.

---

## 🔗 Paso 6: Empalme en Synqo CRM (Backend y Frontend Listos)

El CRM ya está 100% preparado tanto en backend como en frontend:

1. Entra a tu cuenta en **Synqo CRM**.
2. Ve a **Ajustes** $\rightarrow$ pestaña **Integraciones & IA**.
3. En la tarjeta de **Evolution API v2 (VPS Propio)**:
   - Haz clic en **Configurar VPS / Claves**.
   - **URL del Servidor Evolution API:** `https://evolution.tudominio.com` (o `http://TU_IP:8080` si usas IP directa).
   - **Nombre de la Instancia:** Un nombre sin espacios (ej: `synqo_comercial`).
   - **Evolution API Key:** Pega el valor de `AUTHENTICATION_API_KEY` que pusiste en el `.env`.
   - Haz clic en **Guardar y Autoconfigurar Webhooks**.

### 📱 Métodos de Vinculación Disponibles:

* **Opción A: Escanear Código QR**
  - Haz clic en **Vincular WhatsApp (QR o Código)**.
  - Verás el código QR en vivo generado directamente por tu VPS.
  - Cuenta regresiva de 20s y refresco automático.
  - Escanea con WhatsApp desde tu celular $\rightarrow$ **Dispositivos vinculados**.
  - Al escanear, la pantalla detectará la conexión automáticamente y pasará a **Conectado** con luz verde.

* **Opción B: Enlace Telefónico (Pairing Code - Sin Cámara)**
  - En el modal, pasa a la pestaña **Código Numérico (Sin Cámara)**.
  - Escribe tu número con código de país (ej: `573001234567`).
  - Haz clic en **Obtener Código**.
  - Verás el código de 8 dígitos con botón de copiado.
  - En WhatsApp ve a **Dispositivos vinculados** $\rightarrow$ **Vincular un dispositivo** $\rightarrow$ **"Vincular con el número de teléfono"** $\rightarrow$ digita el código.

* **Opción C: Sincronizar Conversaciones Previas**
  - Haz clic en el botón **Sincronizar Últimos 50 Chats**.
  - Los contactos se crearán en el CRM con su último mensaje.
  - **Regla de oro de seguridad:** La IA se mantiene **apagada** (`is_ai_active: false`) en chats importados para no escribirle a nadie sin que tú lo autorices.

---

## 🛡️ Características Activas y Verificadas

1. **Atención con IA (Dual Engine):** Cuando un lead te escriba a la línea, el webhook de Evolution API disparará la IA y responderá automáticamente con cadencia de tipeo humana.
2. **Relevo Humano (Human Takeover):** Si tú o tu asesor responden un mensaje desde el teléfono móvil físico, el CRM detecta `fromMe: true`, **silencia a la IA de inmediato** para ese contacto y registra la intervención en tiempo real en el Inbox.
3. **Transcripción de Notas de Voz:** Las notas de voz que envíen tus clientes se descargan de tu VPS y se transcriben con OpenAI Whisper.
4. **Protección Anti-Ban Orgánica:** Cadencia calculada y cortacircuitos de envíos salientes para proteger la línea de bloqueos.

