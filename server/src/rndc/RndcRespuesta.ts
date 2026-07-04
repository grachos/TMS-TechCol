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
}
