/* exported ResultsPdf */
/**
 * Generación del PDF de resultados (jsPDF) con subida opcional a Google Drive.
 * Requiere utils.js, database.js y, si se quiere subir, js/config.js (APP_CONFIG.APPS_SCRIPT_URL).
 * resultados.html carga jsPDF desde js/vendor antes de este script.
 */

const PDF_STATUS_LABELS = { OK: 'Válido', DQ: 'Descalificado', DNS: 'No se presentó', DNF: 'No terminó' };
const PDF_UPLOAD_TIMEOUT_MS = 30000;
const PDF_PAGE = { width: 210, margin: 15, footerY: 287, bottom: 280 };
const PDF_COLORS = {
    brand: [7, 42, 71],
    accent: [11, 92, 171],
    soft: [238, 246, 253],
    zebra: [247, 249, 252],
    line: [221, 229, 238],
    text: [23, 34, 45],
    muted: [91, 107, 123],
    medals: { 1: [242, 183, 5], 2: [170, 180, 190], 3: [201, 128, 60] }
};
const PDF_TABLE_COLUMNS = [
    { title: 'Pos', width: 12, align: 'center' },
    { title: 'Participante', width: 52 },
    { title: 'Club', width: 44 },
    { title: 'Serie', width: 13, align: 'center' },
    { title: 'Carril', width: 14, align: 'center' },
    { title: 'Tiempo', width: 20, align: 'right' },
    { title: 'Estado', width: 25 }
];
const PDF_ROW_HEIGHT = 6.2;
const PDF_TABLE_HEADER_HEIGHT = PDF_ROW_HEIGHT + 0.8;
const PDF_PODIUM_ROW_HEIGHT = 10;

/** Helvetica estándar solo cubre Latin-1: se normalizan guiones y se descartan emojis y símbolos fuera de rango. */
function pdfText(value) {
    return String(value ?? '')
        .normalize('NFC')
        .replace(/[\u00A0\u2000-\u200B\u202F]/g, ' ')
        .replace(/[\u2010-\u2015\u2212]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, '')
        .replace(/ {2,}/g, ' ')
        .trim();
}

/** Escritor secuencial sobre jsPDF: lleva la posición vertical y los saltos de página. */
class PdfWriter {
    constructor(jsPDF) {
        this.doc = new jsPDF({ unit: 'mm', format: 'a4' });
        this.doc.setFont('helvetica', 'normal');
        this.y = PDF_PAGE.margin;
        this.contentWidth = PDF_PAGE.width - PDF_PAGE.margin * 2;
    }

    get left() { return PDF_PAGE.margin; }
    get right() { return PDF_PAGE.width - PDF_PAGE.margin; }

    ensureSpace(height, onNewPage) {
        if (this.y + height <= PDF_PAGE.bottom) return false;
        this.doc.addPage();
        this.y = PDF_PAGE.margin;
        if (onNewPage) onNewPage();
        return true;
    }

    style({ size, bold = false, color = PDF_COLORS.text }) {
        this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
        this.doc.setFontSize(size);
        this.doc.setTextColor(...color);
    }

    /** Recorta con puntos suspensivos para que el texto quepa en `width` mm. */
    fit(text, width) {
        const clean = pdfText(text);
        if (this.doc.getTextWidth(clean) <= width) return clean;
        let end = clean.length;
        while (end > 1 && this.doc.getTextWidth(`${clean.slice(0, end)}...`) > width) end--;
        return `${clean.slice(0, end).trimEnd()}...`;
    }

    text(text, x, baseline, align = 'left') {
        this.doc.text(pdfText(text), x, baseline, { align });
    }

    fillRect(x, y, width, height, color) {
        this.doc.setFillColor(...color);
        this.doc.rect(x, y, width, height, 'F');
    }

