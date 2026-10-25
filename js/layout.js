/**
 * Layout compartido: inyecta cabecera, navegación y pie en todas las páginas.
 * Cada página incluye <header id="app-header">, <main class="app-main"> y <footer id="app-footer">
 * y llama a Layout.init('clave', 'Título de la página').
 */

const Layout = {
    PRODUCT: 'SwimMeet Manager',

    NAV: [
        { key: 'inicio', href: 'index.html', label: 'Inicio' },
        { key: 'datos', href: 'datos.html', label: 'Datos' },
        { key: 'competencia', href: 'competencia.html', label: 'Competencia' },
        { key: 'resultados', href: 'resultados.html', label: 'Resultados' },
        { key: 'evento', href: 'evento.html', label: 'Evento' },
        { key: 'ajustes', href: 'ajustes.html', label: 'Ajustes' }
    ],

    LOGO: `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
        <circle cx="22" cy="8" r="3" fill="currentColor" stroke="none"/>
        <path d="M3 15c3 0 3-2.5 6-2.5s3 2.5 6 2.5 3-2.5 6-2.5 3 2.5 6 2.5"/>
        <path d="M3 22c3 0 3-2.5 6-2.5s3 2.5 6 2.5 3-2.5 6-2.5 3 2.5 6 2.5"/>
    </svg>`,

    init(activeKey, pageTitle) {
        const config = db.getEventConfig();
        document.title = `${pageTitle} · ${config.name}`;
        this.renderHeader(activeKey, config);
        this.renderFooter(config);
    },

    renderHeader(activeKey, config) {
        const header = document.getElementById('app-header');
        if (!header) return;

        header.className = 'app-header';
        header.innerHTML = html`
            <div class="app-header-inner">
                <a class="brand" href="index.html">
                    ${raw(this.LOGO)}
                    <span>${this.PRODUCT}<small>${config.name}</small></span>
                </a>
                <button class="nav-toggle" type="button" aria-label="Abrir menú" aria-expanded="false">&#9776;</button>
                <nav class="nav" aria-label="Principal">
                    ${this.NAV.map(item => html`<a href="${item.href}" ${item.key === activeKey ? raw('aria-current="page"') : ''}>${item.label}</a>`)}
                </nav>
            </div>
        `;

        const toggle = header.querySelector('.nav-toggle');
        const nav = header.querySelector('.nav');
        toggle.addEventListener('click', () => {
            const open = nav.classList.toggle('open');
            toggle.setAttribute('aria-expanded', String(open));
        });
    },

    renderFooter(config) {
        const footer = document.getElementById('app-footer');
        if (!footer) return;

        const details = [formatDate(config.date), config.venue, config.city].filter(Boolean).join(' · ');
        footer.className = 'app-footer';
        footer.innerHTML = html`
            <p><strong>${config.name}</strong></p>
            ${details ? html`<p>${details}</p>` : ''}
            <p>${this.PRODUCT} · Los datos se guardan solo en este navegador</p>
        `;
    }
};
