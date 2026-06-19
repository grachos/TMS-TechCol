GUÍA

USO DE WEB SERVICE

EN EL RNDC - V5

Pag. 1

Grupo de Logística

CONTROL DE CAMBIOS

Versión:5

Elaborado por:

Jairo Vesga

Revisado por:

Edna Lorena Gutiérrez

Aprobado por:

Juan Felipe Sanabria Saetta

Fecha de aprobación

27/05/2026

Descripción de las modificaciones

:.

FECHA

MODIFICACION

22/06/2023

Se  modifica  versión  de  la  guía  de  Uso  del  Web  Service  en el  RNDC  para

incluir lo definido en la resolución 20233040045515 de 2022

12/05/2026

Nuevo ambiente de pruebas para las empresas de transporte que usen el

webservice y nuevo ambiente de wstest para los que deseen hacer pruebas

sin hacer programas adicionales.

27/05/2026

Actualización de URL y procesos en el RNDC.

Pag. 2

TABLA DE CONTENIDO

Introducción .................................................................................................................................................................... 4

1. Arquitectura del Web Service del RNDC........................................................................................... 5

2. Elementos de la arquitectura del XML del Web Service ..................................................... 9

3. Ambiente de pruebas ........................................................................................................................................11

4. Usando paso a paso el Web Service ................................................................................................... 12

5. Consultas  de  información  de  los  datos  grabados  previamente  en  el  RNDC,
usando Web Service ............................................................................................................................................... 16

6. Herramienta wstest para aprendizaje del Web Service del RNDC ......................... 19

7. Diccionario de datos ....................................................................................................................................... 24

8. Diccionario de Errores ....................................................................................................................................27

Pag. 3

SISTEMA DE INFORMACIÓN REGISTRO NACIONAL DE DESPACHOS DE CARGA- RNDC

GUÍA USO DE WEB SERVICE EN EL RNDC

Introducción

Este documento tiene por objeto establecer los estándares y parámetros para guiar a los usuarios

en  la  transmisión  y  recepción  de  los  datos,  en  el  marco  de  interacción  con  el  RNDC  WEB-

SERVICE. Busca facilitar el uso adecuado de la aplicación y la ejecución del proceso de transporte

que se está instrumentando a través del RNDC, de una manera fácil y rápida.

Es importante resaltar que un Web Service o servicio web es un fragmento de software que usa

un conjunto de protocolos y estándares que sirven para intercambiar datos entre aplicaciones. En

el caso del RNDC, el Web Service busca que las aplicaciones desarrolladas por y para las diferentes

empresas de transporte puedan intercambiar datos con la aplicación del RNDC.

El  RNDC  WEB-SERVICE  ofrece  interoperabilidad  entre  aplicaciones  de  software  creadas  con

propiedades  diferentes  e  instaladas  en  plataformas  diferentes.  Además,  al  usar  estándares  y

protocolos basados en texto (cadenas de caracteres) hace que sea más fácil acceder al contenido

generado y entender claramente su funcionamiento. Por último, el RNDC WEB-SERVICE permite

que las aplicaciones de todas las empresas de transporte puedan interactuar con la plataforma y

combinar fácilmente la información para que ésta sea centralizada.

Pag. 4

1.  Arquitectura del Web Service del RNDC

El Web Service del RNDC atiende con protocolo SOAP (Simple Object Access Protocol) y formato
de datos XML.

Tiene 3 url para atender mejor a los usuarios balanceando las cargas de las solicitudes.

a.  Rndcws2.mintransporte.gov.co:8080

Expedir Remesas y Manifiestos
b.  Plc.mintransporte.gov.co:8080

Realizar Consultas

c.  Rndcws.mintransporte.gov.co:8080

El resto de procesos del RNDC (Todos menos Expedir Remesas y Manifiestos, ni Consultas)

En cada uno de las url se pueden consultar los archivos WSDL (WebService Definition Language)

El acceso a esas 3 url desde IP’s extranjeras se encuentra bloqueado, excepto si son de Estados
Unidos.  En  caso  de  que  una  empresa  de  transporte  necesite  accesar  el  RNDC  desde  una  IP
extranjera deberá solicitar por email la solicitud, al grupo de logística.

WSDL (Web-Service Definition Language)

<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/X
MLSchema" xmlns:tns="http://tempuri.org/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/so
ap/" xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/" xmlns:mime="http://schem
as.xmlsoap.org/wsdl/mime/" name="IBPMServicesservice" targetNamespace="http://tempuri.or
g/">

