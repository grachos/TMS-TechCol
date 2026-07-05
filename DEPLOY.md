# Despliegue: GitHub → Hostinger (stack Node/React)

> Esta guía reemplaza a [`legacy/DEPLOY.md`](legacy/DEPLOY.md) (la de la app PHP).
> El stack cambió: ahora hay un **backend Node/Express** (proceso persistente) y
> un **frontend React (SPA) compilado a archivos estáticos** — ya no es un LAMP
> puro, así que el despliegue tiene una pieza nueva: la app Node.

Repo: <https://github.com/grachos/TMS-TechCol> (rama `main`).

---

## 0. Verifica que tu plan de Hostinger soporte Node.js

hPanel → busca la sección **"Node.js"** (bajo "Avanzado" o "Sitio web"). Está
disponible en planes **Business, Cloud Startup/Professional/Enterprise, KVM
VPS**. Si no la ves, tu plan es solo LAMP compartido y necesitas subir de
plan (o usar un VPS) para correr el backend — el frontend estático sí
funcionaría en cualquier plan, pero sin backend la app no sirve de nada.

**Limitación importante a aceptar de entrada:** los generadores de PDF usan
`puppeteer-core` con **Chrome del sistema**. Los planes compartidos/Node App
de Hostinger no permiten instalar Chrome, así que en producción **los PDFs
caerán automáticamente al fallback de HTML imprimible** (ya está contemplado
en el código, no es un bug). Si necesitas el PDF real, hace falta un VPS con
Chrome instalado.

---

## 1. Base de datos en Hostinger

Si ya tenías la app PHP corriendo ahí, **reutiliza esa misma base** — el
rewrite es 1:1 sobre el mismo esquema, así que tus datos (terceros, remesas,
manifiestos, RNDC…) se preservan. Si es una instalación nueva:

1. hPanel → **Bases de datos → Bases de datos MySQL**.
2. Crea una base (ej. `uXXXX_light_tms`) y un usuario; **anota** host, nombre,
   usuario y clave. En Hostinger `DB_HOST` suele ser `localhost`.
3. **phpMyAdmin** → selecciona la base → pestaña **Importar**, y sube estos
   archivos de [`database/`](database/) **en este orden exacto** (los nombres
   no ordenan bien alfabéticamente — v10 va después de v2, no antes):

   ```
   schema.sql
   maestros.sql
   catalogos.sql
   municipios.sql
   migracion_v2.sql   migracion_v3.sql   migracion_v4.sql   migracion_v5.sql
   migracion_v6.sql   migracion_v7.sql   migracion_v8.sql   migracion_v9.sql
   migracion_v10.sql  migracion_v11.sql  migracion_v12.sql  migracion_v13.sql
   migracion_v14.sql  migracion_v15.sql  migracion_v16.sql  migracion_v17.sql
   migracion_v18.sql  migracion_v19_municipios.sql          migracion_v20.sql
   migracion_v21.sql  migracion_v22.sql  migracion_v23.sql  migracion_v24.sql
   migracion_v25.sql  migracion_v26.sql  migracion_v27.sql  migracion_v28.sql
   migracion_v29.sql  migracion_v30.sql
   migracion_v31_staff_users.sql   ← NUEVO (login del personal)
   migracion_v32_pdf_oficial.sql   ← NUEVO (plantilla PDF oficial)
   ```

   Todas las migraciones usan `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF
   NOT EXISTS`, así que son **idempotentes**: si tu base ya tenía aplicadas
   varias de la app PHP, no pasa nada por re-importarlas. Como mínimo,
   **v31 y v32 son obligatorias y nuevas** (no existían en la app PHP).
4. Solo en instalación nueva: los catálogos CSV (`municipios_dane.csv`,
   `catalogo_productos.csv`, etc.) se importan una vez con phpMyAdmin
   (pestaña Importar, formato CSV, elige la tabla destino) o con
   `php database/importar_productos_csv.php <ruta_csv>` si tienes acceso SSH
   con PHP. Si vienes de la app PHP, esto ya está poblado — sáltalo.

---

## 2. Trae el código al servidor

