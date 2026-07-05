<?php
/**
 * Light TMS - Resultado de una llamada al web service del RNDC.
 */

declare(strict_types=1);

final class RndcRespuesta
{
    /**
     * @param list<array<string,string>> $datos filas devueltas por una consulta
     */
    public function __construct(
        public readonly bool $ok,
        public readonly ?string $ingresoId,
        public readonly ?string $error,
        public readonly int $httpCode,
        public readonly string $respuestaCruda,
        public readonly ?string $xmlEnviado = null,
        public readonly array $datos = [],
    ) {
    }

    /**
     * @param list<array<string,string>> $datos
     */
    public static function exito(string $ingresoId, int $httpCode, string $cruda, ?string $xml = null, array $datos = []): self
    {
        return new self(true, $ingresoId, null, $httpCode, $cruda, $xml, $datos);
    }

    public static function fallo(string $error, int $httpCode, string $cruda, ?string $xml = null): self
    {
        return new self(false, null, $error, $httpCode, $cruda, $xml);
    }
}