Pag. 5

<message name="AtenderMensajeRNDC0Request">
<part name="Request" type="xs:string"/>

</message>

<message name="AtenderMensajeRNDC0Response">

<part name="return" type="xs:string"/>

</message>

<message name="AtenderMensajeBPM1Request">

<part name="Request" type="xs:string"/>

</message>

<message name="AtenderMensajeBPM1Response">

<part name="return" type="xs:string"/>

</message>

<portType name="IBPMServices">

<operation name="AtenderMensajeRNDC">

<input message="tns:AtenderMensajeRNDC0Request"/>

<output message="tns:AtenderMensajeRNDC0Response"/>

</operation>

<operation name="AtenderMensajeBPM">

<input message="tns:AtenderMensajeBPM1Request"/>

<output message="tns:AtenderMensajeBPM1Response"/>

</operation>

</portType>

<binding name="IBPMServicesbinding" type="tns:IBPMServices">

<binding xmlns="http://schemas.xmlsoap.org/wsdl/soap/" style="rpc" transport="http://schem
as.xmlsoap.org/soap/http"/>

<operation name="AtenderMensajeRNDC">

<operation xmlns="http://schemas.xmlsoap.org/wsdl/soap/" soapAction="urn:BPMServicesIntf-
IBPMServices#AtenderMensajeRNDC" style="rpc"/>

<input>

<body xmlns="http://schemas.xmlsoap.org/wsdl/soap/" use="encoded" encodingStyle="http://
schemas.xmlsoap.org/soap/encoding/" namespace="urn:BPMServicesIntf-IBPMServices"/>

</input>

Pag. 6

<output>

<body xmlns="http://schemas.xmlsoap.org/wsdl/soap/" use="encoded" encodingStyle="http://
schemas.xmlsoap.org/soap/encoding/" namespace="urn:BPMServicesIntf-IBPMServices"/>

</output>

</operation>

<operation name="AtenderMensajeBPM">

<operation xmlns="http://schemas.xmlsoap.org/wsdl/soap/" soapAction="urn:BPMServicesIntf-
IBPMServices#AtenderMensajeBPM" style="rpc"/>
<input>

<body xmlns="http://schemas.xmlsoap.org/wsdl/soap/" use="encoded" encodingStyle="http://
schemas.xmlsoap.org/soap/encoding/" namespace="urn:BPMServicesIntf-IBPMServices"/>

</input>

<output>

<body xmlns="http://schemas.xmlsoap.org/wsdl/soap/" use="encoded" encodingStyle="http://
schemas.xmlsoap.org/soap/encoding/" namespace="urn:BPMServicesIntf-IBPMServices"/>

</output>

</operation>

</binding>

<service name="IBPMServicesservice">

<port name="IBPMServicesPort" binding="tns:IBPMServicesbinding">

<address xmlns="http://schemas.xmlsoap.org/wsdl/soap/" location="http://rndcws.mintranspor
te.gov.co:8080/soap/IBPMServices"/>

</port>

</service>

</definitions>

En el XML con un solo Web Service se pueden realizar todas las operaciones necesarias para enviar

o actualizar la información, tanto en el registro de Terceros y Vehículos como en cada uno de los

pasos del proceso.

Es fundamental entender la arquitectura del RNDC WEB-SERVICE ya que de esta forma para un

desarrollador  es  posible  comprender  la  estructura,  el  funcionamiento  y  la  interacción  entre  las

distintas partes de la aplicación.

Pag. 7

Para  el  envío  de  información  al  RNDC  se  usa  el  método  “AtenderMensajeRNDC”.  Asimismo,  el

único  parámetro  que  se  debe  enviar  en  este  método  es  “Request”,  el  cual  es  una  cadena  en

formato XML. El método envía una respuesta también en formato XML con el número de radicación

o con el texto del error (o errores).

El “Request” del método “AtenderMensajeRNDC” del Web Service del RNDC debe tener la siguiente

estructura en XML:

Elemento principal <root> con cuatro elementos secundarios:
<acceso>, <solicitud>, <variables> y <documento>.

A continuación, un ejemplo ilustrativo:

<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
   <acceso>
                 Seguridad del acceso.
  </acceso>
  <solicitud>
                 Qué se desea hacer y en cual proceso.
  </solicitud>
  <variables>
                 Detalle de la información que se envía.
  </variables>
<documento>
                Datos para filtrar el documento del proceso a consultar.
</documento>
</root>

