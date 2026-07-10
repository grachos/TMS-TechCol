/**
 * Light TMS - RNDC web-service client (SOAP/XML). Faithful port of RndcClient.php.
 *
 * The RNDC exposes the SOAP 1.1 operation "AtenderMensajeRNDC", which receives a
 * single string parameter <Request> containing an escaped inner XML:
 *
 *   <root>
 *     <acceso><username>..</username><password>..</password></acceso>
 *     <solicitud><tipo>..</tipo><procesoid>..</procesoid></solicitud>
 *     <variables>...</variables>
 *   </root>
 *
 * The <return> node carries another XML with <ingresoid> (success) or
 * <ErrorMSG>/<error> (rejection).
 *
 * WIRE ENCODING: the request is sent as ISO-8859-1 (like the original client);
 * the response is decoded from ISO-8859-1 only when it is NOT already valid UTF-8
 * (the RNDC declares ISO-8859-1 but usually replies in UTF-8).
 */

import iconv from 'iconv-lite';
import { DOMParser } from '@xmldom/xmldom';
import { config } from '../config/env.js';
import { obtener as obtenerEmpresa } from '../modules/empresa/empresa.repo.js';
import { RndcRespuesta, type RndcFila } from './RndcRespuesta.js';

/** Scalar values accepted as RNDC variable values. */
export type RndcScalar = string | number | null | undefined;
export type RndcVars = Record<string, RndcScalar>;

const PATH = '/soap/IBPMServices';
const SOAP_ACTION = 'urn:BPMServicesIntf-IBPMServices#AtenderMensajeRNDC';
const NS_URN = 'urn:BPMServicesIntf-IBPMServices';

/** Tipos de solicitud (elemento <solicitud><tipo>). */
export const TIPO_INGRESAR = '1'; // Registrar info en procesos y maestros
export const TIPO_CONSULTAR_MAESTRO = '2'; // Consultar registros de maestros
export const TIPO_CONSULTAR_PROCESO = '3'; // Consultar documentos/registros de un proceso

/** Procesos enrutados a servidores específicos en producción. */
const PROCESOS_EXPEDIR = [3, 4]; // Remesa, Manifiesto
const PROCESOS_CONSULTAS = [26, 27, 48, 55]; // Consultas

const HOSTS = {
  // "Ambiente pruebas" per the Ministry's official load-balancing table — NOT
  // rndcpruebas.mintransporte.gov.co (a stale host with different routing).
  pruebas: 'http://rndc.mintransporte.gov.co:8080',
  expedir: 'http://rndcws2.mintransporte.gov.co:8080',
  consultas: 'http://plc.mintransporte.gov.co:8080',
  otros: 'http://rndcws.mintransporte.gov.co:8080',
} as const;

