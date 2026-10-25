/**
 * Utilidades compartidas de SwimMeet Manager.
 * Las funciones puras se pueden probar en Node; las de DOM solo existen en el navegador.
 */

// ===================== Escapado seguro de HTML =====================

class SafeHtml {
    constructor(value) { this.value = String(value); }
    toString() { return this.value; }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Marca un texto como HTML ya seguro (úsalo solo con contenido propio). */
function raw(value) { return new SafeHtml(value); }

function renderValue(value) {
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(renderValue).join('');
    if (value === null || value === undefined || value === false) return '';
    return escapeHtml(value);
}

/**
 * Plantilla etiquetada: escapa cada valor interpolado automáticamente.
 *   el.innerHTML = html`<td>${nombre}</td>`;
 * Las listas se concatenan y se pueden anidar plantillas html``.
 */
function html(strings, ...values) {
    let out = strings[0];
    values.forEach((value, i) => { out += renderValue(value) + strings[i + 1]; });
    return new SafeHtml(out);
}

// ===================== Texto =====================

function normalizeText(text) {
    if (!text) return '';
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function debounce(fn, wait = 200) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

// ===================== Tiempos =====================

/** 65.32 → "1:05.32"; 31.5 → "31.50"; null → "—" */
function formatTime(seconds) {
    if (seconds === null || seconds === undefined || seconds === '' || Number.isNaN(Number(seconds))) return '—';
    const total = Math.round(Number(seconds) * 100) / 100;
    const minutes = Math.floor(total / 60);
    const rest = (total - minutes * 60).toFixed(2).padStart(5, '0');
    return minutes > 0 ? `${minutes}:${rest}` : rest;
}

/**
 * Acepta "31.5", "31,5", "1:05.32", "1:05". Devuelve segundos,
 * null si el texto está vacío y NaN si es inválido.
 */
function parseTime(text) {
    const value = String(text ?? '').trim().replace(',', '.');
    if (value === '') return null;
    const match = /^(?:(\d{1,3}):)?(\d{1,3})(?:\.(\d{1,3}))?$/.exec(value);
    if (!match) return NaN;
    const minutes = match[1] ? parseInt(match[1], 10) : 0;
    const seconds = parseInt(match[2], 10);
    const fraction = match[3] ? parseFloat('0.' + match[3]) : 0;
    if (match[1] && seconds >= 60) return NaN;
    const total = minutes * 60 + seconds + fraction;
    return total > 0 ? Math.round(total * 100) / 100 : NaN;
}

// ===================== Fechas =====================

/** "2025-11-02" → "domingo, 2 de noviembre de 2025" (sin desfase de zona horaria) */
function formatDate(isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
    if (!match) return '';
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ===================== Archivos =====================

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsText(file);
    });
}

// ===================== Toasts y modales (solo navegador) =====================

function toast(message, type = 'info', duration = 3500) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.className = 'toast-stack';
        stack.setAttribute('role', 'status');
        stack.setAttribute('aria-live', 'polite');
        document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), duration);
}

/**
 * Abre un modal. `body` y `footer` pueden ser SafeHtml, texto o nodos.
 * Devuelve { el, close }.
 */
function openModal({ title, body, footer, wide = false, onClose }) {
    const previouslyFocused = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal' + (wide ? ' wide' : '');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', title);
    modal.innerHTML = html`
        <div class="modal-header">
            <h2>${title}</h2>
            <button type="button" class="modal-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body"></div>
        ${footer ? raw('<div class="modal-footer"></div>') : ''}
    `;

    const fill = (container, content) => {
        if (!container || content === undefined) return;
        if (content instanceof Node) container.appendChild(content);
        else container.innerHTML = renderValue(content);
    };
    fill(modal.querySelector('.modal-body'), body);
    fill(modal.querySelector('.modal-footer'), footer);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    function close(result) {
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
        if (onClose) onClose(result);
    }
    function onKey(event) { if (event.key === 'Escape') close(false); }

    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', event => { if (event.target === backdrop) close(false); });
    modal.querySelector('.modal-close').addEventListener('click', () => close(false));

    const firstField = modal.querySelector('input:not([type=hidden]), select, textarea');
    (firstField || modal.querySelector('.modal-close')).focus();

    return { el: modal, close };
}

/** Confirmación asíncrona: await confirmDialog({ message, danger: true }) */
function confirmDialog({ title = 'Confirmar', message, confirmText = 'Aceptar', cancelText = 'Cancelar', danger = false }) {
    return new Promise(resolve => {
        let settled = false;
        const finish = value => { if (!settled) { settled = true; resolve(value); } };

        const modal = openModal({
            title,
            body: html`<p class="mb-0">${message}</p>`,
            footer: html`
                <button type="button" class="btn" data-role="cancel">${cancelText}</button>
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-role="ok">${confirmText}</button>
            `,
            onClose: () => finish(false)
        });
        modal.el.querySelector('[data-role=cancel]').addEventListener('click', () => modal.close(false));
        const ok = modal.el.querySelector('[data-role=ok]');
        ok.addEventListener('click', () => { finish(true); modal.close(true); });
        ok.focus();
    });
}

/**
 * Modal con formulario. `fields` es HTML (SafeHtml) con inputs con atributo name.
 * onSubmit(values, form) puede devolver false para mantener el modal abierto.
 */
function openForm({ title, fields, submitLabel = 'Guardar', wide = false, onSubmit }) {
    const form = document.createElement('form');
    form.noValidate = false;
    form.innerHTML = html`
        ${fields}
        <div class="form-actions">
            <button type="button" class="btn" data-role="cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">${submitLabel}</button>
        </div>
    `;
    const modal = openModal({ title, body: form, wide });
    form.querySelector('[data-role=cancel]').addEventListener('click', () => modal.close(false));
    form.addEventListener('submit', event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        if (onSubmit(values, form) !== false) modal.close(true);
    });
    return modal;
}

/** Delegación de eventos: on(contenedor, 'click', '[data-action]', (el, event) => ...) */
function on(container, type, selector, handler) {
    container.addEventListener(type, event => {
        const target = event.target.closest(selector);
        if (target && container.contains(target)) handler(target, event);
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SafeHtml, escapeHtml, raw, html, normalizeText, debounce, formatTime, parseTime, formatDate };
}