La respuesta que genera el Web-Service cuando los registros se han realizado satisfactoriamente
lleva siempre el siguiente formato:

<?xml version="1.0" encoding="ISO-8859-1" ?>
<root>
<ingresoid>12</ingresoid>
</root>

Aquí el número 12 es el consecutivo de radicado. El consecutivo cambia cada vez que se acepta
un registro nuevo sin errores.

Pag. 8

2. Elementos de la arquitectura del XML del Web Service

Los siguientes son los elementos de esta arquitectura, los cuales se revisarán uno.

Elemento <acceso>

El elemento <acceso> contempla dos elementos: <username> y <password>.

<username>uuuuuu</username>,  donde  uuuuuu  es  el  código  del  usuario  de  la  empresa  de
transporte, generador de carga o empresa de GPS, entre otros actores de la cadena de transporte.

En el caso de <password>pppppp</password>, pppppp es la palabra clave del usuario.

Elemento <solicitud>

El elemento <solicitud> contempla dos elementos:

En <tipo>x</tipo>, x es el tipo de operación:

1.  Registrar Información en procesos y maestros.

2.  Consultar Registros de Maestros.

3.  Consultar Documentos o registros de cualquier proceso.

4.  Consulta para la Policía

5.  Consulta para Generadores de Carga

6.  Consulta de Maestros especiales

7.  Crear un usuario desde la app RNDC transportador

8.  Consulta de un conductor

9.  Consultas de remesas autorizadas para empresas de GPS

En <procesoid>xx</procesoid>, xx = Número del proceso, éste puede ser:

1:

2:

3:

4:

5:

6:

Registrar Información de Carga

Registrar Información de Viaje

Expedir Remesa Terrestre de Carga

Expedir Manifiesto de Carga

Cumplir Remesa Terrestre de Carga

Cumplir Manifiesto de Carga

Pag. 9

7:

8:

Anular Información de Carga

Anular Información del Viaje

9:     Anular Remesa Terrestre de Carga

11:    Crear o Actualizar datos de Tercero (Maestro)

12:    Crear o Actualizar datos de Vehículo (Maestro)

28:    Anular Cumplido de Remesa

29:    Anular Cumplido de Manifiesto

32:    Anular Manifiesto de Carga

34:    Tarifas o Fletes de Generador de carga

38:    Corregir Remesa

39:     Control en Carretera

41:     Anular flete de Generador

45:     Registrar un Cumplido Inicial de Remesa, puede ser empresa de GPS, o empresa de

transporte.

46:     Registrar Novedades de Empresa de GPS

54:     Anular Cumplido Inicial de Remesa

55:     Puntos de Control a monitorear del manifiesto

41:     Anular Flete del Generador de Carga

60:     Monitoreo de Manifiesto

68:     Anular Monitoreo de Manifiesto

73:     Aceptación Electrónica del Manifiesto por parte del Titular del Manifiesto o del Conductor.

75:     Delegar Aceptación Electrónica del titular del manifiesto al Conductor.

79:     Cumplido de Viaje Municipal

81:     Registro de Viaje Municipal

83:     Remesa Municipal

86:     Factura Electrónica de transporte

91:     Anular Registros de Viaje Municipal

92:     Anular Remesa Municipal

93:     Anular Cumplido de Viaje Municipal

96:     Anular Factura Electrónica

Elemento <variables>

El elemento  <variables> tiene n subelementos y depende del proceso al cual se desea enviar

información. Cada elemento tiene como etiqueta el nombre de la variable del Diccionario de Datos,

al cual se puede acceder en el portal del rndc.mintransporte.gov.co en la consulta de maestros.

Elemento <documento>

Pag. 10

El elemento <documento> solo se necesita cuando se quiere consultar información. Si se

desea radicar o enviar información hacia los procesos del RNDC ese elemento no se usa.

Un ejemplo más detallado:

<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
   <acceso>
       <username>uuuuuu</username>
       <password>pppppp</password>
   </acceso>
   <solicitud>
       <tipo>x</tipo>
       <procesoid>xx</procesoid>
  </solicitud>
  <variables>
      <numnitempresatransporte>xxxxxx</numnitempresatransporte>
  </variables>
</root>

3.  Ambiente de pruebas

Las Empresas de Transporte pueden realizar sus pruebas del Web Service en otra IP. El WSDL lo

pueden accesar en url: rndcpruebas.mintransporte.gov.co:8080/

También  se  dispuso  del  ambiente  de  wstest  para  los  que  deseen  hacer  pruebas  sin  hacer
programas adicionales. url: rndc.mintransporte.gov.co/wstest/defaultpruebas.aspx

