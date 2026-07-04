# Light TMS — Stack moderno (React + Node/Express + TypeScript + mysql2)

Migración de la app PHP/MySQL a una pila moderna. **La app PHP original (`/public`, `/src`) se conserva como referencia** hasta validar paridad. El código nuevo vive en `/server` (API) y `/client` (SPA).

## Requisitos
- Node ≥ 20, npm
- MySQL/MariaDB con el esquema existente (`sql/schema.sql` + `maestros.sql` + `catalogos.sql` + `municipios.sql` + `migracion_v2..v31`)
- (Opcional para PDF) Google Chrome o Edge instalado — el backend genera el PDF con el navegador del sistema vía `puppeteer-core`; si no hay, sirve HTML imprimible.

## Configuración
```bash
cp server/.env.example server/.env   # DB_*, JWT_SECRET, RNDC_*, COLA_ENVIO_HABILITADO=false
```
El backend también lee el `.env` de la raíz (el de la app PHP) como respaldo para DB/RNDC/COLA.

## Instalar y correr (desde la raíz)
```bash
npm install                 # workspaces: instala server + client
npm run seed:admin -- --email admin@tms.local --password "CAMBIA-ESTO" --nombre "Admin"
npm run dev                 # API en :4000, SPA (Vite) en :5173 con proxy /api
```
- Roles: `admin` / `operador`. El **envío real al RNDC** (drenar cola, registrar maestros) está restringido a `admin`.
- Interruptor de seguridad: `COLA_ENVIO_HABILITADO=false` (por defecto) arma y previsualiza el XML pero **no** lo envía.

## Scripts
| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta API + SPA en paralelo |
| `npm run build` | Compila server (tsc) y client (vite) |
| `npm run typecheck` | Typecheck de ambos |
| `npm test` | Tests del server (paridad RNDC byte-a-byte + QR) |
| `npm run worker` | Drena la cola una vez (equivale a `cron/retry_worker.php`); progrmáalo con cron/Task Scheduler |
| `npm run seed:admin` | Crea/actualiza el usuario admin |

## Arquitectura
- **`/server`** — Express + `mysql2` (sin ORM), módulos que portan 1:1 los repos PHP:
  `rndc/` (cliente SOAP, ISO-8859-1, con tests de paridad), `modules/{auth,terceros,vehiculos,municipios,catalogos,empresa,solicitudes,cola,pdf,stats}`, `queue/worker.ts`.
- **`/client`** — React 18 + Vite + Tailwind + Zustand + Recharts + Lucide. Componentes reutilizables portados de `public/assets/js/app.js`: `Autocomplete` (debounce 220ms), `MapPicker` (Leaflet + Nominatim), retenciones, autollenado vehículo→conductor.

## Verificación de paridad
- `npm test` valida que el XML/SOAP del cliente RNDC en TS es **idéntico byte a byte** al PHP (incluida la codificación ISO-8859-1) y que el texto del QR del manifiesto respeta el formato exacto.
- Flujo end-to-end (requiere DB): crear solicitud → confirmar despacho → revisar filas encoladas y su XML en **Cola** (`/cola`, botón XML por fila) con `COLA_ENVIO_HABILITADO=false`.
