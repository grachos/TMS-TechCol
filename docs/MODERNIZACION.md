# Light TMS — Stack moderno (React + Node/Express + TypeScript + mysql2)

Migración de la app PHP/MySQL a una pila moderna. **La app PHP original se conserva en `/legacy`** como referencia hasta validar paridad. El código nuevo vive en `/backend` (API) y `/frontend` (SPA); el esquema en `/database`.

## Requisitos
- Node ≥ 20, npm
- MySQL/MariaDB con el esquema existente (`database/schema.sql` + `maestros.sql` + `catalogos.sql` + `municipios.sql` + `migracion_v2..v31`)
- (Opcional para PDF) Google Chrome o Edge instalado — el backend genera el PDF con el navegador del sistema vía `puppeteer-core`; si no hay, sirve HTML imprimible.

## Configuración
```bash
cp backend/.env.example backend/.env   # DB_*, JWT_SECRET, RNDC_*, COLA_ENVIO_HABILITADO=false
```
El backend también lee el `.env` de la raíz como respaldo para DB/RNDC/COLA.

## Instalar y correr (desde la raíz)
```bash
npm install                 # workspaces: instala backend + frontend
npm run seed:admin -- --email admin@tms.local --password "CAMBIA-ESTO" --nombre "Admin"
npm run dev                 # API en :4000, SPA (Vite) en :5173 con proxy /api
```
- Roles: `admin` / `operador`. El **envío real al RNDC** (drenar cola, registrar maestros) está restringido a `admin`.
- Interruptor de seguridad: `COLA_ENVIO_HABILITADO=false` (por defecto) arma y previsualiza el XML pero **no** lo envía.

## Scripts
| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta API + SPA en paralelo |
| `npm run build` | Compila backend (tsc) y frontend (vite) |
| `npm run typecheck` | Typecheck de ambos |
| `npm test` | Tests del backend (paridad RNDC byte-a-byte + QR) |
| `npm run worker` | Drena la cola una vez (equivale a `legacy/cron/retry_worker.php`); prográmalo con cron/Task Scheduler |
| `npm run seed:admin` | Crea/actualiza el usuario admin |

## Arquitectura
- **`/backend`** — Express + `mysql2` (sin ORM), módulos que portan 1:1 los repos PHP:
  `rndc/` (cliente SOAP, ISO-8859-1, con tests de paridad), `modules/{auth,terceros,vehiculos,municipios,catalogos,empresa,solicitudes,cola,cumplido,pdf,stats,informe}`, `queue/worker.ts`.
- **`/frontend`** — React 18 + Vite + Tailwind + Zustand + Recharts + Lucide. Componentes reutilizables portados de `legacy/public/assets/js/app.js`: `Autocomplete` (debounce 220ms), `MapPicker` (Leaflet + Nominatim), `MunicipioAutocomplete`, retenciones, autollenado vehículo→conductor.
- **`/database`** — esquema, maestros, catálogos, municipios DANE y migraciones.
- **`/legacy`** — app PHP original (front controller, repos PDO, vistas, cron, PDFs Dompdf).

## Verificación de paridad
- `npm test` valida que el XML/SOAP del cliente RNDC en TS es **idéntico byte a byte** al PHP (incluida la codificación ISO-8859-1) y que el texto del QR del manifiesto respeta el formato exacto.
- Paridad sobre datos reales: se regeneraron los `payload_xml` de `cola_envios` (creados por la app PHP) con el `ColaRepo` de Node → **idénticos**.
- Flujo end-to-end: crear solicitud → confirmar despacho → revisar filas encoladas y su XML en **Cola** (`/cola`, botón XML por fila) con `COLA_ENVIO_HABILITADO=false`.

> Para regenerar los fixtures de paridad RNDC: `php backend/test/gen_rndc_fixtures.php` (usa `legacy/src/Rndc/RndcClient.php` como fuente de verdad).