    drawHeader({ name, subtitle, details }) {
        this.style({ size: 20, bold: true, color: [255, 255, 255] });
        const nameLines = this.doc.splitTextToSize(pdfText(name), this.contentWidth - 4).slice(0, 2);
        const bandHeight = 12 + nameLines.length * 8.5 + (subtitle ? 8 : 0);
        this.fillRect(0, 0, PDF_PAGE.width, bandHeight, PDF_COLORS.brand);

        this.doc.text(nameLines, this.left, 16);
        if (subtitle) {
            this.style({ size: 11, color: [190, 215, 240] });
            this.text(this.fit(subtitle, this.contentWidth), this.left, 16 + nameLines.length * 8.5 - 1);
        }
        this.y = bandHeight + 7;

        if (details) {
            this.style({ size: 9.5, color: PDF_COLORS.muted });
            this.text(this.fit(details, this.contentWidth), this.left, this.y);
            this.y += 8;
        }
    }

    drawCategoryTitle(name) {
        this.style({ size: 14, bold: true, color: PDF_COLORS.brand });
        this.text(name || 'Sin categoría', this.left, this.y + 5);
        this.doc.setDrawColor(...PDF_COLORS.accent);
        this.doc.setLineWidth(0.5);
        this.doc.line(this.left, this.y + 7.5, this.right, this.y + 7.5);
        this.y += 13;
    }

    drawEventTitle(name, count) {
        this.fillRect(this.left, this.y, this.contentWidth, 8, PDF_COLORS.soft);
        this.style({ size: 11, bold: true, color: PDF_COLORS.brand });
        this.text(this.fit(name, this.contentWidth - 40), this.left + 3, this.y + 5.5);
        this.style({ size: 9, color: PDF_COLORS.muted });
        this.text(`${count} ${count === 1 ? 'resultado' : 'resultados'}`, this.right - 3, this.y + 5.5, 'right');
        this.y += 11;
    }

    drawContinuation(title, section = '') {
        this.style({ size: 9, color: PDF_COLORS.muted });
        const suffix = section ? ` · ${section} (continuación)` : ' (continuación)';
        const name = this.fit(title, this.contentWidth - this.doc.getTextWidth(suffix));
        this.text(name + suffix, this.left, this.y + 3);
        this.y += 6;
    }

    drawPodium(podiumRows, title) {
        if (podiumRows.length === 0) {
            this.style({ size: 9, color: PDF_COLORS.muted });
            this.text('Sin tiempos válidos en esta prueba.', this.left + 3, this.y + 4);
            this.y += 9;
            return;
        }
        for (const row of podiumRows) {
            this.ensureSpace(PDF_PODIUM_ROW_HEIGHT, () => this.drawContinuation(title, 'podio'));
            this.drawPodiumRow(row);
        }
        this.y += 3;
    }

    drawPodiumRow(row) {
        const middle = this.y + PDF_PODIUM_ROW_HEIGHT / 2;
        this.doc.setFillColor(...PDF_COLORS.medals[row.position]);
        this.doc.circle(this.left + 7, middle, 3.4, 'F');
        this.style({ size: 10, bold: true, color: [255, 255, 255] });
        this.text(row.position, this.left + 7, middle + 1.2, 'center');

        this.style({ size: 10.5, bold: true });
        this.text(this.fit(row.participant_name, 110), this.left + 14, this.y + 4.2);
        this.style({ size: 8.5, color: PDF_COLORS.muted });
        this.text(this.fit(row.club || 'Sin club', 110), this.left + 14, this.y + 8.2);
        this.style({ size: 11, bold: true, color: PDF_COLORS.accent });
        this.text(formatTime(row.time), this.right - 3, middle + 1.4, 'right');

        this.doc.setDrawColor(...PDF_COLORS.line);
        this.doc.setLineWidth(0.2);
        this.doc.line(this.left, this.y + PDF_PODIUM_ROW_HEIGHT, this.right, this.y + PDF_PODIUM_ROW_HEIGHT);
        this.y += PDF_PODIUM_ROW_HEIGHT;
    }

    cellX(index, align) {
        const start = PDF_TABLE_COLUMNS.slice(0, index).reduce((sum, col) => sum + col.width, this.left);
        const width = PDF_TABLE_COLUMNS[index].width;
        if (align === 'center') return start + width / 2;
        return align === 'right' ? start + width - 2 : start + 2;
    }

