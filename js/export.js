/**
 * Exportación e importación de datos: respaldo JSON completo y archivos CSV.
 * Requiere utils.js (downloadFile, readFileAsText, toast, formatTime, normalizeText) y database.js.
 */

class DataExporter {
    static get CSV_BOM() { return '\uFEFF'; }
    static get CSV_MIME() { return 'text/csv;charset=utf-8'; }
    static get MAX_REPORTED_PROBLEMS() { return 3; }

    // ===================== Respaldo JSON =====================

    static exportJSON() {
        const json = JSON.stringify(db.exportData(), null, 2);
        downloadFile(json, this.fileName('respaldo', 'json'), 'application/json');
        toast('Respaldo descargado', 'success');
        return true;
    }

    /**
     * Lee un respaldo JSON y lo importa. Resuelve con el conteo de registros
     * guardados; rechaza con un Error de mensaje legible si algo falla.
     */
    static async importJSON(file) {
        if (!file) throw new Error('Selecciona un archivo de respaldo');

        const data = this.parseBackup(await readFileAsText(file));
        const { valid, errors } = db.validateImportData(data);
        if (!valid) throw new Error(this.describeProblems(errors));
        if (!db.importData(data)) {
            throw new Error('No se pudo guardar el respaldo (¿almacenamiento del navegador lleno?). Tus datos actuales no se modificaron.');
        }

        const { categories, events, participants, entries, results } = db.getStats();
        return { categories, events, participants, entries, results };
    }

    static parseBackup(text) {
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error('El archivo no es un JSON válido. Usa un respaldo descargado desde esta aplicación.');
        }
    }

    static describeProblems(errors) {
        const shown = errors.slice(0, DataExporter.MAX_REPORTED_PROBLEMS).join('; ');
        const hidden = errors.length - DataExporter.MAX_REPORTED_PROBLEMS;
        return `El respaldo no es válido: ${shown}${hidden > 0 ? ` (y ${hidden} problema${hidden === 1 ? '' : 's'} más)` : ''}`;
    }

    // ===================== CSV =====================

    /** Filtros opcionales: { eventId, categoryId, status, query }. */
    static exportResultsCSV(filters = {}) {
        const rows = this.filterResultRows(db.getResultRows(filters), filters);
        const header = ['Categoría', 'Prueba', 'Posición', 'Participante', 'Club', 'Género', 'Serie', 'Carril', 'Tiempo', 'Segundos', 'Estado'];
        const body = rows.map(row => [
            row.category_name, row.event_name, row.position, row.participant_name, row.club, row.gender,
            row.heat || '', row.lane || '', row.status === 'OK' ? formatTime(row.time) : '', row.time ?? '', row.status
        ]);
        return this.downloadCSV('resultados', header, body, 'No hay resultados para exportar');
    }

    static exportParticipantsCSV() {
        const header = ['ID', 'Nombre', 'Club o equipo', 'Género'];
        const body = db.getParticipants().map(p => [p.participant_id, p.name, p.club_or_team, p.gender]);
        return this.downloadCSV('participantes', header, body, 'No hay participantes para exportar');
    }

    static exportEntriesCSV() {
        const participants = new Map(db.getParticipants().map(p => [p.participant_id, p]));
        const events = new Map(db.getEvents().map(e => [e.event_id, e]));
        const categories = new Map(db.getCategories().map(c => [c.category_id, c]));
        const header = ['Categoría', 'Prueba', 'Participante', 'Club', 'Serie', 'Carril'];
        const body = db.getEntries().map(entry => {
            const event = events.get(entry.event_id);
            const participant = participants.get(entry.participant_id);
            return [
                categories.get(event?.category_id)?.category_name ?? '',
                event?.event_name ?? '',
                participant?.name ?? '',
                participant?.club_or_team ?? '',
                entry.heat || '',
                entry.lane || ''
            ];
        });
        return this.downloadCSV('inscripciones', header, body, 'No hay inscripciones para exportar');
    }

    /** Aplica el estado y la búsqueda (sin tildes) sobre filas de db.getResultRows(). */
    static filterResultRows(rows, { status = '', query = '' } = {}) {
        const needle = normalizeText(query);
        return rows.filter(row => {
            if (status && row.status !== status) return false;
            return !needle || normalizeText(`${row.participant_name} ${row.club}`).includes(needle);
        });
    }

    static downloadCSV(kind, header, body, emptyMessage) {
        if (body.length === 0) {
            toast(emptyMessage, 'warning');
            return false;
        }
        downloadFile(this.toCSV([header, ...body]), this.fileName(kind, 'csv'), DataExporter.CSV_MIME);
        toast(`Archivo CSV descargado (${body.length} filas)`, 'success');
        return true;
    }

    static toCSV(rows) {
        return DataExporter.CSV_BOM + rows.map(row => row.map(cell => this.csvCell(cell)).join(',')).join('\r\n') + '\r\n';
    }

    /** Escapa una celda: comillas RFC 4180 y prefijo ' contra inyección de fórmulas en texto. */
    static csvCell(value) {
        let text = value === null || value === undefined ? '' : String(value);
        if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    // ===================== Nombres de archivo =====================

    /** "Copa Demo 2025" + "resultados" → "copa-demo-2025-resultados-2025-11-02.csv" */
    static fileName(kind, extension) {
        const slug = this.slugify(db.getEventConfig().name) || 'evento';
        return `${slug}-${kind}-${this.todayISO()}.${extension}`;
    }

    static slugify(text) {
        return normalizeText(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    static todayISO() {
        const now = new Date();
        const pad = number => String(number).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
}
