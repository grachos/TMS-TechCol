<?php
/**
 * Light TMS - Maestro de la empresa propia (NIT, póliza). Fila única (id=1).
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';

final class EmpresaRepo
{
    /** @return array<string,mixed> */
    public function obtener(): array
    {
        $fila = db()->query('SELECT * FROM maestro_empresa WHERE id = 1')->fetch();
        return $fila ?: ['id' => 1, 'tipo_id' => 'N', 'nit' => '', 'razon_social' => '', 'nro_poliza' => '', 'consecutivo_remesa' => 0, 'consecutivo_manifiesto' => 0, 'radicado_remesa' => 0];
    }

    /** @param array<string,mixed> $datos */
    public function guardar(array $datos): void
    {
        db()->prepare(
            'INSERT INTO maestro_empresa (id, tipo_id, nit, razon_social, nro_poliza, consecutivo_remesa, consecutivo_manifiesto, radicado_remesa)
             VALUES (1, :tipo_id, :nit, :razon_social, :nro_poliza, :consecutivo_remesa, :consecutivo_manifiesto, :radicado_remesa)
             ON DUPLICATE KEY UPDATE
                tipo_id = VALUES(tipo_id), nit = VALUES(nit),
                razon_social = VALUES(razon_social), nro_poliza = VALUES(nro_poliza),
                consecutivo_remesa = VALUES(consecutivo_remesa),
                consecutivo_manifiesto = VALUES(consecutivo_manifiesto),
                radicado_remesa = VALUES(radicado_remesa)'
        )->execute([
            'tipo_id'              => $datos['tipo_id'] ?? 'N',
            'nit'                  => trim((string) ($datos['nit'] ?? '')),
            'razon_social'         => trim((string) ($datos['razon_social'] ?? '')) ?: null,
            'nro_poliza'           => trim((string) ($datos['nro_poliza'] ?? '')) ?: null,
            'consecutivo_remesa'   => (int) ($datos['consecutivo_remesa'] ?? 0),
            'consecutivo_manifiesto' => (int) ($datos['consecutivo_manifiesto'] ?? 0),
            'radicado_remesa'      => (int) ($datos['radicado_remesa'] ?? 0),
        ]);
    }

    /** Genera y reserva el siguiente consecutivo de remesa. */
    public function siguienteRemesa(): string
    {
        $emp = $this->obtener();
        $next = ((int) ($emp['consecutivo_remesa'] ?? 0)) + 1;
        db()->prepare('UPDATE maestro_empresa SET consecutivo_remesa = ? WHERE id = 1 AND consecutivo_remesa = ?')
            ->execute([$next, $emp['consecutivo_remesa'] ?? 0]);
        return 'REM-' . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }

    /** Genera y reserva el siguiente consecutivo de manifiesto. */
    public function siguienteManifiesto(): string
    {
        $emp = $this->obtener();
        $next = ((int) ($emp['consecutivo_manifiesto'] ?? 0)) + 1;
        db()->prepare('UPDATE maestro_empresa SET consecutivo_manifiesto = ? WHERE id = 1 AND consecutivo_manifiesto = ?')
            ->execute([$next, $emp['consecutivo_manifiesto'] ?? 0]);
        return 'MAN-' . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }

    /** Genera y reserva el siguiente radicado de remesa. */
    public function siguienteRadicadoRemesa(): int
    {
        $emp = $this->obtener();
        $next = ((int) ($emp['radicado_remesa'] ?? 0)) + 1;
        db()->prepare('UPDATE maestro_empresa SET radicado_remesa = ? WHERE id = 1 AND radicado_remesa = ?')
            ->execute([$next, $emp['radicado_remesa'] ?? 0]);
        return $next;
    }
}