    drawTableHeader() {
        this.fillRect(this.left, this.y, this.contentWidth, PDF_TABLE_HEADER_HEIGHT, PDF_COLORS.accent);
        this.style({ size: 8.5, bold: true, color: [255, 255, 255] });
        PDF_TABLE_COLUMNS.forEach((col, i) => this.text(col.title, this.cellX(i, col.align), this.y + 4.8, col.align));
        this.y += PDF_TABLE_HEADER_HEIGHT;
    }

    drawTableRow(row, index) {
        if (index % 2 === 1) this.fillRect(this.left, this.y, this.contentWidth, PDF_ROW_HEIGHT, PDF_COLORS.zebra);
        const isValid = row.status === 'OK';
        const cells = [
            isValid ? row.position : '-',
            row.participant_name,
            row.club || '-',
            row.heat || '-',
            row.lane || '-',
            isValid ? formatTime(row.time) : '-',
            PDF_STATUS_LABELS[row.status] || row.status
        ];
        const baseline = this.y + 4.4;
        cells.forEach((cell, i) => {
            const col = PDF_TABLE_COLUMNS[i];
            const isTime = i === 5;
            this.style({ size: 8.5, bold: isTime && isValid, color: row.status === 'OK' ? PDF_COLORS.text : PDF_COLORS.muted });
            this.text(this.fit(cell, col.width - 4), this.cellX(i, col.align), baseline, col.align);
        });
        this.y += PDF_ROW_HEIGHT;
    }

    /** Tabla completa; al saltar de página repite el encabezado y rotula la continuación. */
    drawTable(rows, continuationTitle) {
        this.ensureSpace(PDF_TABLE_HEADER_HEIGHT + PDF_ROW_HEIGHT, () => this.drawContinuation(continuationTitle));
        this.drawTableHeader();
        rows.forEach((row, index) => {
            this.ensureSpace(PDF_ROW_HEIGHT, () => {
                this.drawContinuation(continuationTitle);
                this.drawTableHeader();
            });
            this.drawTableRow(row, index);
        });
        this.y += 8;
    }

    /** Pie de cada página: evento, fecha de generación y "Página i de n". */
    drawFooters(label) {
        const pages = this.doc.getNumberOfPages();
        for (let page = 1; page <= pages; page++) {
            this.doc.setPage(page);
            this.doc.setDrawColor(...PDF_COLORS.line);
            this.doc.setLineWidth(0.3);
            this.doc.line(this.left, PDF_PAGE.footerY - 4, this.right, PDF_PAGE.footerY - 4);
            this.style({ size: 8, color: PDF_COLORS.muted });
            this.text(this.fit(label, 140), this.left, PDF_PAGE.footerY);
            this.text(`Página ${page} de ${pages}`, this.right, PDF_PAGE.footerY, 'right');
        }
    }
}

