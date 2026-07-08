/**
 * Light TMS - Chatbot service. Drives an OpenRouter (OpenAI-compatible) model
 * through a tool-use loop: the model asks for data via the `consultar_bd` tool,
 * we run the validated read-only query, feed rows back, and the model answers in
 * natural language. No SDK — plain fetch against the OpenRouter REST API.
 */

import { config } from '../../config/env.js';
import { ESQUEMA, validarSelect, ejecutarSelect } from './chat.repo.js';

type Rol = 'system' | 'user' | 'assistant' | 'tool';

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: Rol;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** Historial que envía el frontend (solo user/assistant). */
export interface TurnoCliente {
  role: 'user' | 'assistant';
  content: string;
}

const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'consultar_bd',
      description:
        'Ejecuta UNA consulta SELECT de solo lectura sobre la base de datos del TMS y ' +
        'devuelve las filas resultantes en JSON. Úsala siempre que necesites datos reales ' +
        'para responder (conteos, listados, sumas, filtros por estado o fecha, etc.).',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'Una única sentencia SELECT válida de MySQL, sin punto y coma final.',
          },
        },
        required: ['sql'],
        additionalProperties: false,
      },
    },
  },
];

function systemPrompt(): string {
  return [
    'Eres el asistente de datos de "Light TMS", un sistema de despachos de carga (RNDC) en Colombia.',
    'Respondes en español, de forma breve y clara, basándote SOLO en datos reales obtenidos con la herramienta consultar_bd.',
    'Nunca inventes cifras: si necesitas un dato, genera un SELECT y consúltalo.',
    'No muestres el SQL a menos que el usuario lo pida explícitamente. No reveles contraseñas ni credenciales.',
    'Si la pregunta no se puede responder con las tablas disponibles, dilo con honestidad.',
    '',
    ESQUEMA,
  ].join('\n');
}

/**
 * Modelos gratuitos con soporte de tool-calling usados como respaldo cuando el
 * modelo configurado es `:free` (los proveedores gratis se saturan a menudo;
 * OpenRouter enruta al siguiente disponible de la lista `models`).
 */
const FALLBACKS_GRATIS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-coder:free',
  'openai/gpt-oss-120b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function llamarOpenRouter(mensajes: ChatMessage[]): Promise<ChatMessage> {
  const cfg = config().chat;
  const esGratis = cfg.modelo.endsWith(':free');
  // Con modelos gratis mandamos la lista `models` (fallback automático de
  // OpenRouter). Con uno de pago mandamos solo ese, para no enrutar a otro
  // proveedor con costo inesperado.
  // OpenRouter limita `models` a 3 elementos.
  const modelos = esGratis
    ? Array.from(new Set([cfg.modelo, ...FALLBACKS_GRATIS])).slice(0, 3)
    : [cfg.modelo];

  const body = JSON.stringify({
    model: modelos[0],
    ...(modelos.length > 1 ? { models: modelos } : {}),
    messages: mensajes,
    tools: HERRAMIENTAS,
    tool_choice: 'auto',
    temperature: 0.1,
    max_tokens: 1024,
  });

  let ultimoError = '';
  for (let intento = 0; intento < 3; intento++) {
    const resp = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        // Opcionales de OpenRouter (identifican la app en su ranking).
        'HTTP-Referer': 'https://tmslight.techcol-service.cc',
        'X-Title': 'Light TMS',
      },
      body,
      signal: AbortSignal.timeout(45_000),
    });

    if (resp.status === 429 || resp.status >= 500) {
      ultimoError = `HTTP ${resp.status}`;
      await delay(1200 * (intento + 1)); // backoff antes de reintentar
      continue;
    }
    if (!resp.ok) {
      const cuerpo = await resp.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${resp.status}: ${cuerpo.slice(0, 300)}`);
    }
    const data = (await resp.json()) as { choices?: { message?: ChatMessage }[]; error?: { message?: string } };
    if (data.error) throw new Error(`OpenRouter: ${data.error.message ?? 'error desconocido'}`);
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenRouter devolvió una respuesta vacía.');
    return msg;
  }
  throw new Error(`El modelo de IA está saturado (${ultimoError}). Intenta de nuevo en unos segundos.`);
}

/** Ejecuta una tool call `consultar_bd` y devuelve el contenido para el rol 'tool'. */
async function ejecutarHerramienta(call: ToolCall): Promise<string> {
  if (call.function.name !== 'consultar_bd') {
    return JSON.stringify({ error: `Herramienta desconocida: ${call.function.name}` });
  }
  let sql: unknown;
  try {
    sql = JSON.parse(call.function.arguments || '{}').sql;
  } catch {
    return JSON.stringify({ error: 'Argumentos inválidos (no es JSON).' });
  }
  const val = validarSelect(sql);
  if (!val.ok) return JSON.stringify({ error: val.error });
  try {
    const r = await ejecutarSelect(val.sql!);
    return JSON.stringify({ columnas: r.columnas, filas: r.filas, truncado: r.truncado });
  } catch (e) {
    // Devolvemos el error como resultado de la herramienta para que el modelo
    // pueda corregir su consulta en la siguiente vuelta.
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

const MAX_VUELTAS = 5;

/**
 * Responde una pregunta del usuario. `historial` son los turnos previos
 * (user/assistant) para dar contexto conversacional.
 */
export async function responder(pregunta: string, historial: TurnoCliente[] = []): Promise<string> {
  const mensajes: ChatMessage[] = [
    { role: 'system', content: systemPrompt() },
    ...historial.slice(-8).map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: pregunta },
  ];

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const msg = await llamarOpenRouter(mensajes);
    mensajes.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        const contenido = await ejecutarHerramienta(call);
        mensajes.push({ role: 'tool', tool_call_id: call.id, content: contenido });
      }
      continue; // vuelve a llamar al modelo con los resultados
    }

    return (msg.content ?? '').trim() || 'No obtuve una respuesta.';
  }
  return 'La consulta resultó demasiado compleja. Intenta reformular la pregunta.';
}
