<?php
/**
 * Light TMS - Catálogo de municipios (DIVIPOLA).
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';

final class MunicipioRepo
{
    /**
     * Busca municipios por nombre o código (para autocompletado).
     *
     * @return list<array{codigo_rndc:string,nombre_completo:string,nombre_mpio:string,label:string}>
     */
    public function buscar(string $q, int $limite = 15): array
    {
        $q = trim($q);
        if ($q === '') {
            return [];
        }
        $like = '%' . $q . '%';
        $stmt = db()->prepare(
            'SELECT codigo_rndc, nombre_completo, nombre_mpio, nombre, departamento
             FROM municipio
             WHERE nombre LIKE ? OR nombre_completo LIKE ? OR codigo_rndc LIKE ? OR nombre_mpio LIKE ?
             ORDER BY (nombre LIKE ?) DESC, nombre
             LIMIT ' . (int) $limite
        );
        $stmt->execute([$like, $like, $like, $like, $q . '%']);
        $filas = $stmt->fetchAll();
        foreach ($filas as &$f) {
            if ($f['nombre'] !== $f['nombre_mpio']) {
                $f['label'] = $f['nombre'] . ' – ' . $f['nombre_mpio'] . ', ' . $f['departamento'];
            } else {
                $f['label'] = $f['nombre_completo'];
            }
        }
        return $filas;
    }

    /** Nombre completo de un municipio por su código (o null). */
    public function nombre(string $codigo): ?string
    {
        $stmt = db()->prepare('SELECT nombre_completo FROM municipio WHERE codigo_rndc = ?');
        $stmt->execute([$codigo]);
        $v = $stmt->fetchColumn();
        return $v === false ? null : (string) $v;
    }
}
