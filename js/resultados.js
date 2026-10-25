/**
 * Página pública de resultados: podios, tabla filtrable y exportación (CSV / PDF).
 * Solo lectura; se actualiza sola cuando otra pestaña modifica los datos.
 */

const PAGE_SIZE = 100;
const COLLAPSED_PODIUMS = 6;
const WATCHED_KEYS = ['categories', 'events', 'participants', 'entries', 'results', 'eventConfig'];
const STATUS_TITLES = { OK: 'Tiempo válido', DQ: 'Descalificado', DNS: 'No se presentó', DNF: 'No terminó' };

const filters = { categoryId: '', eventId: '', status: '', query: '' };
const view = { page: 1, showAllPodiums: false };
const els = {};
let lastUpdate = new Date();

document.addEventListener('DOMContentLoaded', () => {
    Layout.init('resultados', 'Resultados');
    Object.assign(els, {
        subtitle: document.getElementById('results-subtitle'),
        stats: document.getElementById('results-stats'),
        content: document.getElementById('results-content'),
        category: document.getElementById('filter-category'),
        event: document.getElementById('filter-event'),
        status: document.getElementById('filter-status'),
        query: document.getElementById('filter-query')
    });

    readFiltersFromUrl();
    els.query.value = filters.query;
    refresh();
    bindEvents();
});

// ===================== Filtros =====================

function readFiltersFromUrl() {
    const params = new URLSearchParams(location.search);
    const event = db.getEventById(params.get('event'));
    const category = db.getCategoryById(event ? event.category_id : params.get('category'));

    filters.eventId = event ? event.event_id : '';
    filters.categoryId = category ? category.category_id : '';
    filters.status = SwimmingDatabase.STATUSES.includes(params.get('status')) ? params.get('status') : '';
    filters.query = params.get('q') || '';
}

function syncUrl() {
    const params = new URLSearchParams();
    if (filters.categoryId) params.set('category', filters.categoryId);
    if (filters.eventId) params.set('event', filters.eventId);
    if (filters.status) params.set('status', filters.status);
    if (filters.query) params.set('q', filters.query);
    const query = params.toString();
    history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

/** Rellena las listas de categoría y prueba y descarta filtros que ya no existen. */
function fillFilterOptions() {
    const categories = db.getCategories();
    if (!categories.some(c => c.category_id === filters.categoryId)) filters.categoryId = '';

    const categoryNames = new Map(categories.map(c => [c.category_id, c.category_name]));
    const events = filters.categoryId ? db.getEventsByCategory(filters.categoryId) : db.getEvents();
    if (!events.some(e => e.event_id === filters.eventId)) filters.eventId = '';

    els.category.innerHTML = html`
        <option value="">Todas las categorías</option>
        ${categories.map(c => html`<option value="${c.category_id}">${c.category_name}</option>`)}`;
    els.event.innerHTML = html`
        <option value="">Todas las pruebas</option>
        ${events.map(e => html`<option value="${e.event_id}">${filters.categoryId ? e.event_name : `${e.event_name} · ${categoryNames.get(e.category_id) || ''}`}</option>`)}`;

    els.category.value = filters.categoryId;
    els.event.value = filters.eventId;
    els.status.value = filters.status;
}

function applyFilters() {
    view.page = 1;
    syncUrl();
    fillFilterOptions();
    render();
}

function clearFilters() {
    Object.assign(filters, { categoryId: '', eventId: '', status: '', query: '' });
    els.query.value = '';
    applyFilters();
}

// ===================== Eventos =====================

function bindEvents() {
    els.category.addEventListener('change', () => {
        filters.categoryId = els.category.value;
        filters.eventId = '';
        applyFilters();
    });
    els.event.addEventListener('change', () => {
        filters.eventId = els.event.value;
        const event = db.getEventById(filters.eventId);
        if (event) filters.categoryId = event.category_id;
        applyFilters();
    });
    els.status.addEventListener('change', () => {
        filters.status = els.status.value;
        applyFilters();
    });
    els.query.addEventListener('input', debounce(() => {
        filters.query = els.query.value.trim();
        applyFilters();
    }, 250));

    on(document, 'click', '[data-action]', (target) => {
        const actions = {
            'refresh': () => { refresh(); toast('Datos actualizados', 'success', 1800); },
            'export-csv': () => DataExporter.exportResultsCSV(filters),
            'export-pdf': () => downloadPdf(target),
            'toggle-podiums': () => { view.showAllPodiums = !view.showAllPodiums; render(); },
            'clear-filters': clearFilters,
            'prev-page': () => changePage(-1),
            'next-page': () => changePage(1)
        };
        const action = actions[target.dataset.action];
        if (action) action();
    });

    // Otra pestaña (p. ej. el panel de competencia) modificó los datos
    const refreshFromStorage = debounce(() => {
        Layout.init('resultados', 'Resultados');
        refresh();
    }, 150);
    window.addEventListener('storage', event => {
        if (event.key === null || WATCHED_KEYS.includes(event.key)) refreshFromStorage();
    });
}

async function downloadPdf(button) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Generando PDF…';
    try {
        await ResultsPdf.generate({
            eventId: filters.eventId || undefined,
            categoryId: filters.categoryId || undefined
        });
    } finally {
        button.disabled = false;
        button.textContent = label;
    }
}

function changePage(step) {
    view.page += step;
    render();
    els.content.querySelector('table')?.scrollIntoView({ block: 'nearest' });
}

// ===================== Render =====================

function refresh() {
    lastUpdate = new Date();
    fillFilterOptions();
    render();
}