Allí podrán accesar a una base de datos copia del ambiente de producción de alguna fecha. Los

usuarios que  la pueden usar son los mismos que tienen en el ambiente de producción, con sus

respectivos password o claves.

En el ambiente de pruebas, el sistema RNDC puede responder con números de radicados diferentes

al orden de los consecutivos del ambiente de producción normal.

Y la respuesta del ambiente de pruebas es con un radicado mayor a 900,000,000

La  base  de  datos  de  pruebas  del  RNDC  cambia  cada  año  por  una  nueva  foto  del  ambiente  de

producción.

Pag. 11

El ambiente de pruebas del RNDC está habilitado solo a los usuarios que usen una IP de Colombia,

está bloqueada para IP’s extranjeras. Si el usuario expone unos argumentos válidos al grupo de

logística del Ministerio de Transporte, se podrá analizar la posibilidad de parametrizar el firewall

para que excluya del bloqueo a esa IP extranjera.

4.  Usando paso a paso el Web Service

A continuación, se presentan algunos ejemplos comunes dentro del proceso del Web Service y las

consideraciones generales para el registro de los Archivos Maestros (Terceros y Vehículos) y de

cada uno de los pasos del proceso.  Esto con el fin de ofrecer una mayor claridad acerca de los

procesos, las herramientas y el lenguaje utilizado.

Para realizar un proceso rápido y sin interrupciones, se recomienda primero realizar el ingreso de

la  información  de  conductores,  propietarios  o  tenedores  de  vehículos,  empresas,  personas

naturales y vehículos, antes de realizar el proceso de registro de la información en el RNDC.

Solo se debe efectuar una vez el registro en el sistema. Luego de que éste se guarde en la base

de datos, solo se necesita enviar el tipo de  documento y el número de documento  (terceros)  o

placa (vehículos), para que la información restante sea heredada automáticamente por el proceso

que se está realizando.

Los  Terceros  y  Vehículos  se  deben  registrar  únicamente  cuando  hay  cambios  en  alguna

información, de lo contrario se estaría almacenando una historia de cambios que no se necesita y

ocupa mucho recurso de computación. El RNDC envía un mensaje de error cuando recibe un xml

de creación de tercero o vehículo y la información coincide con la que ya está guardada en la base

de datos.

Ejemplo para crear un tercero

A continuación, un xml para un Tercero enviado al ambiente de pruebas
rndcpruebas.mintransporte.gov.co:8080/…..

<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
 <acceso>
  <username>JAIROVESGA@1715</username>
  <password>6789054321</password>
 </acceso>
 <solicitud>
  <tipo>1</tipo>
  <procesoid>11</procesoid>
 </solicitud>
 <variables>

Pag. 12

  <NUMNITEMPRESATRANSPORTE>8999990554</NUMNITEMPRESATRANSPORTE>
  <CODTIPOIDTERCERO>C</CODTIPOIDTERCERO>
  <NUMIDTERCERO>19258361</NUMIDTERCERO>
  <NOMIDTERCERO>PRUEBA DE TERCERO</NOMIDTERCERO>
  <PRIMERAPELLIDOIDTERCERO>PRUEBAS</PRIMERAPELLIDOIDTERCERO>
  <NUMTELEFONOCONTACTO>3161111111</NUMTELEFONOCONTACTO>
  <NOMENCLATURADIRECCION>cra 20 calle 40</NOMENCLATURADIRECCION>
  <CODMUNICIPIORNDC>11001000</CODMUNICIPIORNDC>
  <CODSEDETERCERO>0301</CODSEDETERCERO>
  <NOMSEDETERCERO>PRUEBAS bogota</NOMSEDETERCERO>
  <LATITUD>4.72645</LATITUD>
  <LONGITUD>-74.06204</LONGITUD>
 </variables>
</root>

<?xml version="1.0" encoding="ISO-8859-1”?>
<root>

Ejemplo para crear un vehículo

en este caso se trata de un Tractocamión de 3 ejes, marca Chevrolet, línea código 373, con placa

WZH111, modelo 2010, que pertenece a Linda Barreto Arévalo, quien actúa como propietaria y

tenedor; el vehículo funciona con ACPM, pesa 8000 kilogramos, el tipo de carrocería es S.R.S, la

aseguradora  es  MAPFRE  CREDISEGURO  S.A.  con  NIT  8110191907,  el  número  de  póliza  es