Igual que antes, usando el **Git de hPanel**:

1. hPanel → **Sitios web → Administrar → (Avanzado) Git**.
2. **Crear un nuevo repositorio**:
   - **Repository**: `https://github.com/grachos/TMS-TechCol.git`
   - **Branch**: `main`
   - **Directory**: una carpeta fuera de cualquier `public_html` servido
     directamente (ej. `tms-light-new`) — el código fuente de `backend/` NO
     debe quedar accesible por HTTP.
3. Activa **Auto Deployment** y copia el Webhook URL → GitHub → repo
   **Settings → Webhooks → Add webhook** (Payload URL = el webhook de
   Hostinger, Content type `application/json`, evento `push`). Desde ahora
   cada `git push origin main` trae los cambios solo.

---

## 3. Backend: Node.js App en hPanel

1. hPanel → **Node.js** → **Crear aplicación**:
   - **Node.js version**: 20 (o la mayor disponible ≥ 20 — es el mínimo del
     `engines` del backend).
   - **Application root**: `tms-light-new/backend` (dentro de la carpeta
     donde Git clonó el repo).
   - **Application URL**: el dominio/subdominio que vayas a usar, con
     **path `/api`** — por ejemplo `tms.tudominio.com/api`. Esto es clave:
     el frontend siempre llama a rutas relativas `/api/...` del **mismo
     origen**, así que el backend debe quedar montado bajo `/api` del mismo
     dominio que sirve el frontend (ver paso 4). Si tu panel no permite un
     path y solo dominios completos, usa un subdominio dedicado solo para
     la API (ej. `api.tudominio.com`) y ajusta `CORS_ORIGINS` +la URL base
     del frontend (ver nota al final).
   - **Application startup file**: `dist/server.js`.
2. **Variables de entorno** (sección "Environment variables" de la app
   Node, o crea un `backend/.env` por File Manager/SSH — el backend lee
   ambos):

   ```env
   APP_ENV=produccion
   APP_DEBUG=false
   PORT=4000                      # Hostinger lo re-mapea internamente, no lo cambies
   CORS_ORIGINS=https://tms.tudominio.com

   JWT_SECRET=<genera-uno-largo-y-aleatorio>
   JWT_EXPIRES=8h

   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=uXXXX_light_tms
   DB_USER=uXXXX_usuario
   DB_PASS=tu_clave
   DB_CHARSET=utf8mb4

   RNDC_AMBIENTE=pruebas          # cámbialo a produccion solo cuando ya probaste todo
   RNDC_USERNAME=...
   RNDC_PASSWORD=...
   RNDC_EMPRESA=...
   RNDC_HOST_OVERRIDE=
   RNDC_TIMEOUT=30

   COLA_MAX_INTENTOS=10
   COLA_MINUTOS_REINTENTO=15
   COLA_ENVIO_HABILITADO=false    # true SOLO cuando quieras enviar de verdad al RNDC
   ```

   > **No subas `.env` a GitHub.** No está trackeado (ver `.gitignore`);
   > créalo una vez en el servidor y persiste entre despliegues.

3. Abre una terminal SSH (hPanel suele ofrecer un botón "Run NPM Install" o
   una terminal integrada en la pantalla de la app Node) y ejecuta, desde
   `tms-light-new/backend`:

   ```bash
   npm install
   npm run build          # compila TypeScript a dist/ + copia assets de PDF
   npm run seed:admin -- --email admin@tudominio.com --password "CAMBIA-ESTO" --nombre "Admin"
   ```

4. **Reinicia la app Node** desde hPanel para que tome `dist/server.js`.
5. Prueba: `https://tms.tudominio.com/api/health` debe responder
   `{"ok":true,"database":true}`.

---

## 4. Frontend: build estático

El frontend **no corre en Node en producción** — se compila a archivos
estáticos y Hostinger los sirve directamente (más rápido y no consume el
cupo de la app Node).

1. Local (o en la terminal SSH del servidor, dentro de
   `tms-light-new/frontend`):

   ```bash
   npm install
   npm run build     # genera frontend/dist/
   ```

