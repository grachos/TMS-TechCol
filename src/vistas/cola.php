<?php
/**
 * Vista: monitor de la cola de envíos al RNDC (store-and-forward).
 * Incluye tanto documentos de despacho como de cumplido.
 * @var list<array<string,mixed>> $filas
 * @var array<string,int>         $resumen
 * @var bool                      $envioHabilitado
 * @var string                    $proceso
 */
declare(strict_types=1);

$etiquetas = [
    'tercero'             => 'Tercero',
    'vehiculo'            => 'Vehículo',
    'remesa'              => 'Remesa',
    'manifiesto'          => 'Manifiesto',
    'cumplido_remesa'     => 'Cumplido remesa',
    'cumplido_manifiesto' => 'Cumplido manifiesto',
];

$categorias = [
    'tercero'             => 'Maestro',
    'vehiculo'            => 'Maestro',
    'remesa'              => 'Despacho',
    'manifiesto'          => 'Despacho',
    'cumplido_remesa'     => 'Cumplido',
    'cumplido_manifiesto' => 'Cumplido',
];

$coloresCategoria = ['Maestro' => 'azul', 'Despacho' => 'verde', 'Cumplido' => 'naranja'];

$opcionesProceso = [
    'todos'    => 'Despacho + Cumplido',
    'despacho' => 'Despacho',
    'cumplido' => 'Cumplido',
];
?>
<div class="cabecera-lista">
    <h1>Cola de envíos al RNDC</h1>
    <a href="<?= e(ruta('cola.procesar')) ?>" class="btn btn--primario">Procesar ahora</a>
</div>

<?php flash(); ?>

<?php if (!$envioHabilitado): ?>
    <div class="alerta alerta--ok">
        <strong>Modo seguro activo.</strong> El worker arma y previsualiza el XML pero
        <strong>no</strong> lo envía al RNDC. Para habilitar el envío real, define
        <code>COLA_ENVIO_HABILITADO=true</code> en el archivo <code>.env</code>.
    </div>
<?php else: ?>
    <div class="alerta alerta--err">
        <strong>Envío REAL habilitado.</strong> Procesar la cola escribirá documentos en el RNDC
        (ambiente: <?= e(config()['rndc']['ambiente']) ?>).
    </div>
<?php endif; ?>

<form method="get" class="filtro-bar">
    <input type="hidden" name="r" value="cola">
    <label class="filtro-bar__lbl">Proceso:</label>
    <select name="proceso" onchange="this.form.submit()" class="filtro-bar__select">
        <?php foreach ($opcionesProceso as $val => $lbl): ?>
            <option value="<?= e($val) ?>" <?= $proceso === $val ? 'selected' : '' ?>><?= e($lbl) ?></option>
        <?php endforeach; ?>
    </select>
    <noscript><button type="submit" class="btn btn--small">Filtrar</button></noscript>
</form>

<p class="ayuda">
    Resumen:
    <?php foreach (['pendiente', 'enviando', 'enviado', 'error'] as $est): ?>
        <span class="chip chip--<?= e($est) ?>"><?= e($est) ?>: <?= (int) ($resumen[$est] ?? 0) ?></span>
    <?php endforeach; ?>
</p>

<?php if (empty($filas)): ?>
    <div class="tarjeta vacio">No hay documentos pendientes en la cola. Confirma el despacho de una solicitud o registra el cumplido para encolar sus documentos.</div>
<?php else: ?>
    <div class="tabla-responsive">
        <table class="tabla">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Solicitud</th>
                    <th>Tipo</th>
                    <th>Documento</th>
                    <th>Proceso</th>
                    <th>Estado</th>
                    <th>Intentos</th>
                    <th>Ingreso RNDC</th>
                    <th>Último mensaje</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($filas as $f): ?>
                    <?php $tipo = $f['tipo_documento']; ?>
                    <?php $cat = $categorias[$tipo] ?? '—'; ?>
                    <?php $colorCat = $coloresCategoria[$cat] ?? 'gris'; ?>
                    <tr>
                        <td><?= (int) $f['id'] ?></td>
                        <td><?= e($f['consecutivo'] ?? ('#' . $f['solicitud_id'])) ?></td>
                        <td><span class="chip chip--<?= e($colorCat) ?>"><?= e($cat) ?></span></td>
                        <td><?= e($etiquetas[$tipo] ?? $tipo) ?></td>
                        <td><?= (int) $f['proceso_rndc'] ?></td>
                        <td><span class="chip chip--<?= e($f['estado']) ?>"><?= e($f['estado']) ?></span></td>
                        <td><?= (int) $f['intentos'] ?>/<?= (int) $f['max_intentos'] ?></td>
                        <td><?= e($f['rndc_ingreso_id'] ?? '—') ?></td>
                        <td><small><?= e(mb_strimwidth((string) ($f['ultimo_error'] ?? ''), 0, 80, '…')) ?></small></td>
                        <td><a href="<?= e(ruta('cola.xml', ['id' => (int) $f['id']])) ?>" target="_blank" class="btn btn--small">XML</a></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>
