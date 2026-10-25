/**
 * Competencia: inscripciones, captura de tiempos por serie y corrección de resultados.
 * Estado de la pestaña, prueba y serie activas en la URL: competencia.html?tab=tiempos&event=E-003&heat=2
 */
(() => {
    'use strict';

    const TABS = ['inscripciones', 'tiempos', 'resultados'];
    const PAGE_SIZE = 50;
    const ALL_EVENTS = '*';
    const TIME_PLACEHOLDER = 'ej. 31.52 o 1:05.32';
    const TIME_FORMAT_ERROR = 'Formato no válido. Usa 31.52 o 1:05.32';
    const STATUS_LABELS = {
        OK: 'OK',
        DQ: 'DQ · Descalificado',
        DNS: 'DNS · No se presentó',
        DNF: 'DNF · No terminó'
    };

    const state = {
        tab: 'inscripciones',
        ins: { categoryId: '', eventId: '', search: '', page: 1 },
        times: { categoryId: '', eventId: '', heat: 0 },
        res: { categoryId: '', eventId: '', status: '', search: '', page: 1 }
    };

    const byId = id => document.getElementById(id);
    const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    const tabFilters = () => ({ inscripciones: state.ins, tiempos: state.times, resultados: state.res })[state.tab];

    // ===================== Selects =====================

    function fillSelect(select, options, value, placeholder) {
        select.innerHTML = html`
            ${placeholder === null ? '' : html`<option value="">${placeholder}</option>`}
            ${options.map(option => html`<option value="${option.value}" ${option.value === value ? raw('selected') : ''}>${option.label}</option>`)}
        `;
    }

    function eventOptions(categoryId) {
        const categoryNames = new Map(db.getCategories().map(c => [c.category_id, c.category_name]));
        const events = categoryId ? db.getEventsByCategory(categoryId) : db.getEvents();
        return events.map(event => ({
            value: event.event_id,
            label: categoryId ? event.event_name : `${categoryNames.get(event.category_id)} · ${event.event_name}`
        }));
    }

    /** Selects dependientes categoría → prueba. Sin categoría, la prueba lista todas (o se deshabilita con requireCategory). */
    function fillCategoryEventSelects({ categorySelect, eventSelect, filter, categoryPlaceholder, eventPlaceholder, requireCategory = false, extraEvents = [] }) {
        const categories = db.getCategories().map(c => ({ value: c.category_id, label: c.category_name }));
        fillSelect(categorySelect, categories, filter.categoryId, categoryPlaceholder);
        const events = requireCategory && !filter.categoryId ? [] : [...extraEvents, ...eventOptions(filter.categoryId)];
        fillSelect(eventSelect, events, filter.eventId, eventPlaceholder);
        eventSelect.disabled = requireCategory && !filter.categoryId;
    }

    function setCategory(filter, categoryId) {
        filter.categoryId = categoryId;
        filter.eventId = '';
    }

    function setEvent(filter, eventId) {
        filter.eventId = eventId;
        const event = db.getEventById(eventId);
        if (event) filter.categoryId = event.category_id;
    }

    const statusOptions = selected => Object.entries(STATUS_LABELS)
        .map(([value, label]) => html`<option value="${value}" ${value === selected ? raw('selected') : ''}>${label}</option>`);

    // ===================== Paginación =====================

    function slicePage(rows, filter) {
        const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        filter.page = Math.min(Math.max(1, filter.page), pages);
        const start = (filter.page - 1) * PAGE_SIZE;
        return rows.slice(start, start + PAGE_SIZE);
    }

    function pagerHtml(total, filter, target) {
        const from = total ? (filter.page - 1) * PAGE_SIZE + 1 : 0;
        const to = Math.min(filter.page * PAGE_SIZE, total);
        const lastPage = Math.ceil(total / PAGE_SIZE);
        const button = (step, label, disabled) => html`
            <button type="button" class="btn btn-sm" data-action="page" data-target="${target}" data-step="${step}" ${disabled ? raw('disabled') : ''}>${label}</button>`;
        return html`
            <div class="table-footer">
                <span>Mostrando ${from}–${to} de ${total}</span>
                ${total > PAGE_SIZE ? html`<span class="card-actions">
                    ${button(-1, '← Anterior', filter.page <= 1)}
                    ${button(1, 'Siguiente →', filter.page >= lastPage)}
                </span>` : ''}
            </div>`;
    }

    const emptyHtml = (title, text) => html`
        <div class="empty-state"><h3>${title}</h3><p>${text}</p></div>`;

    // ===================== Campos de tiempo (compartidos por Tiempos y Resultados) =====================

    /** Interpreta un tiempo según el estado. time=null con OK significa "campo vacío". */
    function parseResultInput(status, text) {
        if (status !== 'OK') return { status, time: null };
        const time = parseTime(text);
        if (Number.isNaN(time)) return { error: TIME_FORMAT_ERROR };
        return { status, time };
    }

    function setFieldError(input, message) {
        const errorBox = input.parentElement.querySelector('.row-error');
        input.classList.toggle('invalid', Boolean(message));
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (errorBox) {
            errorBox.textContent = message || '';
            errorBox.hidden = !message;
        }
    }

    function applyStatusToTimeInput(status, input) {
        const needsTime = status === 'OK';
        input.disabled = !needsTime;
        if (!needsTime) {
            input.value = '';
            setFieldError(input, '');
        }
    }

    const signature = (status, time) => (status ? `${status}|${time ?? ''}` : '');

    // ===================== Inscripciones =====================

    function buildEntryRows(filter) {
        const events = db.getEvents();
        const eventOrder = new Map(events.map((event, index) => [event.event_id, index]));
        const eventById = new Map(events.map(event => [event.event_id, event]));
        const categoryById = new Map(db.getCategories().map(c => [c.category_id, c]));
        const participantById = new Map(db.getParticipants().map(p => [p.participant_id, p]));
        const query = normalizeText(filter.search);

        return db.getEntries()
            .map(entry => {
                const event = eventById.get(entry.event_id);
                return { entry, event, participant: participantById.get(entry.participant_id), category: event && categoryById.get(event.category_id) };
            })
            .filter(row => row.event && row.participant && row.category)
            .filter(row => !filter.eventId || row.event.event_id === filter.eventId)
            .filter(row => !filter.categoryId || row.category.category_id === filter.categoryId)
            .filter(row => !query || normalizeText(`${row.participant.name} ${row.participant.club_or_team}`).includes(query))
            .sort((a, b) =>
                eventOrder.get(a.event.event_id) - eventOrder.get(b.event.event_id)
                || (a.entry.heat || Infinity) - (b.entry.heat || Infinity)
                || a.entry.lane - b.entry.lane
                || a.participant.name.localeCompare(b.participant.name, 'es'));
    }

    function renderEntryStats() {
        const entries = db.getEntries();
        const assigned = entries.filter(entry => entry.heat && entry.lane).length;
        const pending = entries.length - assigned;
        byId('ins-stats').innerHTML = html`
            <div class="stat"><div class="stat-value">${entries.length}</div><div class="stat-label">Inscripciones</div></div>
            <div class="stat ok"><div class="stat-value">${assigned}</div><div class="stat-label">Con carril</div></div>
            <div class="stat ${pending ? 'warn' : ''}"><div class="stat-value">${pending}</div><div class="stat-label">Sin asignar</div></div>
        `;
    }

    function entryRowHtml({ entry, event, participant, category }) {
        const name = participant.name;
        return html`
            <tr>
                <td><strong>${name}</strong></td>
                <td>${participant.club_or_team || '—'}</td>
                <td>${category.category_name}</td>
                <td>${event.event_name}</td>
                <td class="center">${entry.heat || '—'}</td>
                <td class="center">${entry.lane
                    ? html`<span class="lane-badge">${entry.lane}</span>`
                    : html`<span class="badge pending">Sin asignar</span>`}</td>
                <td class="actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-action="edit-entry" data-id="${entry.entry_id}" aria-label="Editar serie y carril de ${name}">Editar</button>
                    <button type="button" class="btn btn-ghost btn-sm danger" data-action="delete-entry" data-id="${entry.entry_id}" aria-label="Eliminar inscripción de ${name}">Eliminar</button>
                </td>
            </tr>`;
    }

    function renderEntryTable() {
        const filter = state.ins;
        const rows = buildEntryRows(filter);
        const box = byId('ins-table');

        if (!rows.length) {
            const hasEntries = db.getEntries().length > 0;
            box.innerHTML = hasEntries
                ? emptyHtml('Sin coincidencias', 'Ninguna inscripción coincide con los filtros actuales.')
                : emptyHtml('Aún no hay inscripciones', 'Usa «Nueva inscripción» para inscribir participantes en las pruebas.');
            return;
        }

        box.innerHTML = html`
            <div class="table-wrap">
                <table>
                    <caption class="sr-only">Inscripciones</caption>
                    <thead><tr>
                        <th>Participante</th><th>Club</th><th>Categoría</th><th>Prueba</th>
                        <th class="center">Serie</th><th class="center">Carril</th><th></th>
                    </tr></thead>
                    <tbody>${slicePage(rows, filter).map(entryRowHtml)}</tbody>
                </table>
            </div>
            ${pagerHtml(rows.length, filter, 'ins')}`;
    }

    function renderInscripciones() {
        renderEntryStats();
        fillCategoryEventSelects({
            categorySelect: byId('ins-category'),
            eventSelect: byId('ins-event'),
            filter: state.ins,
            categoryPlaceholder: 'Todas las categorías',
            eventPlaceholder: 'Todas las pruebas'
        });
        renderEntryTable();
        syncUrl();
    }

    function openNewEntryForm() {
        const participants = db.getParticipants().sort((a, b) => a.name.localeCompare(b.name, 'es'));
        const choice = { categoryId: state.ins.categoryId, eventId: state.ins.eventId };
        const allEventsOption = { value: ALL_EVENTS, label: 'Todas las pruebas de la categoría' };

        const modal = openForm({
            title: 'Nueva inscripción',
            submitLabel: 'Inscribir',
            fields: html`
                <div class="field participant-picker">
                    <label for="ne-search">Participante <span class="req">*</span></label>
                    <input type="search" id="ne-search" class="mb-8" placeholder="Buscar por nombre o club" autocomplete="off">
                    <select id="ne-participant" name="participantId" size="6" required aria-label="Participantes"></select>
                </div>
                <div class="form-grid">
                    <div class="field">
                        <label for="ne-category">Categoría <span class="req">*</span></label>
                        <select id="ne-category" name="categoryId" required></select>
                    </div>
                    <div class="field">
                        <label for="ne-event">Prueba <span class="req">*</span></label>
                        <select id="ne-event" name="eventId" required></select>
                    </div>
                    <div class="field">
                        <label for="ne-heat">Serie</label>
                        <input type="number" id="ne-heat" name="heat" min="0" step="1" value="0">
                    </div>
                    <div class="field">
                        <label for="ne-lane">Carril</label>
                        <input type="number" id="ne-lane" name="lane" min="0" max="${db.getEventConfig().lanes}" step="1" value="0">
                    </div>
                </div>
                <p class="small muted">Serie y carril son opcionales: déjalos en 0 para asignarlos después.</p>`,
            onSubmit: values => submitNewEntry(values)
        });

        const root = modal.el;
        const searchInput = root.querySelector('#ne-search');
        const participantSelect = root.querySelector('#ne-participant');
        const eventSelect = root.querySelector('#ne-event');
        const slotInputs = root.querySelectorAll('#ne-heat, #ne-lane');

        const renderParticipants = () => {
            const query = normalizeText(searchInput.value);
            const visible = participants.filter(p => !query || normalizeText(`${p.name} ${p.club_or_team}`).includes(query));
            const options = visible.map(p => ({ value: p.participant_id, label: p.club_or_team ? `${p.name} — ${p.club_or_team}` : p.name }));
            fillSelect(participantSelect, options, participantSelect.value, null);
        };
        const renderEvents = () => {
            fillCategoryEventSelects({
                categorySelect: root.querySelector('#ne-category'),
                eventSelect,
                filter: choice,
                categoryPlaceholder: 'Selecciona categoría',
                eventPlaceholder: 'Selecciona prueba',
                requireCategory: true,
                extraEvents: [allEventsOption]
            });
            slotInputs.forEach(input => { input.disabled = choice.eventId === ALL_EVENTS; });
        };

        searchInput.addEventListener('input', debounce(renderParticipants, 150));
        root.querySelector('#ne-category').addEventListener('change', event => { setCategory(choice, event.target.value); renderEvents(); });
        eventSelect.addEventListener('change', event => { choice.eventId = event.target.value; renderEvents(); });
        renderParticipants();
        renderEvents();
    }

    function submitNewEntry(values) {
        const { participantId, categoryId, eventId } = values;
        if (eventId === ALL_EVENTS) {
            const created = db.enrollInCategory(participantId, categoryId);
            if (!created.length) {
                toast('No se creó ninguna inscripción: ya estaba inscrito en todas las pruebas o la categoría no tiene pruebas', 'warning');
                return false;
            }
            toast(`${plural(created.length, 'inscripción creada', 'inscripciones creadas')}`, 'success');
            setCategory(state.ins, categoryId);
        } else {
            const result = db.addEntry(eventId, participantId, values.heat, values.lane);
            if (result.error) {
                toast(result.error, 'error');
                return false;
            }
            toast('Inscripción creada', 'success');
            setEvent(state.ins, eventId);
        }
        state.ins.search = '';
        byId('ins-search').value = '';
        renderInscripciones();
        return true;
    }

    function openEditEntryForm(entryId) {
        const entry = db.getEntryById(entryId);
        if (!entry) return;
        const participant = db.getParticipantById(entry.participant_id);
        const event = db.getEventById(entry.event_id);
        const lanes = db.getEventConfig().lanes;

        openForm({
            title: 'Serie y carril',
            fields: html`
                <p><strong>${participant?.name}</strong><br><span class="muted">${event?.event_name}</span></p>
                <div class="form-grid">
                    <div class="field">
                        <label for="ee-heat">Serie</label>
                        <input type="number" id="ee-heat" name="heat" min="0" step="1" value="${entry.heat}">
                    </div>
                    <div class="field">
                        <label for="ee-lane">Carril</label>
                        <input type="number" id="ee-lane" name="lane" min="0" max="${lanes}" step="1" value="${entry.lane}">
                    </div>
                </div>
                <p class="small muted">Carriles disponibles: 1 a ${lanes}. Deja ambos en 0 para quitar la asignación.</p>`,
            onSubmit: values => {
                const result = db.assignLane(entryId, values.heat, values.lane);
                if (result.error) {
                    toast(result.error, 'error');
                    return false;
                }
                toast('Asignación actualizada', 'success');
                renderInscripciones();
                return true;
            }
        });
    }

    async function deleteEntry(entryId) {
        const entry = db.getEntryById(entryId);
        if (!entry) return;
        const participant = db.getParticipantById(entry.participant_id);
        const event = db.getEventById(entry.event_id);
        const resultNote = db.getResultByEntryId(entryId) ? ' También se borrará su resultado.' : '';

        const confirmed = await confirmDialog({
            title: 'Eliminar inscripción',
            message: `¿Eliminar la inscripción de ${participant?.name} en «${event?.event_name}»?${resultNote}`,
            confirmText: 'Eliminar',
            danger: true
        });
        if (!confirmed) return;
        db.deleteEntry(entryId);
        toast('Inscripción eliminada', 'success');
        renderInscripciones();
    }

    async function autoAssign() {
        const { eventId } = state.ins;
        const pending = db.getEntries().filter(entry => (!eventId || entry.event_id === eventId) && !(entry.heat && entry.lane)).length;
        if (!pending) {
            toast('No hay inscripciones sin asignar', 'info');
            return;
        }

        const scope = eventId ? `de la prueba «${db.getEventById(eventId).event_name}»` : 'de todas las pruebas';
        const confirmed = await confirmDialog({
            title: 'Asignar carriles',
            message: `Se asignará serie y carril a ${plural(pending, 'inscripción pendiente', 'inscripciones pendientes')} ${scope}. Las asignaciones existentes no cambian.`,
            confirmText: 'Asignar'
        });
        if (!confirmed) return;

        const assigned = eventId ? db.autoAssignLanes(eventId) : db.autoAssignAll();
        toast(`${plural(assigned, 'inscripción asignada', 'inscripciones asignadas')}`, 'success');
        renderInscripciones();
    }

    // ===================== Tiempos =====================

    function loadTimesModel() {
        const details = db.getEntryDetails(state.times.eventId).filter(detail => detail.participant);
        const heats = new Map();
        const unassigned = [];
        details.forEach(detail => {
            if (!detail.entry.heat) {
                unassigned.push(detail);
            } else if (heats.has(detail.entry.heat)) {
                heats.get(detail.entry.heat).push(detail);
            } else {
                heats.set(detail.entry.heat, [detail]);
            }
        });
        return { details, heats, unassigned, done: details.filter(detail => detail.result).length };
    }

    // Primera serie con resultados pendientes; si todas están completas, la primera.
    function defaultHeat(model) {
        const heats = [...model.heats];
        const pending = heats.find(([, rows]) => rows.some(row => !row.result));
        return (pending || heats[0] || [0])[0];
    }

    function renderTimesToolbar(model) {
        const filter = state.times;
        fillCategoryEventSelects({
            categorySelect: byId('times-category'),
            eventSelect: byId('times-event'),
            filter,
            categoryPlaceholder: 'Selecciona categoría',
            eventPlaceholder: 'Selecciona prueba',
            requireCategory: true
        });

        const heatOptions = model ? [...model.heats].map(([heat, rows]) => ({
            value: String(heat),
            label: `Serie ${heat} · ${rows.filter(row => row.result).length} de ${rows.length}`
        })) : [];
        const heatSelect = byId('times-heat');
        fillSelect(heatSelect, heatOptions, String(filter.heat), heatOptions.length ? null : 'Sin series');
        heatSelect.disabled = !heatOptions.length;
    }

    function renderTimesSummary(model) {
        const box = byId('times-summary');
        box.hidden = !model;
        if (!model) {
            box.innerHTML = '';
            return;
        }

        const total = model.details.length;
        const percent = total ? Math.round((model.done / total) * 100) : 0;
        const inscripcionesUrl = `competencia.html?tab=inscripciones&event=${encodeURIComponent(state.times.eventId)}`;
        const names = model.unassigned.slice(0, 5).map(detail => detail.participant.name).join(', ');
        const more = model.unassigned.length > 5 ? ` y ${model.unassigned.length - 5} más` : '';

        box.innerHTML = html`
            <div class="flex between items-center flex-wrap gap-16 mb-8">
                <strong>${model.done} de ${total} con resultado</strong>
                <a class="btn btn-sm" href="resultados.html?event=${encodeURIComponent(state.times.eventId)}">Ver resultados de la prueba</a>
            </div>
            <div class="progress" role="progressbar" aria-label="Progreso de la prueba" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
                <span style="width: ${percent}%"></span>
            </div>
            ${model.unassigned.length ? html`
                <div class="alert warning mt-16 mb-0">
                    ${plural(model.unassigned.length, 'inscripción sin serie', 'inscripciones sin serie')} (${names}${more}) no aparece en ninguna serie.
                    <a href="${inscripcionesUrl}">Asignar en Inscripciones</a>
                </div>` : ''}`;
    }

    function timeRowHtml({ entry, participant, result }) {
        const status = result ? result.status : 'OK';
        const timeValue = result && result.status === 'OK' ? formatTime(result.time_seconds) : '';
        const name = participant.name;
        return html`
            <tr data-entry-id="${entry.entry_id}" data-saved="${signature(result?.status, result?.time_seconds)}">
                <td class="center"><span class="lane-badge">${entry.lane}</span></td>
                <td><strong>${name}</strong></td>
                <td class="muted">${participant.club_or_team || '—'}</td>
                <td>
                    <input type="text" class="lane-input" data-field="time" inputmode="decimal" autocomplete="off"
                        placeholder="${TIME_PLACEHOLDER}" aria-label="Tiempo de ${name}" value="${timeValue}" ${status === 'OK' ? '' : raw('disabled')}>
                    <div class="row-error" role="alert" hidden></div>
                </td>
                <td><select data-field="status" aria-label="Estado de ${name}">${statusOptions(status)}</select></td>
            </tr>`;
    }

    function renderHeatTable(model) {
        const box = byId('times-heat-card');
        const filter = state.times;

        if (!model) {
            box.innerHTML = emptyHtml('Elige una prueba', 'Selecciona la categoría, la prueba y la serie para capturar los tiempos.');
            return;
        }
        if (!model.details.length) {
            box.innerHTML = emptyHtml('Sin inscripciones', 'Esta prueba aún no tiene participantes inscritos.');
            return;
        }
        if (!model.heats.size) {
            box.innerHTML = emptyHtml('Sin series asignadas', 'Asigna serie y carril en Inscripciones para poder capturar tiempos.');
            return;
        }

        const heatNumbers = [...model.heats.keys()];
        const position = heatNumbers.indexOf(filter.heat);
        box.innerHTML = html`
            <div class="card-header">
                <h3>Serie ${filter.heat} <span class="muted small">de ${heatNumbers.length}</span></h3>
                <div class="card-actions">
                    <button type="button" class="btn btn-sm" data-action="heat-step" data-step="-1" ${position <= 0 ? raw('disabled') : ''}>← Serie anterior</button>
                    <button type="button" class="btn btn-sm" data-action="heat-step" data-step="1" ${position >= heatNumbers.length - 1 ? raw('disabled') : ''}>Serie siguiente →</button>
                </div>
            </div>
            <div class="table-wrap">
                <table class="times-table">
                    <caption class="sr-only">Tiempos de la serie ${filter.heat}</caption>
                    <thead><tr>
                        <th class="center">Carril</th><th>Participante</th><th>Club</th><th>Tiempo</th><th>Estado</th>
                    </tr></thead>
                    <tbody>${model.heats.get(filter.heat).map(timeRowHtml)}</tbody>
                </table>
            </div>
            <div class="card-footer flex between items-center flex-wrap gap-16">
                <span class="small muted">Enter pasa a la siguiente fila. Para DQ, DNS o DNF cambia el estado.</span>
                <button type="button" class="btn btn-success" data-action="save-heat">Guardar serie</button>
            </div>`;
    }

    function renderTimes() {
        const filter = state.times;
        const model = filter.eventId ? loadTimesModel() : null;
        if (!model) filter.heat = 0;
        else if (!model.heats.has(filter.heat)) filter.heat = defaultHeat(model);

        renderTimesToolbar(model);
        renderTimesSummary(model);
        renderHeatTable(model);
        syncUrl();
    }

    function refreshTimesProgress() {
        const model = loadTimesModel();
        renderTimesToolbar(model);
        renderTimesSummary(model);
    }

    const timeRows = () => [...document.querySelectorAll('#times-heat-card tr[data-entry-id]')];
    const timeInputOf = row => row.querySelector('[data-field="time"]');

    function readTimeRow(row) {
        const parsed = parseResultInput(row.querySelector('[data-field="status"]').value, timeInputOf(row).value);
        if (parsed.error) return parsed;
        return parsed.status === 'OK' && parsed.time === null ? { status: null, time: null } : parsed;
    }

    /** Valida la fila, muestra el error en línea y normaliza el tiempo escrito (31,5 → 31.50). */
    function validateTimeRow(row) {
        const input = timeInputOf(row);
        const outcome = readTimeRow(row);
        setFieldError(input, outcome.error || '');
        if (!outcome.error && outcome.time !== null) input.value = formatTime(outcome.time);
        return outcome;
    }

    function isTimesDirty() {
        return timeRows().some(row => {
            const outcome = readTimeRow(row);
            return outcome.error || signature(outcome.status, outcome.time) !== row.dataset.saved;
        });
    }

    async function confirmDiscardTimes() {
        if (state.tab !== 'tiempos' || !isTimesDirty()) return true;
        return confirmDialog({
            title: 'Cambios sin guardar',
            message: 'La serie actual tiene tiempos sin guardar. ¿Quieres descartarlos?',
            confirmText: 'Descartar',
            danger: true
        });
    }

    async function changeTimes(change) {
        if (!(await confirmDiscardTimes())) {
            renderTimesToolbar(state.times.eventId ? loadTimesModel() : null);
            return;
        }
        Object.assign(state.times, change);
        renderTimes();
    }

    function stepHeat(step) {
        const heats = [...loadTimesModel().heats.keys()];
        const target = heats[heats.indexOf(state.times.heat) + step];
        if (target) changeTimes({ heat: target });
    }

    function focusNextTimeRow(row) {
        let next = row.nextElementSibling;
        while (next && timeInputOf(next).disabled) next = next.nextElementSibling;
        if (next) {
            const input = timeInputOf(next);
            input.focus();
            input.select();
        } else {
            document.querySelector('[data-action="save-heat"]').focus();
        }
    }

    function saveHeat() {
        const summary = { saved: 0, cleared: 0, errors: 0 };

        timeRows().forEach(row => {
            const outcome = validateTimeRow(row);
            if (outcome.error) {
                summary.errors++;
                return;
            }
            const newSignature = signature(outcome.status, outcome.time);
            if (newSignature === row.dataset.saved) return;

            if (outcome.status === null) {
                db.deleteResult(row.dataset.entryId);
                summary.cleared++;
            } else {
                const result = db.saveResult(row.dataset.entryId, outcome.time, outcome.status);
                if (result.error) {
                    setFieldError(timeInputOf(row), result.error);
                    summary.errors++;
                    return;
                }
                summary.saved++;
            }
            row.dataset.saved = newSignature;
        });

        refreshTimesProgress();
        reportSaveSummary(summary);
        const firstInvalid = document.querySelector('#times-heat-card .invalid');
        if (firstInvalid) firstInvalid.focus();
    }

    function reportSaveSummary({ saved, cleared, errors }) {
        const parts = [];
        if (saved) parts.push(plural(saved, 'resultado guardado', 'resultados guardados'));
        if (cleared) parts.push(plural(cleared, 'resultado borrado', 'resultados borrados'));
        if (errors) {
            parts.push(`${plural(errors, 'fila con error', 'filas con errores')}: revisa los campos en rojo`);
            toast(parts.join(' · '), 'warning', 6000);
        } else if (parts.length) {
            toast(parts.join(' · '), 'success');
        } else {
            toast('No hay cambios por guardar', 'info');
        }
    }

    function bindTimesTable() {
        const box = byId('times-heat-card');
        on(box, 'change', '[data-field="status"]', select => {
            const row = select.closest('tr');
            applyStatusToTimeInput(select.value, timeInputOf(row));
            if (select.value === 'OK') timeInputOf(row).focus();
        });
        on(box, 'focusout', '[data-field="time"]', input => validateTimeRow(input.closest('tr')));
        on(box, 'input', '[data-field="time"]', input => setFieldError(input, ''));
        on(box, 'keydown', '[data-field="time"]', (input, event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const row = input.closest('tr');
            if (!validateTimeRow(row).error) focusNextTimeRow(row);
        });
    }

    // ===================== Resultados =====================

    function renderResultStats(allRows) {
        const ok = allRows.filter(row => row.status === 'OK').length;
        const others = allRows.length - ok;
        byId('res-stats').innerHTML = html`
            <div class="stat"><div class="stat-value">${allRows.length}</div><div class="stat-label">Resultados registrados</div></div>
            <div class="stat ok"><div class="stat-value">${ok}</div><div class="stat-label">Con tiempo (OK)</div></div>
            <div class="stat ${others ? 'bad' : ''}"><div class="stat-value">${others}</div><div class="stat-label">DQ / DNS / DNF</div></div>
        `;
    }

    function resultRowHtml(row) {
        return html`
            <tr>
                <td class="center">${row.position ?? '—'}</td>
                <td><strong>${row.participant_name}</strong></td>
                <td>${row.club || '—'}</td>
                <td>${row.event_name}<div class="small muted">${row.category_name}</div></td>
                <td class="center">${row.heat || '—'}</td>
                <td class="center">${row.lane || '—'}</td>
                <td class="time">${row.status === 'OK' ? formatTime(row.time) : '—'}</td>
                <td><span class="badge ${row.status.toLowerCase()}">${row.status}</span></td>
                <td class="actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-action="edit-result" data-id="${row.entry_id}" aria-label="Editar resultado de ${row.participant_name}">Editar</button>
                    <button type="button" class="btn btn-ghost btn-sm danger" data-action="delete-result" data-id="${row.entry_id}" aria-label="Eliminar resultado de ${row.participant_name}">Eliminar</button>
                </td>
            </tr>`;
    }

    function renderResultTable(allRows) {
        const filter = state.res;
        const query = normalizeText(filter.search);
        const rows = db.getResultRows({ eventId: filter.eventId, categoryId: filter.categoryId })
            .filter(row => !filter.status || row.status === filter.status)
            .filter(row => !query || normalizeText(`${row.participant_name} ${row.club}`).includes(query));
        const box = byId('res-table');

        if (!rows.length) {
            box.innerHTML = allRows.length
                ? emptyHtml('Sin coincidencias', 'Ningún resultado coincide con los filtros actuales.')
                : emptyHtml('Aún no hay resultados', 'Captura los tiempos en la pestaña «Tiempos» y aparecerán aquí.');
            return;
        }

        box.innerHTML = html`
            <div class="table-wrap">
                <table>
                    <caption class="sr-only">Resultados registrados</caption>
                    <thead><tr>
                        <th class="center">Pos.</th><th>Participante</th><th>Club</th><th>Prueba</th>
                        <th class="center">Serie</th><th class="center">Carril</th><th>Tiempo</th><th>Estado</th><th></th>
                    </tr></thead>
                    <tbody>${slicePage(rows, filter).map(resultRowHtml)}</tbody>
                </table>
            </div>
            ${pagerHtml(rows.length, filter, 'res')}`;
    }

    function renderResultados() {
        const allRows = db.getResultRows();
        renderResultStats(allRows);
        fillCategoryEventSelects({
            categorySelect: byId('res-category'),
            eventSelect: byId('res-event'),
            filter: state.res,
            categoryPlaceholder: 'Todas las categorías',
            eventPlaceholder: 'Todas las pruebas'
        });
        const statuses = Object.keys(STATUS_LABELS).map(value => ({ value, label: STATUS_LABELS[value] }));
        fillSelect(byId('res-status'), statuses, state.res.status, 'Todos los estados');
        renderResultTable(allRows);
        syncUrl();
    }

    function openEditResultForm(entryId) {
        const row = db.getResultRows().find(r => r.entry_id === entryId);
        if (!row) return;

        const modal = openForm({
            title: 'Editar resultado',
            fields: html`
                <p><strong>${row.participant_name}</strong><br><span class="muted">${row.category_name} · ${row.event_name}</span></p>
                <div class="form-grid">
                    <div class="field">
                        <label for="er-status">Estado</label>
                        <select id="er-status" name="status">${statusOptions(row.status)}</select>
                    </div>
                    <div class="field">
                        <label for="er-time">Tiempo</label>
                        <input type="text" id="er-time" name="time" inputmode="decimal" autocomplete="off" placeholder="${TIME_PLACEHOLDER}"
                            value="${row.status === 'OK' ? formatTime(row.time) : ''}" ${row.status === 'OK' ? '' : raw('disabled')}>
                        <div class="row-error" role="alert" hidden></div>
                    </div>
                </div>`,
            onSubmit: (values, form) => saveEditedResult(entryId, values, form.elements.time)
        });

        const timeInput = modal.el.querySelector('#er-time');
        modal.el.querySelector('#er-status').addEventListener('change', event => applyStatusToTimeInput(event.target.value, timeInput));
        timeInput.addEventListener('input', () => setFieldError(timeInput, ''));
    }

    function saveEditedResult(entryId, values, timeInput) {
        const parsed = parseResultInput(values.status, values.time);
        const error = parsed.error || (parsed.time === null && parsed.status === 'OK' ? 'Ingresa el tiempo' : '');
        if (error) {
            setFieldError(timeInput, error);
            timeInput.focus();
            return false;
        }

        const result = db.saveResult(entryId, parsed.time, parsed.status);
        if (result.error) {
            toast(result.error, 'error');
            return false;
        }
        toast('Resultado actualizado', 'success');
        renderResultados();
        return true;
    }

    async function deleteResultRow(entryId) {
        const row = db.getResultRows().find(r => r.entry_id === entryId);
        if (!row) return;

        const confirmed = await confirmDialog({
            title: 'Eliminar resultado',
            message: `¿Eliminar el resultado de ${row.participant_name} en «${row.event_name}»? La inscripción se conserva.`,
            confirmText: 'Eliminar',
            danger: true
        });
        if (!confirmed) return;
        db.deleteResult(entryId);
        toast('Resultado eliminado', 'success');
        renderResultados();
    }

    // ===================== Pestañas y URL =====================

    const renderers = { inscripciones: renderInscripciones, tiempos: renderTimes, resultados: renderResultados };

    function syncUrl() {
        const params = new URLSearchParams({ tab: state.tab });
        const filter = tabFilters();
        if (filter.eventId) params.set('event', filter.eventId);
        if (state.tab === 'tiempos' && filter.heat) params.set('heat', filter.heat);
        history.replaceState(null, '', `${location.pathname}?${params}`);
    }

    function readUrlState() {
        const params = new URLSearchParams(location.search);
        if (TABS.includes(params.get('tab'))) state.tab = params.get('tab');

        const event = db.getEventById(params.get('event'));
        if (!event) return;
        setEvent(tabFilters(), event.event_id);
        if (state.tab === 'tiempos') state.times.heat = Number(params.get('heat')) || 0;
    }

    function updateTabsUi() {
        document.querySelectorAll('[role="tab"]').forEach(tab => {
            const selected = tab.dataset.tab === state.tab;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            byId(`panel-${tab.dataset.tab}`).hidden = !selected;
        });
    }

    async function selectTab(tab) {
        if (tab === state.tab) return;
        if (!(await confirmDiscardTimes())) return;
        state.tab = tab;
        updateTabsUi();
        renderers[tab]();
    }

    function bindTabs() {
        const tablist = document.querySelector('[role="tablist"]');
        on(tablist, 'click', '[role="tab"]', tab => selectTab(tab.dataset.tab));
        tablist.addEventListener('keydown', event => {
            const offsets = { ArrowRight: 1, ArrowLeft: -1 };
            const current = TABS.indexOf(state.tab);
            let target;
            if (event.key in offsets) target = TABS[(current + offsets[event.key] + TABS.length) % TABS.length];
            else if (event.key === 'Home') target = TABS[0];
            else if (event.key === 'End') target = TABS[TABS.length - 1];
            if (!target) return;
            event.preventDefault();
            selectTab(target).then(() => byId(`tab-${state.tab}`).focus());
        });
    }

    // ===================== Eventos =====================

    const actions = {
        'new-entry': openNewEntryForm,
        'auto-assign': autoAssign,
        'edit-entry': el => openEditEntryForm(el.dataset.id),
        'delete-entry': el => deleteEntry(el.dataset.id),
        'heat-step': el => stepHeat(Number(el.dataset.step)),
        'save-heat': saveHeat,
        'edit-result': el => openEditResultForm(el.dataset.id),
        'delete-result': el => deleteResultRow(el.dataset.id),
        page: el => {
            state[el.dataset.target].page += Number(el.dataset.step);
            if (el.dataset.target === 'ins') renderEntryTable();
            else renderResultados();
        }
    };

    function bindFilters(prefix, filter, render) {
        byId(`${prefix}-category`).addEventListener('change', event => { setCategory(filter, event.target.value); filter.page = 1; render(); });
        byId(`${prefix}-event`).addEventListener('change', event => { setEvent(filter, event.target.value); filter.page = 1; render(); });
    }

    function bindEvents() {
        bindTabs();
        bindTimesTable();
        on(document, 'click', '[data-action]', el => actions[el.dataset.action]?.(el));

        bindFilters('ins', state.ins, renderInscripciones);
        bindFilters('res', state.res, renderResultados);
        byId('ins-search').addEventListener('input', debounce(event => {
            state.ins.search = event.target.value;
            state.ins.page = 1;
            renderEntryTable();
        }));
        byId('res-status').addEventListener('change', event => { state.res.status = event.target.value; state.res.page = 1; renderResultados(); });
        byId('res-search').addEventListener('input', debounce(event => {
            state.res.search = event.target.value;
            state.res.page = 1;
            renderResultados();
        }));

        byId('times-category').addEventListener('change', event => changeTimes({ categoryId: event.target.value, eventId: '', heat: 0 }));
        byId('times-event').addEventListener('change', event => {
            const selected = db.getEventById(event.target.value);
            changeTimes({ eventId: event.target.value, categoryId: selected ? selected.category_id : state.times.categoryId, heat: 0 });
        });
        byId('times-heat').addEventListener('change', event => changeTimes({ heat: Number(event.target.value) }));

        window.addEventListener('beforeunload', event => {
            if (state.tab === 'tiempos' && isTimesDirty()) event.preventDefault();
        });
    }

    function showEmptyState() {
        byId('workspace').hidden = true;
        const box = byId('empty-state');
        box.hidden = false;
        box.innerHTML = html`
            <div class="empty-state">
                <div class="icon" aria-hidden="true">🏊</div>
                <h3>Aún no hay datos para competir</h3>
                <p>Para inscribir nadadores necesitas al menos una prueba y un participante. Carga un evento de demostración o una plantilla desde Ajustes, o registra tus propios datos.</p>
                <div class="page-actions">
                    <a class="btn btn-primary" href="ajustes.html">Cargar demo o plantilla</a>
                    <a class="btn" href="datos.html">Ir a Datos</a>
                </div>
            </div>`;
    }

    document.addEventListener('DOMContentLoaded', () => {
        Layout.init('competencia', 'Competencia');
        if (!db.getEvents().length || !db.getParticipants().length) {
            showEmptyState();
            return;
        }
        readUrlState();
        bindEvents();
        updateTabsUi();
        renderers[state.tab]();
    });
})();