function render() {
    const rows = DataExporter.filterResultRows(db.getResultRows(filters), filters);

    renderSubtitle();
    renderStats(rows);
    if (db.getStats().results === 0) {
        els.content.innerHTML = renderEmpty({
            title: 'Aún no hay resultados',
            message: 'Cuando se registren tiempos en la competencia aparecerán aquí automáticamente.',
            action: html`<a class="btn btn-primary" href="competencia.html?tab=tiempos">Registrar tiempos</a>`
        });
    } else if (rows.length === 0) {
        els.content.innerHTML = renderEmpty({
            title: 'Sin coincidencias',
            message: 'Ningún resultado cumple los filtros seleccionados.',
            action: html`<button type="button" class="btn" data-action="clear-filters">Limpiar filtros</button>`
        });
    } else {
        els.content.innerHTML = html`${renderPodiums(rows)}${renderTable(rows)}`;
    }
}

function renderSubtitle() {
    const pad = number => String(number).padStart(2, '0');
    const time = `${pad(lastUpdate.getHours())}:${pad(lastUpdate.getMinutes())}`;
    els.subtitle.textContent = `${db.getEventConfig().name} · Última actualización ${time}`;
}

function renderStats(rows) {
    const count = status => rows.filter(row => row.status === status).length;
    const tiles = [
        { value: rows.length, label: 'Resultados registrados' },
        { value: count('OK'), label: 'Tiempos válidos', tone: 'ok' },
        { value: count('DQ'), label: 'Descalificados', tone: 'bad' },
        { value: new Set(rows.map(row => row.event_id)).size, label: 'Pruebas con resultados' }
    ];
    els.stats.innerHTML = html`${tiles.map(tile => html`
        <div class="stat ${tile.tone || ''}">
            <div class="stat-value">${tile.value}</div>
            <div class="stat-label">${tile.label}</div>
        </div>`)}`;
}

function renderEmpty({ title, message, action }) {
    return html`
        <section class="card">
            <div class="empty-state">
                <h3>${title}</h3>
                <p>${message}</p>
                ${action}
            </div>
        </section>`;
}

// ===================== Podios =====================

function podiumGroups(rows) {
    const groups = new Map();
    rows.filter(row => row.status === 'OK' && row.position <= 3).forEach(row => {
        if (!groups.has(row.event_id)) groups.set(row.event_id, []);
        groups.get(row.event_id).push(row);
    });
    return [...groups.values()];
}

function renderPodiums(rows) {
    const groups = podiumGroups(rows);
    if (groups.length === 0) return '';

    const collapsible = groups.length > COLLAPSED_PODIUMS;
    const visible = collapsible && !view.showAllPodiums ? groups.slice(0, COLLAPSED_PODIUMS) : groups;
    return html`
        <section class="card">
            <div class="card-header">
                <h2>Podios</h2>
                ${collapsible ? html`
                    <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-podiums" aria-expanded="${String(view.showAllPodiums)}">
                        ${view.showAllPodiums ? 'Ver menos' : `Ver todos (${groups.length})`}
                    </button>` : ''}
            </div>
            <div class="podium-grid">${visible.map(renderPodiumCard)}</div>
        </section>`;
}

function renderPodiumCard(group) {
    return html`
        <article class="podium-card">
            <h3>${group[0].event_name}<small>${group[0].category_name}</small></h3>
            ${group.map(row => html`
                <div class="podium-row p${row.position}">
                    <span class="podium-medal">${row.position}</span>
                    <div>
                        <div class="podium-name">${row.participant_name}</div>
                        <div class="podium-meta">${row.club || 'Sin club'}</div>
                    </div>
                    <span class="podium-time time">${formatTime(row.time)}</span>
                </div>`)}
        </article>`;
}

// ===================== Tabla =====================

function renderTable(rows) {
    const totalPages = Math.ceil(rows.length / PAGE_SIZE);
    view.page = Math.min(Math.max(view.page, 1), totalPages);
    const start = (view.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    return html`
        <section class="card">
            <div class="card-header"><h2>Tabla de resultados</h2></div>
            <div class="table-wrap">
                <table>
                    <caption class="sr-only">Resultados por prueba</caption>
                    <thead>
                        <tr>
                            <th class="center">Pos</th><th>Participante</th><th>Club</th><th>Categoría</th><th>Prueba</th>
                            <th class="center">Serie</th><th class="center">Carril</th><th class="num">Tiempo</th><th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>${pageRows.map(renderTableRow)}</tbody>
                </table>
            </div>
            <div class="table-footer">
                <span>Mostrando ${start + 1}–${start + pageRows.length} de ${rows.length}</span>
                ${totalPages > 1 ? html`
                    <span class="flex items-center gap-8">
                        <button type="button" class="btn btn-sm" data-action="prev-page" ${view.page === 1 ? raw('disabled') : ''}>Anterior</button>
                        <span>Página ${view.page} de ${totalPages}</span>
                        <button type="button" class="btn btn-sm" data-action="next-page" ${view.page === totalPages ? raw('disabled') : ''}>Siguiente</button>
                    </span>` : ''}
            </div>
        </section>`;
}

function renderTableRow(row) {
    const isValid = row.status === 'OK';
    return html`
        <tr>
            <td class="center">${isValid ? row.position : '—'}</td>
            <td><strong>${row.participant_name}</strong></td>
            <td>${row.club || '—'}</td>
            <td>${row.category_name}</td>
            <td>${row.event_name}</td>
            <td class="center">${row.heat || '—'}</td>
            <td class="center">${row.lane || '—'}</td>
            <td class="num time">${isValid ? formatTime(row.time) : '—'}</td>
            <td><span class="badge ${row.status.toLowerCase()}" title="${STATUS_TITLES[row.status]}">${row.status}</span></td>
        </tr>`;
}