AT131811151729 y vence el 14 de octubre del 2011.

XML para el proceso solicitado:

<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
 <acceso>
  <username>USUARIO1</username>
  <password>CLAVE</password>
 </acceso>
 <solicitud>
  <tipo>1</tipo>
  <procesoid>12</procesoid>
 </solicitud>
 <variables>    <NUMNITEMPRESATRANSPORTE>900301001</NUMNITEMPRESATRANSPORTE>
   <NUMPLACA>WZH111</NUMPLACA>
   <CODCONFIGURACIONUNIDADCARGA>55</CODCONFIGURACIONUNIDADCARGA>
  <PESOVEHICULOVACIO>8000</PESOVEHICULOVACIO>
  <CODTIPOCARROCERIA>0</CODTIPOCARROCERIA>
  <CODTIPOIDTENEDOR>C</CODTIPOIDTENEDOR>
  <NUMIDTENEDOR>51760125</NUMIDTENEDOR>
</variables>
</root>

Ejemplo para crear una Remesa Terrestre de Carga

Pag. 13

<?xml version='1.0' encoding='ISO-8859-1' ?>

<root>

 <acceso>

  <username>YYYYYYY</username>

  <password>XXXXXXX</password>

 </acceso>

 <solicitud>

  <tipo>1</tipo>

  <procesoid>3</procesoid>

 </solicitud>

 <variables>

  <NUMNITEMPRESATRANSPORTE>8999990554</NUMNITEMPRESATRANSPORTE>

  <CONSECUTIVOREMESA>REMESA1</CONSECUTIVOREMESA>

  <CODOPERACIONTRANSPORTE>G</CODOPERACIONTRANSPORTE>

  <CODNATURALEZACARGA>1</CODNATURALEZACARGA>

  <CANTIDADCARGADA>2000</CANTIDADCARGADA>

  <UNIDADMEDIDACAPACIDAD>1</UNIDADMEDIDACAPACIDAD>

  <CODTIPOEMPAQUE>0</CODTIPOEMPAQUE>

  <MERCANCIAREMESA>0301</MERCANCIAREMESA>

  <DESCRIPCIONCORTAPRODUCTO>PRUEBAS</DESCRIPCIONCORTAPRODUCTO>

  <CODTIPOIDREMITENTE>C</CODTIPOIDREMITENTE>

  <NUMIDREMITENTE>19258361</NUMIDREMITENTE>

  <CODSEDEREMITENTE>0</CODSEDEREMITENTE>

  <CODTIPOIDDESTINATARIO>C</CODTIPOIDDESTINATARIO>

  <NUMIDDESTINATARIO>19258361</NUMIDDESTINATARIO>

  <CODSEDEDESTINATARIO>1</CODSEDEDESTINATARIO>

  <HORASPACTOCARGA>1</HORASPACTOCARGA>

  <MINUTOSPACTOCARGA>0</MINUTOSPACTOCARGA>

  <HORASPACTODESCARGUE>1</HORASPACTODESCARGUE>

  <MINUTOSPACTODESCARGUE>0</MINUTOSPACTODESCARGUE>

  <CODTIPOIDPROPIETARIO>C</CODTIPOIDPROPIETARIO>

  <NUMIDPROPIETARIO>19258361</NUMIDPROPIETARIO>

Pag. 14

  <CODSEDEPROPIETARIO>0</CODSEDEPROPIETARIO>

  <FECHACITAPACTADACARGUE>13/06/2026</FECHACITAPACTADACARGUE>

  <HORACITAPACTADACARGUE>08:10</HORACITAPACTADACARGUE>

  <FECHACITAPACTADADESCARGUE>14/06/2026</FECHACITAPACTADADESCARGUE>

<HORACITAPACTADADESCARGUEREMESA>10:25</HORACITAPACTADADESCARGUERE
MESA>

 </variables>

</root>

La respuesta del ambiente de pruebas nos entrega un radicado con un número mayor a
900,000,000:

<?xml version="1.0" encoding="ISO-8859-1" ?>

<root>

<ingresoid>900000026</ingresoid>

</root>

Recomendamos acceder la GUIA de REMESA para tener la lista de variables del proceso en forma
completa.

Ejemplo para crear un Manifiesto de Carga, con consecutivo 0001

El tipo de manifiesto es general, la fecha de expedición es 29 de julio de 2011, se transportará

con origen Cali y destino Bogotá, el titular del Manifiesto de Carga es a nombre de Edgar Moreno

