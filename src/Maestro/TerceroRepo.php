<?php
/**
 * Light TMS - Maestro de Terceros (proceso 11 del RNDC).
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../Rndc/RndcClient.php';

final class TerceroRepo
{
    private const CAMPOS = [
        'tipo_id', 'num_id', 'nombre', 'primer_apellido', 'segundo_apellido', 'regimen_simple',
        'direccion', 'cod_municipio', 'municipio_nombre', 'sede', 'nombre_sede',
        'telefono', 'celular', 'email', 'latitud', 'longitud',
        'es_conductor', 'categoria_licencia', 'num_licencia', 'fecha_venc_licencia',
    ];

    /**
     * @param array<string,mixed> $datos
     * @return int id del tercero
     */
    public function crear(array $datos): int
    {
        $fila = [];
        foreach (self::CAMPOS as $c) {
            $valor = $datos[$c] ?? null;
            $fila[$c] = ($valor === '' ? null : $valor);
        }
        $fila['es_conductor'] = !empty($datos['es_conductor']) ? 1 : 0;

        $cols = implode(', ', array_keys($fila));
        $ph   = implode(', ', array_map(static fn ($c) => ":$c", array_keys($fila)));
        $stmt = db()->prepare("INSERT INTO tercero ($cols) VALUES ($ph)");
        $stmt->execute($fila);
        return (int) db()->lastInsertId();
    }

    /**
     * Busca terceros para autocompletado.
     *
     * @return list<array{id:int,tipo_id:string,num_id:string,nombre:string,label:string}>
     */
    public function buscar(string $q, bool $soloConductor = false, int $limite = 15): array
    {
        $q = trim($q);
        if ($q === '') {
            return [];
        }
        $like = '%' . $q . '%';
        $sql  = 'SELECT id, tipo_id, num_id, nombre FROM tercero WHERE (nombre LIKE ? OR num_id LIKE ?)';
        if ($soloConductor) {
            $sql .= ' AND es_conductor = 1';
        }
        $sql .= ' ORDER BY nombre LIMIT ' . (int) $limite;
        $stmt = db()->prepare($sql);
        $stmt->execute([$like, $like]);
        $filas = $stmt->fetchAll();
        foreach ($filas as &$f) {
            $f['label'] = $f['nombre'] . ' (' . $f['tipo_id'] . ' ' . $f['num_id'] . ')';
        }
        return $filas;
    }

    /**
     * Actualiza un tercero existente.
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
        $fila['es_conductor'] = !empty($datos['es_conductor']) ? 1 : 0;
        // Al cambiar los datos hay que volver a enviarlos al RNDC.
        $fila['estado_rndc'] = 'borrador';
        $fila['rndc_error']  = null;

        $sets = implode(', ', array_map(static fn ($c) => "$c = :$c", array_keys($fila)));
        $fila['id'] = $id;
        db()->prepare("UPDATE tercero SET $sets WHERE id = :id")->execute($fila);
    }

    /** @return list<array<string,mixed>> */
    public function listar(int $limite = 200): array
    {
        return db()->query(
            'SELECT id, tipo_id, num_id, nombre, municipio_nombre, es_conductor, estado_rndc, rndc_ingreso_id
             FROM tercero ORDER BY id DESC LIMIT ' . (int) $limite
        )->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public function obtener(int $id): ?array
    {
        $stmt = db()->prepare('SELECT * FROM tercero WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Registra el tercero en el RNDC (proceso 11) y actualiza su estado.
     */
    public function registrarEnRndc(int $id): RndcRespuesta
    {
        $t = $this->obtener($id);
        if ($t === null) {
            return RndcRespuesta::fallo('Tercero no encontrado.', 0, '');
        }

        $rndc = RndcClient::desdeConfig();
        $vars = [
            'NUMNITEMPRESATRANSPORTE'  => config()['rndc']['empresa'],
            'CODTIPOIDTERCERO'         => $t['tipo_id'],
            'NUMIDTERCERO'             => $t['num_id'],
            'NOMIDTERCERO'             => $t['nombre'],
            'PRIMERAPELLIDOIDTERCERO'  => $t['primer_apellido'],
            'SEGUNDOAPELLIDOIDTERCERO' => $t['segundo_apellido'],
            'REGIMENSIMPLE'            => $t['regimen_simple'],
            'NOMENCLATURADIRECCION'    => $t['direccion'],
            'CODMUNICIPIORNDC'         => $t['cod_municipio'],
            'CODSEDETERCERO'           => $t['sede'],
            'NOMSEDETERCERO'           => $t['nombre_sede'],
            'NUMTELEFONOCONTACTO'      => $t['telefono'],
            'NUMCELULARPERSONA'        => $t['celular'],
            'LATITUD'                  => $t['latitud'],
            'LONGITUD'                 => $t['longitud'],
        ];


        $resp = $rndc->ingresar(11, $vars);

        $upd = db()->prepare(
            'UPDATE tercero SET estado_rndc = ?, rndc_ingreso_id = ?, rndc_error = ? WHERE id = ?'
        );
        $upd->execute([
            $resp->ok ? 'registrado' : 'error',
            $resp->ingresoId,
            $resp->ok ? null : $resp->error,
            $id,
        ]);

        return $resp;
    }

    /** Convierte una fecha YYYY-MM-DD al formato del RNDC DD/MM/YYYY. */
    private static function fechaRndc(?string $fecha): ?string
    {
        if (empty($fecha)) {
            return null;
        }
        $ts = strtotime($fecha);
        return $ts ? date('d/m/Y', $ts) : $fecha;
    }
}