export class RndcClient {
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly ambiente: string = 'pruebas',
    private readonly hostOverride: string = '',
    private readonly timeout: number = 30,
  ) {}

  /**
   * Username/password come from maestro_empresa (editable in the "Empresa"
   * form) rather than the environment — only ambiente/hostOverride/timeout
   * stay deployment-level config.
   */
  static async desdeConfig(): Promise<RndcClient> {
    const cfg = config().rndc;
    const empresa = await obtenerEmpresa();
    return new RndcClient(
      empresa.rndc_username ?? '',
      empresa.rndc_password ?? '',
      cfg.ambiente ?? 'pruebas',
      cfg.hostOverride ?? '',
      cfg.timeout ?? 30,
    );
  }

  /** Resuelve la URL completa del web service según el proceso y el ambiente. */
  endpointPara(procesoid: number): string {
    if (this.hostOverride !== '') {
      return this.hostOverride.replace(/\/+$/, '') + PATH;
    }
    if (this.ambiente !== 'produccion') {
      return HOSTS.pruebas + PATH;
    }
    if (PROCESOS_EXPEDIR.includes(procesoid)) {
      return HOSTS.expedir + PATH;
    }
    if (PROCESOS_CONSULTAS.includes(procesoid)) {
      return HOSTS.consultas + PATH;
    }
    return HOSTS.otros + PATH;
  }

  /** Atajo para ingresar/expedir información de un proceso (tipo = 1). */
  async ingresar(procesoid: number, variables: RndcVars, documento?: RndcVars): Promise<RndcRespuesta> {
    return this.enviar(TIPO_INGRESAR, procesoid, variables, documento);
  }

  /** Envía una solicitud al RNDC y devuelve la respuesta parseada. */
  async enviar(
    tipo: string,
    procesoid: number,
    variables: RndcVars,
    documento?: RndcVars,
  ): Promise<RndcRespuesta> {
    const xmlInterno = this.construirXmlInterno(tipo, procesoid, variables, documento);
    return this.enviarXmlInterno(xmlInterno, procesoid);
  }

  /**
   * Ingresa un proceso a partir de un fragmento <variables> ya renderizado.
   * Permite contenido anidado (p.ej. <REMESASMAN>) que el armado plano no soporta.
   */
  async ingresarXml(procesoid: number, variablesXml: string): Promise<RndcRespuesta> {
    return this.enviarXmlInterno(this.envolverVariables(procesoid, variablesXml), procesoid);
  }

  /** Devuelve el XML interno completo (para previsualizar sin enviar). */
  previewXmlInterno(procesoid: number, variablesXml: string): string {
    return this.envolverVariables(procesoid, variablesXml);
  }

  /** Envuelve un fragmento <variables> con <acceso>/<solicitud> (tipo 1). */
  private envolverVariables(procesoid: number, variablesXml: string): string {
    // <ambiente>R</ambiente> is a manifiesto-only (procesoid 4) requirement —
    // does not apply to remesa (3) or cumplido (5/6), which share this wrapper.
    const ambiente = procesoid === 4 ? '    <ambiente>R</ambiente>\n' : '';
    return (
      "<?xml version='1.0' encoding='ISO-8859-1'?>\n<root>\n" +
      '  <acceso>\n' +
      '    <username>' + RndcClient.escaparXml(this.username) + '</username>\n' +
      '    <password>' + RndcClient.escaparXml(this.password) + '</password>\n' +
      ambiente +
      '  </acceso>\n' +
      '  <solicitud>\n' +
      '    <tipo>' + TIPO_INGRESAR + '</tipo>\n' +
      '    <procesoid>' + procesoid + '</procesoid>\n' +
      '  </solicitud>\n' +
      '  <variables>' + variablesXml + '</variables>\n' +
      '</root>'
    );
  }

  /** Ejecuta el POST + parseo de un XML interno ya construido. */
  private async enviarXmlInterno(xmlInterno: string, procesoid: number): Promise<RndcRespuesta> {
    const url = this.endpointPara(procesoid);
    const { httpCode, respuestaUtf8, errConn } = await this.postSoap(xmlInterno, url);

    if (errConn !== null) {
      return RndcRespuesta.fallo(errConn, 0, '', xmlInterno);
    }
    if (httpCode < 200 || httpCode >= 300) {
      return RndcRespuesta.fallo(`HTTP ${httpCode}`, httpCode, respuestaUtf8, xmlInterno);
    }
    return this.parsearRespuesta(respuestaUtf8, httpCode, xmlInterno);
  }

  /**
   * Renderiza un arreglo plano de variables como líneas <CLAVE>valor</CLAVE>,
   * omitiendo las vacías y escapando los valores. Devuelve solo el contenido
   * interno de <variables> (sin la etiqueta envolvente).
   */
  static renderVariables(vars: RndcVars): string {
    let xml = '';
    for (const [clave, valor] of Object.entries(vars)) {
      if (valor === null || valor === undefined || valor === '') {
        continue;
      }
      xml += '<' + clave + '>' + RndcClient.escaparXml(String(valor)) + '</' + clave + '>';
    }
    return xml;
  }

  /**
   * Consulta documentos/registros de un proceso del RNDC (tipo = 3 por defecto).
   */
  async consultar(
    procesoid: number,
    campos: string[],
    filtro: RndcVars,
    rango: RndcVars = {},
    tipo: string = TIPO_CONSULTAR_PROCESO,
    url?: string,
  ): Promise<RndcRespuesta> {
    const xmlInterno = this.construirXmlConsulta(tipo, procesoid, campos, filtro, rango);
    const endpoint = url ?? this.endpointConsultas();

    const { httpCode, respuestaUtf8, errConn } = await this.postSoap(xmlInterno, endpoint);

    if (errConn !== null) {
      return RndcRespuesta.fallo(errConn, 0, '', xmlInterno);
    }
    if (httpCode < 200 || httpCode >= 300) {
      return RndcRespuesta.fallo(`HTTP ${httpCode}`, httpCode, respuestaUtf8, xmlInterno);
    }

    const ret = this.extraerNodo(respuestaUtf8, 'return') ?? respuestaUtf8;
    const error = this.extraerNodo(ret, 'ErrorMSG') ?? this.extraerNodo(ret, 'error');
    if (error !== null) {
      return RndcRespuesta.fallo(error, httpCode, ret, xmlInterno);
    }
    const datos = this.parsearDocumentos(ret);
    return RndcRespuesta.exito('', httpCode, ret, xmlInterno, datos);
  }

  /** Convierte la respuesta de consulta en filas asociativas (una por <documento>). */
  private parsearDocumentos(xml: string): RndcFila[] {
    xml = xml.replace(/<\?xml[^>]*\?>/i, '').trim();
    if (xml === '') return [];
    const dom = this.parseXml(xml);
    if (!dom) return [];
    const filas: RndcFila[] = [];
    const docs = dom.getElementsByTagName('documento');
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (!doc) continue;
      const fila: RndcFila = {};
      for (let j = 0; j < doc.childNodes.length; j++) {
        const campo = doc.childNodes[j];
        // nodeType 1 === ELEMENT_NODE
        if (campo && campo.nodeType === 1) {
          const el = campo as unknown as { nodeName: string; textContent: string | null };
          fila[el.nodeName] = (el.textContent ?? '').trim();
        }
      }
      if (Object.keys(fila).length > 0) filas.push(fila);
    }
    return filas;
  }

  /**
   * Ejecuta el POST SOAP y devuelve { httpCode, respuestaUtf8, errConn }.
   * Envío en ISO-8859-1; respuesta decodificada solo si no es UTF-8 válido.
   */
  private async postSoap(
    xmlInterno: string,
    url: string,
  ): Promise<{ httpCode: number; respuestaUtf8: string; errConn: string | null }> {
    const sobre = this.construirSobreSoap(xmlInterno);
    // El envío se hace en ISO-8859-1 (como el cliente original).
    const cuerpo = iconv.encode(sobre, 'ISO-8859-1');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout * 1000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=ISO-8859-1',
          SOAPAction: SOAP_ACTION,
        },
        body: cuerpo,
        signal: controller.signal,
      });
      const httpCode = res.status;
      const bytes = Buffer.from(await res.arrayBuffer());

      // El RNDC declara ISO-8859-1 pero normalmente responde en UTF-8.
      // Convertimos solo si los bytes NO son UTF-8 válido (evita doble codificación).
      const respuestaUtf8 = isValidUtf8(bytes) ? bytes.toString('utf8') : iconv.decode(bytes, 'ISO-8859-1');

      return { httpCode, respuestaUtf8, errConn: null };
    } catch (e) {
      // Node's fetch (undici) wraps the real reason (DNS failure, connection
      // refused, timeout, TLS error…) in `cause` — e.message alone is just the
      // generic "fetch failed". Surface both so this is diagnosable in
      // production without needing to reproduce it locally.
      const msg = e instanceof Error ? e.message : String(e);
      const cause = e instanceof Error && e.cause ? (e.cause instanceof Error ? e.cause.message : String(e.cause)) : null;
      console.error('RNDC postSoap error:', e);
      return {
        httpCode: 0,
        respuestaUtf8: '',
        errConn: `Error de conexión: ${msg}${cause ? ` (${cause})` : ''}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Endpoint de consultas (servidor plc, o el host forzado/ambiente). */
  endpointConsultas(): string {
    if (this.hostOverride !== '') {
      return this.hostOverride.replace(/\/+$/, '') + PATH;
    }
    if (this.ambiente !== 'produccion') {
      return HOSTS.pruebas + PATH;
    }
    return HOSTS.consultas + PATH;
  }

  /** Construye el XML interno (parámetro <Request>) en UTF-8. */
  construirXmlInterno(tipo: string, procesoid: number, variables: RndcVars, documento?: RndcVars): string {
    let xml = "<?xml version='1.0' encoding='ISO-8859-1'?>\n<root>\n";
    xml += '  <acceso>\n';
    xml += '    <username>' + RndcClient.escaparXml(this.username) + '</username>\n';
    xml += '    <password>' + RndcClient.escaparXml(this.password) + '</password>\n';
    xml += '  </acceso>\n';
    xml += '  <solicitud>\n';
    xml += '    <tipo>' + RndcClient.escaparXml(tipo) + '</tipo>\n';
    xml += '    <procesoid>' + procesoid + '</procesoid>\n';
    xml += '  </solicitud>\n';
    xml += '  <variables>\n';
    for (const [clave, valor] of Object.entries(variables)) {
      if (valor === null || valor === undefined || valor === '') {
        continue; // No enviar variables vacías.
      }
      xml += '    <' + clave + '>' + RndcClient.escaparXml(String(valor)) + '</' + clave + '>\n';
    }
    xml += '  </variables>\n';
    if (documento && Object.keys(documento).length > 0) {
      xml += '  <documento>\n';
      for (const [clave, valor] of Object.entries(documento)) {
        xml += '    <' + clave + '>' + RndcClient.escaparXml(String(valor ?? '')) + '</' + clave + '>\n';
      }
      xml += '  </documento>\n';
    }
    xml += '</root>';
    return xml;
  }

  /** Construye el XML interno para una CONSULTA. */
  construirXmlConsulta(
    tipo: string,
    procesoid: number,
    campos: string[],
    filtro: RndcVars,
    rango: RndcVars = {},
  ): string {
    let xml = "<?xml version='1.0' encoding='ISO-8859-1'?>\n<root>\n";
    xml += '  <acceso>\n';
    xml += '    <username>' + RndcClient.escaparXml(this.username) + '</username>\n';
    xml += '    <password>' + RndcClient.escaparXml(this.password) + '</password>\n';
    xml += '  </acceso>\n';
    xml += '  <solicitud>\n';
    xml += '    <tipo>' + RndcClient.escaparXml(tipo) + '</tipo>\n';
    xml += '    <procesoid>' + procesoid + '</procesoid>\n';
    xml += '  </solicitud>\n';
    xml += '  <variables>' + RndcClient.escaparXml(campos.join(',')) + '</variables>\n';
    xml += '  <documento>\n';
    for (const [clave, valor] of Object.entries(filtro)) {
      if (valor === null || valor === undefined || valor === '') {
        continue;
      }
      xml += '    <' + clave + '>' + RndcClient.escaparXml(String(valor)) + '</' + clave + '>\n';
    }
    xml += '  </documento>\n';
    if (Object.keys(rango).length > 0) {
      xml += '  <documentorango>\n';
      for (const [clave, valor] of Object.entries(rango)) {
        xml += '    <' + clave + '>' + RndcClient.escaparXml(String(valor ?? '')) + '</' + clave + '>\n';
      }
      xml += '  </documentorango>\n';
    }
    xml += '</root>';
    return xml;
  }

  /** Envuelve el XML interno en el sobre SOAP 1.1 de AtenderMensajeRNDC. */
  construirSobreSoap(xmlInterno: string): string {
    const req = RndcClient.escaparXml(xmlInterno);
    return (
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
      'xmlns:urn="' + NS_URN + '">\n' +
      '  <soapenv:Header/>\n' +
      '  <soapenv:Body>\n' +
      '    <urn:AtenderMensajeRNDC soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n' +
      '      <Request xsi:type="xsd:string">' + req + '</Request>\n' +
      '    </urn:AtenderMensajeRNDC>\n' +
      '  </soapenv:Body>\n' +
      '</soapenv:Envelope>'
    );
  }

  /** Extrae el <return> del sobre SOAP y parsea el XML interno de resultado. */
  private parsearRespuesta(respuesta: string, httpCode: number, xmlEnviado: string): RndcRespuesta {
    const ret = this.extraerNodo(respuesta, 'return');
    if (ret === null) {
      // Puede ser un SOAP Fault.
      const fault = this.extraerNodo(respuesta, 'faultstring');
      const msg = fault !== null ? `SOAP Fault: ${fault}` : 'Estructura de respuesta inesperada (sin <return>).';
      return RndcRespuesta.fallo(msg, httpCode, respuesta, xmlEnviado);
    }

    const ingreso = this.extraerNodo(ret, 'ingresoid');
    if (ingreso !== null && ingreso !== '') {
      return RndcRespuesta.exito(ingreso, httpCode, ret, xmlEnviado);
    }

    const errorMsg = this.extraerNodo(ret, 'ErrorMSG') ?? this.extraerNodo(ret, 'error');
    if (errorMsg !== null) {
      // "DUPLICADO:<ingresoid> ..." — an identical record was already registered
      // in a prior attempt; not a real failure, so it's treated as a success.
      const dup = /^DUPLICADO:\s*(\d+)/i.exec(errorMsg);
      if (dup?.[1]) {
        return RndcRespuesta.duplicado(dup[1], errorMsg, httpCode, ret, xmlEnviado);
      }
      return RndcRespuesta.fallo(errorMsg, httpCode, ret, xmlEnviado);
    }

    return RndcRespuesta.fallo('Respuesta sin <ingresoid> ni error.', httpCode, ret, xmlEnviado);
  }

  /** Devuelve el textContent del primer elemento con el nombre dado (ignora namespaces). */
  private extraerNodo(xml: string, nombre: string): string | null {
    xml = xml.replace(/<\?xml[^>]*\?>/i, '').trim();
    if (xml === '') return null;
    const dom = this.parseXml(xml);
    if (!dom) return null;
    let nodos = dom.getElementsByTagName(nombre);
    // Fallback robusto a namespaces: si no hubo match por nombre cualificado,
    // busca por local-name (p.ej. <ns:return>).
    if (nodos.length === 0) {
      const all = dom.getElementsByTagName('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i] as unknown as { localName?: string; nodeName: string; textContent: string | null };
        const local = el.localName ?? el.nodeName.split(':').pop();
        if (local === nombre) {
          return (el.textContent ?? '').trim();
        }
      }
      return null;
    }
    const first = nodos[0] as unknown as { textContent: string | null } | undefined;
    if (!first) return null;
    return (first.textContent ?? '').trim();
  }

  /** Parseo tolerante de XML (devuelve null en error de parseo). */
  private parseXml(xml: string): ReturnType<DOMParser['parseFromString']> | null {
    try {
      const parser = new DOMParser({
        onError: () => {
          /* ignora warnings/errores no fatales, como hacía libxml_use_internal_errors */
        },
      });
      const doc = parser.parseFromString(xml, 'text/xml');
      return doc ?? null;
    } catch {
      return null;
    }
  }

  /** Escapa caracteres especiales de XML (igual que el script original). */
  static escaparXml(valor: string): string {
    return valor
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&apos;')
      .replace(/"/g, '&quot;');
  }
}

/** True if the buffer is valid UTF-8 (mirrors mb_check_encoding($s,'UTF-8')). */
function isValidUtf8(buf: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}
