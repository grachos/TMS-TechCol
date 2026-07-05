<?php
/**
 * Vista: listado de Solicitudes de Servicio.
 * @var array<int,array<string,mixed>> $solicitudes
 * @var int $total
 * @var int $pagina
 * @var int $paginas
 */
declare(strict_types=1);

$q = (string) ($_GET['q'] ?? '');
$desde = $_GET['desde'] ?? '';
$hasta = $_GET['hasta'] ?? '';
?>
<div class="cabecera-lista">
    <h1>Solicitudes de Servicio <small><?= number_format($total) ?> registros</small></h1>
    <a href="<?= e(ruta('solicitud.nueva')) ?>" class="btn btn--primario">+ Nueva solicitud</a>
</div>

<?php flash(); ?>

<form method="get" class="filtros">
    <input type="hidden" name="r" value="solicitudes">
    <label>Buscar <input type="text" name="q" value="<?= e($q) ?>" placeholder="Consecutivo…"></label>
    <label>Desde <input type="date" name="desde" value="<?= e($desde) ?>"></label>
    <label>Hasta <input type="date" name="hasta" value="<?= e($hasta) ?>"></label>
    <button type="submit" class="btn">Filtrar</button>
    <?php if ($q || $desde || $hasta): ?>
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
    <?php if ($paginas > 1): ?>
    <?php $bloque = (int) ceil($pagina / 10);
    $inicio = ($bloque - 1) * 10 + 1;
    $fin = min($bloque * 10, $paginas); ?>
    <nav class="paginacion">
        <?php if ($bloque > 1): ?>
            <a href="<?= e(ruta('solicitudes', ['q' => $q, 'desde' => $desde, 'hasta' => $hasta, 'p' => $inicio - 1])) ?>" class="btn btn--small">&laquo;</a>
        <?php endif; ?>
        <?php for ($i = $inicio; $i <= $fin; $i++): ?>
            <a href="<?= e(ruta('solicitudes', ['q' => $q, 'desde' => $desde, 'hasta' => $hasta, 'p' => $i])) ?>" class="btn btn--small<?= $i === $pagina ? ' btn--activo' : '' ?>"><?= $i ?></a>
        <?php endfor; ?>
        <?php if ($fin < $paginas): ?>
            <a href="<?= e(ruta('solicitudes', ['q' => $q, 'desde' => $desde, 'hasta' => $hasta, 'p' => $fin + 1])) ?>" class="btn btn--small">&raquo;</a>
        <?php endif; ?>
    </nav>
    <?php endif; ?>
<?php endif; ?>
