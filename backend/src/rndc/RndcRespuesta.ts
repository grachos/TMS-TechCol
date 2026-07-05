/**
 * Light TMS - Result of an RNDC web-service call. Port of RndcRespuesta.php.
 */

export type RndcFila = Record<string, string>;

export class RndcRespuesta {
  constructor(
    public readonly ok: boolean,
    public readonly ingresoId: string | null,
    public readonly error: string | null,
    public readonly httpCode: number,
    public readonly respuestaCruda: string,
    public readonly xmlEnviado: string | null = null,
    public readonly datos: RndcFila[] = [],
    /** True when the RNDC rejected the send because an identical record was already registered. */
    public readonly duplicado: boolean = false,
  ) {}

  static exito(
    ingresoId: string,
    httpCode: number,
    cruda: string,
    xml: string | null = null,
    datos: RndcFila[] = [],
  ): RndcRespuesta {
    return new RndcRespuesta(true, ingresoId, null, httpCode, cruda, xml, datos);
  }

  static fallo(error: string, httpCode: number, cruda: string, xml: string | null = null): RndcRespuesta {
    return new RndcRespuesta(false, null, error, httpCode, cruda, xml);
  }

  /**
   * The RNDC rejected the send with "DUPLICADO:<ingresoid> ..." — the record was
   * already registered with identical data in a prior attempt. Treated as a
   * success (reuses the original ingresoid) so the caller marks it registrado/
   * aceptado instead of error, while keeping the original message for the user.
   */
  static duplicado(ingresoId: string, mensaje: string, httpCode: number, cruda: string, xml: string | null = null): RndcRespuesta {
    return new RndcRespuesta(true, ingresoId, mensaje, httpCode, cruda, xml, [], true);
  }
}
