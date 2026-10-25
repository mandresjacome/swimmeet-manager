/**
 * Página de información del evento: se genera por completo desde db.getEventConfig()
 * y el catálogo de categorías y pruebas.
 */

const PHONE_PATTERN = /^\+?[\d\s().-]{6,24}$/;
const EMAIL_PATTERN = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

document.addEventListener('DOMContentLoaded', () => {
    Layout.init('evento', 'Evento');
    renderEventPage(document.getElementById('evento-content'));
});

function renderEventPage(container) {
    const config = db.getEventConfig();
    const schedule = config.schedule.filter(item => item.time || item.label);

    container.innerHTML = html`
        ${renderHero(config)}
        ${hasEventDetails(config) ? '' : renderSetupNotice()}
        ${renderStats(db.getStats())}
        ${schedule.length ? renderSchedule(schedule) : ''}
        ${config.rules.length ? renderRules(config.rules) : ''}
        ${config.contacts.length ? renderContacts(config.contacts) : ''}
        ${renderCategories()}`;
}

/** La configuración inicial solo trae nombre, carriles y largo de piscina. */
function hasEventDetails(config) {
    return Boolean(
        config.organizer || config.venue || config.city || config.date || config.startTime || config.description
        || config.contacts.length || config.rules.length || config.schedule.length
    );
}

function renderSetupNotice() {
    return html`
        <div class="alert info">
            Aún no se han completado los datos del evento (organizador, lugar, fecha, horarios, reglas y contactos).
            <a href="ajustes.html">Editar el evento en Ajustes</a>.
        </div>`;
}

function renderHero(config) {
    const place = [config.venue, config.city].filter(Boolean).join(', ');
    const chips = [
        config.date && formatDate(config.date),
        config.startTime && `Inicio ${config.startTime}`,
        place,
        `Piscina de ${config.poolLength} m · ${config.lanes} carriles`
    ].filter(Boolean);

    return html`
        <section class="hero">
            <h1>${config.name}</h1>
            ${config.organizer ? html`<p>Organiza: ${config.organizer}</p>` : ''}
            ${config.description ? html`<p class="pre-line mt-8">${config.description}</p>` : ''}
            <div class="hero-meta">${chips.map(chip => html`<span>${chip}</span>`)}</div>
        </section>`;
}

function renderStats(stats) {
    const tiles = [
        { value: stats.categories, label: 'Categorías' },
        { value: stats.events, label: 'Pruebas' },
        { value: stats.participants, label: 'Participantes' },
        { value: stats.entries, label: 'Inscripciones' }
    ];
    return html`
        <div class="stats">${tiles.map(tile => html`
            <div class="stat"><div class="stat-value">${tile.value}</div><div class="stat-label">${tile.label}</div></div>`)}
        </div>`;
}

function renderSchedule(schedule) {
    return html`
        <section class="card">
            <div class="card-header"><h2>Programa</h2></div>
            <ol class="timeline">${schedule.map(item => html`
                <li><span class="timeline-time">${item.time}</span><span>${item.label}</span></li>`)}
            </ol>
        </section>`;
}

function renderRules(rules) {
    return html`
        <section class="card">
            <div class="card-header"><h2>Reglas</h2></div>
            <ul class="rules-list">${rules.map(rule => html`<li>${rule}</li>`)}</ul>
        </section>`;
}

function renderContacts(contacts) {
    return html`
        <section class="card">
            <div class="card-header"><h2>Contacto</h2></div>
            <div class="contact-grid">${contacts.map(renderContactCard)}</div>
        </section>`;
}

function renderContactCard(contact) {
    return html`
        <article class="contact-card">
            <strong>${contact.name}</strong>
            ${contact.role ? html`<div class="contact-role">${contact.role}</div>` : ''}
            ${contactLink(contact.phone, PHONE_PATTERN, value => `tel:${value.replace(/[^\d+]/g, '')}`)}
            ${contactLink(contact.email, EMAIL_PATTERN, value => `mailto:${encodeURI(value)}`)}
        </article>`;
}

/** Enlace solo si el valor tiene un formato razonable; si no, texto plano. */
function contactLink(value, pattern, toHref) {
    const text = String(value || '').trim();
    if (!text) return '';
    return pattern.test(text) ? html`<a href="${toHref(text)}">${text}</a>` : html`<span>${text}</span>`;
}

function renderCategories() {
    const categories = db.getCategories();
    if (categories.length === 0) {
        return html`
            <section class="card">
                <div class="card-header"><h2>Categorías y pruebas</h2></div>
                <div class="empty-state">
                    <h3>Aún no hay categorías</h3>
                    <p>Crea las categorías y pruebas del evento para mostrarlas aquí.</p>
                    <a class="btn btn-primary" href="datos.html">Ir a Datos</a>
                </div>
            </section>`;
    }

    return html`
        <section class="card">
            <div class="card-header"><h2>Categorías y pruebas</h2></div>
            ${categories.map(renderCategoryBlock)}
        </section>`;
}

function renderCategoryBlock(category) {
    const events = db.getEventsByCategory(category.category_id);
    return html`
        <div class="category-block">
            <div class="category-block-header">
                <h3>${category.category_name}</h3>
                <a class="small" href="resultados.html?category=${encodeURIComponent(category.category_id)}">Ver resultados</a>
            </div>
            ${events.length ? html`
                <div class="pill-list">${events.map(event => html`
                    <a class="badge" href="resultados.html?event=${encodeURIComponent(event.event_id)}">${event.event_name}</a>`)}
                </div>` : html`<p class="muted small mb-0">Sin pruebas todavía.</p>`}
        </div>`;
}
