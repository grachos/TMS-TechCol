# Despliegue: GitHub → Hostinger

Flujo: desarrollas local (XAMPP) → `git push` a GitHub → Hostinger trae los cambios
con su herramienta **Git** (manual o automático por webhook).

Repo: <https://github.com/grachos/light-tms> (rama `main`).

---

## 1. Base de datos en Hostinger

1. hPanel → **Bases de datos → Bases de datos MySQL**.
2. Crea una base (ej. `uXXXX_light_tms`) y un usuario; **anota** host, nombre, usuario y clave.
   > En Hostinger el `DB_HOST` suele ser `localhost`.
3. Entra a **phpMyAdmin** → selecciona la base → pestaña **Importar** → sube
   `sql/schema.sql` → **Continuar**. Deben crearse las 4 tablas.

---

## 2. Conectar el repositorio (Git de hPanel)

1. hPanel → **Sitios web → Administrar →** (Avanzado) **GIT**.
2. **Crear un nuevo repositorio**:
   - **Repository**: `https://github.com/grachos/light-tms.git`
   - **Branch**: `main`
   - **Directory**: el destino del clon (ver paso 3 según la forma elegida).
3. Pulsa **Crear**. Hostinger clona el repo en esa carpeta.

---

## 3. Document root (elige UNA forma)

El código mantiene `public/` como única carpeta pública. Hay dos formas:

### Forma A — Subdominio (recomendada)
1. hPanel → **Dominios → Subdominios** → crea `tms` (→ `tms.tudominio.com`).
2. En **Directory** del repo Git usa una carpeta, ej. `light-tms`.
3. Ajusta la **carpeta del subdominio** para que apunte a `light-tms/public`.
   - Así `src/`, `.env`, `sql/`, `cron/` quedan fuera de la web automáticamente.

### Forma B — Dominio principal en `public_html`
1. En **Directory** del repo Git usa `public_html`.
2. No hace falta cambiar el document root: el `.htaccess` raíz enruta todo a
   `public/` y bloquea `src/`, `.env`, etc.

---

## 4. Crear el `.env` en el servidor

El `.env` **no** está en GitHub. Créalo una vez en el servidor, en la **raíz del repo
clonado** (junto a `src/`), vía File Manager o SSH, con los datos de producción:

```env
APP_ENV=produccion
APP_DEBUG=false

DB_HOST=localhost
DB_PORT=3306
DB_NAME=uXXXX_light_tms
DB_USER=uXXXX_usuario
DB_PASS=tu_clave
DB_CHARSET=utf8mb4

RNDC_URL=http://plataforma.mintransporte.gov.co/ws/rndcWebService.php
RNDC_USERNAME=...
RNDC_PASSWORD=...
RNDC_EMPRESA=...

COLA_MAX_INTENTOS=10
COLA_MINUTOS_REINTENTO=15
```

> Persiste entre despliegues (Git no lo borra porque no lo rastrea).

---

## 5. Auto-deploy (opcional pero recomendado)

1. En la pantalla **GIT** de hPanel, activa **Auto Deployment** y **copia el Webhook URL**.
2. GitHub → repo **light-tms → Settings → Webhooks → Add webhook**:
   - **Payload URL**: el webhook de Hostinger.
   - **Content type**: `application/json`.
   - **Just the push event** → **Add webhook**.
3. Desde ahora, cada `git push` a `main` despliega solo.
   (Sin webhook: usa el botón **Deploy** de hPanel para traer cambios.)

---

## 6. Cron del worker de reintento (Fase 4)

hPanel → **Avanzado → Trabajos Cron**, cada 15 min:

```
*/15 * * * * /usr/bin/php /home/uXXXX/domains/tudominio.com/light-tms/cron/retry_worker.php
```

(Ajusta la ruta real del clon.)

---

## Resumen del flujo diario

```
editar en local  →  git add/commit  →  git push origin main
                                            │
                       (webhook)            ▼
                                   Hostinger hace pull → app actualizada
```
