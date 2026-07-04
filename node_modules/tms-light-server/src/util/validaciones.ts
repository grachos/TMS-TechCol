/**
 * Light TMS - Shared validations. Port of validarProductoPeligrosa() from helpers.php.
 */

import { productoPorCodigo } from '../modules/catalogos/catalogo.repo.js';

/**
 * Ensures a dangerous-nature product has codigo_un and estado_producto.
 * Returns null if valid, or an error message otherwise.
 */
export async function validarProductoPeligrosa(codigo: string, naturaleza: string): Promise<string | null> {
  if (naturaleza !== '2' || codigo === '') return null;
  const prod = await productoPorCodigo(codigo);
  if (prod === null) return null;
  if (!prod.codigo_un || !prod.estado_producto) {
    return 'El producto es de naturaleza peligrosa pero le falta Código UN y/o Estado del producto. Edítalo en Productos primero.';
  }
  return null;
}
