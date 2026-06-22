<?php
/**
 * Vista: listado de Terceros.
 * @var list<array<string,mixed>> $terceros
 * @var int $total
 * @var int $pagina
 * @var int $paginas
 */
declare(strict_types=1);
$q = (string) ($_GET['q'] ?? '');
?>
<div class="cabecera-lista">
    <h1>Terceros <small><?= number_format($total) ?> registros</small></h1>
    <a href="<?= e(ruta('tercero.nuevo')) ?>" class="btn btn--primario">+ Nuevo tercero</a>
</div>

<?php flash(); ?>

<form method="get" class="barra-busqueda">
    <input type="hidden" name="r" value="terceros">
    <input type="text" name="q" value="<?= e($q) ?>" placeholder="Buscar tercero…" autofocus>
    <button type="submit" class="btn">Buscar</button>
    <a href="<?= e(ruta('terceros')) ?>" class="btn">Limpiar</a>
</form>

<?php if (empty($terceros)): ?>
    <div class="tarjeta vacio">
        Aún no hay terceros. <a href="<?= e(ruta('tercero.nuevo')) ?>">Crea el primero</a>.
    </div>
<?php else: ?>
    <table class="tabla">
        <thead>
            <tr>
                <th>#</th><th>Identificación</th><th>Nombre</th><th>Municipio</th>
                <th>Conductor</th><th>RNDC</th><th></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($terceros as $t): ?>
                <tr>
                    <td><?= (int) $t['id'] ?></td>
                    <td><?= e($t['tipo_id']) ?> <?= e($t['num_id']) ?></td>
                    <td><?= e($t['nombre']) ?></td>
                    <td><?= e($t['municipio_nombre'] ?? '—') ?></td>
                    <td><?= ((int) $t['es_conductor'] === 1) ? 'Sí' : '—' ?></td>
                    <td><span class="chip chip--<?= e($t['estado_rndc']) ?>"><?= e($t['estado_rndc']) ?></span></td>
                    <td>
                        <a href="<?= e(ruta('tercero.editar', ['id' => (int) $t['id']])) ?>">Editar</a>
                        <?php if ($t['estado_rndc'] !== 'registrado'): ?>
                            &middot; <a href="<?= e(ruta('tercero.registrar', ['id' => (int) $t['id']])) ?>"><?= !empty($t['rndc_ingreso_id']) ? 'Actualizar en RNDC' : 'Registrar en RNDC' ?></a>
                        <?php else: ?>
                            &middot; <span class="ayuda">RNDC id <?= e($t['rndc_ingreso_id'] ?? '') ?></span>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php if ($paginas > 1): ?>
    <?php $bloque = (int) ceil($pagina / 10);
    $inicio = ($bloque - 1) * 10 + 1;
    $fin = min($bloque * 10, $paginas); ?>
    <nav class="paginacion">
        <?php if ($bloque > 1): ?>
            <a href="<?= e(ruta('terceros', ['q' => $q, 'p' => $inicio - 1])) ?>" class="btn btn--small">&laquo;</a>
        <?php endif; ?>
        <?php for ($i = $inicio; $i <= $fin; $i++): ?>
            <a href="<?= e(ruta('terceros', ['q' => $q, 'p' => $i])) ?>" class="btn btn--small<?= $i === $pagina ? ' btn--activo' : '' ?>"><?= $i ?></a>
        <?php endfor; ?>
        <?php if ($fin < $paginas): ?>
            <a href="<?= e(ruta('terceros', ['q' => $q, 'p' => $fin + 1])) ?>" class="btn btn--small">&raquo;</a>
        <?php endif; ?>
    </nav>
    <?php endif; ?>
<?php endif; ?>
