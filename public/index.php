<?php
/**
 * Light TMS - Front controller.
 * Enruta las páginas mediante ?r=<ruta>.
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/db.php';
require_once __DIR__ . '/../src/vista.php';
require_once __DIR__ . '/../src/Solicitud/SolicitudRepo.php';
require_once __DIR__ . '/../src/Maestro/MunicipioRepo.php';
require_once __DIR__ . '/../src/Maestro/TerceroRepo.php';
require_once __DIR__ . '/../src/Maestro/VehiculoRepo.php';
require_once __DIR__ . '/../src/Maestro/CatalogoRepo.php';
require_once __DIR__ . '/../src/Maestro/EmpresaRepo.php';
require_once __DIR__ . '/../src/Despacho/ColaRepo.php';
require_once __DIR__ . '/../src/Rndc/RndcClient.php';

$r = $_GET['r'] ?? 'inicio';

try {
    switch ($r) {

        case 'municipios.buscar':
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode((new MunicipioRepo())->buscar((string) ($_GET['q'] ?? '')), JSON_UNESCAPED_UNICODE);
            break;

        case 'terceros.buscar':
            header('Content-Type: application/json; charset=utf-8');
            $solo = !empty($_GET['solo_conductor']);
            echo json_encode((new TerceroRepo())->buscar((string) ($_GET['q'] ?? ''), $solo), JSON_UNESCAPED_UNICODE);
            break;

        case 'vehiculos.buscar':
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode((new VehiculoRepo())->buscar((string) ($_GET['q'] ?? '')), JSON_UNESCAPED_UNICODE);
            break;

        case 'vehiculo.detalle':
            header('Content-Type: application/json; charset=utf-8');
            $det = (new VehiculoRepo())->detalle((string) ($_GET['placa'] ?? ''));
            echo json_encode($det ?? new stdClass(), JSON_UNESCAPED_UNICODE);
            break;

        case 'productos.buscar':
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode((new CatalogoRepo())->buscarProductos((string) ($_GET['q'] ?? '')), JSON_UNESCAPED_UNICODE);
            break;

        case 'productos':
            $cat = new CatalogoRepo();
            $pagina = max(1, (int) ($_GET['p'] ?? 1));
            $res = $cat->listarProductos((string) ($_GET['q'] ?? ''), $pagina, 10);
            $lista = $res['items'];
            $total = $res['total'];
            $paginas = (int) ceil($total / 10);
            layout_top('Productos', 'productos');
            require __DIR__ . '/../src/vistas/productos.php';
            layout_bottom();
            break;

        case 'producto.editar':
            $codigo = (string) ($_GET['codigo'] ?? '');
            $prod = (new CatalogoRepo())->productoPorCodigo($codigo);
            if ($prod === null) {
                header('Location: ' . ruta('productos', ['err' => 'Producto no encontrado.']));
                break;
            }
            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                (new CatalogoRepo())->actualizarProducto($codigo, $_POST);
                header('Location: ' . ruta('productos', ['ok' => 'Producto actualizado.']));
                break;
            }
            layout_top('Editar producto', 'productos');
            require __DIR__ . '/../src/vistas/producto_form.php';
            layout_bottom();
            break;

        case 'terceros':
            $pagina = max(1, (int) ($_GET['p'] ?? 1));
            $res = (new TerceroRepo())->listarConPaginacion((string) ($_GET['q'] ?? ''), $pagina, 10);
            $terceros = $res['items'];
            $total = $res['total'];
            $paginas = (int) ceil($total / 10);
            layout_top('Terceros', 'terceros');
            require __DIR__ . '/../src/vistas/terceros.php';
            layout_bottom();
            break;

        case 'tercero.nuevo':
            layout_top('Nuevo tercero', 'terceros');
            require __DIR__ . '/../src/vistas/tercero_form.php';
            layout_bottom();
            break;

        case 'tercero.crear':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                header('Location: ' . ruta('tercero.nuevo'));
                break;
            }
            if (empty($_POST['cod_municipio'])) {
                header('Location: ' . ruta('tercero.nuevo', ['err' => 'Elige el municipio de la lista.']));
                break;
            }
            try {
                (new TerceroRepo())->crear($_POST);
                header('Location: ' . ruta('terceros', ['ok' => 'Tercero guardado.']));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo guardar el tercero.';
                header('Location: ' . ruta('tercero.nuevo', ['err' => $msg]));
            }
            break;

        case 'tercero.editar':
            $tercero = (new TerceroRepo())->obtener((int) ($_GET['id'] ?? 0));
            if ($tercero === null) {
                header('Location: ' . ruta('terceros', ['err' => 'Tercero no encontrado.']));
                break;
            }
            $accion = ruta('tercero.actualizar', ['id' => (int) $tercero['id']]);
            layout_top('Editar tercero', 'terceros');
            require __DIR__ . '/../src/vistas/tercero_form.php';
            layout_bottom();
            break;

        case 'tercero.actualizar':
            $id = (int) ($_GET['id'] ?? 0);
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                header('Location: ' . ruta('tercero.editar', ['id' => $id]));
                break;
            }
            if (empty($_POST['cod_municipio'])) {
                header('Location: ' . ruta('tercero.editar', ['id' => $id, 'err' => 'Elige el municipio de la lista.']));
                break;
            }
            try {
                (new TerceroRepo())->actualizar($id, $_POST);
                header('Location: ' . ruta('terceros', ['ok' => 'Tercero actualizado.']));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo actualizar.';
                header('Location: ' . ruta('tercero.editar', ['id' => $id, 'err' => $msg]));
            }
            break;

        case 'tercero.registrar':
            $id = (int) ($_GET['id'] ?? 0);
            $resp = (new TerceroRepo())->registrarEnRndc($id);
            if ($resp->ok) {
                header('Location: ' . ruta('terceros', ['ok' => 'Tercero registrado en RNDC (id ' . $resp->ingresoId . ').']));
            } else {
                header('Location: ' . ruta('terceros', ['err' => 'RNDC: ' . $resp->error]));
            }
            break;

        case 'vehiculos':
            $pagina = max(1, (int) ($_GET['p'] ?? 1));
            $res = (new VehiculoRepo())->listarConPaginacion((string) ($_GET['q'] ?? ''), $pagina, 10);
            $vehiculos = $res['items'];
            $total = $res['total'];
            $paginas = (int) ceil($total / 10);
            layout_top('Vehículos', 'vehiculos');
            require __DIR__ . '/../src/vistas/vehiculos.php';
            layout_bottom();
            break;

        case 'vehiculo.nuevo':
            layout_top('Nuevo vehículo', 'vehiculos');
            require __DIR__ . '/../src/vistas/vehiculo_form.php';
            layout_bottom();
            break;

        case 'vehiculo.crear':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                header('Location: ' . ruta('vehiculo.nuevo'));
                break;
            }
            if (empty($_POST['tenedor_num_id'])) {
                header('Location: ' . ruta('vehiculo.nuevo', ['err' => 'Elige el tenedor de la lista de terceros.']));
                break;
            }
            try {
                (new VehiculoRepo())->crear($_POST);
                header('Location: ' . ruta('vehiculos', ['ok' => 'Vehículo guardado.']));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo guardar el vehículo.';
                header('Location: ' . ruta('vehiculo.nuevo', ['err' => $msg]));
            }
            break;

        case 'vehiculo.editar':
            $vehiculo = (new VehiculoRepo())->obtener((int) ($_GET['id'] ?? 0));
            if ($vehiculo === null) {
                header('Location: ' . ruta('vehiculos', ['err' => 'Vehículo no encontrado.']));
                break;
            }
            $accion = ruta('vehiculo.actualizar', ['id' => (int) $vehiculo['id']]);
            layout_top('Editar vehículo', 'vehiculos');
            require __DIR__ . '/../src/vistas/vehiculo_form.php';
            layout_bottom();
            break;

        case 'vehiculo.actualizar':
            $id = (int) ($_GET['id'] ?? 0);
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                header('Location: ' . ruta('vehiculo.editar', ['id' => $id]));
                break;
            }
            if (empty($_POST['tenedor_num_id'])) {
                header('Location: ' . ruta('vehiculo.editar', ['id' => $id, 'err' => 'Elige el tenedor de la lista de terceros.']));
                break;
            }
            try {
                (new VehiculoRepo())->actualizar($id, $_POST);
                header('Location: ' . ruta('vehiculos', ['ok' => 'Vehículo actualizado.']));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo actualizar.';
                header('Location: ' . ruta('vehiculo.editar', ['id' => $id, 'err' => $msg]));
            }
            break;

        case 'vehiculo.registrar':
            $id = (int) ($_GET['id'] ?? 0);
            $resp = (new VehiculoRepo())->registrarEnRndc($id);
            if ($resp->ok) {
                header('Location: ' . ruta('vehiculos', ['ok' => 'Vehículo registrado en RNDC (id ' . $resp->ingresoId . ').']));
            } else {
                header('Location: ' . ruta('vehiculos', ['err' => 'RNDC: ' . $resp->error]));
            }
            break;
        case 'solicitudes':
            $repo = new SolicitudRepo();
            $pagina = max(1, (int) ($_GET['p'] ?? 1));
            $desde = !empty($_GET['desde']) ? $_GET['desde'] : null;
            $hasta = !empty($_GET['hasta']) ? $_GET['hasta'] : null;
            $res = $repo->listarConPaginacion((string) ($_GET['q'] ?? ''), $pagina, 10, $desde, $hasta);
            $solicitudes = $res['items'];
            $total = $res['total'];
            $paginas = (int) ceil($total / 10);
            layout_top('Solicitudes', 'solicitudes');
            require __DIR__ . '/../src/vistas/solicitudes.php';
            layout_bottom();
            break;

        case 'solicitud.nueva':
            layout_top('Nueva solicitud', 'solicitud.nueva');
            require __DIR__ . '/../src/vistas/solicitud_form.php';
            layout_bottom();
            break;

        case 'solicitud.crear':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                header('Location: ' . ruta('solicitud.nueva'));
                break;
            }
            $errPeligrosa = validarProductoPeligrosa($_POST['mercancia_codigo'] ?? '', $_POST['naturaleza_carga'] ?? '');
            if ($errPeligrosa !== null) {
                header('Location: ' . ruta('solicitud.nueva', ['err' => $errPeligrosa]));
                break;
            }
            $repo = new SolicitudRepo();
            try {
                $id = $repo->crear($_POST);
                header('Location: ' . ruta('solicitud.ver', [
                    'id' => $id,
                    'ok' => 'Solicitud creada.',
                ]));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo guardar la solicitud.';
                header('Location: ' . ruta('solicitud.nueva', ['err' => $msg]));
            }
            break;

        case 'solicitud.editar':
            $datos = (new SolicitudRepo())->obtener((int) ($_GET['id'] ?? 0));
            if ($datos === null) {
                header('Location: ' . ruta('solicitudes', ['err' => 'Solicitud no encontrada.']));
                break;
            }
            $solicitud = $datos['solicitud'];
            if ($solicitud['estado'] === 'despachada') {
                header('Location: ' . ruta('solicitud.ver', ['id' => (int) $solicitud['id'], 'err' => 'La solicitud ya fue despachada; no se puede editar.']));
                break;
            }
            $accion = ruta('solicitud.actualizar', ['id' => (int) $solicitud['id']]);
            layout_top('Editar solicitud', 'solicitudes');
            require __DIR__ . '/../src/vistas/solicitud_form.php';
            layout_bottom();
            break;

        case 'solicitud.actualizar':
            $id = (int) ($_GET['id'] ?? 0);
            $repo = new SolicitudRepo();
            $datos = $repo->obtener($id);
            if ($datos === null) {
                header('Location: ' . ruta('solicitudes', ['err' => 'Solicitud no encontrada.']));
                break;
            }
            if ($datos['solicitud']['estado'] !== 'borrador') {
                header('Location: ' . ruta('solicitud.ver', ['id' => $id, 'err' => 'La solicitud solo se puede editar en estado borrador.']));
                break;
            }
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                header('Location: ' . ruta('solicitud.editar', ['id' => $id]));
                break;
            }
            $errPeligrosa = validarProductoPeligrosa($_POST['mercancia_codigo'] ?? '', $_POST['naturaleza_carga'] ?? '');
            if ($errPeligrosa !== null) {
                header('Location: ' . ruta('solicitud.editar', ['id' => $id, 'err' => $errPeligrosa]));
                break;
            }
            try {
                $repo->actualizar($id, $_POST);
                header('Location: ' . ruta('solicitud.ver', ['id' => $id, 'ok' => 'Solicitud actualizada.']));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo actualizar la solicitud.';
                header('Location: ' . ruta('solicitud.editar', ['id' => $id, 'err' => $msg]));
            }
            break;

        case 'solicitud.ver':
            $id = (int) ($_GET['id'] ?? 0);
            $manifiestoId = isset($_GET['manifiesto_id']) ? (int) $_GET['manifiesto_id'] : null;
            $repo = new SolicitudRepo();
            $datos = $repo->obtener($id, $manifiestoId);
            if ($datos === null) {
                http_response_code(404);
                layout_top('No encontrada', 'solicitudes');
                echo '<div class="tarjeta vacio">Solicitud no encontrada.</div>';
                layout_bottom();
                break;
            }
            $solicitud  = $datos['solicitud'];
            $manifiesto = $datos['manifiesto'];
            $remesas    = $datos['remesas'];
            layout_top('Solicitud #' . $id, 'solicitudes');
            require __DIR__ . '/../src/vistas/solicitud_detalle.php';
            layout_bottom();
            break;

        case 'despacho.confirmar':
            $id = (int) ($_GET['id'] ?? 0);
            $repo = new SolicitudRepo();
            $dd = $repo->obtener($id);
            if ($dd === null) {
                header('Location: ' . ruta('solicitudes', ['err' => 'Solicitud no encontrada.']));
                break;
            }
            if ($dd['solicitud']['estado'] === 'despachada') {
                header('Location: ' . ruta('solicitud.ver', ['id' => $id, 'err' => 'La solicitud ya fue despachada.']));
                break;
            }
            if (($dd['solicitud']['cantidad_vehiculos'] ?? 1) < 1) {
                header('Location: ' . ruta('solicitud.ver', ['id' => $id, 'err' => 'Ya no quedan vehículos por despachar en esta solicitud.']));
                break;
            }
            $solicitud = $dd['solicitud'];
            $remesas   = $dd['remesas'];
            if (empty($solicitud['emf'])) {
                $empresa = (new EmpresaRepo())->obtener();
                $solicitud['emf'] = $empresa['emf'] ?? '';
            }
            layout_top('Confirmar despacho', 'solicitudes');
            require __DIR__ . '/../src/vistas/despacho_form.php';
            layout_bottom();
            break;

        case 'despacho.guardar':
            $id = (int) ($_GET['id'] ?? 0);
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                header('Location: ' . ruta('despacho.confirmar', ['id' => $id]));
                break;
            }
            if (empty($_POST['placa_vehiculo']) || empty($_POST['conductor_num_id'])) {
                header('Location: ' . ruta('despacho.confirmar', ['id' => $id, 'err' => 'Placa y conductor son obligatorios para despachar.']));
                break;
            }
            try {
                (new SolicitudRepo())->confirmarDespacho($id, $_POST);
                header('Location: ' . ruta('cola', ['ok' => 'Despacho confirmado. Documentos encolados para el RNDC.']));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo confirmar el despacho.';
                header('Location: ' . ruta('despacho.confirmar', ['id' => $id, 'err' => $msg]));
            }
            break;

        case 'cola':
            $cola = (new ColaRepo());
            $filas = $cola->listar();
            $resumen = $cola->resumen();
            $envioHabilitado = (bool) config()['cola']['envio_habilitado'];
            layout_top('Cola de envíos', 'cola');
            require __DIR__ . '/../src/vistas/cola.php';
            layout_bottom();
            break;

        case 'cola.procesar':
            try {
                $r2 = (new ColaRepo())->drenar();
                $modo = ((bool) config()['cola']['envio_habilitado']) ? 'envío real' : 'modo seguro';
                $msg = sprintf('Cola procesada (%s): enviados=%d, errores=%d, esperando=%d, previstos=%d.',
                    $modo, $r2['enviados'], $r2['errores'], $r2['esperando'], $r2['previstos']);
                header('Location: ' . ruta('cola', ['ok' => $msg]));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo procesar la cola.';
                header('Location: ' . ruta('cola', ['err' => $msg]));
            }
            break;

        case 'cola.procesar_item':
            $id = (int) ($_GET['id'] ?? 0);
            $r2 = (new ColaRepo())->procesarItem($id);
            header('Location: ' . ruta('cola', [$r2['ok'] ? 'ok' : 'err' => $r2['mensaje']]));
            break;

        case 'cola.xml':
            $fila = db()->prepare('SELECT * FROM cola_envios WHERE id = ?');
            $fila->execute([(int) ($_GET['id'] ?? 0)]);
            $f = $fila->fetch();
            header('Content-Type: text/plain; charset=utf-8');
            if ($f === false) {
                echo 'No encontrado.';
                break;
            }
            try {
                $rndc = RndcClient::desdeConfig();
                echo "=== PREVISUALIZACIÓN XML ===\n\n";
                echo $rndc->previewXmlInterno((int) $f['proceso_rndc'], (string) $f['payload_xml']);
            } catch (Throwable) {
                echo "(Fragmento <variables>):\n" . $f['payload_xml'];
            }
            if ($f['respuesta_rndc'] !== null && $f['respuesta_rndc'] !== '') {
                echo "\n\n=== RESPUESTA DEL RNDC ===\n\n";
                echo $f['respuesta_rndc'];
            }
            break;

        case 'cumplido':
            $pendientes = (new ColaRepo())->listarPendientesCumplido();
            layout_top('Cumplido de despachos', 'cumplido');
            require __DIR__ . '/../src/vistas/cumplido_lista.php';
            layout_bottom();
            break;

        case 'cumplido.form':
            $manifiestoId = (int) ($_GET['manifiesto_id'] ?? 0);
            if (!$manifiestoId) { http_response_code(400); echo 'Falta manifiesto_id'; break; }
            $repo = new ColaRepo();
            $mm = db()->prepare('SELECT * FROM manifiesto WHERE id = ?');
            $mm->execute([$manifiestoId]);
            $manifiesto = $mm->fetch();
            if (!$manifiesto) { http_response_code(404); echo 'Manifiesto no encontrado'; break; }
            $ss = db()->prepare('SELECT * FROM solicitud_servicio WHERE id = ?');
            $ss->execute([$manifiesto['solicitud_id']]);
            $solicitud = $ss->fetch() ?: [];
            $remesas = $repo->obtenerRemesasCumplido($manifiestoId);
            layout_top('Cumplido', 'cumplido');
            require __DIR__ . '/../src/vistas/cumplido_form.php';
            layout_bottom();
            break;

        case 'cumplido.guardar':
            $manifiestoId = (int) ($_GET['manifiesto_id'] ?? 0);
            if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !$manifiestoId) {
                header('Location: ' . ruta('cumplido'));
                break;
            }
            $pdo = db();
            $pdo->beginTransaction();
            try {
                // Guardar datos de cumplido en el manifiesto.
                $stmtM = $pdo->prepare(
                    "UPDATE manifiesto SET cumplido_tipo = ?, fecha_entrega_documentos = ?,
                     valor_adicional_flete = ?, valor_descuento_flete = ?,
                     observaciones_cumplido = ?, cumplido_estado_rndc = 'pendiente'
                     WHERE id = ?"
                );
                $stmtM->execute([
                    $_POST['cumplido_tipo'] ?? 'C',
                    !empty($_POST['fecha_entrega_documentos']) ? $_POST['fecha_entrega_documentos'] : null,
                    !empty($_POST['valor_adicional_flete']) ? (float) $_POST['valor_adicional_flete'] : 0,
                    !empty($_POST['valor_descuento_flete']) ? (float) $_POST['valor_descuento_flete'] : 0,
                    $_POST['observaciones_cumplido'] ?? '',
                    $manifiestoId,
                ]);

                // Guardar datos de cumplido en cada remesa.
                $remesaIds = [];
                $stmtR = $pdo->prepare(
                    "UPDATE remesa SET cumplido_tipo = ?, cantidad_entregada = ?,
                     fecha_llegada_descargue = ?, hora_llegada_descargue = ?,
                     fecha_entrada_descargue = ?, hora_entrada_descargue = ?,
                     fecha_salida_descargue = ?, hora_salida_descargue = ?,
                     fecha_llegada_cargue = ?, hora_llegada_cargue = ?,
                     cumplido_estado_rndc = 'pendiente'
                     WHERE id = ?"
                );
                $rdatos = $_POST['remesas'] ?? [];
                foreach ($rdatos as $rd) {
                    $rid = (int) ($rd['id'] ?? 0);
                    if (!$rid) { continue; }
                    $remesaIds[] = $rid;
                    $stmtR->execute([
                        $rd['cumplido_tipo'] ?? 'C',
                        !empty($rd['cantidad_entregada']) ? (float) $rd['cantidad_entregada'] : null,
                        !empty($rd['fecha_llegada_descargue']) ? $rd['fecha_llegada_descargue'] : null,
                        $rd['hora_llegada_descargue'] ?? null,
                        !empty($rd['fecha_entrada_descargue']) ? $rd['fecha_entrada_descargue'] : null,
                        $rd['hora_entrada_descargue'] ?? null,
                        !empty($rd['fecha_salida_descargue']) ? $rd['fecha_salida_descargue'] : null,
                        $rd['hora_salida_descargue'] ?? null,
                        !empty($rd['fecha_llegada_cargue']) ? $rd['fecha_llegada_cargue'] : null,
                        $rd['hora_llegada_cargue'] ?? null,
                        $rid,
                    ]);
                }

                // Encolar cumplidos.
                $manif = $pdo->prepare('SELECT solicitud_id FROM manifiesto WHERE id = ?');
                $manif->execute([$manifiestoId]);
                $sId = (int) ($manif->fetchColumn() ?: 0);
                if ($sId > 0 && !empty($remesaIds)) {
                    (new ColaRepo())->encolarCumplido($pdo, $sId, $manifiestoId, $remesaIds);
                }

                $pdo->commit();
                header('Location: ' . ruta('cumplido', ['ok' => 'Cumplido guardado y encolado para el RNDC.']));
            } catch (Throwable $e) {
                $pdo->rollBack();
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo guardar el cumplido.';
                header('Location: ' . ruta('cumplido.form', ['manifiesto_id' => $manifiestoId, 'err' => $msg]));
            }
            break;

        case 'despachos':
            $pagina = max(1, (int) ($_GET['p'] ?? 1));
            $desde = !empty($_GET['desde']) ? $_GET['desde'] : null;
            $hasta = !empty($_GET['hasta']) ? $_GET['hasta'] : null;
            $res = (new ColaRepo())->listarDespachosConPaginacion((string) ($_GET['q'] ?? ''), $pagina, 10, $desde, $hasta);
            $despachos = $res['items'];
            $total = $res['total'];
            $paginas = (int) ceil($total / 10);
            layout_top('Despachos', 'despachos');
            require __DIR__ . '/../src/vistas/despachos.php';
            layout_bottom();
            break;

        case 'despacho.procesar':
            $manifiestoId = (int) ($_GET['manifiesto_id'] ?? 0);
            try {
                $r2 = (new ColaRepo())->procesarDespacho($manifiestoId);
                $msg = $r2['ok'] ? 'ok' : 'err';
                header('Location: ' . ruta('despachos', [$msg => $r2['mensaje']]));
            } catch (Throwable $e) {
                $msg = config()['app']['debug'] ? $e->getMessage() : 'No se pudo procesar el despacho.';
                header('Location: ' . ruta('despachos', ['err' => $msg]));
            }
            break;

        case 'empresa':
            $empresa = (new EmpresaRepo())->obtener();
            layout_top('Empresa', 'empresa');
            require __DIR__ . '/../src/vistas/empresa_form.php';
            layout_bottom();
            break;

        case 'empresa.guardar':
            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                (new EmpresaRepo())->guardar($_POST);
            }
            header('Location: ' . ruta('empresa', ['ok' => 'Datos de la empresa guardados.']));
            break;

        case 'remesa.pdf':
            $manifiestoId = (int) ($_GET['manifiesto_id'] ?? 0);
            if (!$manifiestoId) { http_response_code(400); echo 'Falta manifiesto_id'; break; }

            $remesas = db()->prepare(
                'SELECT r.* FROM remesa r
                 JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
                 WHERE mr.manifiesto_id = ?
                 ORDER BY r.id'
            );
            $remesas->execute([$manifiestoId]);
            $remesas = $remesas->fetchAll();
            if (empty($remesas)) { http_response_code(404); echo 'No hay remesas asociadas'; break; }

            // Usar la primera remesa para datos compartidos.
            $remesa = $remesas[0];

            $s = db()->prepare('SELECT * FROM solicitud_servicio WHERE id = ?');
            $s->execute([$remesa['solicitud_id']]);
            $solicitud = $s->fetch() ?: [];

            $empresa = (new EmpresaRepo())->obtener();

            $muni = new MunicipioRepo();

            $nombresNat = ['1' => 'NORMAL', '2' => 'PELIGROSA', '3' => 'EXTRADIMENSIONADA',
                           '4' => 'EXTRAPESADA', '5' => 'DESECHO PELIGROSO', '6' => 'SEMOVIENTES', '7' => 'REFRIGERADA'];

            $terceroPorTipoNum = static function (string $tipo, string $num): ?array {
                $q = db()->prepare('SELECT * FROM tercero WHERE tipo_id = ? AND num_id = ?');
                $q->execute([$tipo, $num]);
                return $q->fetch() ?: null;
            };

            $nomTerc = static function (?array $t): string {
                if (!$t) { return '—'; }
                return trim(($t['nombre'] ?? '') . ' ' . ($t['primer_apellido'] ?? '') . ' ' . ($t['segundo_apellido'] ?? '')) ?: ($t['nombre_completo'] ?? '—');
            };

            $fmtMuni = static function (?string $cod) use ($muni): string {
                if (!$cod) { return '—'; }
                $nom = $muni->nombre($cod);
                return $nom ?: $cod;
            };

            $ops = ['G' => 'General', 'P' => 'Paqueteo', 'C' => 'Contenedor Cargado', 'V' => 'Contenedor Vacío'];
            $opNombre = $ops[$remesa['operacion_transporte'] ?? ''] ?? ($remesa['operacion_transporte'] ?? '—');

            $estadosProd = ['L' => 'Líquido', 'S' => 'Sólido/semi-sólido', 'G' => 'Gaseoso'];

            $empaquesList = (new CatalogoRepo())->empaques();
            $empaqueMap = [];
            foreach ($empaquesList as $emp) { $empaqueMap[$emp['codigo']] = $emp['codigo'] . ' - ' . $emp['descripcion']; }

            require __DIR__ . '/../src/vistas/remesa_pdf.php';
            break;

        case 'manifiesto.pdf':
            $manifiestoId = (int) ($_GET['manifiesto_id'] ?? 0);
            if (!$manifiestoId) { http_response_code(400); echo 'Falta manifiesto_id'; break; }

            $mm = db()->prepare('SELECT * FROM manifiesto WHERE id = ?');
            $mm->execute([$manifiestoId]);
            $manifiesto = $mm->fetch();
            if (!$manifiesto) { http_response_code(404); echo 'Manifiesto no encontrado'; break; }

            $remesas = db()->prepare(
                'SELECT r.* FROM remesa r
                 JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
                 WHERE mr.manifiesto_id = ?
                 ORDER BY r.id'
            );
            $remesas->execute([$manifiestoId]);
            $remesas = $remesas->fetchAll();
            $remesa = $remesas[0] ?? [];
            if (empty($remesas)) { http_response_code(404); echo 'No hay remesas asociadas'; break; }

            $ss = db()->prepare('SELECT * FROM solicitud_servicio WHERE id = ?');
            $ss->execute([$manifiesto['solicitud_id']]);
            $solicitud = $ss->fetch() ?: [];

            $vv = db()->prepare('SELECT * FROM vehiculo WHERE placa = ?');
            $vv->execute([$manifiesto['placa_vehiculo']]);
            $vehiculo = $vv->fetch() ?: [];

            $empresa = (new EmpresaRepo())->obtener();
            $muni = new MunicipioRepo();
            $cat = new CatalogoRepo();

            $nombresNat = ['1' => 'NORMAL', '2' => 'PELIGROSA', '3' => 'EXTRADIMENSIONADA',
                           '4' => 'EXTRAPESADA', '5' => 'DESECHO PELIGROSO', '6' => 'SEMOVIENTES', '7' => 'REFRIGERADA'];

            $ops = ['G' => 'GENERAL', 'P' => 'PAQUETEO', 'C' => 'CONTENEDOR CARGADO', 'V' => 'CONTENEDOR VACÍO'];
            $tipoManifiesto = $ops[$manifiesto['operacion_transporte'] ?? ''] ?? ($manifiesto['operacion_transporte'] ?? '—');

            $responsables = ['E' => 'EMPRESA DE TRANSPORTE', 'R' => 'REMITENTE', 'D' => 'DESTINATARIO'];

            $terceroPorTipoNum = static function (string $tipo, string $num): ?array {
                $q = db()->prepare('SELECT * FROM tercero WHERE tipo_id = ? AND num_id = ?');
                $q->execute([$tipo, $num]);
                return $q->fetch() ?: null;
            };

            $nomTerc = static function (?array $t): string {
                if (!$t) { return '—'; }
                return trim(($t['nombre'] ?? '') . ' ' . ($t['primer_apellido'] ?? '') . ' ' . ($t['segundo_apellido'] ?? '')) ?: ($t['nombre_completo'] ?? '—');
            };

            $fmtMuni = static function (?string $cod) use ($muni): string {
                if (!$cod) { return '—'; }
                $nom = $muni->nombre($cod);
                return $nom ?: $cod;
            };

            $titular = $terceroPorTipoNum($manifiesto['titular_tipo_id'] ?? '', $manifiesto['titular_num_id'] ?? '');
            $conductor = $terceroPorTipoNum($manifiesto['conductor_tipo_id'] ?? '', $manifiesto['conductor_num_id'] ?? '');
            $remitente = $terceroPorTipoNum($remesa['remitente_tipo_id'] ?? '', $remesa['remitente_num_id'] ?? '');
            $destinatario = $terceroPorTipoNum($remesa['destinatario_tipo_id'] ?? '', $remesa['destinatario_num_id'] ?? '');
            $generador = null;
            $genTipo = $remesa['propietario_tipo_id'] ?? $solicitud['generador_tipo_id'] ?? null;
            $genNum  = $remesa['propietario_num_id'] ?? $solicitud['generador_num_id'] ?? null;
            if ($genTipo && $genNum) {
                $generador = $terceroPorTipoNum($genTipo, $genNum);
            }

            $empaqueDesc = $cat->empaquePorCodigo($remesa['tipo_empaque'] ?? '') ?? ($remesa['tipo_empaque'] ?? '—');

            require __DIR__ . '/../src/vistas/manifiesto_pdf.php';
            break;

        case 'inicio':
        default:
            require __DIR__ . '/../src/vistas/inicio.php';
            break;
    }
} catch (Throwable $e) {
    http_response_code(500);
    layout_top('Error', '');
    echo '<div class="alerta alerta--err">Ocurrió un error.';
    if (config()['app']['debug']) {
        echo '<br><small>' . e($e->getMessage()) . '</small>';
    }
    echo '</div>';
    layout_bottom();
}
