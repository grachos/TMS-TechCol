<?php
/**
 * Light TMS - Cola de envíos store-and-forward (Fase 4).
 *
 * Al confirmar el despacho de una solicitud se ENCOLAN sus documentos en el
 * orden que exige el RNDC:
 *
 *     tercero (11)  →  vehículo (12)  →  remesa (3)  →  manifiesto (4)
 *
 * El worker de cron (cron/retry_worker.php) DRENA la cola: envía cada fila
 * pendiente cuyas dependencias (filas de menor `orden` de la misma solicitud)
 * ya estén 'enviado'. Reintenta con backoff hasta `max_intentos`.
 *
 * Interruptor de seguridad: si config()['cola']['envio_habilitado'] es false,
 * el worker ARMA y guarda el XML pero NO lo envía (modo previsualización).
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../Rndc/RndcClient.php';
require_once __DIR__ . '/../Maestro/EmpresaRepo.php';
require_once __DIR__ . '/../Maestro/TerceroRepo.php';
require_once __DIR__ . '/../Maestro/VehiculoRepo.php';

final class ColaRepo
{
    /** Orden de envío por tipo de documento. */
    private const ORDEN = ['tercero' => 10, 'vehiculo' => 20, 'remesa' => 30, 'manifiesto' => 40, 'cumplido_remesa' => 50, 'cumplido_manifiesto' => 60];
    /** Proceso RNDC por tipo de documento. */
    private const PROCESO = ['tercero' => 11, 'vehiculo' => 12, 'remesa' => 3, 'manifiesto' => 4, 'cumplido_remesa' => 5, 'cumplido_manifiesto' => 6];

    /**
     * Encola los documentos de una solicitud ya despachada.
     *
     * @param int[] $remesaIds
     */
    public function encolar(PDO $pdo, int $solicitudId, ?int $manifiestoId = null, array $remesaIds = []): void
    {
        $s = $this->fila($pdo, 'SELECT * FROM solicitud_servicio WHERE id = ?', [$solicitudId]);
        if ($s === null) {
            throw new RuntimeException('Solicitud no encontrada para encolar.');
        }
        if ($manifiestoId === null || empty($remesaIds)) {
            throw new RuntimeException('Se requieren manifiestoId y remesaIds para encolar.');
        }
        $manif = $this->fila($pdo, 'SELECT * FROM manifiesto WHERE id = ?', [$manifiestoId]);
        if ($manif === null) {
            throw new RuntimeException('Manifiesto no encontrado.');
        }

        // 1) Terceros referenciados que existen en el maestro y no están registrados.
        $vistos = [];
        foreach ([
            ['remitente_tipo_id', 'remitente_num_id'],
            ['destinatario_tipo_id', 'destinatario_num_id'],
            ['conductor_tipo_id', 'conductor_num_id'],
            ['generador_tipo_id', 'generador_num_id'],
        ] as [$ct, $cn]) {
            $tipo = $s[$ct] ?? null;
            $num  = $s[$cn] ?? null;
            if (!$tipo || !$num) {
                continue;
            }
            $clave = $tipo . '|' . $num;
            if (isset($vistos[$clave])) {
                continue;
            }
            $vistos[$clave] = true;
            $t = $this->fila($pdo, 'SELECT id, estado_rndc FROM tercero WHERE tipo_id = ? AND num_id = ?', [$tipo, $num]);
            if ($t !== null && ($t['estado_rndc'] ?? '') !== 'registrado') {
                $this->insertarCola($pdo, $solicitudId, $manifiestoId, 'tercero', (int) $t['id'], 'Tercero ' . $tipo . ' ' . $num);
            }
        }

        // 2) Vehículo del maestro (si no está registrado).
        if (!empty($manif['placa_vehiculo'])) {
            $v = $this->fila($pdo, 'SELECT id, estado_rndc FROM vehiculo WHERE placa = ?', [strtoupper((string) $manif['placa_vehiculo'])]);
            if ($v !== null && ($v['estado_rndc'] ?? '') !== 'registrado') {
                $this->insertarCola($pdo, $solicitudId, $manifiestoId, 'vehiculo', (int) $v['id'], 'Vehículo ' . $manif['placa_vehiculo']);
            }
        }

        // 3) Remesas (una fila de cola por cada remesa).
        foreach ($remesaIds as $rid) {
            $rem = $this->fila($pdo, 'SELECT * FROM remesa WHERE id = ?', [$rid]);
            if ($rem === null) {
                continue;
            }
            $this->insertarCola($pdo, $solicitudId, $manifiestoId, 'remesa', (int) $rid, $this->payloadRemesa($rem, $pdo));
        }

        // 4) Manifiesto (payload XML con todas las remesas del bloque).
        $this->insertarCola($pdo, $solicitudId, $manifiestoId, 'manifiesto', $manifiestoId, $this->payloadManifiesto($manif, $pdo));
    }

    /**
     * Encola los documentos de cumplido (procesoid 5 y 6) para un manifiesto ya aceptado.
     *
     * @param int[] $remesaIds
     */
    public function encolarCumplido(PDO $pdo, int $solicitudId, int $manifiestoId, array $remesaIds): void
    {
        // 1) Cumplido de cada remesa (procesoid 5).
        foreach ($remesaIds as $rid) {
            $rem = $this->fila($pdo, 'SELECT * FROM remesa WHERE id = ?', [$rid]);
            if ($rem === null) {
                continue;
            }
            $this->insertarCola($pdo, $solicitudId, $manifiestoId, 'cumplido_remesa', (int) $rid, $this->payloadCumplidoRemesa($rem));
        }

        // 2) Cumplido del manifiesto (procesoid 6).
        $manif = $this->fila($pdo, 'SELECT * FROM manifiesto WHERE id = ?', [$manifiestoId]);
        if ($manif !== null) {
            $this->insertarCola($pdo, $solicitudId, $manifiestoId, 'cumplido_manifiesto', $manifiestoId, $this->payloadCumplidoManifiesto($manif));
        }
    }

    /** Inserta una fila en la cola (usa manifiesto_id en lugar de remesa_id). */
    private function insertarCola(PDO $pdo, int $solicitudId, int $manifiestoId, string $tipo, int $referenciaId, string $payloadXml): void
    {
        $pdo->prepare(
            'INSERT INTO cola_envios
                (solicitud_id, manifiesto_id, tipo_documento, referencia_id, proceso_rndc, orden, payload_xml, estado, max_intentos)
             VALUES (?, ?, ?, ?, ?, ?, ?, \'pendiente\', ?)'
        )->execute([
            $solicitudId, $manifiestoId, $tipo, $referenciaId, self::PROCESO[$tipo], self::ORDEN[$tipo],
            $payloadXml, (int) config()['cola']['max_intentos'],
        ]);
    }

    /**
     * Drena la cola: envía las filas pendientes en orden, respetando dependencias.
     *
     * @return array{enviados:int,errores:int,esperando:int,previstos:int}
     */
    public function drenar(): array
    {
        $habilitado = (bool) config()['cola']['envio_habilitado'];
        $minutos    = (int) config()['cola']['minutos_reintento'];
        $rndc       = RndcClient::desdeConfig();

        $pendientes = db()->query(
            "SELECT * FROM cola_envios
             WHERE estado = 'pendiente'
               AND (programado_para IS NULL OR programado_para <= NOW())
             ORDER BY solicitud_id, orden, id"
        )->fetchAll();

        $res = ['enviados' => 0, 'errores' => 0, 'esperando' => 0, 'previstos' => 0];

        foreach ($pendientes as $row) {
            $id = (int) $row['id'];

            // Modo seguro: previsualiza el XML de TODAS las filas (sin enviar ni
            // bloquear por dependencias, que solo importan en el envío real).
            if (!$habilitado) {
                $preview = in_array($row['tipo_documento'], ['remesa', 'manifiesto'], true)
                    ? $rndc->previewXmlInterno((int) $row['proceso_rndc'], (string) $row['payload_xml'])
                    : '(envío del maestro ' . $row['tipo_documento'] . ' #' . $row['referencia_id'] . ')';
                db()->prepare(
                    'UPDATE cola_envios SET respuesta_rndc = ?, ultimo_error = ? WHERE id = ?'
                )->execute([$preview, 'Modo seguro: envío deshabilitado (COLA_ENVIO_HABILITADO=false).', $id]);
                $res['previstos']++;
                continue;
            }

            // Dependencias: no enviar si una fila previa de la misma solicitud no se ha enviado.
            if ($this->dependenciaPendiente((int) $row['solicitud_id'], (int) $row['orden'])) {
                $res['esperando']++;
                continue;
            }

            db()->prepare("UPDATE cola_envios SET estado = 'enviando' WHERE id = ?")->execute([$id]);
            $resp = $this->enviarFila($rndc, $row);

            if ($resp->ok) {
                db()->prepare(
                    "UPDATE cola_envios
                     SET estado = 'enviado', rndc_ingreso_id = ?, respuesta_rndc = ?, ultimo_error = NULL,
                         intentos = intentos + 1, enviado_at = NOW()
                     WHERE id = ?"
                )->execute([$resp->ingresoId, $resp->respuestaCruda, $id]);
                $this->marcarOrigen($row, $resp);
                $res['enviados']++;
            } else {
                $intentos = (int) $row['intentos'] + 1;
                $agotado  = $intentos >= (int) $row['max_intentos'];
                db()->prepare(
                    'UPDATE cola_envios SET estado = ?, intentos = ?, ultimo_error = ?, respuesta_rndc = ?,
                            programado_para = ' . ($agotado ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)') . '
                     WHERE id = ?'
                )->execute($agotado
                    ? ['error', $intentos, $resp->error, $resp->respuestaCruda, $id]
                    : ['pendiente', $intentos, $resp->error, $resp->respuestaCruda, $minutos, $id]);
                $res['errores']++;
            }
        }

        return $res;
    }

    /**
     * Procesa un solo item de la cola por su id.
     * @return array{ok:bool,mensaje:string}
     */
    public function procesarItem(int $colaId): array
    {
        $habilitado = (bool) config()['cola']['envio_habilitado'];
        $minutos    = (int) config()['cola']['minutos_reintento'];
        $rndc       = RndcClient::desdeConfig();

        $stmt = db()->prepare('SELECT * FROM cola_envios WHERE id = ?');
        $stmt->execute([$colaId]);
        $row = $stmt->fetch();
        if (!$row) {
            return ['ok' => false, 'mensaje' => "Item #{$colaId} no encontrado."];
        }
        if (!in_array($row['estado'], ['pendiente', 'error'], true)) {
            return ['ok' => false, 'mensaje' => "Estado {$row['estado']} no permite procesar."];
        }

        $id = (int) $row['id'];
        if (!$habilitado) {
            $preview = in_array($row['tipo_documento'], ['remesa', 'manifiesto'], true)
                ? $rndc->previewXmlInterno((int) $row['proceso_rndc'], (string) $row['payload_xml'])
                : '(envío del maestro ' . $row['tipo_documento'] . ' #' . $row['referencia_id'] . ')';
            db()->prepare('UPDATE cola_envios SET respuesta_rndc = ?, ultimo_error = ? WHERE id = ?')
                ->execute([$preview, 'Modo seguro: envío deshabilitado.', $id]);
            return ['ok' => true, 'mensaje' => 'Previsualizado (modo seguro).'];
        }

        if ($this->dependenciaPendiente((int) $row['solicitud_id'], (int) $row['orden'])) {
            return ['ok' => false, 'mensaje' => 'Hay dependencias pendientes para esta solicitud.'];
        }

        db()->prepare("UPDATE cola_envios SET estado = 'enviando' WHERE id = ?")->execute([$id]);
        $resp = $this->enviarFila($rndc, $row);

        if ($resp->ok) {
            db()->prepare(
                "UPDATE cola_envios SET estado = 'enviado', rndc_ingreso_id = ?,
                        respuesta_rndc = ?, ultimo_error = NULL,
                        intentos = intentos + 1, enviado_at = NOW()
                 WHERE id = ?"
            )->execute([$resp->ingresoId, $resp->respuestaCruda, $id]);
            $this->marcarOrigen($row, $resp);
            return ['ok' => true, 'mensaje' => 'Enviado correctamente.'];
        }

        $intentos = (int) $row['intentos'] + 1;
        $agotado  = $intentos >= (int) $row['max_intentos'];
        db()->prepare(
            'UPDATE cola_envios SET estado = ?, intentos = ?, ultimo_error = ?,
                    respuesta_rndc = ?,
                    programado_para = ' . ($agotado ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)') . '
             WHERE id = ?'
        )->execute($agotado
            ? ['error', $intentos, $resp->error, $resp->respuestaCruda, $id]
            : ['pendiente', $intentos, $resp->error, $resp->respuestaCruda, $minutos, $id]);
        return ['ok' => false, 'mensaje' => $resp->error];
    }

    /**
     * Procesa los items de cola de un único despacho (remesas + manifiesto + ter/veh).
     * @return array{ok:bool,mensaje:string}
     */
    public function procesarDespacho(int $manifiestoId): array
    {
        $habilitado = (bool) config()['cola']['envio_habilitado'];
        $minutos    = (int) config()['cola']['minutos_reintento'];
        $rndc       = RndcClient::desdeConfig();
        $enviados = 0; $errores = 0;

        $items = db()->prepare(
            "SELECT * FROM cola_envios
             WHERE manifiesto_id = ? AND estado IN ('pendiente','error')
             ORDER BY orden, id"
        );
        $items->execute([$manifiestoId]);
        foreach ($items as $row) {
            $id = (int) $row['id'];
            if (!$habilitado) {
                $preview = in_array($row['tipo_documento'], ['remesa', 'manifiesto'], true)
                    ? $rndc->previewXmlInterno((int) $row['proceso_rndc'], (string) $row['payload_xml'])
                    : '(envío del maestro ' . $row['tipo_documento'] . ' #' . $row['referencia_id'] . ')';
                db()->prepare('UPDATE cola_envios SET respuesta_rndc = ?, ultimo_error = ? WHERE id = ?')
                    ->execute([$preview, 'Modo seguro: envío deshabilitado.', $id]);
                $errores++;
                continue;
            }
            if ($this->dependenciaPendiente((int) $row['solicitud_id'], (int) $row['orden'])) {
                continue;
            }
            db()->prepare("UPDATE cola_envios SET estado = 'enviando' WHERE id = ?")->execute([$id]);
            $resp = $this->enviarFila($rndc, $row);
            if ($resp->ok) {
                db()->prepare(
                    "UPDATE cola_envios SET estado = 'enviado', rndc_ingreso_id = ?,
                            respuesta_rndc = ?, ultimo_error = NULL,
                            intentos = intentos + 1, enviado_at = NOW()
                     WHERE id = ?"
                )->execute([$resp->ingresoId, $resp->respuestaCruda, $id]);
                $this->marcarOrigen($row, $resp);
                $enviados++;
            } else {
                $intentos = (int) $row['intentos'] + 1;
                $agotado  = $intentos >= (int) $row['max_intentos'];
                db()->prepare(
                    'UPDATE cola_envios SET estado = ?, intentos = ?, ultimo_error = ?,
                            respuesta_rndc = ?,
                            programado_para = ' . ($agotado ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)') . '
                     WHERE id = ?'
                )->execute($agotado
                    ? ['error', $intentos, $resp->error, $resp->respuestaCruda, $id]
                    : ['pendiente', $intentos, $resp->error, $resp->respuestaCruda, $minutos, $id]);
                $errores++;
            }
        }
        return ['ok' => $errores === 0, 'mensaje' => "Enviados: $enviados, errores: $errores."];
    }

    /** Envía una fila según su tipo (maestros vía sus repos; documentos vía XML). */
    private function enviarFila(RndcClient $rndc, array $row): RndcRespuesta
    {
        return match ($row['tipo_documento']) {
            'tercero'  => (new TerceroRepo())->registrarEnRndc((int) $row['referencia_id']),
            'vehiculo' => (new VehiculoRepo())->registrarEnRndc((int) $row['referencia_id']),
            default    => $rndc->ingresarXml((int) $row['proceso_rndc'], (string) $row['payload_xml']),
        };
    }

    /** Propaga el resultado al documento de origen y cierra el despacho. */
    private function marcarOrigen(array $row, RndcRespuesta $resp): void
    {
        if ($row['tipo_documento'] === 'remesa' || $row['tipo_documento'] === 'manifiesto') {
            db()->prepare(
                "UPDATE `{$row['tipo_documento']}` SET estado_rndc = 'aceptado', rndc_ingreso_id = ? WHERE id = ?"
            )->execute([$resp->ingresoId, (int) $row['referencia_id']]);
        }
        if ($row['tipo_documento'] === 'manifiesto') {
            db()->prepare("UPDATE solicitud_servicio SET estado = 'despachada' WHERE id = ?")
                ->execute([(int) $row['solicitud_id']]);
            $this->consultarSeguridadQr((int) $row['referencia_id']);
        }
        if ($row['tipo_documento'] === 'cumplido_remesa') {
            db()->prepare(
                "UPDATE remesa SET cumplido_estado_rndc = 'aceptado', cumplido_rndc_ingreso_id = ? WHERE id = ?"
            )->execute([$resp->ingresoId, (int) $row['referencia_id']]);
        }
        if ($row['tipo_documento'] === 'cumplido_manifiesto') {
            db()->prepare(
                "UPDATE manifiesto SET cumplido_estado_rndc = 'aceptado', cumplido_rndc_ingreso_id = ? WHERE id = ?"
            )->execute([$resp->ingresoId, (int) $row['referencia_id']]);
        }
    }

    /** Consulta el código de seguridad QR del manifiesto ante el RNDC. */
    private function consultarSeguridadQr(int $manifiestoId): void
    {
        try {
            $manif = $this->fila(db(), 'SELECT num_manifiesto FROM manifiesto WHERE id = ?', [$manifiestoId]);
            if (!$manif || empty($manif['num_manifiesto'])) {
                return;
            }
            $rndc    = RndcClient::desdeConfig();
            $empresa = (string) (config()['rndc']['empresa'] ?? '');
            if ($empresa === '') {
                return;
            }
            $qrResp = $rndc->consultar(
                4,
                ['INGRESOID', 'FECHAING', 'OBSERVACIONES', 'SEGURIDADOR'],
                [
                    'NUMNITEMPRESATRANSPORTE' => "'" . $empresa . "'",
                    'NUMMANIFIESTOCARGA'      => "'" . $manif['num_manifiesto'] . "'",
                ],
            );
            if ($qrResp->ok && !empty($qrResp->datos[0]['seguridadqr'])) {
                db()->prepare('UPDATE manifiesto SET seguridadqr = ? WHERE id = ?')
                    ->execute([$qrResp->datos[0]['seguridadqr'], $manifiestoId]);
            }
        } catch (\Throwable $e) {
            error_log('Error al consultar seguridadqr: ' . $e->getMessage());
        }
    }

    /** ¿Hay una fila previa (menor orden) de la misma solicitud sin enviar? */
    private function dependenciaPendiente(int $solicitudId, int $orden): bool
    {
        $stmt = db()->prepare(
            "SELECT COUNT(*) FROM cola_envios
             WHERE solicitud_id = ? AND orden < ? AND estado <> 'enviado'"
        );
        $stmt->execute([$solicitudId, $orden]);
        return (int) $stmt->fetchColumn() > 0;
    }

    // ---------- Construcción de payloads (variables RNDC) ----------

    /** @param array<string,mixed> $r remesa */
    private function payloadRemesa(array $r, ?PDO $pdo = null): string
    {
        $sedeTercero = static function (string $tipo, string $num) use ($pdo): string {
            if ($pdo === null || $tipo === '' || $num === '') {
                return '0';
            }
            $f = $pdo->prepare('SELECT sede FROM tercero WHERE tipo_id = ? AND num_id = ?');
            $f->execute([$tipo, $num]);
            $row = $f->fetch();
            return $row !== false && ($row['sede'] ?? '') !== '' ? $row['sede'] : '0';
        };

        $vars = [
            'NUMNITEMPRESATRANSPORTE'  => config()['rndc']['empresa'],
            'consecutivoRemesa'        => str_pad((string)(int) preg_replace('/[^0-9]/', '', $r['num_remesa'] ?? '0'), 10, '0', STR_PAD_LEFT),
            'codOperacionTransporte'   => $r['operacion_transporte'],
            'codTipoEmpaque'           => $r['tipo_empaque'] ?: '0',
            'codNaturalezaCarga'       => $r['naturaleza_carga'],
            'descripcionCortaProducto' => $r['descripcion_producto'],
            'mercanciaRemesa'          => $r['mercancia_codigo'],
            'cantidadCargada'          => self::num($r['cantidad_cargada']),
            'unidadMedidaCapacidad'    => $r['unidad_medida'],
            'pesoContenedorVacio'      => '2100',
            'codTipoIdRemitente'       => $r['remitente_tipo_id'],
            'numIdRemitente'           => $r['remitente_num_id'],
            'codSedeRemitente'         => $sedeTercero($r['remitente_tipo_id'], $r['remitente_num_id']),
            'codTipoIdDestinatario'    => $r['destinatario_tipo_id'],
            'numIdDestinatario'        => $r['destinatario_num_id'],
            'codSedeDestinatario'      => $sedeTercero($r['destinatario_tipo_id'], $r['destinatario_num_id']),
            'codTipoIdPropietario'     => $r['propietario_tipo_id'],
            'numIdPropietario'         => $r['propietario_num_id'],
            'duenoPoliza'              => $r['dueno_poliza'] ?? 'N',
            'horasPactoCarga'          => $r['horas_pacto_cargue'] ?? '1',
            'minutospactocarga'        => $r['minutos_pacto_cargue'] ?? '0',
            'fechaCitaPactadaCargue'   => self::fecha($r['fecha_cita_cargue']),
            'horaCitaPactadaCargue'    => $r['hora_cita_cargue'],
            'horasPactoDescargue'      => $r['horas_pacto_descargue'],
            'minutosPactoDescargue'    => $r['minutos_pacto_descargue'] ?? '0',
            'fechaCitaPactadaDescargue' => self::fecha($r['fecha_cita_descargue']),
            'horaCitaPactadaDescargueRemesa' => $r['hora_cita_descargue'],
            'codSedePropietario'       => $sedeTercero($r['propietario_tipo_id'], $r['propietario_num_id']),
            'CODIGOUN'                 => $r['codigo_un'],
            'ESTADOMERCANCIA'          => $r['estado_producto'],
        ];
        return RndcClient::renderVariables($vars);
    }

    /**
     * @param array<string,mixed> $m manifiesto
     */
    private function payloadManifiesto(array $m, PDO $pdo): string
    {
        // La placa del remolque se hereda del maestro de vehículos.
        $remolque = null;
        if (!empty($m['placa_vehiculo'])) {
            $v = $this->fila($pdo, 'SELECT remolque_placa FROM vehiculo WHERE placa = ?', [strtoupper((string) $m['placa_vehiculo'])]);
            $remolque = $v['remolque_placa'] ?? null;
        }

        // RETENCIONICAMANIFIESTOCARGA va como TARIFA por mil (no como monto).
        $tarifaIca = null;
        if (!empty($m['solicitud_id'])) {
            $s = $this->fila($pdo, 'SELECT porcentaje_ica FROM solicitud_servicio WHERE id = ?', [(int) $m['solicitud_id']]);
            $tarifaIca = $s['porcentaje_ica'] ?? null;
        }

        $vars = [
            'NUMNITEMPRESATRANSPORTE'      => config()['rndc']['empresa'],
            'NUMMANIFIESTOCARGA'          => $m['num_manifiesto'],
            'CODOPERACIONTRANSPORTE'      => $m['operacion_transporte'],
            'FECHAEXPEDICIONMANIFIESTO'   => self::fecha($m['fecha_expedicion']),
            'CODMUNICIPIOORIGENMANIFIESTO'  => $m['municipio_origen'],
            'CODMUNICIPIODESTINOMANIFIESTO' => $m['municipio_destino'],
            'CODIDTITULARMANIFIESTO'      => $m['titular_tipo_id'],
            'NUMIDTITULARMANIFIESTO'      => $m['titular_num_id'],
            'NUMPLACA'                    => $m['placa_vehiculo'],
            'NUMPLACAREMOLQUE'            => $remolque,
            'CODIDCONDUCTOR'              => $m['conductor_tipo_id'],
            'NUMIDCONDUCTOR'              => $m['conductor_num_id'],
            'VALORFLETEPACTADOVIAJE'      => self::num($m['valor_flete_pactado']),
            'RETENCIONICAMANIFIESTOCARGA' => self::num($tarifaIca),
            'RETENCIONFUENTEMANIFIESTO'   => self::num($m['retencion_fuente']),
            'VALORANTICIPOMANIFIESTO'     => self::num($m['valor_anticipo']),
            'CODMUNICIPIOPAGOSALDO'       => $m['municipio_pago_saldo'],
            'FECHAPAGOSALDOMANIFIESTO'    => self::fecha($m['fecha_pago_saldo']),
            'CODRESPONSABLEPAGOCARGUE'    => $m['responsable_pago_cargue'],
            'CODRESPONSABLEPAGODESCARGUE' => $m['responsable_pago_descargue'],
            'TIPOVALORPACTADO'            => $m['tipo_valor_pactado'],
            'MANNROPOLIZA'                => $m['nro_poliza'],
        ];
        // NITMONITOREOFLOTA: siempre se envía (incluso vacío), required display.
        $vars['NITMONITOREOFLOTA'] = $m['emf'] ?? '';

        // Remesas asociadas al manifiesto (bloque anidado) — iterar join table.
        $remesasStmt = $pdo->prepare(
            'SELECT r.num_remesa FROM remesa r
             JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
             WHERE mr.manifiesto_id = ?
             ORDER BY r.id'
        );
        $remesasStmt->execute([(int) $m['id']]);
        $remesasXml = '';
        foreach ($remesasStmt as $rem) {
            $remesasXml .= '<REMESA>'
                . '<CONSECUTIVOREMESA>' . RndcClient::escaparXml((string) $rem['num_remesa']) . '</CONSECUTIVOREMESA>'
                . '</REMESA>';
        }

        $xml = RndcClient::renderVariables($vars);
        $xml .= '<NITMONITOREOFLOTA>' . RndcClient::escaparXml($m['emf'] ?? '') . '</NITMONITOREOFLOTA>';
        return $xml . '<REMESASMAN procesoid="43">' . $remesasXml . '</REMESASMAN>';
    }

    /** @param array<string,mixed> $r remesa */
    private function payloadCumplidoRemesa(array $r): string
    {
        $vars = [
            'NUMNITEMPRESATRANSPORTE'  => config()['rndc']['empresa'],
            'NUMMANIFIESTOCARGA'       => $r['num_manifiesto'] ?? '',
            'CONSECUTIVOREMESA'        => RndcClient::escaparXml((string) ($r['num_remesa'] ?? '')),
            'TIPOCUMPLIDOREMESA'       => $r['cumplido_tipo'] ?? 'C',
            'NOMUNIDADMEDIDACAPACIDAD' => $r['unidad_medida'] ?? '1',
            'CANTIDADCARGADA'          => self::num($r['peso']),
            'CANTIDADENTREGADA'        => self::num($r['cantidad_entregada'] ?? $r['peso']),
        ];
        $xml = RndcClient::renderVariables($vars);
        if (!empty($r['fecha_llegada_descargue'])) {
            $xml .= '<FECHALLEGADADESCARGUE>' . self::fecha($r['fecha_llegada_descargue']) . '</FECHALLEGADADESCARGUE>';
            $xml .= '<HORALLEGADADESCARGUECUMPLIDO>' . RndcClient::escaparXml($r['hora_llegada_descargue'] ?? '') . '</HORALLEGADADESCARGUECUMPLIDO>';
        }
        if (!empty($r['fecha_entrada_descargue'])) {
            $xml .= '<FECHAENTRADADESCARGUE>' . self::fecha($r['fecha_entrada_descargue']) . '</FECHAENTRADADESCARGUE>';
            $xml .= '<HORAENTRADADESCARGUECUMPLIDO>' . RndcClient::escaparXml($r['hora_entrada_descargue'] ?? '') . '</HORAENTRADADESCARGUECUMPLIDO>';
        }
        if (!empty($r['fecha_salida_descargue'])) {
            $xml .= '<FECHASALIDADESCARGUE>' . self::fecha($r['fecha_salida_descargue']) . '</FECHASALIDADESCARGUE>';
            $xml .= '<HORASALIDADESCARGUECUMPLIDO>' . RndcClient::escaparXml($r['hora_salida_descargue'] ?? '') . '</HORASALIDADESCARGUECUMPLIDO>';
        }
        // Conditional: fechas de cargue solo si no se capturaron en creación.
        if (!empty($r['fecha_llegada_cargue'])) {
            $xml .= '<FECHALLEGADACARGUE>' . self::fecha($r['fecha_llegada_cargue']) . '</FECHALLEGADACARGUE>';
            $xml .= '<HORALLEGADACARGUEREMESA>' . RndcClient::escaparXml($r['hora_llegada_cargue'] ?? '') . '</HORALLEGADACARGUEREMESA>';
        }
        return $xml;
    }

    /** @param array<string,mixed> $m manifiesto */
    private function payloadCumplidoManifiesto(array $m): string
    {
        $vars = [
            'NUMNITEMPRESATRANSPORTE'  => config()['rndc']['empresa'],
            'NUMMANIFIESTOCARGA'       => $m['num_manifiesto'],
            'NOMTIPOCUMPLIDOMANIFIESTO' => $m['cumplido_tipo'] ?? 'C',
            'FECHAENTREGADOCUMENTOS'   => self::fecha($m['fecha_entrega_documentos']),
        ];
        $xml = RndcClient::renderVariables($vars);
        $xml .= '<VALORADICIONALFLETE>' . self::num($m['valor_adicional_flete'] ?? 0) . '</VALORADICIONALFLETE>';
        $xml .= '<VALORDESCUENTOFLETE>' . self::num($m['valor_descuento_flete'] ?? 0) . '</VALORDESCUENTOFLETE>';
        $xml .= '<OBSERVACIONES>' . RndcClient::escaparXml($m['observaciones_cumplido'] ?? '') . '</OBSERVACIONES>';
        return $xml;
    }

    /** Normaliza un número: quita decimales superfluos (3000000.00 → 3000000). */
    private static function num($valor): ?string
    {
        if ($valor === null || $valor === '') {
            return null;
        }
        if (!is_numeric($valor)) {
            return (string) $valor;
        }
        $s = (string) (float) $valor;
        return $s;
    }

    /** Convierte YYYY-MM-DD (o datetime) al formato del RNDC DD/MM/YYYY. */
    private static function fecha(?string $fecha): ?string
    {
        if (empty($fecha)) {
            return null;
        }
        $ts = strtotime($fecha);
        return $ts ? date('d/m/Y', $ts) : $fecha;
    }

    /**
     * @param list<scalar> $params
     * @return array<string,mixed>|null
     */
    private function fila(PDO $pdo, string $sql, array $params): ?array
    {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch() ?: null;
    }

    // ---------- Lectura para el monitor ----------

    /** @return list<array<string,mixed>> */
    public function listar(int $limite = 200): array
    {
        return db()->query(
            'SELECT c.*, s.consecutivo
             FROM cola_envios c
             LEFT JOIN solicitud_servicio s ON s.id = c.solicitud_id
             ORDER BY c.id DESC LIMIT ' . (int) $limite
        )->fetchAll();
    }

    /**
     * Lista despachos (agrupados por manifiesto) con estado de cada remesa.
     * @return list<array{remesa_id:int, solicitud_id:int, consecutivo:string, placa:string,
     *                     estado_remesa:string, num_remesa:string, num_manifiesto:string,
     *                     manifiesto_id:int}>
     */
    public function listarDespachos(): array
    {
        return db()->query(
            "SELECT r.id AS remesa_id, r.solicitud_id, s.consecutivo,
                    r.num_remesa, m.num_manifiesto, m.id AS manifiesto_id,
                    r.created_at,
                    r.estado_rndc AS estado_remesa
             FROM remesa r
             JOIN solicitud_servicio s ON s.id = r.solicitud_id
             LEFT JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
             LEFT JOIN manifiesto m ON m.id = mr.manifiesto_id
             ORDER BY r.id DESC"
        )->fetchAll();
    }

    /** @return array{items:list<array<string,mixed>>,total:int} */
    public function listarDespachosConPaginacion(string $q = '', int $pagina = 1, int $porPagina = 10, ?string $desde = null, ?string $hasta = null): array
    {
        $from = 'FROM remesa r
                 JOIN solicitud_servicio s ON s.id = r.solicitud_id
                 LEFT JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
                 LEFT JOIN manifiesto m ON m.id = mr.manifiesto_id';
        $where = 'WHERE 1=1';
        $params = [];
        if ($q !== '') {
            $like = '%' . $q . '%';
            $where .= ' AND (r.num_remesa LIKE ? OR m.num_manifiesto LIKE ?)';
            $params = [$like, $like];
        }
        if ($desde !== null) {
            $where .= ' AND r.created_at >= ?';
            $params[] = $desde;
        }
        if ($hasta !== null) {
            $where .= ' AND r.created_at <= ?';
            $params[] = $hasta . ' 23:59:59';
        }
        $countStmt = db()->prepare("SELECT COUNT(*) $from $where");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $offset = max(0, ($pagina - 1) * $porPagina);
        $cols = 'r.id AS remesa_id, r.solicitud_id, s.consecutivo,
                 r.num_remesa, m.num_manifiesto, m.id AS manifiesto_id,
                 r.created_at,
                 r.estado_rndc AS estado_remesa';
        $stmt = db()->prepare("SELECT $cols $from $where ORDER BY r.id DESC LIMIT ? OFFSET ?");
        $stmt->execute(array_merge($params, [$porPagina, $offset]));
        return ['items' => $stmt->fetchAll(), 'total' => $total];
    }

    /**
     * Lista despachos cuyo manifiesto fue aceptado por RNDC pero el cumplido
     * aún está pendiente.
     * @return list<array{manifiesto_id:int, solicitud_id:int, consecutivo:string,
     *                     num_manifiesto:string, remesas:int, placa:string}>
     */
    public function listarPendientesCumplido(): array
    {
        return db()->query(
            "SELECT m.id AS manifiesto_id, m.solicitud_id, s.consecutivo,
                    m.num_manifiesto, m.placa_vehiculo AS placa,
                    (SELECT COUNT(*) FROM manifiesto_remesa mr WHERE mr.manifiesto_id = m.id) AS remesas,
                    COUNT(r2.id) AS remesas_cumplidas
             FROM manifiesto m
             JOIN solicitud_servicio s ON s.id = m.solicitud_id
             JOIN manifiesto_remesa mr2 ON mr2.manifiesto_id = m.id
             JOIN remesa r2 ON r2.id = mr2.remesa_id
             WHERE m.estado_rndc = 'aceptado'
               AND m.cumplido_estado_rndc = 'pendiente'
             GROUP BY m.id, m.solicitud_id, s.consecutivo, m.num_manifiesto, m.placa_vehiculo
             ORDER BY m.id DESC"
        )->fetchAll();
    }

    /** Obtiene las remesas de un manifiesto con sus datos de cumplido. */
    public function obtenerRemesasCumplido(int $manifiestoId): array
    {
        return db()->query(
            "SELECT r.* FROM remesa r
             JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
             WHERE mr.manifiesto_id = $manifiestoId
             ORDER BY r.id"
        )->fetchAll();
    }

    /**
     * Procesa los items de cola PENDIENTES de una solicitud (tercero, vehículo,
     * remesas y manifiesto).
     * @return array{enviados:int,errores:int}
     */
    public function procesarSolicitud(int $solicitudId): array
    {
        $habilitado = (bool) config()['cola']['envio_habilitado'];
        $minutos    = (int) config()['cola']['minutos_reintento'];
        $rndc       = RndcClient::desdeConfig();

        $items = db()->query(
            "SELECT * FROM cola_envios
             WHERE solicitud_id = $solicitudId AND estado = 'pendiente'
             ORDER BY orden, id"
        )->fetchAll();

        $res = ['enviados' => 0, 'errores' => 0];
        foreach ($items as $row) {
            $id = (int) $row['id'];
            if (!$habilitado) {
                $res['errores']++;
                continue;
            }
            if ($this->dependenciaPendiente($solicitudId, (int) $row['orden'])) {
                continue;
            }
            db()->prepare("UPDATE cola_envios SET estado = 'enviando' WHERE id = ?")->execute([$id]);
            $resp = $this->enviarFila($rndc, $row);
            if ($resp->ok) {
                db()->prepare(
                    "UPDATE cola_envios SET estado = 'enviado', rndc_ingreso_id = ?,
                            respuesta_rndc = ?, ultimo_error = NULL,
                            intentos = intentos + 1, enviado_at = NOW()
                     WHERE id = ?"
                )->execute([$resp->ingresoId, $resp->respuestaCruda, $id]);
                $this->marcarOrigen($row, $resp);
                $res['enviados']++;
            } else {
                $intentos = (int) $row['intentos'] + 1;
                $agotado  = $intentos >= (int) $row['max_intentos'];
                db()->prepare(
                    'UPDATE cola_envios SET estado = ?, intentos = ?, ultimo_error = ?,
                            respuesta_rndc = ?,
                            programado_para = ' . ($agotado ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)') . '
                     WHERE id = ?'
                )->execute($agotado
                    ? ['error', $intentos, $resp->error, $resp->respuestaCruda, $id]
                    : ['pendiente', $intentos, $resp->error, $resp->respuestaCruda, $minutos, $id]);
                $res['errores']++;
            }
        }
        return $res;
    }

    /** @return array<string,int> conteo por estado */
    public function resumen(): array
    {
        $filas = db()->query('SELECT estado, COUNT(*) n FROM cola_envios GROUP BY estado')->fetchAll();
        $out = [];
        foreach ($filas as $f) {
            $out[$f['estado']] = (int) $f['n'];
        }
        return $out;
    }
}