Silva, identificado con cédula de ciudadanía No 79.616.565 de Bogotá. El descuento de ley es del

3 por mil, el valor del anticipo es de $1.000.000, el saldo se pagará en la ciudad de Bogotá, el 29

de Julio del 2011. El encargado del pago del cargue y del descargue es la empresa de transporte.

Se  recomienda  que  en  caso  de  accidente  el  conductor  se  comunique  al  número  celular

3102569874. A este manifiesto están asociadas dos remesas con los consecutivos: 0001 y 0020.

XML para el proceso solicitado:

<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
 <acceso>
  <username>USUARIO1</username>
  <password> USUARIO1</password>
 </acceso>

Pag. 15

 <solicitud>
  <tipo>1</tipo>
  <procesoid>4</procesoid>
 </solicitud>
 <variables>     <NUMNITEMPRESATRANSPORTE>900301001</NUMNITEMPRESATRANSPORTE>
   <NUMMANIFIESTOCARGA>0001</NUMMANIFIESTOCARGA>
   <CODOPERACIONTRANSPORTE>G</CODOPERACIONTRANSPORTE>
<FECHAEXPEDICIONMANIFIESTO>29/07/2011</FECHAEXPEDICIONMANIFIESTO>
<CODMUNICIPIOORIGENMANIFIESTO>76001000</CODMUNICIPIOORIGENMANIFIESTO>
<CODMUNICIPIODESTINOMANIFIESTO>11001000</CODMUNICIPIODESTINOMANIFIESTO>
   <CODIDTITULARMANIFIESTO>C</CODIDTITULARMANIFIESTO>
<NUMIDTITULARMANIFIESTO>79616565</NUMIDTITULARMANIFIESTO>
  <NUMPLACA>XXXXXX</NUMPLACA>
  <NUMPLACAREMOLQUE>YYYYYY</NUMPLACAREMOLQUE>
  <CODIDCONDUCTOR>C</CODIDCONDUCTOR>
  <NUMIDCONDUCTOR>4675675</NUMIDCONDUCTOR>
  <CODIDCONDUCTOR2>C</CODIDCONDUCTOR2>
  <NUMIDCONDUCTOR2>96896</NUMIDCONDUCTOR2>
<VALORFLETEPACTADOVIAJE>3250000</VALORFLETEPACTADOVIAJE>
<RETENCIONICAMANIFIESTOCARGA>3</RETENCIONICAMANIFIESTOCARGA>
<VALORANTICIPOMANIFIESTO>1000000</VALORANTICIPOMANIFIESTO>
<CODMUNICIPIOPAGOSALDO>11001000</CODMUNICIPIOPAGOSALDO>
<FECHAPAGOSALDOMANIFIESTO>29/07/2011</FECHAPAGOSALDOMANIFIESTO>
<CODRESPONSABLEPAGOCARGUE>E</CODRESPONSABLEPAGOCARGUE>
<CODRESPONSABLEPAGODESCARGUE>E</CODRESPONSABLEPAGODESCARGUE>
  <ACEPTACIONELECTRONICA>SI</ACEPTACIONELECTRONICA>
   <OBSERVACIONES>Se recomienda que en caso de accidente el conductor debe comunicarse
al número celular 3102569871</OBSERVACIONES>
   <REMESASMAN procesoid="43">
   <REMESA>
   <CONSECUTIVOREMESA>0001</ CONSECUTIVOREMESA >
   </REMESA>
   <REMESA>
   < CONSECUTIVOREMESA >0020</ CONSECUTIVOREMESA >
   </REMESA>
   </REMESASMAN>
</variables>
</root>

Recomendamos acceder la GUIA de MANIFIESTO para tener la lista de variables del proceso en
forma completa.

Lo mismo sugerimos con la GUIA de CUMPLIDOS de Remesa y Manifiesto, además de la Guía de
Facturación Electrónica.

5.  Consultas de información de los datos grabados previamente en el RNDC,

usando Web Service

Las empresas de transporte pueden realizar consultas de cada uno de los procesos o registros de

información enviada previamente. Para ello se usa el tipo de solicitud 3 en vez del 1, que es para

enviar información.

Pag. 16

A continuación, un ejemplo de la consulta de si un manifiesto ya fue firmado.  Se usará el Web

Service con el tipo: 3 “Consulta” del proceso 73, el cual corresponde a la firma o aceptación de

manifiestos.

Ejemplo en Wstest del XML, con su respectiva respuesta:

La fecha y hora entregada en el tag: <fechaing> puede ser almacenada en la base de datos del

