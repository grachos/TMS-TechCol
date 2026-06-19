<?php
/**
 * Vista: listado de Vehículos.
 * @var list<array<string,mixed>> $vehiculos
 */
declare(strict_types=1);
?>
<div class="cabecera-lista">
    <h1>Vehículos</h1>
    <a href="<?= e(ruta('vehiculo.nuevo')) ?>" class="btn btn--primario">+ Nuevo vehículo</a>
</div>

<?php flash(); ?>

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
<?php endif; ?>
