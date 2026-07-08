/**
 * Light TMS - Floating data chatbot. Asks natural-language questions about the
 * TMS data ("¿cuántos manifiestos he creado?", "¿qué falta por cumplir?") and
 * the backend answers via OpenRouter + a read-only SQL tool. Renders nothing
 * unless the backend reports the assistant is enabled.
 */

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Loader2, Bot } from 'lucide-react';
import { api, ApiError } from '../lib/api';

interface Turno {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatWidget() {
  const [habilitado, setHabilitado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Turno[]>([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api<{ habilitado: boolean }>('/chat/estado');
        setHabilitado(r.habilitado);
      } catch {
        setHabilitado(false);
      }
    })();
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, cargando]);

  if (!habilitado) return null;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const pregunta = texto.trim();
    if (!pregunta || cargando) return;
    const historial = mensajes.slice(-8);
    setMensajes((m) => [...m, { role: 'user', content: pregunta }]);
    setTexto('');
    setCargando(true);
    try {
      const r = await api<{ respuesta: string }>('/chat', {
        method: 'POST',
        body: { pregunta, historial },
      });
      setMensajes((m) => [...m, { role: 'assistant', content: r.respuesta }]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo obtener respuesta.';
      setMensajes((m) => [...m, { role: 'assistant', content: `⚠️ ${msg}` }]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      {/* Botón flotante */}
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-celeste-600 text-white shadow-lg transition hover:bg-celeste-700"
          aria-label="Abrir asistente de datos"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Panel */}
      {abierto && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between bg-celeste-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bot size={18} /> Asistente de datos
            </div>
            <button onClick={() => setAbierto(false)} aria-label="Cerrar">
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {mensajes.length === 0 && (
              <div className="mt-6 text-center text-sm text-slate-400">
                Pregúntame sobre tus datos.
                <div className="mt-2 space-y-1 text-xs">
                  <p>"¿Cuántos manifiestos he creado?"</p>
                  <p>"¿Qué falta por cumplir?"</p>
                  <p>"¿Cuántos envíos con error hay en la cola?"</p>
                </div>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-celeste-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {cargando && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-400">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              </div>
            )}
            <div ref={finRef} />
          </div>

          <form onSubmit={enviar} className="flex items-center gap-2 border-t border-slate-200 p-2">
            <input
              className="field-input flex-1"
              placeholder="Escribe tu pregunta…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={cargando}
            />
            <button
              type="submit"
              className="btn-primary px-3 py-2"
              disabled={cargando || texto.trim() === ''}
              aria-label="Enviar"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
