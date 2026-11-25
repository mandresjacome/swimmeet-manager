# PDF de resultados y Google Drive

## Generar el PDF

1. Abre **Resultados**.
2. Selecciona una categoría o prueba si quieres acotar el informe.
3. Pulsa **Descargar PDF**.

El informe incluye el podio y la tabla completa de cada prueba seleccionada. Los podios con empates pueden ocupar varias páginas. Las tablas repiten su encabezado al continuar y todas las páginas llevan numeración. El filtro de estado y la búsqueda se aplican al CSV. El PDF se genera en el navegador con la copia local de jsPDF y siempre se descarga en el equipo.

## Configurar la subida opcional

La integración viene desactivada. Si decides usarla, crea un proyecto en [Google Apps Script](https://script.google.com) y pega el ejemplo con el ID de una carpeta dedicada de Drive.

```javascript
const FOLDER_ID = 'ID_DE_TU_CARPETA';
const MAX_PDF_BYTES = 7 * 1024 * 1024;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_PDF_BYTES / 3);

function doPost(e) {
  let upload;
  try {
    upload = readPdfUpload(e && e.postData && e.postData.contents);
  } catch (error) {
    return jsonResponse({ success: false, error: error.message });
  }

  try {
    const blob = Utilities.newBlob(upload.bytes, 'application/pdf', upload.filename);
    DriveApp.getFolderById(FOLDER_ID).createFile(blob);
    return jsonResponse({ success: true });
  } catch {
    return jsonResponse({ success: false, error: 'No se pudo guardar el PDF en Drive' });
  }
}

function readPdfUpload(body) {
  if (typeof body !== 'string' || body.length > MAX_BASE64_LENGTH + 1024) {
    throw new Error('Solicitud inválida o demasiado grande');
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('La solicitud debe contener un objeto JSON');
  }

  const filename = data && data.filename;
  const content = data && data.content;
  if (typeof filename !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,239}\.pdf$/i.test(filename)) {
    throw new Error('El nombre del archivo debe ser un nombre simple con extensión .pdf');
  }
  if (typeof content !== 'string' || content.length > MAX_BASE64_LENGTH
      || content.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(content)) {
    throw new Error('Contenido base64 inválido o demasiado grande');
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(content);
  } catch {
    throw new Error('El contenido no se pudo decodificar');
  }
  const header = String.fromCharCode(...bytes.slice(0, 8));
  const tail = String.fromCharCode(...bytes.slice(-1024));
  if (bytes.length > MAX_PDF_BYTES || !/^%PDF-\d\.\d$/.test(header) || !/%%EOF\s*$/.test(tail)) {
    throw new Error('El contenido debe tener una cabecera y un final de PDF válidos');
  }
  return { bytes, filename };
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
```

El ejemplo acepta PDF de hasta 7 MiB. Para usarlo desde la aplicación estática, el despliegue web tendría que admitir acceso anónimo y ejecutarse como el propietario. Evalúa primero los riesgos de esa configuración. Guarda la URL de ejecución únicamente en tu copia local de `js/config.js`, en `APPS_SCRIPT_URL`. Puedes comprobar si hay una URL en **Ajustes → Subida de PDFs a Google Drive**.

La aplicación envía el nombre del archivo y el PDF en base64 con `Content-Type: text/plain`. Confirma la subida cuando puede leer una respuesta JSON con `success: true`. Google Content Service puede redirigir esa respuesta. El navegador debe permitir leerla desde el origen de SwimMeet Manager. Un error de red, permisos o tiempo de espera deja la descarga local disponible. [Documentación de Content Service](https://developers.google.com/apps-script/guides/content)

La integración se verificó con servicios simulados y datos ficticios. La revocación de credenciales históricas sigue pendiente de una comprobación independiente.

## Privacidad y límites

- El despliegue anónimo actúa bajo la identidad y cuotas del propietario. Cualquier persona que obtenga la URL puede intentar subir archivos. Configura una carpeta dedicada con acceso restringido y conserva la URL fuera del repositorio. Una URL incluida en el código servido al navegador es visible para quien pueda abrir la aplicación. [Permisos de aplicaciones web](https://developers.google.com/apps-script/guides/web) · [Cuotas de Apps Script](https://developers.google.com/apps-script/guides/services/quotas)
- El ejemplo comprueba nombre, tamaño, base64 y marcas del formato PDF. Estas comprobaciones no autentican al emisor ni equivalen a analizar el contenido del documento. La exposición de la URL puede consumir almacenamiento y cuota. Si se filtra, archiva el despliegue anterior. [Gestión de despliegues](https://developers.google.com/apps-script/concepts/deployments)
- Los PDF pueden contener nombres, clubes y resultados. Decide quién puede leer la carpeta antes de subir archivos. Las claves históricas requieren confirmación independiente de su revocación en el servicio correspondiente. [Claves de cuentas de servicio](https://docs.cloud.google.com/iam/docs/keys-create-delete)
