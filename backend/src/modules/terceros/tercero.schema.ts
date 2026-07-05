/**
 * Light TMS - Zod schemas for Terceros. Mirror the DB NOT NULL columns and the
 * router guard ("Elige el municipio de la lista" => cod_municipio required).
 */

import { z } from 'zod';

const optionalStr = z.string().trim().optional().nullable();

export const terceroUpsertSchema = z.object({
  tipo_id: z.string().trim().min(1, 'El tipo de identificación es obligatorio.'),
  num_id: z.string().trim().min(1, 'El número de identificación es obligatorio.'),
  nombre: z.string().trim().min(1, 'El nombre o razón social es obligatorio.'),
  primer_apellido: optionalStr,
  segundo_apellido: optionalStr,
  regimen_simple: optionalStr,
  direccion: z.string().trim().min(1, 'La dirección es obligatoria.'),
  cod_municipio: z.string().trim().min(1, 'Elige el municipio de la lista.'),
  municipio_nombre: optionalStr,
  sede: optionalStr,
  nombre_sede: optionalStr,
  telefono: optionalStr,
  celular: optionalStr,
  email: z.string().trim().email('Correo inválido.').optional().nullable().or(z.literal('')),
  latitud: optionalStr,
  longitud: optionalStr,
  es_conductor: z.coerce.boolean().optional().default(false),
  categoria_licencia: optionalStr,
  num_licencia: optionalStr,
  fecha_venc_licencia: optionalStr,
});

export type TerceroUpsert = z.infer<typeof terceroUpsertSchema>;
