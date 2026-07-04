/**
 * Light TMS - Generic debounced autocomplete.
 *
 * Ports initAutocomplete() from public/assets/js/app.js: 220ms debounce, min 2
 * chars, fetches an /...buscar endpoint returning items with a `label` plus the
 * fields the caller copies via onSelect.
 */

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import type { AcItem } from '../types';

interface AutocompleteProps {
  /** API path, e.g. '/terceros/buscar'. */
  endpoint: string;
  /** Extra query params (e.g. { solo_conductor: 1 }). */
  params?: Record<string, string | number | boolean>;
  /** Called when an item is chosen. */
  onSelect: (item: AcItem) => void;
  /** Called when the user edits the text (invalidates the previous selection). */
  onClear?: () => void;
  placeholder?: string;
  /** Initial text shown (e.g. when editing an existing record). */
  initialLabel?: string;
  /** Optional custom row renderer. */
  renderItem?: (item: AcItem) => React.ReactNode;
}

export function Autocomplete({
  endpoint,
  params,
  onSelect,
  onClear,
  placeholder,
  initialLabel = '',
  renderItem,
}: AutocompleteProps) {
  const [text, setText] = useState(initialLabel);
  const [items, setItems] = useState<AcItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setText(initialLabel), [initialLabel]);

  function onInput(value: string) {
    setText(value);
    onClear?.(); // selection invalid until an item is picked
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api<AcItem[]>(endpoint, { query: { q, ...params } });
        setItems(res);
        setOpen(true);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 220);
  }

  function choose(it: AcItem) {
    setText(it.label);
    setItems([]);
    setOpen(false);
    onSelect(it);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="field-input pl-9"
          value={text}
          placeholder={placeholder}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          autoComplete="off"
        />
      </div>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && <li className="px-3 py-2 text-sm text-slate-400">Buscando…</li>}
          {!loading && items.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Sin resultados.</li>
          )}
          {items.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-celeste-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(it);
                }}
              >
                {renderItem ? renderItem(it) : it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
