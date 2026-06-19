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
        return $fila ?: ['id' => 1, 'tipo_id' => 'N', 'nit' => '', 'razon_social' => '', 'nro_poliza' => ''];
    }

    /** @param array<string,mixed> $datos */
    public function guardar(array $datos): void
    {
        db()->prepare(
            'INSERT INTO maestro_empresa (id, tipo_id, nit, razon_social, nro_poliza)
             VALUES (1, :tipo_id, :nit, :razon_social, :nro_poliza)
             ON DUPLICATE KEY UPDATE
                tipo_id = VALUES(tipo_id), nit = VALUES(nit),
                razon_social = VALUES(razon_social), nro_poliza = VALUES(nro_poliza)'
        )->execute([
            'tipo_id'      => $datos['tipo_id'] ?? 'N',
            'nit'          => trim((string) ($datos['nit'] ?? '')),
            'razon_social' => trim((string) ($datos['razon_social'] ?? '')) ?: null,
            'nro_poliza'   => trim((string) ($datos['nro_poliza'] ?? '')) ?: null,
        ]);
    }
}
