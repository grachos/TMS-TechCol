/**
 * Light TMS - Zod schema for Vehículos. Required: placa, configuración,
 * peso_vacio, and the tenedor (router guard: "Elige el tenedor de la lista").
 */

import { z } from 'zod';

const optionalStr = z.string().trim().optional().nullable();

export const vehiculoUpsertSchema = z.object({
  placa: z.string().trim().min(1, 'La placa es obligatoria.').max(6),
  cod_configuracion: z.string().trim().min(1, 'La configuración es obligatoria.'),
  peso_vacio: z.coerce.number({ invalid_type_error: 'Peso vacío inválido.' }).int().nonnegative().nullable().optional(),
  remolque_placa: optionalStr,
  propietario_tipo_id: optionalStr,
  propietario_num_id: optionalStr,
  tenedor_tipo_id: z.string().trim().min(1, 'Elige el tenedor de la lista de terceros.'),
  tenedor_num_id: z.string().trim().min(1, 'Elige el tenedor de la lista de terceros.'),
  conductor_tipo_id: optionalStr,
  conductor_num_id: optionalStr,
});

export type VehiculoUpsert = z.infer<typeof vehiculoUpsertSchema>;
