<?php
/**
 * Light TMS - Maestro de Vehículos (proceso 12 del RNDC).
 *
 * Campos como marca, modelo o propietario son opcionales: el RNDC los
 * hereda del RUNT a partir de la placa si no se envían.
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../Rndc/RndcClient.php';

final class VehiculoRepo
{
    private const CAMPOS = [
        'placa', 'cod_configuracion', 'peso_vacio', 'remolque_placa',
        'propietario_tipo_id', 'propietario_num_id', 'tenedor_tipo_id', 'tenedor_num_id',
    ];

    /**
     * @param array<string,mixed> $datos
     * @return int id del vehículo
     */
    public function crear(array $datos): int
    {
        $fila = [];
        foreach (self::CAMPOS as $c) {
            $valor = $datos[$c] ?? null;
            $fila[$c] = ($valor === '' ? null : $valor);
        }
        if (!empty($fila['placa'])) {
            $fila['placa'] = strtoupper((string) $fila['placa']);
        }

        $cols = implode(', ', array_keys($fila));
        $ph   = implode(', ', array_map(static fn ($c) => ":$c", array_keys($fila)));
        $stmt = db()->prepare("INSERT INTO vehiculo ($cols) VALUES ($ph)");
        $stmt->execute($fila);
        return (int) db()->lastInsertId();
    }

    /**
     * Busca vehículos por placa para autocompletado.
     *
     * @return list<array{id:int,placa:string,label:string}>
     */
    public function buscar(string $q, int $limite = 15): array
    {
        $q = trim($q);
        if ($q === '') {
            return [];
        }
        $stmt = db()->prepare(
            'SELECT id, placa FROM vehiculo WHERE placa LIKE ? ORDER BY placa LIMIT ' . (int) $limite
        );
        $stmt->execute(['%' . strtoupper($q) . '%']);
        $filas = $stmt->fetchAll();
        foreach ($filas as &$f) {
            $f['label'] = $f['placa'];
        }
        return $filas;
    }

    /**
     * Actualiza un vehículo existente.
     *
     * @param array<string,mixed> $datos
     */
    public function actualizar(int $id, array $datos): void
    {
        $fila = [];
        foreach (self::CAMPOS as $c) {
            $valor = $datos[$c] ?? null;
            $fila[$c] = ($valor === '' ? null : $valor);
        }
        if (!empty($fila['placa'])) {
            $fila['placa'] = strtoupper((string) $fila['placa']);
        }
        // Al cambiar los datos hay que volver a enviarlos al RNDC.
        $fila['estado_rndc'] = 'borrador';
        $fila['rndc_error']  = null;

        $sets = implode(', ', array_map(static fn ($c) => "$c = :$c", array_keys($fila)));
        $fila['id'] = $id;
        db()->prepare("UPDATE vehiculo SET $sets WHERE id = :id")->execute($fila);
    }

    /** @return list<array<string,mixed>> */
    public function listar(int $limite = 200): array
    {
        return db()->query(
            'SELECT id, placa, cod_configuracion, remolque_placa, tenedor_num_id, estado_rndc, rndc_ingreso_id
             FROM vehiculo ORDER BY id DESC LIMIT ' . (int) $limite
        )->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public function obtener(int $id): ?array
    {
        $stmt = db()->prepare('SELECT * FROM vehiculo WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    /** Registra el vehículo en el RNDC (proceso 12). */
    public function registrarEnRndc(int $id): RndcRespuesta
    {
        $v = $this->obtener($id);
        if ($v === null) {
            return RndcRespuesta::fallo('Vehículo no encontrado.', 0, '');
        }

        $rndc = RndcClient::desdeConfig();
        // ingresar() omite las variables vacías: lo no enviado lo hereda el RNDC.
        $vars = [
            'NUMNITEMPRESATRANSPORTE'     => config()['rndc']['empresa'],
            'NUMPLACA'                    => $v['placa'],
            'CODCONFIGURACIONUNIDADCARGA' => $v['cod_configuracion'],
            'PESOVEHICULOVACIO'           => $v['peso_vacio'],
            'CODTIPOIDPROPIETARIO'        => $v['propietario_tipo_id'],
            'NUMIDPROPIETARIO'            => $v['propietario_num_id'],
            'CODTIPOIDTENEDOR'            => $v['tenedor_tipo_id'],
            'NUMIDTENEDOR'                => $v['tenedor_num_id'],
        ];

        $resp = $rndc->ingresar(12, $vars);

        db()->prepare('UPDATE vehiculo SET estado_rndc = ?, rndc_ingreso_id = ?, rndc_error = ? WHERE id = ?')
            ->execute([
                $resp->ok ? 'registrado' : 'error',
                $resp->ingresoId,
                $resp->ok ? null : $resp->error,
                $id,
            ]);

        return $resp;
    }
}
