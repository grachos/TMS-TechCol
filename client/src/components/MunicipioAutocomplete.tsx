/**
 * Light TMS - Standard DIVIPOLA municipio picker.
 *
 * Use this for EVERY "Municipio" field so the display format stays consistent.
 * It always shows the API `label` — "{nombre} – {nombre_mpio}, {departamento}"
 * (e.g. "GUACAMAYAL – JERICÓ, ANTIOQUIA") — so localities that share a name are
 * distinguishable by their municipio + departamento. Do not override renderItem.
 */

import { Autocomplete } from './Autocomplete';
import type { AcItem } from '../types';

interface MunicipioAutocompleteProps {
  /** Called with the selected municipio's codigo_rndc (DIVIPOLA) and full label. */
  onSelect: (codigoRndc: string, label: string) => void;
  /** Called when the text changes (selection becomes invalid). */
  onClear?: () => void;
  /** Text shown initially (e.g. when editing an existing record). */
  initialLabel?: string;
  placeholder?: string;
}

export function MunicipioAutocomplete({
  onSelect,
  onClear,
  initialLabel = '',
  placeholder = 'Escribe y elige…',
}: MunicipioAutocompleteProps) {
  return (
    <Autocomplete
      endpoint="/municipios/buscar"
      placeholder={placeholder}
      initialLabel={initialLabel}
      onClear={onClear}
      onSelect={(it: AcItem) => onSelect(String(it.codigo_rndc ?? ''), it.label)}
    />
  );
}
