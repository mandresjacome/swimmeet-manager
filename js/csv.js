/**
 * Lectura de CSV (coma, punto y coma o tabulador; comillas y BOM) e importación
 * de participantes: columnas nombre, club, género y categoría.
 */

const PARTICIPANTS_CSV_TEMPLATE = 'nombre,club,genero,categoria\nAna Pérez,Delfines,F,Infantil A\nLuis Gómez,Tiburones,M,Juvenil A\n';

const MAX_IMPORT_ROWS = 2000;

function detectDelimiter(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let quoted = false;
    for (const char of text.replace(/^(?:[^\S\r\n]*\r?\n)+/, '')) {
        if (char === '"') quoted = !quoted;
        if (quoted) continue;
        if (char === '\n' || char === '\r') break;
        if (Object.hasOwn(counts, char)) counts[char]++;
    }
    return Object.keys(counts).reduce((best, char) => counts[char] > counts[best] ? char : best);
}

/** Convierte texto CSV en una matriz de filas (ignora filas vacías). */
function parseCsv(text) {
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(source);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (quoted) {
            if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
            else if (char === '"') quoted = false;
            else field += char;
        } else if (char === '"') {
            quoted = true;
        } else if (char === delimiter) {
            row.push(field); field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && source[i + 1] === '\n') i++;
            row.push(field); field = '';
            rows.push(row); row = [];
        } else {
            field += char;
        }
    }
    if (quoted) throw new SyntaxError('El CSV contiene un campo con comillas sin cerrar');
    row.push(field);
    rows.push(row);

    return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function normalizeHeader(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function normalizeGender(value) {
    const v = normalizeHeader(value);
    if (['f', 'femenino', 'mujer', 'female', 'w'].includes(v)) return 'F';
    if (['m', 'masculino', 'hombre', 'male'].includes(v)) return 'M';
    return '';
}

const PARTICIPANT_COLUMNS = {
    name: ['nombre', 'name', 'nadador', 'participante'],
    club: ['club', 'equipo', 'team', 'club/equipo'],
    gender: ['genero', 'sexo', 'gender', 'rama'],
    category: ['categoria', 'category']
};

/**
 * Interpreta un CSV de participantes. Devuelve { participants, errors }.
 * Cada participante: { name, club, gender ('F'|'M'|''), category (texto, opcional) }.
 */
function parseParticipantsCsv(text) {
    let rows;
    try {
        rows = parseCsv(text);
    } catch (error) {
        return { participants: [], errors: [error.message] };
    }
    const errors = [];
    if (rows.length === 0) return { participants: [], errors: ['El archivo está vacío'] };

    const firstRow = rows[0].map(normalizeHeader);
    const hasHeader = firstRow.some(cell => PARTICIPANT_COLUMNS.name.includes(cell));
    const columnIndex = { name: 0, club: 1, gender: 2, category: 3 };
    if (hasHeader) {
        for (const field of Object.keys(PARTICIPANT_COLUMNS)) {
            columnIndex[field] = firstRow.findIndex(cell => PARTICIPANT_COLUMNS[field].includes(cell));
        }
    }

    const dataRows = hasHeader ? rows.slice(1) : rows;
    if (dataRows.length > MAX_IMPORT_ROWS) {
        return { participants: [], errors: [`El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas`] };
    }

    const cell = (row, field) => (columnIndex[field] >= 0 ? (row[columnIndex[field]] ?? '').trim() : '');
    const participants = [];
    dataRows.forEach((row, i) => {
        const line = i + (hasHeader ? 2 : 1);
        const name = cell(row, 'name');
        if (!name) { errors.push(`Fila ${line}: falta el nombre`); return; }

        const genderText = cell(row, 'gender');
        const gender = normalizeGender(genderText);
        if (genderText && !gender) errors.push(`Fila ${line}: género "${genderText}" no reconocido (se deja sin especificar)`);
        participants.push({ name, club: cell(row, 'club'), gender, category: cell(row, 'category') });
    });

    return { participants, errors };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseCsv, parseParticipantsCsv, PARTICIPANTS_CSV_TEMPLATE };
}
