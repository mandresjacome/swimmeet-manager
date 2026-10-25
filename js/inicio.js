/** Página de inicio: resumen del evento, avance y primeros pasos. */

document.addEventListener('DOMContentLoaded', () => {
    Layout.init('inicio', 'Inicio');
    render();
    on(document.getElementById('demoCard'), 'click', '[data-action="demo"]', loadDemo);
});

function render() {
    const config = db.getEventConfig();
    const stats = db.getStats();

    renderHero(config);
    renderStats(stats);
    renderSteps(config, stats);
    renderProgress(stats);
    document.getElementById('demoCard').hidden = stats.categories > 0 || stats.participants > 0;
}

function renderHero(config) {
    const chips = [
        config.date && formatDate(config.date),
        config.startTime && `${config.startTime} h`,
        [config.venue, config.city].filter(Boolean).join(', '),
        config.organizer
    ].filter(Boolean);

    document.getElementById('hero').innerHTML = html`
        <h1>${config.name}</h1>
        <p>${config.description || 'Configura los datos de tu evento para empezar.'}</p>
        ${chips.length ? html`<div class="hero-meta">${chips.map(chip => html`<span>${chip}</span>`)}</div>` : ''}
        <div class="mt-16"><a class="btn btn-sm" href="ajustes.html">Editar evento</a></div>
    `;
}

function renderStats(stats) {
    const cards = [
        { value: stats.participants, label: 'Participantes' },
        { value: stats.events, label: `Pruebas en ${stats.categories} categorías` },
        { value: stats.entries, label: 'Inscripciones' },
        { value: stats.results, label: 'Resultados registrados', tone: stats.results ? 'ok' : '' }
    ];
    document.getElementById('stats').innerHTML = html`${cards.map(card => html`
        <div class="stat ${card.tone || ''}">
            <div class="stat-value">${card.value}</div>
            <div class="stat-label">${card.label}</div>
        </div>`)}`;
}

function renderSteps(config, stats) {
    const eventConfigured = Boolean(config.organizer || config.venue || config.date);
    const steps = [
        { title: 'Configura tu evento', desc: 'Nombre, fecha, sede, carriles y contactos.', done: eventConfigured, href: 'ajustes.html', cta: 'Configurar' },
        { title: 'Crea categorías y pruebas', desc: 'Parte de una plantilla o créalas a mano.', done: stats.categories > 0 && stats.events > 0, href: 'ajustes.html#plantillas', cta: 'Elegir plantilla' },
        { title: 'Registra a los participantes', desc: 'Uno a uno o importando un archivo CSV.', done: stats.participants > 0, href: 'datos.html?tab=participantes', cta: 'Agregar' },
        { title: 'Inscribe y asigna carriles', desc: 'Reparte a los nadadores en series y carriles.', done: stats.entries > 0 && stats.assigned === stats.entries, href: 'competencia.html?tab=inscripciones', cta: 'Inscripciones' },
        { title: 'Registra los tiempos', desc: 'Digita tiempos y estados serie por serie.', done: stats.results > 0, href: 'competencia.html?tab=tiempos', cta: 'Registrar' },
        { title: 'Publica los resultados', desc: 'Podios, tabla completa, CSV y PDF.', done: stats.entries > 0 && stats.results === stats.entries, href: 'resultados.html', cta: 'Ver resultados' }
    ];

    const completed = steps.filter(step => step.done).length;
    const summary = document.getElementById('stepsSummary');
    summary.textContent = `${completed} de ${steps.length}`;
    summary.className = 'badge' + (completed === steps.length ? ' ok' : '');

    document.getElementById('steps').innerHTML = html`${steps.map((step, i) => html`
        <li class="${step.done ? 'done' : ''}">
            <span class="step-mark">${step.done ? '✓' : i + 1}</span>
            <div class="step-body">
                <div class="step-title">${step.title}</div>
                <div class="step-desc">${step.desc}</div>
            </div>
            <a class="btn btn-sm ${step.done ? '' : 'btn-primary'}" href="${step.href}">${step.cta}</a>
        </li>`)}`;
}

function renderProgress(stats) {
    const el = document.getElementById('progress');
    if (!stats.entries) {
        el.innerHTML = html`<p class="muted mb-0">Cuando existan inscripciones verás aquí cuántas pruebas ya tienen resultado.</p>`;
        return;
    }
    el.innerHTML = html`
        <div class="flex between items-center mb-8">
            <strong>${stats.completion}% completado</strong>
            <span class="muted small">${stats.results} de ${stats.entries} inscripciones con resultado</span>
        </div>
        <div class="progress" role="progressbar" aria-valuenow="${stats.completion}" aria-valuemin="0" aria-valuemax="100"><span style="width: ${stats.completion}%"></span></div>
        <div class="pill-list mt-16">
            <span class="badge ok">${stats.ok} válidos</span>
            <span class="badge dq">${stats.dq} descalificados</span>
            <span class="badge">${stats.eventsWithResults} de ${stats.events} pruebas con resultados</span>
            <span class="badge pending">${stats.entries - stats.assigned} sin carril</span>
        </div>
    `;
}

function loadDemo(button) {
    const withResults = button.dataset.results === 'true';
    const summary = loadDemoEvent(db, { withResults });
    toast(`Demo cargada: ${summary.participants} participantes y ${summary.entries} inscripciones`, 'success');
    Layout.init('inicio', 'Inicio');
    render();
}