const ResultsPdf = {
    /**
     * Genera, descarga y (si hay APPS_SCRIPT_URL) sube el PDF de resultados.
     * Filtros: { eventId } (una prueba), { categoryId } (una categoría) o ninguno (todo).
     * Nunca lanza: informa con toast y devuelve { ok, uploaded, reason }.
     * `reason` es un texto legible si algo falló, o 'not-configured' si la subida a Drive está desactivada.
     */
    async generate({ eventId, categoryId } = {}) {
        try {
            const rows = db.getResultRows({ eventId, categoryId });
            if (rows.length === 0) return this.fail('No hay resultados para exportar', 'warning');

            const jsPDF = window.jspdf?.jsPDF;
            if (!jsPDF) return this.fail('No se pudo cargar jsPDF', 'error');
            // Cede el hilo para que la interfaz pinte el estado "Generando…" antes del trabajo pesado
            await new Promise(resolve => setTimeout(resolve, 30));

            const doc = this.buildDocument(jsPDF, rows, { eventId, categoryId });
            const blob = doc.output('blob');
            const filename = this.buildFileName({ eventId, categoryId });
            downloadFile(blob, filename, 'application/pdf');

            const upload = await this.upload(blob, filename);
            this.reportOutcome(upload);
            return { ok: true, uploaded: upload.ok, reason: upload.ok ? null : upload.reason };
        } catch (error) {
            return this.fail(`No se pudo generar el PDF: ${error.message}`, 'error');
        }
    },

    fail(reason, type) {
        toast(reason, type);
        return { ok: false, uploaded: false, reason };
    },

    reportOutcome(upload) {
        if (upload.ok) toast('PDF descargado y subido a Google Drive', 'success');
        else if (upload.reason === 'not-configured') toast('PDF descargado', 'success');
        else toast(`PDF descargado, pero no se pudo subir a Drive: ${upload.reason}`, 'warning', 6000);
    },

    buildDocument(jsPDF, rows, filters) {
        const config = db.getEventConfig();
        const writer = new PdfWriter(jsPDF);
        writer.drawHeader({
            name: config.name,
            subtitle: `Resultados · ${this.describeScope(filters)}`,
            details: [formatDate(config.date), config.venue, config.city].filter(Boolean).join(' · ')
        });

        let currentCategory = null;
        this.groupByEvent(rows).forEach(group => {
            const { category_id, category_name, event_name } = group[0];
            const podium = group.filter(row => row.status === 'OK' && row.position <= 3);
            const podiumHeight = podium.length ? podium.length * PDF_PODIUM_ROW_HEIGHT + 3 : 9;

            const startsCategory = category_id !== currentCategory;
            const titleHeight = (startsCategory ? 13 : 0) + 11;
            const tableStart = PDF_TABLE_HEADER_HEIGHT + PDF_ROW_HEIGHT;
            const wholeStart = titleHeight + podiumHeight + tableStart;
            const firstRow = podium.length ? PDF_PODIUM_ROW_HEIGHT : podiumHeight + tableStart;
            writer.ensureSpace(wholeStart <= PDF_PAGE.bottom - PDF_PAGE.margin ? wholeStart : titleHeight + firstRow);
            if (startsCategory) {
                currentCategory = category_id;
                writer.drawCategoryTitle(category_name);
            }
            writer.drawEventTitle(event_name, group.length);
            writer.drawPodium(podium, event_name);
            writer.drawTable(group, event_name);
        });

        const generated = new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
        writer.drawFooters(`${config.name} · Generado el ${generated}`);
        return writer.doc;
    },

    groupByEvent(rows) {
        const groups = new Map();
        rows.forEach(row => {
            if (!groups.has(row.event_id)) groups.set(row.event_id, []);
            groups.get(row.event_id).push(row);
        });
        return [...groups.values()];
    },

    describeScope({ eventId, categoryId }) {
        const event = eventId && db.getEventById(eventId);
        if (event) return `${event.event_name} (${db.getCategoryById(event.category_id)?.category_name || 'Sin categoría'})`;
        const category = categoryId && db.getCategoryById(categoryId);
        return category ? category.category_name : 'Todas las categorías';
    },

    buildFileName({ eventId, categoryId }) {
        const event = eventId && db.getEventById(eventId);
        const category = categoryId && db.getCategoryById(categoryId);
        const scope = event ? event.event_name : category ? category.category_name : '';
        const parts = [db.getEventConfig().name, scope, 'resultados'].map(this.slugify).filter(Boolean);
        return `${parts.join('-')}-${this.todayISO()}.pdf`;
    },

    slugify(text) {
        return normalizeText(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    },

    todayISO() {
        const now = new Date();
        const pad = number => String(number).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    },

    /**
     * Sube el PDF mediante un Google Apps Script (ver INSTRUCCIONES_PDF.md). Solo cuenta como
     * subido si el script responde { success: true }. Se envía como text/plain para evitar el
     * preflight CORS. La respuesta debe permitir la lectura desde el origen de la app.
     */
    async upload(blob, filename) {
        const url = (window.APP_CONFIG || {}).APPS_SCRIPT_URL;
        if (!url) return { ok: false, reason: 'not-configured' };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PDF_UPLOAD_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ filename, content: await this.toBase64(blob) }),
                signal: controller.signal
            });
            if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };

            const data = await response.json();
            if (data.success !== true) return { ok: false, reason: data.error || 'El script no confirmó la subida' };
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: error.name === 'AbortError' ? 'Tiempo de espera agotado' : error.message };
        } finally {
            clearTimeout(timer);
        }
    },

    toBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }
};