sistema de información de la empresa de transporte, para que cuando realicen la generación del

pdf del manifiesto aparezca en la ubicación de la firma electrónica.

Consulta de varias aprobaciones electrónicas en un rango de tiempo:

<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
 <acceso>
  <username>xxxxxxx@xxx</username>
  <password>xxxxxxxxxx</password>
 </acceso>

Pag. 17

 <solicitud>
  <tipo>3</tipo>
  <procesoid>73</procesoid>
 </solicitud>
 <variables>
INGRESOID,FECHAING, INGRESOIDMANIFIESTO,TIPO, CODIDCONDUCTOR,
NUMIDCONDUCTOR, OBSERVACION
 </variables>
 <documento>
<NUMNITEMPRESATRANSPORTE>8999990554</NUMNITEMPRESATRANSPORTE>
 </documento>
 <documentorango>
  <iniFECHAING>'2020/01/01'</iniFECHAING>
  <finFECHAING>'2020/03/31'</finFECHAING>
 </documentorango>
</root>

Nos entrega la respuesta:

<?xml version="1.0" encoding="ISO-8859-1" ?>
<root>
<documento>
<ingresoid>15</ingresoid>
<fechaing>28/03/2020 9:44:52 a. m.</fechaing>
<ingresoidmanifiesto>48043700</ingresoidmanifiesto>
<tipo>C</tipo>
<codidconductor>C</codidconductor>
<numidconductor>80387330</numidconductor>
<observacion>Celular 3103040052</observacion>
</documento>
<documento>
<ingresoid>8</ingresoid>
<fechaing>22/03/2020 10:26:49 p. m.</fechaing>
<ingresoidmanifiesto>47492363</ingresoidmanifiesto>
<tipo>T</tipo>
<codidconductor></codidconductor>
<numidconductor></numidconductor>
<observacion>okk</observacion>
</documento>
<documento>
<ingresoid>18</ingresoid>
<fechaing>30/03/2020 8:37:08 a. m.</fechaing>
<ingresoidmanifiesto>48088076</ingresoidmanifiesto>
<tipo>C</tipo>
<codidconductor>C</codidconductor>
<numidconductor>79171592</numidconductor>
<observacion>Celular 3134850261</observacion>
</documento>
<documento>
<ingresoid>12</ingresoid>
<fechaing>27/03/2020 12:31:07 p. m.</fechaing>
<ingresoidmanifiesto>48045984</ingresoidmanifiesto>
<tipo>C</tipo>
<codidconductor>C</codidconductor>
<numidconductor>79170327</numidconductor>
<observacion>Celular 3112119340</observacion>

Pag. 18

</documento>
</root>

Si  se  desean  consultar  los  manifiestos  pendientes  de  Aceptación  Electrónica,  el  XML
sería:

<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
 <acceso>
  <username>xxxxxx@xxxx</username>
  <password>xxxxxxxxxxx</password>
 </acceso>
 <solicitud>
  <tipo>3</tipo>
  <procesoid>4</procesoid>
 </solicitud>
 <variables>
INGRESOID,FECHAING,NUMMANIFIESTOCARGA,NUMIDTITULARMANIFIESTO,NUMPLACA,NUMID
CONDUCTOR
 </variables>
 <documento>
<NUMNITEMPRESATRANSPORTE>8999990554</NUMNITEMPRESATRANSPORTE>
  <ACEPTACIONELECTRONICA>NULL</ACEPTACIONELECTRONICA>
 </documento>
 <documentorango>
  <iniFECHAING>'2020/04/01'</iniFECHAING>
  <finFECHAING>'2020/05/01'</finFECHAING>
 </documentorango>
</root>

La respuesta de los manifiestos pendientes de aceptación electrónica sería:

<?xml version="1.0" encoding="ISO-8859-1" ?>
<root>
<documento>
<ingresoid>48017065</ingresoid>
<fechaing>05/04/2020 10:09:58 a. m.</fechaing>
<nummanifiestocarga>M321</nummanifiestocarga>
<numidtitularmanifiesto>19258361</numidtitularmanifiesto>
<numplaca>BOD874</numplaca>
<numidconductor>19258361</numidconductor>
</documento>
</root>

6. Herramienta wstest para aprendizaje del Web Service del RNDC

El  RNDC  posee  un  programa  que  permite  comprender  bien  la  forma  en  que  se  debe  escribir  el

XML.

Pag. 19

Si el usuario empieza con el aprendizaje de la elaboración de los xml con esta herramienta, podrá

