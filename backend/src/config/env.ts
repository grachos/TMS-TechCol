/**
 * Light TMS - Typed configuration loader.
 *
 * Port of src/config.php. Loads environment variables from server/.env and,
 * as a fallback, from the repo-root .env (the PHP app's file), so DB/RNDC/COLA
 * values can live in a single place. Values already present in process.env win.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/src/config -> server root is ../../ ; repo root is ../../../
const serverRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(serverRoot, '..');

// Load server/.env first (highest priority among files), then repo-root .env as
// a fallback for shared DB/RNDC/COLA values. dotenv does not overwrite existing
// keys, so the first file loaded for a given key wins.
dotenv.config({ path: path.join(serverRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env') });

/** Reads a string env var with a default; treats "" as absent. */
function str(key: string, def = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? def : v;
}

/** Reads an integer env var with a default. */
function int(key: string, def: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return def;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

/** Reads a boolean env var (true/1/yes) with a default. */
function bool(key: string, def: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return def;
  return ['true', '1', 'yes', 'on'].includes(v.toLowerCase());
}

export interface AppConfig {
  app: { name: string; env: string; debug: boolean; port: number; corsOrigins: string[] };
  auth: { jwtSecret: string; jwtExpires: string };
  db: { host: string; port: number; name: string; user: string; pass: string; charset: string };
  /** Read-only DB user for the chatbot (least privilege). Falls back to the main user. */
  dbReadonly: { user: string; pass: string };
  rndc: {
    ambiente: string;
    hostOverride: string;
    timeout: number;
  };
  cola: { maxIntentos: number; minutosReintento: number; envioHabilitado: boolean };
  /** Data chatbot via OpenRouter (OpenAI-compatible API). */
  chat: {
    habilitado: boolean;
    apiKey: string;
    modelo: string;
    baseUrl: string;
    maxFilas: number;
  };
}

let cached: AppConfig | null = null;

/** Consolidated application configuration (memoised). Mirrors config() in config.php. */
export function config(): AppConfig {
  if (cached) return cached;
  cached = {
    app: {
      name: str('APP_NAME', 'Light TMS'),
      env: str('APP_ENV', 'local'),
      debug: bool('APP_DEBUG', false),
      port: int('PORT', 4000),
      corsOrigins: str('CORS_ORIGINS', 'http://localhost:5173')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    auth: {
      jwtSecret: str('JWT_SECRET', 'change-me-in-production'),
      jwtExpires: str('JWT_EXPIRES', '8h'),
    },
    db: {
      host: str('DB_HOST', 'localhost'),
      port: int('DB_PORT', 3306),
      name: str('DB_NAME', 'light_tms'),
      user: str('DB_USER', 'root'),
      pass: str('DB_PASS', ''),
      charset: str('DB_CHARSET', 'utf8mb4'),
    },
    dbReadonly: {
      // If DB_READONLY_* are unset, the chatbot uses the main DB user. Strongly
      // recommended: create a MySQL user with SELECT-only grants (see chat.repo.ts).
      user: str('DB_READONLY_USER', str('DB_USER', 'root')),
      pass: str('DB_READONLY_PASS', str('DB_PASS', '')),
    },
    rndc: {
      // 'pruebas' (servidor rndc) o 'produccion' (rndcws/rndcws2/plc).
      ambiente: str('RNDC_AMBIENTE', 'pruebas'),
      hostOverride: str('RNDC_HOST_OVERRIDE', ''),
      timeout: int('RNDC_TIMEOUT', 30),
    },
    cola: {
      maxIntentos: int('COLA_MAX_INTENTOS', 10),
      minutosReintento: int('COLA_MINUTOS_REINTENTO', 15),
      // Safety switch: false builds/previews XML but does NOT send to the RNDC.
      envioHabilitado: bool('COLA_ENVIO_HABILITADO', false),
    },
    chat: {
      // Opt-in: the chatbot only works once an OpenRouter key is set and enabled.
      habilitado: bool('CHAT_HABILITADO', false),
      apiKey: str('OPENROUTER_API_KEY', ''),
      // Free/cheap model with tool-calling support. Override via OPENROUTER_MODEL.
      modelo: str('OPENROUTER_MODEL', 'deepseek/deepseek-chat-v3-0324:free'),
      baseUrl: str('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
      maxFilas: int('CHAT_MAX_FILAS', 200),
    },
  };
  return cached;
}
