<?php
/**
 * Vista: listado de Vehículos.
 * @var list<array<string,mixed>> $vehiculos
 * @var int $total
 * @var int $pagina
 * @var int $paginas
 */
declare(strict_types=1);
$q = (string) ($_GET['q'] ?? '');
?>
<div class="cabecera-lista">
    <h1>Vehículos <small><?= number_format($total) ?> registros</small></h1>
    <a href="<?= e(ruta('vehiculo.nuevo')) ?>" class="btn btn--primario">+ Nuevo vehículo</a>
</div>

<?php flash(); ?>

<form method="get" class="barra-busqueda">
    <input type="hidden" name="r" value="vehiculos">
    <input type="text" name="q" value="<?= e($q) ?>" placeholder="Buscar por placa…" autofocus>
    <button type="submit" class="btn">Buscar</button>
    <a href="<?= e(ruta('vehiculos')) ?>" class="btn">Limpiar</a>
</form>

<?php if (empty($vehiculos)): ?>
    <div class="tarjeta vacio">
        Aún no hay vehículos. <a href="<?= e(ruta('vehiculo.nuevo')) ?>">Crea el primero</a>.
    </div>
<?php else: ?>
    <table class="tabla">
        <thead>
            <tr><th>#</th><th>Placa</th><th>Configuración</th><th>Remolque</th><th>Tenedor</th><th>RNDC</th><th></th></tr>
        </thead>
        <tbody>
            <?php foreach ($vehiculos as $v): ?>
                <tr>
                    <td><?= (int) $v['id'] ?></td>
                    <td><strong><?= e($v['placa']) ?></strong></td>
                    <td><?= e($v['cod_configuracion'] ?? '—') ?></td>
                    <td><?= e($v['remolque_placa'] ?? '—') ?></td>
                    <td><?= e($v['tenedor_num_id'] ?? '—') ?></td>
                    <td><span class="chip chip--<?= e($v['estado_rndc']) ?>"><?= e($v['estado_rndc']) ?></span></td>
                    <td>
                        <a href="<?= e(ruta('vehiculo.editar', ['id' => (int) $v['id']])) ?>">Editar</a>
                        <?php if ($v['estado_rndc'] !== 'registrado'): ?>
                            &middot; <a href="<?= e(ruta('vehiculo.registrar', ['id' => (int) $v['id']])) ?>"><?= !empty($v['rndc_ingreso_id']) ? 'Actualizar en RNDC' : 'Registrar en RNDC' ?></a>
                        <?php else: ?>
                            &middot; <span class="ayuda">RNDC id <?= e($v['rndc_ingreso_id'] ?? '') ?></span>
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
            <a href="<?= e(ruta('vehiculos', ['q' => $q, 'p' => $inicio - 1])) ?>" class="btn btn--small">&laquo;</a>
        <?php endif; ?>
        <?php for ($i = $inicio; $i <= $fin; $i++): ?>
            <a href="<?= e(ruta('vehiculos', ['q' => $q, 'p' => $i])) ?>" class="btn btn--small<?= $i === $pagina ? ' btn--activo' : '' ?>"><?= $i ?></a>
        <?php endfor; ?>
        <?php if ($fin < $paginas): ?>
            <a href="<?= e(ruta('vehiculos', ['q' => $q, 'p' => $fin + 1])) ?>" class="btn btn--small">&raquo;</a>
        <?php endif; ?>
    </nav>
    <?php endif; ?>
<?php endif; ?>
