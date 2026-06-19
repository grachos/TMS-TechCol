<?php
/**
 * Light TMS - Catálogos RNDC (empaque, carrocería, producto).
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';

final class CatalogoRepo
{
    /** @return list<array{codigo:string,descripcion:string}> */
    public function empaques(): array
    {
        return db()->query('SELECT codigo, descripcion FROM empaque ORDER BY descripcion')->fetchAll();
    }

    /** @return list<array{codigo:string,descripcion:string}> */
    public function carrocerias(): array
    {
        return db()->query('SELECT codigo, descripcion FROM carroceria ORDER BY descripcion')->fetchAll();
    }

    /** @return list<array{codigo:string,nombre:string,descripcion:string}> */
    public function configuraciones(): array
    {
        return db()->query(
            'SELECT codigo, nombre, descripcion FROM configuracion_vehiculo ORDER BY tipo, nombre'
        )->fetchAll();
    }

    /**
     * Busca productos por nombre o código (autocompletado).
     *
     * @return list<array{codigo:string,nombre:string,label:string}>
     */
    public function buscarProductos(string $q, int $limite = 15): array
    {
        $q = trim($q);
        if ($q === '') {
            return [];
        }
        $like = '%' . $q . '%';
        $stmt = db()->prepare(
            "SELECT codigo, nombre FROM producto
             WHERE nombre <> '' AND (nombre LIKE ? OR codigo LIKE ?)
             ORDER BY nombre LIMIT " . (int) $limite
        );
        $stmt->execute([$like, $like]);
        $filas = $stmt->fetchAll();
        foreach ($filas as &$f) {
            $f['label'] = $f['codigo'] . ' — ' . $f['nombre'];
        }
        return $filas;
    }
}