realizar las pruebas de cada una de las operaciones a los procesos y comprender bien la forma en

que se debe escribir el XML.

 URL: https://rndc.mintransporte.gov.co/wstest/default.aspx

o

URL: https://rndc.mintransporte.gov.co/wstest/default2.aspx

o

URL: https://rndc.mintransporte.gov.co/wstest/default3.aspx

La  diferencia  de  las  tres  URL  está  en  que  la  primera  envía  el  Web  Service  al  servidor:

rndcws.mintransporte.gov.co:8080/….

Mientras

la

segunda

envía

el  Web

Service

al

servidor

secundario:

rndcws2.mintransporte.gov.co:8080/….

Mientras la tercera envía el Web Service al servidor de consultas:

plc.mintransporte.gov.co:8080/….

La herramienta podrá buscarse desde distintos navegadores y al ingresar a la misma,

se muestra una pantalla compuesta por 4 partes:

1.  Lista de procesos del RNDC.

2.  Diccionario de datos del proceso seleccionado

3.  XML que se genera automáticamente a partir del diccionario de datos y además es editable

4.  XML de respuesta del RNDC cuando recibe el Web Service

Pag. 20

Como se observa en la figura, lo primero que se debe digitar es el usuario y la clave.

En la parte superior está la lista de los procesos que reciben Web Service en el RNDC: Número y

nombre.

El número del proceso se debe digitar al lado izquierdo, en donde dice: Proceso ID.

Después de digitar el número del proceso, se hace clic en el botón “Validar” e inmediatamente se

visualizará el diccionario de datos de ese proceso.

Por ejemplo, si se selecciona el 3-Remesa, se visualizará lo siguiente:

Pag. 21

Pag. 22

El usuario debe escribir los datos de cada variable del diccionario en los cajones de la derecha de

cada uno.

Al terminar de diligenciar los datos, se debe hacer clic en el botón: Generar XML para grabar y el

sistema mostrará a la derecha el XML que se debe enviar por el Web Service.

Se pueden dejar campos en blanco y el sistema no los incluirá en el XML.

Luego se debe hacer clic en el botón: Consumir Servicio.

El programa enviará el Web Service al servidor del RNDC y se visualizará la respuesta en un cuadro

inferior, así como mensajes de error o el radicado de aceptación del registro.

Pag. 23

7.  Diccionario de datos

Los usuarios pueden consultar el diccionario de datos para cada uno de los procesos. La consulta

se  debe  hacer  con  la  funcionalidad  de  CONSULTAR  que  se  encuentra  en  el  menú  del  portal

https://rndc2.mintransporte.gov.co/Ingresar/Iniciar-Sesi%C3%B3n

Allí se debe seleccionar: Consultar Maestros

Pag. 24

Luego se debe seleccionar de la lista desplegable de los maestros el

Diccionario de Datos

Se visualizará la pantalla que permite hacer la consulta de un solo mensaje de error. Asimismo,

al dejar la casilla en blanco se visualizará una mayor información sobre distintos errores.

Pag. 25

El usuario puede filtrar los mensajes escribiendo el dato en la línea en blanco que está ubicada al

principio de cada columna. Ver, por ejemplo, la columna Proceso ID, en la casilla en mención se

agregó el número 8.

El usuario puede hacer clic en el botón: Transmitir Archivo Plano y puede obtener la información

en un archivo en formato Excel en su PC.

Pag. 26

8. Diccionario de Errores

Los usuarios pueden consultar el diccionario de errores para cada uno de los procesos. La consulta

se debe hacer con la funcionalidad de CONSULTAR del menú del portal rndc.mintransporte.gov.co

Allí se deberá seleccionar: Consultar Maestros.

El paso a seguir será seleccionar de la lista desplegable de los maestros el Diccionario de Errores

Pag. 27

Se  visualizará  en  la  pantalla  la  opción  que  permite  hacer  la  consulta  del  mensaje  de  error.

Asimismo,  al  dejar  la  casilla  en  blanco  se  visualizará  una  mayor  información  sobre  distintos

errores.

El usuario puede filtrar los mensajes escribiendo el dato en la línea en blanco que tiene al principio

cada columna. Ver ejemplo en la columna PROCESO ID, en primera fila se agregó el número 93.

Pag. 28

Finalmente,  el  usuario  podrá  hacer  clic  en  el  botón:  Transmitir  Archivo  Plano  y  obtener  la

información en un archivo en formato Excel en su PC.

Pag. 29


