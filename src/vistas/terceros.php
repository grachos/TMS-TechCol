<?php
/**
 * Vista: listado de Terceros.
 * @var list<array<string,mixed>> $terceros
 */
declare(strict_types=1);
?>
<div class="cabecera-lista">
    <h1>Terceros</h1>
    <a href="<?= e(ruta('tercero.nuevo')) ?>" class="btn btn--primario">+ Nuevo tercero</a>
</div>

<?php flash(); ?>

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
<?php endif; ?>
