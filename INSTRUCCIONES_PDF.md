# PDFs de resultados y subida a Google Drive

## Generar el PDF

1. Abre **Resultados** (`resultados.html`).
2. Opcional: filtra por categoría o prueba. El PDF respeta esos dos filtros; sin filtros incluye todo.
3. Pulsa **Descargar PDF**.

El PDF lleva el nombre del evento (de **Ajustes**), un podio y la tabla completa por prueba, encabezado repetido en cada página y numeración. Siempre se descarga en tu equipo.

## Subida automática a Google Drive (opcional)

La subida usa un **Google Apps Script** tuyo; no se necesita ninguna clave ni cuenta de servicio en el repositorio.

1. Entra a [script.google.com](https://script.google.com) y crea un proyecto.
2. Pega este código y cambia `FOLDER_ID` por el ID de tu carpeta de Drive (la parte final de su URL):

```javascript
const FOLDER_ID = 'ID_DE_TU_CARPETA';
const MAX_BASE64_LENGTH = 10 * 1024 * 1024; // ~7 MB de PDF

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (typeof data.content !== 'string' || data.content.length > MAX_BASE64_LENGTH) {
      throw new Error('Contenido inválido o demasiado grande');
    }
    // Nombre saneado: el cliente no controla rutas ni extensiones
    const filename = String(data.filename || 'resultados.pdf')
      .replace(/[^\w.\- ]/g, '_')
      .slice(0, 120);

    const blob = Utilities.newBlob(
      Utilities.base64Decode(data.content),
      'application/pdf',
      filename
    );
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: file.getId(),
      url: file.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. **Implementar → Nueva implementación → Aplicación web**, ejecutar como *tú* y acceso *Cualquier persona*.
4. Copia la URL generada y pégala en `js/config.js`:

```javascript
window.APP_CONFIG = {
    APPS_SCRIPT_URL: 'TU_URL_AQUI'
};
```

La aplicación envía `{ filename, content }` (PDF en base64) como `text/plain` y solo da la subida por buena si el script responde `{ "success": true }`; en cualquier otro caso (error del script, HTTP, red o más de 30 s) lo informa y el PDF queda descargado igualmente.

En **Ajustes → Subida de PDFs a Google Drive** verás si la URL está configurada.

## Seguridad

- **Nunca** subas claves privadas ni JSON de cuentas de servicio al repositorio. Este proyecto no las necesita.
- La carpeta de destino vive **dentro del Apps Script**, no en el navegador: quien conozca la URL no puede elegir otra carpeta de tu Drive.
- Un Web App con acceso "Cualquier persona" acepta archivos de quien tenga la URL. Mantén tu URL fuera de repositorios públicos (por eso `js/config.js` va vacío) y, si se filtra, crea una implementación nueva.
- Si una clave se expuso alguna vez en Git, bórrala del código **y revócala** en Google Cloud (IAM → Cuentas de servicio → Claves): eliminarla de un archivo no la invalida.
