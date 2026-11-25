/** Datos: gestión de categorías, pruebas y participantes. */

const PAGE_SIZE = 25;
const TABS = ['categorias', 'pruebas', 'participantes'];

const state = {
    tab: 'categorias',
    page: { categorias: 1, pruebas: 1, participantes: 1 }
};

document.addEventListener('DOMContentLoaded', () => {
    Layout.init('datos', 'Datos');
    initTabs();
    initFilters();
    initActions();
    renderAll();
});

// ===================== Pestañas y filtros =====================

function initTabs() {
    const requested = new URLSearchParams(location.search).get('tab');
    selectTab(TABS.includes(requested) ? requested : 'categorias');
    on(document.querySelector('.tabs'), 'click', '[data-tab]', tab => selectTab(tab.dataset.tab));
}

function selectTab(tab) {
    state.tab = tab;
    TABS.forEach(name => {
        document.getElementById(`tab-${name}`).setAttribute('aria-selected', String(name === tab));
        document.getElementById(`panel-${name}`).hidden = name !== tab;
    });
    history.replaceState(null, '', `?tab=${tab}`);
}

function initFilters() {
    const reset = page => () => { state.page[page] = 1; renderAll(); };
    document.getElementById('eventSearch').addEventListener('input', debounce(reset('pruebas'), 150));
    document.getElementById('eventCategory').addEventListener('change', reset('pruebas'));
    document.getElementById('participantSearch').addEventListener('input', debounce(reset('participantes'), 150));
    document.getElementById('participantClub').addEventListener('change', reset('participantes'));
}

function initActions() {
    const handlers = {
        'new-category': () => categoryForm(),
        'edit-category': el => categoryForm(el.dataset.id),
        'delete-category': el => deleteCategory(el.dataset.id),
        'new-event': () => eventForm(),
        'edit-event': el => eventForm(el.dataset.id),
        'delete-event': el => deleteEvent(el.dataset.id),
        'new-participant': () => participantForm(),
        'edit-participant': el => participantForm(el.dataset.id),
        'delete-participant': el => deleteParticipant(el.dataset.id),
        'import-csv': () => importCsvForm(),
        'page': el => { state.page[el.dataset.table] = Number(el.dataset.page); renderAll(); }
    };
    on(document.querySelector('main'), 'click', '[data-action]', el => handlers[el.dataset.action]?.(el));
}

// ===================== Render =====================

function renderAll() {
    renderCategories();
    renderEvents();
    renderParticipants();
}

function countBy(items, key) {
    const counts = new Map();
    items.forEach(item => counts.set(item[key], (counts.get(item[key]) || 0) + 1));
    return counts;
}

function pagedTable({ table, headers, rows, emptyState }) {
    if (rows.length === 0) return emptyState;

    const pages = Math.ceil(rows.length / PAGE_SIZE);
    const page = Math.min(state.page[table], pages);
    state.page[table] = page;
    const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return html`
        <div class="table-wrap">
            <table>
                <thead><tr>${headers.map(h => html`<th class="${h.cls || ''}">${h.label}</th>`)}</tr></thead>
                <tbody>${visible}</tbody>
            </table>
        </div>
        <div class="table-footer">
            <span>${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}</span>
            ${pages > 1 ? html`
                <span class="flex items-center gap-8">
                    <button type="button" class="btn btn-sm" data-action="page" data-table="${table}" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Anterior</button>
                    Página ${page} de ${pages}
                    <button type="button" class="btn btn-sm" data-action="page" data-table="${table}" data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Siguiente</button>
                </span>` : ''}
        </div>`;
}

function emptyState(title, text, buttonHtml) {
    return html`<div class="empty-state"><h3>${title}</h3><p>${text}</p>${buttonHtml}</div>`;
}

function rowActions(kind, id, label) {
    return html`
        <td class="actions">
            <button type="button" class="btn btn-ghost btn-sm" data-action="edit-${kind}" data-id="${id}" aria-label="Editar ${label}">Editar</button>
            <button type="button" class="btn btn-ghost danger btn-sm" data-action="delete-${kind}" data-id="${id}" aria-label="Eliminar ${label}">Eliminar</button>
        </td>`;
}

