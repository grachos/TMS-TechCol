# Integración con el RNDC

Documentación de la capa de integración con el web service del **RNDC**
(Registro Nacional de Despachos de Carga), Ministerio de Transporte de Colombia.

## Cómo funciona

El RNDC expone una operación **SOAP 1.1**: `AtenderMensajeRNDC`, que recibe un
parámetro string `<Request>` con un **XML interno escapado**:

```xml
<root>
  <acceso><username>..</username><password>..</password></acceso>
  <solicitud><tipo>1</tipo><procesoid>11</procesoid></solicitud>
  <variables>
    <NOMVARIABLE>valor</NOMVARIABLE>
    ...
  </variables>
</root>
```

- `tipo` = tipo de operación (ver tabla).
- `procesoid` = número de proceso (ver abajo).
- La respuesta trae `<ingresoid>` (éxito) o `<ErrorMSG>` / `<error>` (rechazo).

### Tipos de operación (`<solicitud><tipo>`)

| tipo | Operación | Constante en el cliente |
|---|---|---|
| 1 | Registrar información en procesos y maestros | `TIPO_INGRESAR` |
| 2 | Consultar registros de maestros | `TIPO_CONSULTAR_MAESTRO` |
| 3 | Consultar documentos/registros de un proceso | `TIPO_CONSULTAR_PROCESO` |
| 4 | Consulta para la Policía | — |

> Para consultar un manifiesto/remesa usa **tipo 3** con el `procesoid` del documento.

**Headers:** `Content-Type: text/xml; charset=ISO-8859-1` y
`SOAPAction: urn:BPMServicesIntf-IBPMServices#AtenderMensajeRNDC`.
Ruta del servicio: `/soap/IBPMServices`.

> **Encoding:** el RNDC *declara* ISO-8859-1 pero en la práctica **responde en UTF-8**.
> El cliente lo detecta y solo convierte si los bytes no son UTF-8 válido
> (evita la doble codificación de acentos).

## Servidores (balanceo de carga oficial)

Tabla oficial del Ministerio ("Balanceo de Carga a los Servidores del RNDC"),
2026-07-05:

| Servidor | Host:puerto (SOAP) | Procesos | Estado verificado |
|---|---|---|---|
| Pruebas | `rndc.mintransporte.gov.co:8080` | todos (ambiente prueba) | timeout (ver nota IP abajo) |
| Mantenimiento | `rndc2.mintransporte.gov.co:8080` | (fallback si A está en mantenimiento) | no probado |
| Otros | `rndcws.mintransporte.gov.co:8080` | 1,2,5,6,7,8,9,11,12,17,28,29,32,33,34,38,41,44,45,46,54,60,67,68,73,75,79,81,82,83,86,90,91,92,93,96,103,106,… | ✅ responde |
| Expedir | `rndcws2.mintransporte.gov.co:8080` | **3 (Remesa), 4 (Manifiesto)** | ✅ responde |
| Consultas | `plc.mintransporte.gov.co:8080` | 26, 27, 48, 55 | ✅ verificado (consulta real OK) |

> ⚠️ **`rndc.mintransporte.gov.co` (el host oficial de "Ambiente pruebas") no
> respondió (timeout) ni siquiera desde una IP que sí alcanza `rndcws`/`rndcws2`/
> `plc` sin problema** — a diferencia de esos tres, parece requerir autorización
> previa independientemente de la geografía. El viejo alias
> `rndcpruebas.mintransporte.gov.co:8080` sigue respondiendo (WSDL genérico) pero
> puede no ser el endpoint real de pruebas vigente.
>
> Las IP extranjeras están **bloqueadas** (salvo EE. UU.). Para acceder desde una IP
> extranjera hay que solicitarlo al Grupo de Logística del Ministerio. La IP del
> servidor Hostinger debe poder llegar a estos hosts — confirmarla con
> `GET /api/diagnostico/ip-saliente` (temporal, ver `backend/src/app.ts`).
>
> Además del ambiente programático hay **wstest** (sin programar):
> `https://rndc.mintransporte.gov.co/wstest/default.aspx` (y default2/default3 para
> apuntar a rndcws2 / plc). También existen endpoints REST (`:8081` HTTP,
> `inside.mintransporte.gov.co:443` HTTPS) que este cliente no usa (solo SOAP).

El cliente resuelve el endpoint automáticamente con `RNDC_AMBIENTE`
(`pruebas` | `produccion`) y enruta por `procesoid`. Se puede forzar con
`RNDC_HOST_OVERRIDE`.

## Procesos clave para Light TMS

| procesoid | Nombre | Campos | Uso |
|---|---|---|---|
| 11 | Tercero | 20 | Registrar remitente/destinatario/propietario/conductor |
| 12 | Vehículo | 30 | Registrar el vehículo |
| **3** | **Remesa Terrestre de Carga** | 60 | Documento de la carga |
| **4** | **Manifiesto de Carga** | 46 | Documento del viaje |

Orden de envío: **Terceros → Vehículo → Remesa → Manifiesto**.

El diccionario completo de variables oficiales está en:
- `docs/diccionario_rndc.csv` (fuente, UTF-8)
- `src/Rndc/Diccionario.php` (generado, usado por el código)

Para regenerar el PHP desde el CSV:

```bash
iconv -f ISO-8859-1 -t UTF-8 "Maestro_Diccionario de Datos_RNDC.csv" \
  | awk -f tools/_gen_diccionario.awk > src/Rndc/Diccionario.php
```

## Uso del cliente (PHP)

```php
require_once __DIR__ . '/src/Rndc/RndcClient.php';

$rndc = RndcClient::desdeConfig();          // usa el .env
$resp = $rndc->ingresar(11, [               // proceso 11 = Tercero
    'NUMNITEMPRESATRANSPORTE' => '900000000',
    'CODTIPOIDTERCERO'        => 'N',
    'NUMIDTERCERO'            => '12345678',
    'NOMIDTERCERO'            => 'ACME SAS',
    // ...
]);

if ($resp->ok) {
    echo "ingresoid: {$resp->ingresoId}";
} else {
    echo "Error: {$resp->error}";
}
```

Probar desde la terminal:

```bash
php tools/probar_rndc.php                  # muestra el XML, sin enviar
php tools/probar_rndc.php --enviar         # envía (usa el .env)
php tools/probar_rndc.php --enviar --host="http://rndcws2.mintransporte.gov.co:8080"
```

## Consultas (tipo 3)

```php
$rndc = RndcClient::desdeConfig();
$resp = $rndc->consultar(
    4,                                                  // proceso 4 = Manifiesto
    ['NUMMANIFIESTOCARGA','NUMPLACA','VALORFLETEPACTADOVIAJE'],  // campos a traer
    ['NUMNITEMPRESATRANSPORTE' => $nit, 'NUMMANIFIESTOCARGA' => $num], // filtro <documento>
);
foreach ($resp->datos as $fila) {
    echo $fila['numplaca'];
}
```

- `<documento>` lleva los filtros exactos (sub-elementos).
- `<documentorango>` (4º parámetro) lleva rangos con comillas simples,
  p.ej. `['iniFECHAING' => "'2026/01/01'", 'finFECHAING' => "'2026/12/31'"]`.
- `RndcRespuesta::$datos` es una lista de filas (una por `<documento>` del resultado).

**Verificado** (2026-06-18): consulta del manifiesto `0102002560` devolvió placa
`KSO581`, flete `2198000`, ingresoid `119855230`.