2. Copia el **contenido** de `frontend/dist/` (no la carpeta en sí) a la
   raíz pública del dominio/subdominio elegido (`tms.tudominio.com` →
   normalmente `domains/tudominio.com/tms/` o el `public_html` del
   subdominio, según cómo lo hayas creado en **Dominios → Subdominios**).
   Vía File Manager (subir el zip de `dist/` y extraer ahí) o SFTP.

3. Como es una SPA con rutas de React Router, agrega un `.htaccess` en esa
   misma carpeta pública para que cualquier ruta que no sea un archivo real
   ni empiece por `/api` caiga en `index.html`:

   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteCond %{REQUEST_URI} !^/api/
     RewriteRule ^ index.html [L]
   </IfModule>
   ```

4. Verifica que la app Node del paso 3 quede **bajo el mismo dominio, en
   `/api`** (Passenger/LiteSpeed reenvía esas rutas al proceso Node; todo lo
   demás lo sirve el Apache/LiteSpeed estático). Así el fetch relativo
   `/api/...` del frontend llega al backend sin problemas de CORS.

   > Si tu plan no soporta montar la app Node en un path (`/api`) del mismo
   > dominio y tuviste que usar un subdominio aparte para la API (ej.
   > `api.tudominio.com`), el cliente HTTP del frontend (`frontend/src/lib/api.ts`)
   > **siempre llama a rutas relativas del mismo origen** — no hay variable de
   > entorno para apuntar a otro host. En ese caso hace falta un cambio de
   > código (agregar una `VITE_API_BASE_URL` y usarla en `buildUrl()`) antes
   > de desplegar con dominios separados. Aplica solo si el path `/api` no es
   > viable en tu plan.

---

## 5. Cron del worker de reintento

Reemplaza al cron de `legacy/cron/retry_worker.php`. hPanel → **Avanzado →
Trabajos Cron**, cada 15 minutos:

```
*/15 * * * * cd /home/uXXXX/domains/tudominio.com/tms-light-new/backend && /ruta/al/node dist/queue/worker.js >> /home/uXXXX/logs/tms-worker.log 2>&1
```

La ruta exacta del binario `node` la ves en la pantalla de la app Node de
hPanel (algo como `/home/uXXXX/nodevenv/tms-light-new/backend/20/bin/node`).
Compílalo antes con `npm run build` (mismo `dist/` que usa la app web).

---

## 6. Checklist post-despliegue

- [ ] `GET /api/health` responde `{"ok":true,"database":true}`.
- [ ] Login con el usuario creado por `seed:admin` funciona.
- [ ] `COLA_ENVIO_HABILITADO=false` mientras pruebas — la cola arma y
      previsualiza el XML pero no envía nada real al RNDC.
- [ ] `RNDC_AMBIENTE=pruebas` hasta confirmar que todo el flujo (solicitud →
      despacho → cola → cumplido) funciona contra el ambiente de pruebas del
      Ministerio.
- [ ] Solo entonces: `RNDC_AMBIENTE=produccion` + `COLA_ENVIO_HABILITADO=true`,
      y reinicia la app Node para que tome el cambio.
- [ ] El cron del worker corre cada 15 min (revisa el log).
- [ ] PDFs: si no hay Chrome instalado, confirma que cae al HTML imprimible
      sin romper la descarga (comportamiento esperado, no error).

## Resumen del flujo diario

```
editar en local  →  git add/commit  →  git push origin main
                                            │
                       (webhook)            ▼
                              Hostinger hace pull del código
                                            │
                     (manual, por ahora)    ▼
        SSH: npm install && npm run build (backend y/o frontend)
                                            │
                                            ▼
                   Reiniciar la app Node desde hPanel si tocaste backend
```

> A diferencia de la app PHP, el build de TypeScript/Vite **no es
> automático** con solo el `git pull` del webhook — hace falta correr
> `npm run build` tras cada despliegue que toque `backend/` o `frontend/`.
> Si quieres automatizarlo del todo, hPanel permite configurar un
> **Deployment script** en la pantalla Git que corra esos comandos después
> del pull.