function renderCategories() {
    const eventsPerCategory = countBy(db.getEvents(), 'category_id');
    const eventCategory = new Map(db.getEvents().map(e => [e.event_id, e.category_id]));
    const entriesPerCategory = new Map();
    db.getEntries().forEach(entry => {
        const categoryId = eventCategory.get(entry.event_id);
        entriesPerCategory.set(categoryId, (entriesPerCategory.get(categoryId) || 0) + 1);
    });

    const rows = db.getCategories().map(c => html`
        <tr>
            <td><strong>${c.category_name}</strong></td>
            <td class="num">${eventsPerCategory.get(c.category_id) || 0}</td>
            <td class="num">${entriesPerCategory.get(c.category_id) || 0}</td>
            ${rowActions('category', c.category_id, c.category_name)}
        </tr>`);

    document.getElementById('categoriesTable').innerHTML = pagedTable({
        table: 'categorias',
        headers: [{ label: 'Categoría' }, { label: 'Pruebas', cls: 'num' }, { label: 'Inscripciones', cls: 'num' }, { label: '', cls: 'actions' }],
        rows,
        emptyState: emptyState('Aún no hay categorías', 'Crea una a mano o parte de una plantilla con pruebas ya definidas.', html`<a class="btn btn-primary" href="ajustes.html#plantillas">Elegir plantilla</a>`)
    });
}

function renderEvents() {
    const categories = db.getCategories();
    const select = document.getElementById('eventCategory');
    const selected = select.value;
    select.innerHTML = html`<option value="">Todas</option>${categories.map(c => html`<option value="${c.category_id}">${c.category_name}</option>`)}`;
    select.value = categories.some(c => c.category_id === selected) ? selected : '';

    const query = normalizeText(document.getElementById('eventSearch').value);
    const categoryName = new Map(categories.map(c => [c.category_id, c.category_name]));
    const entriesPerEvent = countBy(db.getEntries(), 'event_id');

    const rows = db.getEvents()
        .filter(e => (!select.value || e.category_id === select.value) && normalizeText(e.event_name).includes(query))
        .map(e => html`
            <tr>
                <td><strong>${e.event_name}</strong></td>
                <td>${categoryName.get(e.category_id) || '—'}</td>
                <td class="num">${entriesPerEvent.get(e.event_id) || 0}</td>
                ${rowActions('event', e.event_id, e.event_name)}
            </tr>`);

    const noCategories = categories.length === 0;
    document.getElementById('eventsTable').innerHTML = pagedTable({
        table: 'pruebas',
        headers: [{ label: 'Prueba' }, { label: 'Categoría' }, { label: 'Inscritos', cls: 'num' }, { label: '', cls: 'actions' }],
        rows,
        emptyState: emptyState(
            noCategories ? 'Primero crea una categoría' : 'No hay pruebas para mostrar',
            noCategories ? 'Cada prueba pertenece a una categoría.' : 'Cambia los filtros o agrega una prueba nueva.',
            noCategories ? html`<a class="btn btn-primary" href="?tab=categorias">Ir a categorías</a>` : '')
    });
}

