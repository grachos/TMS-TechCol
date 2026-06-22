<?php
/**
 * Vista: Lista de despachos (remesas) con estado y botón procesar.
 * @var list<array{remesa_id:int, solicitud_id:int, consecutivo:string, placa:string,
 *                  estado_remesa:string, num_remesa:string}> $despachos
 */
declare(strict_types=1);
$estadosRndc = ['pendiente' => 'Pendiente', 'enviado' => 'Enviado', 'aceptado' => 'Aceptado', 'rechazado' => 'Rechazado'];
?>
<h1>Despachos</h1>
<?php flash(); ?>

<?php if (empty($despachos)): ?>
    <div class="tarjeta vacio">No hay despachos. Confirma el despacho de una solicitud para generar remesas.</div>
<?php else: ?>
    <table class="tabla">
        <thead>
            <tr>
                <th>Remesa</th>
                <th>Solicitud</th>
                <th>Placa</th>
                <th>Estado remesa</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($despachos as $d): ?>
                <tr>
                    <td><?= e($d['num_remesa'] ?: ('#' . $d['remesa_id'])) ?></td>
                    <td><?= e($d['consecutivo'] ?: ('#' . $d['solicitud_id'])) ?></td>
                    <td><?= e($d['placa'] ?? '—') ?></td>
                    <td><span class="chip chip--<?= e($d['estado_remesa']) ?>"><?= e($estadosRndc[$d['estado_remesa']] ?? $d['estado_remesa']) ?></span></td>
                    <td>
                        <a href="<?= e(ruta('despacho.procesar', ['id' => $d['solicitud_id']])) ?>" class="btn btn--small btn--primario">Procesar ahora</a>
                        <a href="<?= e(ruta('solicitud.ver', ['id' => $d['solicitud_id']])) ?>" class="btn btn--small">Ver</a>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>
