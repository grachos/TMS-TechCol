<?php
/**
 * Vista: listado de Solicitudes de Servicio.
 * @var array<int,array<string,mixed>> $solicitudes
 */
declare(strict_types=1);
?>
<div class="cabecera-lista">
    <h1>Solicitudes de Servicio</h1>
    <a href="<?= e(ruta('solicitud.nueva')) ?>" class="btn btn--primario">+ Nueva solicitud</a>
</div>

<?php flash(); ?>

<?php if (empty($solicitudes)): ?>
    <div class="tarjeta vacio">
        Aún no hay solicitudes. <a href="<?= e(ruta('solicitud.nueva')) ?>">Crea la primera</a>.
    </div>
<?php else: ?>
    <table class="tabla">
        <thead>
            <tr>
                <th>#</th>
                <th>Consecutivo</th>
                <th>Fecha</th>
                <th>Origen → Destino</th>
                <th>Estado</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($solicitudes as $s): ?>
                <tr>
                    <td><?= (int) $s['id'] ?></td>
                    <td><?= e($s['consecutivo'] ?? '—') ?></td>
                    <td><?= e($s['fecha_solicitud'] ?? '') ?></td>
                    <td><?= e($s['municipio_origen'] ?? '—') ?> → <?= e($s['municipio_destino'] ?? '—') ?></td>
                    <td><span class="chip chip--<?= e($s['estado']) ?>"><?= e($s['estado']) ?></span></td>
                    <td>
                        <a href="<?= e(ruta('solicitud.ver', ['id' => (int) $s['id']])) ?>">Ver</a>
                        <?php if (($s['estado'] ?? '') !== 'despachada'): ?>
                            &middot; <a href="<?= e(ruta('solicitud.editar', ['id' => (int) $s['id']])) ?>">Editar</a>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>
