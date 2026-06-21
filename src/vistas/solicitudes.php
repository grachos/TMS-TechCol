<?php
/**
 * Vista: listado de Solicitudes de Servicio.
 * @var array<int,array<string,mixed>> $solicitudes
 */
declare(strict_types=1);

$desde = $_GET['desde'] ?? '';
$hasta = $_GET['hasta'] ?? '';
?>
<div class="cabecera-lista">
    <h1>Solicitudes de Servicio</h1>
    <a href="<?= e(ruta('solicitud.nueva')) ?>" class="btn btn--primario">+ Nueva solicitud</a>
</div>

<?php flash(); ?>

<form method="get" class="filtros">
    <input type="hidden" name="r" value="solicitudes">
    <label>Desde <input type="date" name="desde" value="<?= e($desde) ?>"></label>
    <label>Hasta <input type="date" name="hasta" value="<?= e($hasta) ?>"></label>
    <button type="submit" class="btn">Filtrar</button>
    <?php if ($desde || $hasta): ?>
        <a href="<?= e(ruta('solicitudes')) ?>" class="btn">Limpiar</a>
    <?php endif; ?>
</form>

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
                <th>Origen</th>
                <th>Destino</th>
                <th>Generador de carga</th>
                <th>Flete</th>
                <th>Despachos</th>
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
                    <td><?= e($s['origen_nombre'] ? ($s['municipio_origen'] . ' - ' . $s['origen_nombre']) : ($s['municipio_origen'] ?? '—')) ?></td>
                    <td><?= e($s['destino_nombre'] ? ($s['municipio_destino'] . ' - ' . $s['destino_nombre']) : ($s['municipio_destino'] ?? '—')) ?></td>
                    <td><?php
                        $g = $s['generador_tipo_id'] ?? null;
                        $gn = $s['generador_num_id'] ?? null;
                        echo e($g && $gn ? $g . ' ' . $gn . ($s['generador_nombre'] ? ' - ' . $s['generador_nombre'] : '') : '—');
                    ?></td>
                    <td><?= $s['valor_flete'] !== null ? e('$ ' . number_format((float) $s['valor_flete'], 2)) : '—' ?></td>
                    <td><?php
                        $rest = (int) ($s['cantidad_vehiculos'] ?? 0);
                        $orig = (int) ($s['cantidad_vehiculos_original'] ?? $rest);
                        $done = max(0, $orig - $rest);
                        echo e($done . '/' . $orig);
                    ?></td>
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
