/** Ajustes: datos del evento, plantillas, demo, copias de seguridad y borrado. */

const REPEATERS = {
    schedule: { container: 'scheduleRows', fields: [['time', 'Hora', 'time'], ['label', 'Actividad', 'text']], empty: { time: '', label: '' } },
    contacts: { container: 'contactRows', fields: [['name', 'Nombre', 'text'], ['role', 'Cargo', 'text'], ['phone', 'Teléfono', 'tel'], ['email', 'Correo', 'email']], empty: { name: '', role: '', phone: '', email: '' } }
};

document.addEventListener('DOMContentLoaded', () => {
    Layout.init('ajustes', 'Ajustes');
    fillEventForm();
    renderTemplates();
    renderDriveStatus();
    initActions();
});

// ===================== Datos del evento =====================

function fillEventForm() {
    const config = db.getEventConfig();
    const form = document.getElementById('eventForm');

    ['name', 'organizer', 'venue', 'city', 'date', 'startTime', 'lanes', 'poolLength', 'description'].forEach(field => {
        form.elements[field].value = config[field];
    });
    form.elements.rules.value = config.rules.join('\n');
    renderRows('schedule', config.schedule);
    renderRows('contacts', config.contacts);
}

function renderRows(key, items) {
    const { container, fields } = REPEATERS[key];
    document.getElementById(container).innerHTML = html`${items.map((item, i) => html`
        <div class="repeater-row" data-row="${key}">
            ${fields.map(([field, label, type]) => html`
                <input type="${type}" data-field="${field}" aria-label="${label}" placeholder="${label}" value="${item[field]}">`)}
            <button type="button" class="btn btn-ghost danger btn-sm" data-action="remove-row" data-key="${key}" data-index="${i}" aria-label="Quitar fila">Quitar</button>
        </div>`)}`;
}

// Lee los campos tal cual (incluye filas vacías, para no perder las que se están editando)
function readRowsRaw(key) {
    return [...document.querySelectorAll(`[data-row="${key}"]`)].map(row =>
        Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value])));
}

// Filas con contenido y sin espacios sobrantes (lo que se guarda)
function readRows(key) {
    return readRowsRaw(key)
        .map(row => Object.fromEntries(Object.entries(row).map(([field, text]) => [field, text.trim()])))
        .filter(row => Object.values(row).some(Boolean));
}

function saveEventForm(event) {
    event.preventDefault();
    const form = event.target;
    const value = name => form.elements[name].value;

    const result = db.saveEventConfig({
        name: value('name'),
        organizer: value('organizer').trim(),
        venue: value('venue').trim(),
        city: value('city').trim(),
        date: value('date'),
        startTime: value('startTime'),
        lanes: parseInt(value('lanes'), 10),
        poolLength: parseInt(value('poolLength'), 10),
        description: value('description').trim(),
        rules: value('rules').split('\n').map(line => line.trim()).filter(Boolean),
        schedule: readRows('schedule'),
        contacts: readRows('contacts')
    });

    if (result.error) {
        toast(result.error, 'error');
        return;
    }
    Layout.init('ajustes', 'Ajustes');
    toast('Datos del evento guardados', 'success');
}

// ===================== Plantillas =====================

function renderTemplates() {
    document.getElementById('templates').innerHTML = html`${SWIM_TEMPLATES.map(template => {
        const events = template.categories.reduce((sum, c) => sum + c.events.length, 0);
        return html`
            <div class="card mb-0">
                <div class="card-body">
                    <h3>${template.name}</h3>
                    <p class="small muted">${template.description}</p>
                    <p class="small">${template.categories.length} categorías · ${events} pruebas</p>
                    <button type="button" class="btn btn-sm btn-primary" data-action="apply-template" data-id="${template.id}">Aplicar</button>
                </div>
            </div>`;
    })}`;
}

function applyTemplateAction(id) {
    const created = applyTemplate(db, id);
    if (created.error) { toast(created.error, 'error'); return; }
    toast(created.categories || created.events
        ? `Se agregaron ${created.categories} categorías y ${created.events} pruebas`
        : 'La plantilla ya estaba aplicada; no hubo cambios', created.categories || created.events ? 'success' : 'info');
}

// ===================== Drive =====================

function renderDriveStatus() {
    const configured = Boolean(window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL);
    const badge = document.getElementById('driveStatus');
    badge.textContent = configured ? 'Configurado' : 'No configurado';
    badge.className = 'badge' + (configured ? ' ok' : '');
}

// ===================== Acciones =====================

async function confirmDanger(title, message, confirmText) {
    return confirmDialog({ title, message, confirmText, danger: true });
}

function initActions() {
    document.getElementById('eventForm').addEventListener('submit', saveEventForm);

    const handlers = {
        'add-schedule': () => addRow('schedule'),
        'add-contact': () => addRow('contacts'),
        'remove-row': el => removeRow(el.dataset.key, Number(el.dataset.index)),
        'apply-template': el => applyTemplateAction(el.dataset.id),
        'demo': el => loadDemo(el.dataset.results === 'true'),
        'export-json': () => DataExporter.exportJSON(),
        'import-json': () => document.getElementById('importFile').click(),
        'clear-results': clearResults,
        'clear-data': clearData,
        'reset-all': resetAll
    };
    on(document.querySelector('main'), 'click', '[data-action]', el => handlers[el.dataset.action]?.(el));
    document.getElementById('importFile').addEventListener('change', importBackup);
}

function addRow(key) {
    renderRows(key, [...readRowsRaw(key), { ...REPEATERS[key].empty }]);
}

function removeRow(key, index) {
    renderRows(key, readRowsRaw(key).filter((_, i) => i !== index));
}

async function loadDemo(withResults) {
    const hasData = db.getStats().participants > 0 || db.getStats().categories > 0;
    if (hasData && !await confirmDanger('Cargar demo', 'Esto reemplazará los datos actuales por un evento de demostración. ¿Continuar?', 'Reemplazar')) return;

    const summary = loadDemoEvent(db, { withResults });
    fillEventForm();
    Layout.init('ajustes', 'Ajustes');
    toast(`Demo cargada: ${summary.participants} participantes y ${summary.entries} inscripciones`, 'success');
}

async function importBackup(event) {
    const input = event.target;
    const file = input.files[0];
    input.value = '';
    if (!file) return;

    if (!await confirmDanger('Importar copia', 'Los datos incluidos en el archivo reemplazarán a los actuales. ¿Continuar?', 'Importar')) return;
    try {
        await DataExporter.importJSON(file);
        fillEventForm();
        Layout.init('ajustes', 'Ajustes');
        toast('Copia importada correctamente', 'success');
    } catch (error) {
        toast(error.message, 'error', 6000);
    }
}

async function clearResults() {
    if (!await confirmDanger('Borrar resultados', 'Se eliminarán todos los tiempos y estados. Participantes, pruebas e inscripciones se conservan.', 'Borrar resultados')) return;
    db.clearResults();
    toast('Resultados eliminados', 'success');
}

async function clearData() {
    if (!await confirmDanger('Borrar datos', 'Se eliminarán categorías, pruebas, participantes, inscripciones y resultados. Los datos del evento se conservan.', 'Borrar datos')) return;
    db.clearAllData({ keepConfig: true });
    toast('Datos eliminados', 'success');
}

async function resetAll() {
    if (!await confirmDanger('Restablecer todo', 'Se eliminará TODO, incluidos los datos del evento. La aplicación quedará como nueva.', 'Restablecer')) return;
    db.clearAllData();
    fillEventForm();
    Layout.init('ajustes', 'Ajustes');
    toast('Aplicación restablecida', 'success');
}
