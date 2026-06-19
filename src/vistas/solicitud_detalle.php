<?php
/**
 * Vista: detalle de una Solicitud con su Manifiesto y Remesa sembrados.
 * @var array<string,mixed>      $solicitud
 * @var array<string,mixed>|null $manifiesto
 * @var array<string,mixed>|null $remesa
 */
declare(strict_types=1);

/** Imprime una tabla clave/valor a partir de un arreglo de campos. */
if (!function_exists('fichaCampos')) {
    function fichaCampos(?array $fila, array $campos): void
    {
        if ($fila === null) {
            echo '<p class="ayuda">No generado.</p>';
            return;
        }
        echo '<dl class="ficha">';
        foreach ($campos as $col => $etq) {
            $val = $fila[$col] ?? null;
            echo '<dt>' . e($etq) . '</dt><dd>' . ($val === null || $val === '' ? '—' : e((string) $val)) . '</dd>';
        }
        echo '</dl>';
    }
}
?>
<div class="cabecera-lista">
    <h1>Solicitud #<?= (int) $solicitud['id'] ?>
        <span class="chip chip--<?= e($solicitud['estado']) ?>"><?= e($solicitud['estado']) ?></span>
    </h1>
    <a href="<?= e(ruta('solicitudes')) ?>" class="btn">← Volver</a>
</div>

<?php flash(); ?>

<section class="tarjeta">
    <h2>Datos de la solicitud</h2>
    <?php fichaCampos($solicitud, [
        'consecutivo'          => 'Consecutivo',
        'fecha_solicitud'      => 'Fecha',
        'operacion_transporte' => 'Operación',
        'municipio_origen'     => 'Municipio origen',
        'municipio_destino'    => 'Municipio destino',
        'empresa_num_id'       => 'NIT empresa',
        'placa_vehiculo'       => 'Placa',
        'conductor_num_id'     => 'Conductor',
        'remitente_num_id'     => 'Remitente',
        'destinatario_num_id'  => 'Destinatario',
        'descripcion_producto' => 'Producto',
        'cantidad_cargada'     => 'Cantidad',
        'valor_flete'          => 'Flete',
        'valor_anticipo'       => 'Anticipo',
        'observaciones'        => 'Observaciones',
    ]); ?>
</section>

<div class="dos-columnas">
    <section class="tarjeta">
        <h2>Remesa <span class="chip chip--rndc"><?= e($remesa['estado_rndc'] ?? '—') ?></span></h2>
        <?php fichaCampos($remesa, [
            'num_remesa'           => 'Consecutivo remesa',
            'naturaleza_carga'     => 'Naturaleza carga',
            'tipo_empaque'         => 'Tipo empaque',
            'mercancia_codigo'     => 'Cód. mercancía',
            'descripcion_producto' => 'Producto',
            'cantidad_cargada'     => 'Cantidad',
            'municipio_cargue'     => 'Mun. cargue',
            'municipio_descargue'  => 'Mun. descargue',
            'remitente_num_id'     => 'Remitente',
            'destinatario_num_id'  => 'Destinatario',
            'propietario_num_id'   => 'Propietario carga',
            'fecha_cita_cargue'    => 'Cita cargue',
            'rndc_ingreso_id'      => 'Ingreso RNDC',
        ]); ?>
    </section>

    <section class="tarjeta">
        <h2>Manifiesto <span class="chip chip--rndc"><?= e($manifiesto['estado_rndc'] ?? '—') ?></span></h2>
        <?php fichaCampos($manifiesto, [
            'num_manifiesto'        => 'Consecutivo manifiesto',
            'fecha_expedicion'      => 'Fecha expedición',
            'municipio_origen'      => 'Origen',
            'municipio_destino'     => 'Destino',
            'titular_num_id'        => 'Titular',
            'placa_vehiculo'        => 'Placa',
            'conductor_num_id'      => 'Conductor',
            'valor_flete_pactado'   => 'Flete pactado',
            'valor_anticipo'        => 'Anticipo',
            'retencion_ica'         => 'Retención ICA',
            'municipio_pago_saldo'  => 'Mun. pago saldo',
            'fecha_pago_saldo'      => 'Fecha pago saldo',
            'nro_poliza'            => 'Nro. póliza',
            'rndc_ingreso_id'       => 'Ingreso RNDC',
        ]); ?>
    </section>
</div>

<div class="acciones">
    <?php if (($solicitud['estado'] ?? '') === 'borrador'): ?>
        <a href="<?= e(ruta('despacho.confirmar', ['id' => (int) $solicitud['id']])) ?>" class="btn btn--primario">Confirmar despacho</a>
        <a href="<?= e(ruta('solicitud.editar', ['id' => (int) $solicitud['id']])) ?>" class="btn">Editar</a>
    <?php elseif (($solicitud['estado'] ?? '') === 'procesada'): ?>
        <span class="chip chip--procesada">En cola de envío</span>
        <a href="<?= e(ruta('cola')) ?>" class="btn btn--primario">Ver cola RNDC</a>
        <a href="<?= e(ruta('despacho.confirmar', ['id' => (int) $solicitud['id']])) ?>" class="btn">Reeditar despacho</a>
    <?php elseif (($solicitud['estado'] ?? '') === 'despachada'): ?>
        <span class="chip chip--despachada">Despachada al RNDC</span>
        <a href="<?= e(ruta('cola')) ?>" class="btn">Ver cola RNDC</a>
    <?php endif; ?>
</div>