function renderParticipants() {
    const participants = db.getParticipants();
    const clubSelect = document.getElementById('participantClub');
    const selected = clubSelect.value;
    const clubs = [...new Set(participants.map(p => p.club_or_team).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    clubSelect.innerHTML = html`<option value="">Todos</option>${clubs.map(club => html`<option>${club}</option>`)}`;
    clubSelect.value = clubs.includes(selected) ? selected : '';

    const query = normalizeText(document.getElementById('participantSearch').value);
    const entriesPerParticipant = countBy(db.getEntries(), 'participant_id');
    const genderLabel = { F: 'Femenino', M: 'Masculino' };

    const rows = participants
        .filter(p => (!clubSelect.value || p.club_or_team === clubSelect.value)
            && normalizeText(`${p.name} ${p.club_or_team}`).includes(query))
        .map(p => html`
            <tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.club_or_team || '—'}</td>
                <td>${genderLabel[p.gender] || '—'}</td>
                <td class="num">${entriesPerParticipant.get(p.participant_id) || 0}</td>
                ${rowActions('participant', p.participant_id, p.name)}
            </tr>`);

    document.getElementById('participantsTable').innerHTML = pagedTable({
        table: 'participantes',
        headers: [{ label: 'Nombre' }, { label: 'Club' }, { label: 'Género' }, { label: 'Inscripciones', cls: 'num' }, { label: '', cls: 'actions' }],
        rows,
        emptyState: emptyState(
            participants.length ? 'Sin coincidencias' : 'Aún no hay participantes',
            participants.length ? 'Prueba con otra búsqueda o club.' : 'Agrégalos uno a uno o impórtalos desde un archivo CSV.',
            participants.length ? '' : html`<button type="button" class="btn btn-primary" data-action="import-csv">Importar CSV</button>`)
    });
}

// ===================== Formularios =====================

function categoryForm(id) {
    const category = id ? db.getCategoryById(id) : null;
    openForm({
        title: category ? 'Editar categoría' : 'Nueva categoría',
        fields: html`
            <div class="field">
                <label for="f-name">Nombre <span class="req">*</span></label>
                <input type="text" id="f-name" name="name" required maxlength="80" value="${category?.category_name ?? ''}" placeholder="Ej. Infantil A (9-10 años)">
            </div>`,
        onSubmit: ({ name }) => {
            const result = category ? db.updateCategory(id, name) : db.addCategory(name);
            if (result.error) { toast(result.error, 'error'); return false; }
            toast(category ? 'Categoría actualizada' : 'Categoría creada', 'success');
            renderAll();
        }
    });
}

function eventForm(id) {
    const event = id ? db.getEventById(id) : null;
    const categories = db.getCategories();
    if (categories.length === 0) { toast('Primero crea una categoría', 'warning'); selectTab('categorias'); return; }

    openForm({
        title: event ? 'Editar prueba' : 'Nueva prueba',
        fields: html`
            <div class="field">
                <label for="f-name">Nombre <span class="req">*</span></label>
                <input type="text" id="f-name" name="name" required maxlength="80" value="${event?.event_name ?? ''}" placeholder="Ej. 50 m Libre">
            </div>
            <div class="field">
                <label for="f-category">Categoría <span class="req">*</span></label>
                <select id="f-category" name="categoryId" required>
                    ${categories.map(c => html`<option value="${c.category_id}" ${c.category_id === (event?.category_id ?? document.getElementById('eventCategory').value) ? 'selected' : ''}>${c.category_name}</option>`)}
                </select>
            </div>`,
        onSubmit: ({ name, categoryId }) => {
            const result = event ? db.updateEvent(id, name, categoryId) : db.addEvent(name, categoryId);
            if (result.error) { toast(result.error, 'error'); return false; }
            toast(event ? 'Prueba actualizada' : 'Prueba creada', 'success');
            renderAll();
        }
    });
}

function participantForm(id) {
    const participant = id ? db.getParticipantById(id) : null;
    const categories = db.getCategories();
    const clubs = [...new Set(db.getParticipants().map(p => p.club_or_team).filter(Boolean))];

    openForm({
        title: participant ? 'Editar participante' : 'Nuevo participante',
        fields: html`
            <div class="field">
                <label for="f-name">Nombre completo <span class="req">*</span></label>
                <input type="text" id="f-name" name="name" required maxlength="100" value="${participant?.name ?? ''}">
            </div>
            <div class="form-grid">
                <div class="field">
                    <label for="f-club">Club o equipo</label>
                    <input type="text" id="f-club" name="club" maxlength="60" list="clubOptions" value="${participant?.club_or_team ?? ''}">
                    <datalist id="clubOptions">${clubs.map(club => html`<option value="${club}"></option>`)}</datalist>
                </div>
                <div class="field">
                    <label for="f-gender">Género</label>
                    <select id="f-gender" name="gender">
                        <option value="">Sin especificar</option>
                        <option value="F" ${participant?.gender === 'F' ? 'selected' : ''}>Femenino</option>
                        <option value="M" ${participant?.gender === 'M' ? 'selected' : ''}>Masculino</option>
                    </select>
                </div>
            </div>
            ${participant || categories.length === 0 ? '' : html`
                <div class="field">
                    <label for="f-enroll">Inscribir en las pruebas de</label>
                    <select id="f-enroll" name="categoryId">
                        <option value="">No inscribir todavía</option>
                        ${categories.map(c => html`<option value="${c.category_id}">${c.category_name}</option>`)}
                    </select>
                    <span class="hint">Lo inscribe en todas las pruebas de esa categoría (los carriles se asignan en Competencia).</span>
                </div>`}`,
        onSubmit: ({ name, club, gender, categoryId }) => {
            const result = participant
                ? db.updateParticipant(id, name, club, gender)
                : db.addParticipant(name, club, gender);
            if (result.error) { toast(result.error, 'error'); return false; }

            if (!participant && categoryId) {
                const created = db.enrollInCategory(result.participant_id, categoryId).length;
                toast(`Participante creado e inscrito en ${created} ${created === 1 ? 'prueba' : 'pruebas'}`, 'success');
            } else {
                toast(participant ? 'Participante actualizado' : 'Participante creado', 'success');
            }
            renderAll();
        }
    });
}

// ===================== Eliminación =====================

async function deleteCategory(id) {
    const category = db.getCategoryById(id);
    const events = db.getEventsByCategory(id);
    const entries = events.reduce((sum, e) => sum + db.getEntriesByEvent(e.event_id).length, 0);
    const consequence = events.length
        ? ` También se eliminarán sus ${events.length} pruebas y ${entries} inscripciones (con sus resultados).`
        : '';

    if (await confirmDialog({ title: 'Eliminar categoría', message: `¿Eliminar "${category.category_name}"?${consequence}`, confirmText: 'Eliminar', danger: true })) {
        db.deleteCategory(id);
        toast('Categoría eliminada', 'success');
        renderAll();
    }
}

async function deleteEvent(id) {
    const event = db.getEventById(id);
    const entries = db.getEntriesByEvent(id).length;
    const consequence = entries ? ` También se eliminarán sus ${entries} inscripciones (con sus resultados).` : '';

    if (await confirmDialog({ title: 'Eliminar prueba', message: `¿Eliminar "${event.event_name}"?${consequence}`, confirmText: 'Eliminar', danger: true })) {
        db.deleteEvent(id);
        toast('Prueba eliminada', 'success');
        renderAll();
    }
}

async function deleteParticipant(id) {
    const participant = db.getParticipantById(id);
    const entries = db.getEntries().filter(e => e.participant_id === id).length;
    const consequence = entries ? ` También se eliminarán sus ${entries} inscripciones (con sus resultados).` : '';

    if (await confirmDialog({ title: 'Eliminar participante', message: `¿Eliminar a "${participant.name}"?${consequence}`, confirmText: 'Eliminar', danger: true })) {
        db.deleteParticipant(id);
        toast('Participante eliminado', 'success');
        renderAll();
    }
}

// ===================== Importación CSV =====================

function importCsvForm() {
    let parsed = { participants: [], errors: [] };

    const modal = openForm({
        title: 'Importar participantes (CSV)',
        submitLabel: 'Importar',
        wide: true,
        fields: html`
            <p class="small muted">Columnas: <code>nombre, club, genero, categoria</code> (la primera fila puede ser un encabezado; acepta coma, punto y coma o tabulador).
                <a href="#" data-role="template">Descargar plantilla</a></p>
            <div class="field">
                <label for="f-file">Archivo CSV</label>
                <input type="file" id="f-file" accept=".csv,text/csv,text/plain">
            </div>
            <div class="field">
                <label for="f-text">…o pega el contenido</label>
                <textarea id="f-text" name="text" rows="5" placeholder="nombre,club,genero,categoria"></textarea>
            </div>
            <div class="field">
                <label><input type="checkbox" name="enroll" checked> Inscribir en todas las pruebas de la categoría indicada</label>
                <label><input type="checkbox" name="assign" checked> Asignar series y carriles automáticamente</label>
            </div>
            <div id="importPreview" class="alert info" role="status">Selecciona un archivo o pega datos para ver una vista previa.</div>`,
        onSubmit: values => {
            parsed = parseParticipantsCsv(values.text || '');
            if (parsed.participants.length === 0) { toast(parsed.errors[0] || 'No hay participantes para importar', 'error'); return false; }
            runImport(parsed, { enroll: values.enroll === 'on', assign: values.assign === 'on' });
        }
    });

    const textarea = modal.el.querySelector('#f-text');
    const preview = modal.el.querySelector('#importPreview');
    const updatePreview = () => {
        parsed = parseParticipantsCsv(textarea.value);
        const problems = parsed.errors.length ? ` · ${parsed.errors.length} avisos` : '';
        preview.className = 'alert ' + (parsed.participants.length ? 'success' : 'info');
        if (!textarea.value.trim()) preview.textContent = 'Selecciona un archivo o pega datos para ver una vista previa.';
        else if (!parsed.participants.length) preview.textContent = parsed.errors[0];
        else preview.textContent = `${parsed.participants.length} participantes listos para importar${problems}`;
    };

    textarea.addEventListener('input', debounce(updatePreview, 150));
    modal.el.querySelector('#f-file').addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            textarea.value = await readFileAsText(file);
            updatePreview();
        } catch (error) {
            textarea.value = '';
            updatePreview();
            toast(error.message, 'error');
        }
    });
    modal.el.querySelector('[data-role="template"]').addEventListener('click', event => {
        event.preventDefault();
        downloadFile('\uFEFF' + PARTICIPANTS_CSV_TEMPLATE, 'plantilla-participantes.csv', 'text/csv;charset=utf-8');
    });
}

function runImport({ participants, errors }, { enroll, assign }) {
    const categories = db.getCategories();
    const findCategory = name => categories.find(c => normalizeText(c.category_name) === normalizeText(name));

    let created = 0;
    let enrolled = 0;
    let unknownCategory = 0;

    participants.forEach(person => {
        const participant = db.addParticipant(person.name, person.club, person.gender);
        if (participant.error) return;
        created++;

        if (enroll && person.category) {
            const category = findCategory(person.category);
            if (category) enrolled += db.enrollInCategory(participant.participant_id, category.category_id).length;
            else unknownCategory++;
        }
    });

    if (assign) db.autoAssignAll();

    const notes = [
        enrolled ? `${enrolled} inscripciones` : '',
        unknownCategory ? `${unknownCategory} con categoría no reconocida` : '',
        errors.length ? `${errors.length} avisos` : ''
    ].filter(Boolean).join(' · ');
    toast(`${created} participantes importados${notes ? ' · ' + notes : ''}`, unknownCategory || errors.length ? 'warning' : 'success', 5000);
    renderAll();
}
