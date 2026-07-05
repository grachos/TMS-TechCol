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
   migracion_v33_rndc_credenciales.sql   ← NUEVO (usuario/contraseña RNDC en maestro_empresa)
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

## 2. Importa el repo desde GitHub (un solo deploy para todo)

Hostinger ofrece dos maneras distintas de desplegar Node — cuál ves depende
de tu plan/cuenta:

- **Flujo nuevo tipo "Import from GitHub"** (el que probablemente tienes):
  una pantalla de una sola app con **Rama**, **Versión de Node**,
  **Directorio raíz**, **Comando de compilación / Directorio de salida /
  Archivo de entrada**, y **Variables de entorno**. Es del estilo
  Vercel/Netlify: un repo → un proceso Node.
- **Flujo clásico de hPanel** (`Avanzado → Git` + `Node.js` por separado):
  el de la app PHP original.

Esta guía usa el flujo nuevo porque es monorepo-friendly con un solo truco:
como `backend/` y `frontend/` son dos paquetes npm separados, y el cliente
HTTP del frontend (`frontend/src/lib/api.ts`) **siempre llama a rutas
relativas `/api/...` del mismo origen** (no hay forma de apuntar a otro
host sin tocar código), la solución más simple es que **el propio backend
Express sirva también el frontend ya compilado** — así todo queda en un
solo proceso, un solo dominio, cero problemas de CORS. Esto ya está resuelto
en el código (`backend/src/app.ts` sirve `frontend/dist/` estático + hace
fallback a `index.html` para las rutas de React Router, si esa carpeta
existe en el build).

Al conectar el repo (`https://github.com/grachos/TMS-TechCol`, rama `main`),
configura:

| Campo | Valor |
|---|---|
| **Directorio raíz** | `.` (la raíz del repo, **no** `backend`) |
| **Comando de compilación** | `npm run build` (el de la raíz — compila backend Y frontend en un solo paso: `npm --prefix backend run build && npm --prefix frontend run build`) |
| **Gestor de paquetes** | `npm` |
| **Directorio de salida** | `backend/dist` |
| **Archivo de entrada** | `backend/dist/server.js` |
| **Versión de Node** | 20.x (el backend requiere ≥ 20) |

> Ojo con el **Directorio de salida** y el **Archivo de entrada**: como el
> directorio raíz es `.` (todo el repo), las rutas son relativas a la raíz,
> no a `backend/` — por eso llevan el prefijo `backend/`. Si los dejas como
> `dist` y `dist/server.js` a secas, el deploy falla porque esos paths no
> existen en la raíz del repo.

---

## 3. Variables de entorno

En la sección **"Variables de entorno"** de esa misma pantalla, agrega:

```env
APP_ENV=produccion
APP_DEBUG=false
CORS_ORIGINS=*                 # no hace falta restringirlo — front y API comparten origen

JWT_SECRET=<genera-uno-largo-y-aleatorio>
JWT_EXPIRES=8h

DB_HOST=localhost
DB_PORT=3306
DB_NAME=uXXXX_light_tms
DB_USER=uXXXX_usuario
DB_PASS=tu_clave
DB_CHARSET=utf8mb4

RNDC_AMBIENTE=pruebas           # cámbialo a produccion solo cuando ya probaste todo
RNDC_HOST_OVERRIDE=
RNDC_TIMEOUT=30

COLA_MAX_INTENTOS=10
COLA_MINUTOS_REINTENTO=15
COLA_ENVIO_HABILITADO=false     # true SOLO cuando quieras enviar de verdad al RNDC
```

No definas `PORT` — Hostinger asigna uno y lo inyecta él solo; el backend ya
lo lee de `process.env.PORT` vía `config()`.

> **Usuario/contraseña RNDC y NIT ya no van aquí.** Se editan desde el
> formulario **Empresa** (solo admin) una vez que la app está corriendo —
> el NIT es el mismo campo "NIT \*" del formulario, y las credenciales se
> guardan en `maestro_empresa` (columnas `rndc_username`/`rndc_password`,
> migración v33). Solo hace falta importar esa migración y luego cargar los
> datos desde la UI — no hay nada que poner en variables de entorno.

Finaliza/guarda y lanza el deploy (o "Redesplegar" si ya existía).

---

## 4. Primer arranque: crear el admin

Una vez el deploy termina en verde, necesitas correr `seed:admin` una vez.
Si el panel te da una terminal (revisa si hay un botón de shell/consola en
la pantalla de la app, o **Avanzado → SSH Access** en hPanel clásico):

```bash
cd <ruta-de-tu-app>          # la misma que "Directorio raíz" del deploy
npm --prefix backend run seed:admin -- --email admin@tudominio.com --password "CAMBIA-ESTO" --nombre "Admin"
```

Si no tienes shell, dilo — hay una alternativa (endpoint temporal o
`INSERT` directo por phpMyAdmin con un hash bcrypt) pero preferí siempre
la vía del script porque hashea la contraseña correctamente.

Prueba:
- `https://<tu-dominio-asignado>/api/health` → `{"ok":true,"database":{"ok":true}}`
- `https://<tu-dominio-asignado>/` → la pantalla de login de React (ya no
  "Cannot GET /").

---

## 5. Cron del worker de reintento

Reemplaza al cron de `legacy/cron/retry_worker.php`. hPanel → **Avanzado →
Trabajos Cron**, cada 15 minutos:

```
*/15 * * * * cd <ruta-de-tu-app> && <ruta-al-node> backend/dist/queue/worker.js >> <ruta-a-tus-logs>/tms-worker.log 2>&1
```

La ruta exacta del binario `node` para ese Node.js version la ves en la
pantalla de la app (o en `Avanzado → SSH Access`, corriendo `which node`).

---

## 6. Checklist post-despliegue

- [ ] `GET /api/health` responde `{"ok":true,"database":{"ok":true}}`.
- [ ] `/` sirve la pantalla de login de React (no "Cannot GET /").
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
                                            ▼
                Hostinger detecta el push y corre el pipeline solo:
                git pull → npm install (raíz) → npm run build
                (backend + frontend) → reinicia el proceso Node
```

Con el flujo "Import from GitHub", el build y el reinicio **son
automáticos** en cada push a `main` — a diferencia del hPanel clásico
(Git + Node.js App por separado), donde sí haría falta un paso manual de
`npm run build` + reinicio. Si tu deploy no se dispara solo, revisa que el
webhook/auto-deploy esté activado en la pantalla de la app.
