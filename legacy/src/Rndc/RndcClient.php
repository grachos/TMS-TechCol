<?php
/**
 * Light TMS - Cliente del web service del RNDC (SOAP/XML).
 *
 * Portado del Google Apps Script funcional. El RNDC expone la operación
 * SOAP 1.1 "AtenderMensajeRNDC", que recibe un parámetro string <Request>
 * con un XML interno escapado:
 *
 *   <root>
 *     <acceso><username>..</username><password>..</password></acceso>
 *     <solicitud><tipo>..</tipo><procesoid>..</procesoid></solicitud>
 *     <variables>...</variables>
 *   </root>
 *
 * Respuesta: el <return> trae otro XML con <ingresoid> (éxito) o
 * <ErrorMSG>/<error> (rechazo).
 *
 * Balanceo de carga (tabla oficial del Ministerio):
 *   - Pruebas:        rndc.mintransporte.gov.co:8080  (todos los procesos)
 *   - Expedir 3 y 4:  rndcws2.mintransporte.gov.co:8080 (Remesa / Manifiesto)
 *   - Consultas:      plc.mintransporte.gov.co:8080  (26, 27, 48, 55)
 *   - Otros procesos: rndcws.mintransporte.gov.co:8080
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/RndcRespuesta.php';

final class RndcClient
{
    private const PATH        = '/soap/IBPMServices';
    private const SOAP_ACTION = 'urn:BPMServicesIntf-IBPMServices#AtenderMensajeRNDC';
    private const NS_URN      = 'urn:BPMServicesIntf-IBPMServices';

    /** Tipos de solicitud (elemento <solicitud><tipo>). */
    public const TIPO_INGRESAR           = '1'; // Registrar info en procesos y maestros
    public const TIPO_CONSULTAR_MAESTRO  = '2'; // Consultar registros de maestros
    public const TIPO_CONSULTAR_PROCESO  = '3'; // Consultar documentos/registros de un proceso

    /** Procesos enrutados a servidores específicos en producción. */
    private const PROCESOS_EXPEDIR   = [3, 4];               // Remesa, Manifiesto
    private const PROCESOS_CONSULTAS = [26, 27, 48, 55];     // Consultas

    private const HOSTS = [
        'pruebas'   => 'http://rndcpruebas.mintransporte.gov.co:8080',
        'expedir'   => 'http://rndcws2.mintransporte.gov.co:8080',
        'consultas' => 'http://plc.mintransporte.gov.co:8080',
        'otros'     => 'http://rndcws.mintransporte.gov.co:8080',
    ];

    public function __construct(
        private readonly string $username,
        private readonly string $password,
        private readonly string $ambiente = 'pruebas',
        private readonly string $hostOverride = '',
        private readonly int $timeout = 30,
    ) {
    }

    public static function desdeConfig(): self
    {
        $cfg = config()['rndc'];
        return new self(
            (string) $cfg['username'],
            (string) $cfg['password'],
            (string) ($cfg['ambiente'] ?? 'pruebas'),
            (string) ($cfg['host_override'] ?? ''),
            (int) ($cfg['timeout'] ?? 30),
        );
    }

    /**
     * Resuelve la URL completa del web service según el proceso y el ambiente.
     */
    public function endpointPara(int $procesoid): string
    {
        if ($this->hostOverride !== '') {
            return rtrim($this->hostOverride, '/') . self::PATH;
        }
        if ($this->ambiente !== 'produccion') {
            return self::HOSTS['pruebas'] . self::PATH;
        }
        if (in_array($procesoid, self::PROCESOS_EXPEDIR, true)) {
            return self::HOSTS['expedir'] . self::PATH;
        }
        if (in_array($procesoid, self::PROCESOS_CONSULTAS, true)) {
            return self::HOSTS['consultas'] . self::PATH;
        }
        return self::HOSTS['otros'] . self::PATH;
    }

    /**
     * Atajo para ingresar/expedir información de un proceso (tipo = 1).
     *
     * @param array<string,scalar|null> $variables
     */
    public function ingresar(int $procesoid, array $variables, ?array $documento = null): RndcRespuesta
    {
        return $this->enviar(self::TIPO_INGRESAR, $procesoid, $variables, $documento);
    }

    /**
     * Envía una solicitud al RNDC y devuelve la respuesta parseada.
     *
     * @param array<string,scalar|null> $variables
     * @param array<string,scalar|null>|null $documento
     */
    public function enviar(string $tipo, int $procesoid, array $variables, ?array $documento = null): RndcRespuesta
    {
        $xmlInterno = $this->construirXmlInterno($tipo, $procesoid, $variables, $documento);
        return $this->enviarXmlInterno($xmlInterno, $procesoid);
    }

    /**
     * Ingresa un proceso a partir de un fragmento <variables> ya renderizado.
     *
     * Sirve para la cola store-and-forward (Fase 4): el fragmento se arma y se
     * guarda al confirmar el despacho (sin credenciales), y el worker lo envuelve
     * con <acceso>/<solicitud> al momento de enviarlo. Permite contenido anidado
     * como <REMESASMAN> que el armado plano de variables no soporta.
     */
    public function ingresarXml(int $procesoid, string $variablesXml): RndcRespuesta
    {
        return $this->enviarXmlInterno($this->envolverVariables($procesoid, $variablesXml), $procesoid);
    }

    /** Devuelve el XML interno completo (para previsualizar sin enviar). */
    public function previewXmlInterno(int $procesoid, string $variablesXml): string
    {
        return $this->envolverVariables($procesoid, $variablesXml);
    }

    /** Envuelve un fragmento <variables> con <acceso>/<solicitud> (tipo 1). */
    private function envolverVariables(int $procesoid, string $variablesXml): string
    {
        return "<?xml version='1.0' encoding='ISO-8859-1'?>\n<root>\n"
            . "  <acceso>\n"
            . '    <username>' . self::escaparXml($this->username) . "</username>\n"
            . '    <password>' . self::escaparXml($this->password) . "</password>\n"
            . "  </acceso>\n"
            . "  <solicitud>\n"
            . '    <tipo>' . self::TIPO_INGRESAR . "</tipo>\n"
            . '    <procesoid>' . $procesoid . "</procesoid>\n"
            . "  </solicitud>\n"
            . '  <variables>' . $variablesXml . "</variables>\n"
            . '</root>';
    }

    /** Ejecuta el POST + parseo de un XML interno ya construido. */
    private function enviarXmlInterno(string $xmlInterno, int $procesoid): RndcRespuesta
    {
        $url = $this->endpointPara($procesoid);

        [$httpCode, $respuestaUtf8, $errConn] = $this->postSoap($xmlInterno, $url);

        if ($errConn !== null) {
            return RndcRespuesta::fallo($errConn, 0, '', $xmlInterno);
        }
        if ($httpCode < 200 || $httpCode >= 300) {
            return RndcRespuesta::fallo("HTTP $httpCode", $httpCode, $respuestaUtf8, $xmlInterno);
        }
        return $this->parsearRespuesta($respuestaUtf8, $httpCode, $xmlInterno);
    }

    /**
     * Renderiza un arreglo plano de variables como líneas <CLAVE>valor</CLAVE>,
     * omitiendo las vacías y escapando los valores. Devuelve solo el contenido
     * interno de <variables> (sin la etiqueta envolvente).
     *
     * @param array<string,scalar|null> $vars
     */
    public static function renderVariables(array $vars): string
    {
        $xml = '';
        foreach ($vars as $clave => $valor) {
            if ($valor === null || $valor === '') {
                continue;
            }
            $xml .= '<' . $clave . '>' . self::escaparXml((string) $valor) . '</' . $clave . '>';
        }
        return $xml;
    }

    /**
     * Consulta documentos/registros de un proceso del RNDC (tipo = 3 por defecto).
     *
     * @param int                       $procesoid proceso a consultar (p.ej. 4 = Manifiesto)
     * @param string[]                  $campos    variables a devolver
     * @param array<string,scalar|null> $filtro    criterios exactos (van en <documento>)
     * @param array<string,scalar|null> $rango     rangos (van en <documentorango>),
     *                                            p.ej. ['iniFECHAING'=>"'2020/01/01'", ...]
     */
    public function consultar(
        int $procesoid,
        array $campos,
        array $filtro,
        array $rango = [],
        string $tipo = self::TIPO_CONSULTAR_PROCESO,
        ?string $url = null,
    ): RndcRespuesta {
        $xmlInterno = $this->construirXmlConsulta($tipo, $procesoid, $campos, $filtro, $rango);
        $url ??= $this->endpointConsultas();

        [$httpCode, $respuestaUtf8, $errConn] = $this->postSoap($xmlInterno, $url);

        if ($errConn !== null) {
            return RndcRespuesta::fallo($errConn, 0, '', $xmlInterno);
        }
        if ($httpCode < 200 || $httpCode >= 300) {
            return RndcRespuesta::fallo("HTTP $httpCode", $httpCode, $respuestaUtf8, $xmlInterno);
        }

        $return = $this->extraerNodo($respuestaUtf8, 'return') ?? $respuestaUtf8;
        $error  = $this->extraerNodo($return, 'ErrorMSG') ?? $this->extraerNodo($return, 'error');
        if ($error !== null) {
            return RndcRespuesta::fallo($error, $httpCode, $return, $xmlInterno);
        }
        // Cada <documento> del resultado es una fila.
        $datos = $this->parsearDocumentos($return);
        return RndcRespuesta::exito('', $httpCode, $return, $xmlInterno, $datos);
    }

    /**
     * Convierte la respuesta de consulta en filas asociativas (una por <documento>).
     *
     * @return list<array<string,string>>
     */
    private function parsearDocumentos(string $xml): array
    {
        $xml = preg_replace('/<\?xml[^>]*\?>/i', '', $xml) ?? $xml;
        $xml = trim($xml);
        if ($xml === '') {
            return [];
        }
        $dom = new DOMDocument();
        $previo = libxml_use_internal_errors(true);
        $ok = $dom->loadXML($xml);
        libxml_clear_errors();
        libxml_use_internal_errors($previo);
        if (!$ok) {
            return [];
        }
        $filas = [];
        foreach ($dom->getElementsByTagName('documento') as $doc) {
            $fila = [];
            foreach ($doc->childNodes as $campo) {
                if ($campo instanceof DOMElement) {
                    $fila[$campo->nodeName] = trim($campo->textContent);
                }
            }
            if ($fila !== []) {
                $filas[] = $fila;
            }
        }
        return $filas;
    }

    /**
     * Ejecuta el POST SOAP y devuelve [httpCode, respuestaUTF8, errorConexion|null].
     *
     * @return array{0:int,1:string,2:?string}
     */
    private function postSoap(string $xmlInterno, string $url): array
    {
        $sobre = $this->construirSobreSoap($xmlInterno);

        // El envío se hace en ISO-8859-1 (como el cliente original).
        $cuerpo = mb_convert_encoding($sobre, 'ISO-8859-1', 'UTF-8');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $cuerpo,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: text/xml; charset=ISO-8859-1',
                'SOAPAction: ' . self::SOAP_ACTION,
            ],
            CURLOPT_TIMEOUT        => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 15,
        ]);

        $respuesta = curl_exec($ch);
        $httpCode  = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($respuesta === false) {
            return [0, '', "Error de conexión: $curlError"];
        }

        // El RNDC declara ISO-8859-1 pero normalmente responde en UTF-8.
        // Convertimos solo si los bytes NO son UTF-8 válido (evita doble codificación).
        $respuesta = (string) $respuesta;
        $respuestaUtf8 = mb_check_encoding($respuesta, 'UTF-8')
            ? $respuesta
            : mb_convert_encoding($respuesta, 'UTF-8', 'ISO-8859-1');

        return [$httpCode, $respuestaUtf8, null];
    }

    /** Endpoint de consultas (servidor plc, o el host forzado/ambiente). */
    public function endpointConsultas(): string
    {
        if ($this->hostOverride !== '') {
            return rtrim($this->hostOverride, '/') . self::PATH;
        }
        if ($this->ambiente !== 'produccion') {
            return self::HOSTS['pruebas'] . self::PATH;
        }
        return self::HOSTS['consultas'] . self::PATH;
    }

    /**
     * Construye el XML interno (parámetro <Request>) en UTF-8.
     *
     * @param array<string,scalar|null> $variables
     * @param array<string,scalar|null>|null $documento
     */
    public function construirXmlInterno(string $tipo, int $procesoid, array $variables, ?array $documento = null): string
    {
        $xml  = "<?xml version='1.0' encoding='ISO-8859-1'?>\n<root>\n";
        $xml .= "  <acceso>\n";
        $xml .= '    <username>' . self::escaparXml($this->username) . "</username>\n";
        $xml .= '    <password>' . self::escaparXml($this->password) . "</password>\n";
        $xml .= "  </acceso>\n";
        $xml .= "  <solicitud>\n";
        $xml .= '    <tipo>' . self::escaparXml($tipo) . "</tipo>\n";
        $xml .= '    <procesoid>' . $procesoid . "</procesoid>\n";
        $xml .= "  </solicitud>\n";
        $xml .= "  <variables>\n";
        foreach ($variables as $clave => $valor) {
            if ($valor === null || $valor === '') {
                continue; // No enviar variables vacías.
            }
            $xml .= '    <' . $clave . '>' . self::escaparXml((string) $valor) . '</' . $clave . ">\n";
        }
        $xml .= "  </variables>\n";
        if ($documento !== null && $documento !== []) {
            $xml .= "  <documento>\n";
            foreach ($documento as $clave => $valor) {
                $xml .= '    <' . $clave . '>' . self::escaparXml((string) $valor) . '</' . $clave . ">\n";
            }
            $xml .= "  </documento>\n";
        }
        $xml .= '</root>';
        return $xml;
    }

    /**
     * Construye el XML interno para una CONSULTA.
     * <variables> es la lista (separada por comas) de campos a devolver;
     * <documento> son los filtros exactos; <documentorango> los rangos.
     *
     * @param string[]                  $campos
     * @param array<string,scalar|null> $filtro
     * @param array<string,scalar|null> $rango
     */
    public function construirXmlConsulta(string $tipo, int $procesoid, array $campos, array $filtro, array $rango = []): string
    {
        $xml  = "<?xml version='1.0' encoding='ISO-8859-1'?>\n<root>\n";
        $xml .= "  <acceso>\n";
        $xml .= '    <username>' . self::escaparXml($this->username) . "</username>\n";
        $xml .= '    <password>' . self::escaparXml($this->password) . "</password>\n";
        $xml .= "  </acceso>\n";
        $xml .= "  <solicitud>\n";
        $xml .= '    <tipo>' . self::escaparXml($tipo) . "</tipo>\n";
        $xml .= '    <procesoid>' . $procesoid . "</procesoid>\n";
        $xml .= "  </solicitud>\n";
        $xml .= '  <variables>' . self::escaparXml(implode(',', $campos)) . "</variables>\n";
        $xml .= "  <documento>\n";
        foreach ($filtro as $clave => $valor) {
            if ($valor === null || $valor === '') {
                continue;
            }
            $xml .= '    <' . $clave . '>' . self::escaparXml((string) $valor) . '</' . $clave . ">\n";
        }
        $xml .= "  </documento>\n";
        if ($rango !== []) {
            $xml .= "  <documentorango>\n";
            foreach ($rango as $clave => $valor) {
                $xml .= '    <' . $clave . '>' . self::escaparXml((string) $valor) . '</' . $clave . ">\n";
            }
            $xml .= "  </documentorango>\n";
        }
        $xml .= '</root>';
        return $xml;
    }

    /**
     * Envuelve el XML interno en el sobre SOAP 1.1 de AtenderMensajeRNDC.
     */
    public function construirSobreSoap(string $xmlInterno): string
    {
        $req = self::escaparXml($xmlInterno);
        return '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" '
            . 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
            . 'xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
            . 'xmlns:urn="' . self::NS_URN . "\">\n"
            . "  <soapenv:Header/>\n"
            . "  <soapenv:Body>\n"
            . '    <urn:AtenderMensajeRNDC soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' . "\n"
            . '      <Request xsi:type="xsd:string">' . $req . "</Request>\n"
            . "    </urn:AtenderMensajeRNDC>\n"
            . "  </soapenv:Body>\n"
            . '</soapenv:Envelope>';
    }

    /**
     * Extrae el <return> del sobre SOAP y parsea el XML interno de resultado.
     */
    private function parsearRespuesta(string $respuesta, int $httpCode, string $xmlEnviado): RndcRespuesta
    {
        $return = $this->extraerNodo($respuesta, 'return');
        if ($return === null) {
            // Puede ser un SOAP Fault.
            $fault = $this->extraerNodo($respuesta, 'faultstring');
            $msg = $fault !== null ? "SOAP Fault: $fault" : 'Estructura de respuesta inesperada (sin <return>).';
            return RndcRespuesta::fallo($msg, $httpCode, $respuesta, $xmlEnviado);
        }

        // El contenido de <return> es a su vez un XML (ya des-escapado por el parser).
        $ingreso = $this->extraerNodo($return, 'ingresoid');
        if ($ingreso !== null && $ingreso !== '') {
            return RndcRespuesta::exito($ingreso, $httpCode, $return, $xmlEnviado);
        }

        $errorMsg = $this->extraerNodo($return, 'ErrorMSG')
            ?? $this->extraerNodo($return, 'error');
        if ($errorMsg !== null) {
            return RndcRespuesta::fallo($errorMsg, $httpCode, $return, $xmlEnviado);
        }

        return RndcRespuesta::fallo('Respuesta sin <ingresoid> ni error.', $httpCode, $return, $xmlEnviado);
    }

    /**
     * Devuelve el textContent del primer elemento con el nombre dado (ignora namespaces).
     */
    private function extraerNodo(string $xml, string $nombre): ?string
    {
        // Quita la declaracion XML inicial: ya trabajamos en UTF-8, pero el RNDC
        // declara ISO-8859-1 y eso haria que DOMDocument re-decodifique mal.
        $xml = preg_replace('/<\?xml[^>]*\?>/i', '', $xml) ?? $xml;
        $xml = trim($xml);
        if ($xml === '') {
            return null;
        }
        $dom = new DOMDocument();
        $previo = libxml_use_internal_errors(true);
        $ok = $dom->loadXML($xml);
        libxml_clear_errors();
        libxml_use_internal_errors($previo);
        if (!$ok) {
            return null;
        }
        $nodos = $dom->getElementsByTagName($nombre);
        if ($nodos->length === 0) {
            return null;
        }
        return trim($nodos->item(0)->textContent);
    }

    /**
     * Escapa caracteres especiales de XML (igual que el script original).
     */
    public static function escaparXml(string $valor): string
    {
        return strtr($valor, [
            '&'  => '&amp;',
            '<'  => '&lt;',
            '>'  => '&gt;',
            "'"  => '&apos;',
            '"'  => '&quot;',
        ]);
    }
}
