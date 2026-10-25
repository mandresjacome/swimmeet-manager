/**
 * SwimMeet Manager — capa de datos
 * Persiste en localStorage: categorías, pruebas, participantes, inscripciones,
 * resultados y configuración del evento.
 */

// Clave de comparación sin tildes ni mayúsculas ("Máster " == "master")
function normalizeKey(text) {
    return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

class SwimmingDatabase {
    static get STATUSES() { return ['OK', 'DQ', 'DNS', 'DNF']; }

    constructor() {
        this.initDatabase();
    }

    initDatabase() {
        // Inicializar estructuras si no existen
        if (!localStorage.getItem('categories')) {
            localStorage.setItem('categories', JSON.stringify([]));
        }
        if (!localStorage.getItem('events')) {
            localStorage.setItem('events', JSON.stringify([]));
        }
        if (!localStorage.getItem('participants')) {
            localStorage.setItem('participants', JSON.stringify([]));
        }
        if (!localStorage.getItem('entries')) {
            localStorage.setItem('entries', JSON.stringify([]));
        }
        if (!localStorage.getItem('results')) {
            localStorage.setItem('results', JSON.stringify([]));
        }
    }

    // ===================== CATEGORIES =====================
    
    getCategories() {
        return JSON.parse(localStorage.getItem('categories') || '[]');
    }

    addCategory(name) {
        const cleanName = String(name ?? '').trim();
        if (!cleanName) return { error: 'El nombre de la categoría es obligatorio' };

        const categories = this.getCategories();
        if (categories.some(c => normalizeKey(c.category_name) === normalizeKey(cleanName))) {
            return { error: 'Ya existe una categoría con ese nombre' };
        }

        const id = this.nextId('C', categories, 'category_id');
        const category = {
            category_id: id,
            category_name: cleanName
        };
        categories.push(category);
        localStorage.setItem('categories', JSON.stringify(categories));
        return category;
    }

    updateCategory(id, name) {
        const cleanName = String(name ?? '').trim();
        if (!cleanName) return { error: 'El nombre de la categoría es obligatorio' };

        const categories = this.getCategories();
        const index = categories.findIndex(c => c.category_id === id);
        if (index === -1) return false;
        if (categories.some(c => c.category_id !== id && normalizeKey(c.category_name) === normalizeKey(cleanName))) {
            return { error: 'Ya existe una categoría con ese nombre' };
        }
        categories[index].category_name = cleanName;
        localStorage.setItem('categories', JSON.stringify(categories));
        return true;
    }

    /** Elimina la categoría y, en cascada, sus pruebas, inscripciones y resultados. */
    deleteCategory(id) {
        this.getEventsByCategory(id).forEach(e => this.deleteEvent(e.event_id));
        const categories = this.getCategories().filter(c => c.category_id !== id);
        localStorage.setItem('categories', JSON.stringify(categories));
        return true;
    }

    getCategoryById(id) {
        const categories = this.getCategories();
        return categories.find(c => c.category_id === id);
    }

    // ===================== EVENTS =====================
    
    getEvents() {
        return JSON.parse(localStorage.getItem('events') || '[]');
    }

    addEvent(name, categoryId) {
        const cleanName = String(name ?? '').trim();
        if (!cleanName) return { error: 'El nombre de la prueba es obligatorio' };
        if (!this.getCategoryById(categoryId)) return { error: 'La categoría seleccionada no existe' };

        const events = this.getEvents();
        if (events.some(e => e.category_id === categoryId && normalizeKey(e.event_name) === normalizeKey(cleanName))) {
            return { error: 'Esa categoría ya tiene una prueba con ese nombre' };
        }

        const id = this.nextId('E', events, 'event_id');
        const event = {
            event_id: id,
            event_name: cleanName,
            category_id: categoryId
        };
        events.push(event);
        localStorage.setItem('events', JSON.stringify(events));
        return event;
    }

    updateEvent(id, name, categoryId) {
        const cleanName = String(name ?? '').trim();
        if (!cleanName) return { error: 'El nombre de la prueba es obligatorio' };
        if (!this.getCategoryById(categoryId)) return { error: 'La categoría seleccionada no existe' };

        const events = this.getEvents();
        const index = events.findIndex(e => e.event_id === id);
        if (index === -1) return false;
        if (events.some(e => e.event_id !== id && e.category_id === categoryId && normalizeKey(e.event_name) === normalizeKey(cleanName))) {
            return { error: 'Esa categoría ya tiene una prueba con ese nombre' };
        }
        events[index].event_name = cleanName;
        events[index].category_id = categoryId;
        localStorage.setItem('events', JSON.stringify(events));
        return true;
    }

    /** Elimina la prueba y, en cascada, sus inscripciones y resultados. */
    deleteEvent(id) {
        this.getEntriesByEvent(id).forEach(e => this.deleteEntry(e.entry_id));
        const events = this.getEvents().filter(e => e.event_id !== id);
        localStorage.setItem('events', JSON.stringify(events));
        return true;
    }

    getEventById(id) {
        const events = this.getEvents();
        return events.find(e => e.event_id === id);
    }

    getEventsByCategory(categoryId) {
        const events = this.getEvents();
        return events.filter(e => e.category_id === categoryId);
    }

    // ===================== PARTICIPANTS =====================
    
    getParticipants() {
        return JSON.parse(localStorage.getItem('participants') || '[]');
    }

    addParticipant(name, club = '', gender = '') {
        const cleanName = String(name ?? '').trim();
        if (!cleanName) return { error: 'El nombre del participante es obligatorio' };

        const participants = this.getParticipants();
        const id = this.nextId('P', participants, 'participant_id');
        const participant = {
            participant_id: id,
            name: cleanName,
            club_or_team: String(club ?? '').trim(),
            gender: gender
        };
        participants.push(participant);
        localStorage.setItem('participants', JSON.stringify(participants));
        return participant;
    }

    updateParticipant(id, name, club, gender) {
        const cleanName = String(name ?? '').trim();
        if (!cleanName) return { error: 'El nombre del participante es obligatorio' };

        const participants = this.getParticipants();
        const index = participants.findIndex(p => p.participant_id === id);
        if (index !== -1) {
            participants[index].name = cleanName;
            participants[index].club_or_team = String(club ?? '').trim();
            participants[index].gender = gender;
            localStorage.setItem('participants', JSON.stringify(participants));
            return true;
        }
        return false;
    }

    /** Elimina al participante y, en cascada, sus inscripciones y resultados. */
    deleteParticipant(id) {
        this.getEntries().filter(e => e.participant_id === id).forEach(e => this.deleteEntry(e.entry_id));
        const participants = this.getParticipants().filter(p => p.participant_id !== id);
        localStorage.setItem('participants', JSON.stringify(participants));
        return true;
    }

    getParticipantById(id) {
        const participants = this.getParticipants();
        return participants.find(p => p.participant_id === id);
    }

    // ===================== ENTRIES =====================
    
    getEntries() {
        return JSON.parse(localStorage.getItem('entries') || '[]');
    }

    addEntry(eventId, participantId, heat = 0, lane = 0) {
        if (!this.getEventById(eventId)) return { error: 'La prueba no existe' };
        if (!this.getParticipantById(participantId)) return { error: 'El participante no existe' };

        const heatNum = parseInt(heat, 10) || 0;
        const laneNum = parseInt(lane, 10) || 0;
        const slotError = this.validateSlot(heatNum, laneNum);
        if (slotError) return { error: slotError };

        const entries = this.getEntries();
        if (entries.some(e => e.event_id === eventId && e.participant_id === participantId)) {
            return { error: 'El participante ya está inscrito en esta prueba' };
        }
        if (heatNum && entries.some(e => e.event_id === eventId && e.heat === heatNum && e.lane === laneNum)) {
            return { error: 'El carril ya está ocupado en esa serie' };
        }

        const entry = {
            entry_id: this.nextId('EN', entries, 'entry_id'),
            event_id: eventId,
            participant_id: participantId,
            heat: heatNum,
            lane: laneNum
        };
        entries.push(entry);
        localStorage.setItem('entries', JSON.stringify(entries));
        return entry;
    }

    // Serie y carril van juntos: ambos 0 (sin asignar) o ambos válidos.
    validateSlot(heat, lane) {
        if (heat < 0 || lane < 0) return 'Serie y carril deben ser números positivos';
        if ((heat === 0) !== (lane === 0)) return 'Indica serie y carril, o deja ambos sin asignar';
        if (lane > this.getEventConfig().lanes) return `El carril máximo es ${this.getEventConfig().lanes}`;
        return null;
    }

    /** Asigna (o libera con 0/0) la serie y el carril de una inscripción. */
    assignLane(entryId, heat, lane) {
        const heatNum = parseInt(heat, 10) || 0;
        const laneNum = parseInt(lane, 10) || 0;
        const slotError = this.validateSlot(heatNum, laneNum);
        if (slotError) return { error: slotError };

        const entries = this.getEntries();
        const entry = entries.find(e => e.entry_id === entryId);
        if (!entry) return { error: 'La inscripción no existe' };

        if (heatNum && entries.some(e => e.entry_id !== entryId && e.event_id === entry.event_id && e.heat === heatNum && e.lane === laneNum)) {
            return { error: 'El carril ya está ocupado en esa serie' };
        }
        entry.heat = heatNum;
        entry.lane = laneNum;
        localStorage.setItem('entries', JSON.stringify(entries));
        return true;
    }

    /**
     * Reparte las inscripciones sin asignar de una prueba en series, llenando los
     * carriles libres. Devuelve cuántas inscripciones se asignaron.
     */
    autoAssignLanes(eventId, lanes = this.getEventConfig().lanes) {
        const entries = this.getEntries();
        const mine = entries.filter(e => e.event_id === eventId);
        const taken = new Set(mine.filter(e => e.heat && e.lane).map(e => `${e.heat}-${e.lane}`));
        const pending = mine.filter(e => !e.heat || !e.lane);

        let heat = 1;
        let lane = 1;
        pending.forEach(entry => {
            while (taken.has(`${heat}-${lane}`)) {
                lane++;
                if (lane > lanes) { lane = 1; heat++; }
            }
            entry.heat = heat;
            entry.lane = lane;
            taken.add(`${heat}-${lane}`);
        });

        if (pending.length) localStorage.setItem('entries', JSON.stringify(entries));
        return pending.length;
    }

    autoAssignAll(lanes = this.getEventConfig().lanes) {
        return this.getEvents().reduce((total, e) => total + this.autoAssignLanes(e.event_id, lanes), 0);
    }

    /** Inscribe al participante en todas las pruebas de una categoría. Devuelve las inscripciones creadas. */
    enrollInCategory(participantId, categoryId) {
        return this.getEventsByCategory(categoryId)
            .map(e => this.addEntry(e.event_id, participantId))
            .filter(result => !result.error);
    }

    deleteEntry(id) {
        const entries = this.getEntries().filter(e => e.entry_id !== id);
        localStorage.setItem('entries', JSON.stringify(entries));
        this.deleteResult(id);
        return true;
    }

    getEntriesByEvent(eventId) {
        const entries = this.getEntries();
        return entries.filter(e => e.event_id === eventId);
    }

    getEntriesByEventAndHeat(eventId, heat) {
        const entries = this.getEntries();
        return entries.filter(e => e.event_id === eventId && e.heat == heat)
            .sort((a, b) => a.lane - b.lane);
    }

    getAllEntries() {
        return this.getEntries();
    }

    getEntryById(entryId) {
        const entries = this.getEntries();
        return entries.find(e => e.entry_id === entryId);
    }

    /** Inscripciones de una prueba con su participante y resultado, ordenadas por serie y carril. */
    getEntryDetails(eventId) {
        const participants = new Map(this.getParticipants().map(p => [p.participant_id, p]));
        const results = new Map(this.getResults().map(r => [r.entry_id, r]));
        return this.getEntriesByEvent(eventId)
            .map(entry => ({ entry, participant: participants.get(entry.participant_id) || null, result: results.get(entry.entry_id) || null }))
            .sort((a, b) => {
                const unassignedA = a.entry.heat ? 0 : 1;
                const unassignedB = b.entry.heat ? 0 : 1;
                return unassignedA - unassignedB
                    || a.entry.heat - b.entry.heat
                    || a.entry.lane - b.entry.lane
                    || String(a.participant?.name).localeCompare(String(b.participant?.name), 'es');
            });
    }

    // ===================== RESULTS =====================
    
    getResults() {
        return JSON.parse(localStorage.getItem('results') || '[]');
    }

    /** Guarda (o reemplaza) el resultado de una inscripción. Solo `OK` lleva tiempo. */
    saveResult(entryId, timeSeconds, status = 'OK') {
        if (!this.getEntryById(entryId)) return { error: 'La inscripción no existe' };
        if (!SwimmingDatabase.STATUSES.includes(status)) return { error: `Estado inválido: ${status}` };

        let time = null;
        if (status === 'OK') {
            time = Math.round(Number(timeSeconds) * 100) / 100;
            if (!Number.isFinite(time) || time <= 0) return { error: 'El tiempo debe ser un número mayor que cero' };
        }

        const results = this.getResults();
        const result = {
            result_id: `R-${entryId}`,
            entry_id: entryId,
            time_seconds: time,
            status: status
        };

        const existingIndex = results.findIndex(r => r.entry_id === entryId);
        if (existingIndex !== -1) {
            results[existingIndex] = result;
        } else {
            results.push(result);
        }

        localStorage.setItem('results', JSON.stringify(results));
        return result;
    }

    deleteResult(entryId) {
        const results = this.getResults().filter(r => r.entry_id !== entryId);
        localStorage.setItem('results', JSON.stringify(results));
        return true;
    }

    getResultByEntryId(entryId) {
        const results = this.getResults();
        return results.find(r => r.entry_id === entryId);
    }

    /**
     * Resultados enriquecidos con prueba, categoría y participante, con posición por prueba
     * (ranking de competición: los empates comparten posición; solo `OK` puntúa).
     * Filtros opcionales: { eventId, categoryId }.
     */
    getResultRows({ eventId, categoryId } = {}) {
        const categories = this.getCategories();
        const events = this.getEvents();
        const categoryOrder = new Map(categories.map((c, i) => [c.category_id, i]));
        const eventOrder = new Map(events.map((e, i) => [e.event_id, i]));
        const categoryById = new Map(categories.map(c => [c.category_id, c]));
        const eventById = new Map(events.map(e => [e.event_id, e]));
        const participantById = new Map(this.getParticipants().map(p => [p.participant_id, p]));
        const entryById = new Map(this.getEntries().map(e => [e.entry_id, e]));

        const rows = [];
        this.getResults().forEach(result => {
            const entry = entryById.get(result.entry_id);
            const event = entry && eventById.get(entry.event_id);
            if (!event) return;
            if (eventId && event.event_id !== eventId) return;
            if (categoryId && event.category_id !== categoryId) return;
            const participant = participantById.get(entry.participant_id);
            const category = categoryById.get(event.category_id);

            rows.push({
                result_id: result.result_id,
                entry_id: entry.entry_id,
                event_id: event.event_id,
                event_name: event.event_name,
                category_id: event.category_id,
                category_name: category ? category.category_name : '',
                participant_id: entry.participant_id,
                participant_name: participant ? participant.name : '(participante eliminado)',
                club: participant ? participant.club_or_team : '',
                gender: participant ? participant.gender : '',
                heat: entry.heat,
                lane: entry.lane,
                time: result.time_seconds,
                status: result.status,
                position: null
            });
        });

        // Posiciones por prueba
        const byEvent = new Map();
        rows.forEach(row => {
            if (!byEvent.has(row.event_id)) byEvent.set(row.event_id, []);
            byEvent.get(row.event_id).push(row);
        });
        byEvent.forEach(group => {
            const ranked = group.filter(r => r.status === 'OK').sort((a, b) => a.time - b.time);
            ranked.forEach((row, index) => {
                row.position = index > 0 && row.time === ranked[index - 1].time ? ranked[index - 1].position : index + 1;
            });
        });

        const statusOrder = { OK: 0, DNF: 1, DQ: 2, DNS: 3 };
        return rows.sort((a, b) =>
            (categoryOrder.get(a.category_id) ?? 0) - (categoryOrder.get(b.category_id) ?? 0)
            || (eventOrder.get(a.event_id) ?? 0) - (eventOrder.get(b.event_id) ?? 0)
            || statusOrder[a.status] - statusOrder[b.status]
            || (a.time ?? Infinity) - (b.time ?? Infinity)
            || a.participant_name.localeCompare(b.participant_name, 'es'));
    }

    /** Contadores para el panel de inicio. */
    getStats() {
        const entries = this.getEntries();
        const results = this.getResults();
        const eventsWithResults = new Set(
            results.map(r => entries.find(e => e.entry_id === r.entry_id)).filter(Boolean).map(e => e.event_id)
        );
        return {
            categories: this.getCategories().length,
            events: this.getEvents().length,
            participants: this.getParticipants().length,
            entries: entries.length,
            assigned: entries.filter(e => e.heat && e.lane).length,
            results: results.length,
            ok: results.filter(r => r.status === 'OK').length,
            dq: results.filter(r => r.status === 'DQ').length,
            eventsWithResults: eventsWithResults.size,
            completion: entries.length ? Math.round((results.length / entries.length) * 100) : 0
        };
    }

    // ===================== EVENT CONFIG =====================

    static get DEFAULT_EVENT_CONFIG() {
        return {
            name: 'Mi competencia de natación',
            organizer: '',
            venue: '',
            city: '',
            date: '',
            startTime: '',
            description: '',
            lanes: 6,
            poolLength: 25,
            contacts: [],
            rules: [],
            schedule: []
        };
    }

    getEventConfig() {
        let stored = {};
        try {
            stored = JSON.parse(localStorage.getItem('eventConfig') || '{}') || {};
        } catch (error) {
            stored = {};
        }
        return { ...SwimmingDatabase.DEFAULT_EVENT_CONFIG, ...stored };
    }

    /** Devuelve la lista de errores de una configuración (vacía si es válida). */
    validateEventConfig(config) {
        const errors = [];
        if (!config || typeof config !== 'object' || Array.isArray(config)) return ['La configuración debe ser un objeto'];

        ['name', 'organizer', 'venue', 'city', 'description'].forEach(key => {
            if (config[key] !== undefined && typeof config[key] !== 'string') errors.push(`"${key}" debe ser texto`);
        });
        if (config.name !== undefined && String(config.name).trim() === '') errors.push('El nombre del evento es obligatorio');
        if (config.date !== undefined && config.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(config.date)) errors.push('La fecha debe tener formato AAAA-MM-DD');
        if (config.startTime !== undefined && config.startTime !== '' && !/^\d{2}:\d{2}$/.test(config.startTime)) errors.push('La hora debe tener formato HH:MM');
        if (config.lanes !== undefined && !(Number.isInteger(config.lanes) && config.lanes >= 1 && config.lanes <= 12)) errors.push('Los carriles deben ser un entero entre 1 y 12');
        if (config.poolLength !== undefined && ![25, 50].includes(config.poolLength)) errors.push('La piscina debe ser de 25 o 50 metros');

        const listOfObjects = (key, fields) => {
            if (config[key] === undefined) return;
            if (!Array.isArray(config[key])) { errors.push(`"${key}" debe ser una lista`); return; }
            config[key].forEach((item, i) => {
                if (!item || typeof item !== 'object' || fields.some(f => typeof item[f] !== 'string')) {
                    errors.push(`${key}[${i}] debe tener los campos de texto: ${fields.join(', ')}`);
                }
            });
        };
        listOfObjects('contacts', ['name', 'role', 'phone', 'email']);
        listOfObjects('schedule', ['time', 'label']);
        if (config.rules !== undefined && (!Array.isArray(config.rules) || config.rules.some(r => typeof r !== 'string'))) {
            errors.push('"rules" debe ser una lista de textos');
        }
        return errors;
    }

    /** Guarda cambios parciales de la configuración. Devuelve la configuración o { error }. */
    saveEventConfig(changes) {
        const merged = { ...this.getEventConfig(), ...changes };
        if (typeof merged.name === 'string') merged.name = merged.name.trim();
        const errors = this.validateEventConfig(merged);
        if (errors.length) return { error: errors[0], errors };
        localStorage.setItem('eventConfig', JSON.stringify(merged));
        return merged;
    }

    // ===================== UTILITIES =====================
    
    generateId(prefix, index) {
        const paddedIndex = String(index + 1).padStart(3, '0');
        return `${prefix}-${paddedIndex}`;
    }

    // Siguiente ID libre: usa el mayor sufijo existente, no la cantidad de registros,
    // para no repetir IDs después de eliminar elementos.
    nextId(prefix, items, field) {
        const pattern = new RegExp(`^${prefix}-(\\d+)$`);
        const max = items.reduce((acc, item) => {
            const match = pattern.exec(item && item[field]);
            return match ? Math.max(acc, parseInt(match[1], 10)) : acc;
        }, 0);
        return this.generateId(prefix, max);
    }

    exportData() {
        return {
            app: 'SwimMeet Manager',
            version: 2,
            eventConfig: this.getEventConfig(),
            categories: this.getCategories(),
            events: this.getEvents(),
            participants: this.getParticipants(),
            entries: this.getEntries(),
            results: this.getResults(),
            exportDate: new Date().toISOString()
        };
    }

    // Campos obligatorios (string) por colección; el primero es el identificador
    static get IMPORT_SCHEMA() {
        return {
            categories: ['category_id', 'category_name'],
            events: ['event_id', 'event_name', 'category_id'],
            participants: ['participant_id', 'name'],
            entries: ['entry_id', 'event_id', 'participant_id'],
            results: ['entry_id']
        };
    }

    /**
     * Valida la estructura de un respaldo sin modificar nada.
     * Devuelve { valid, errors }.
     */
    validateImportData(data) {
        const errors = [];

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return { valid: false, errors: ['El respaldo debe ser un objeto JSON'] };
        }

        const schema = SwimmingDatabase.IMPORT_SCHEMA;
        const present = Object.keys(schema).filter(key => data[key] !== undefined);
        if (present.length === 0 && data.eventConfig === undefined) {
            return { valid: false, errors: ['El archivo no contiene datos reconocibles (eventConfig, categories, events, participants, entries, results)'] };
        }
        if (data.eventConfig !== undefined) {
            errors.push(...this.validateEventConfig(data.eventConfig));
        }

        present.forEach(key => {
            const items = data[key];
            if (!Array.isArray(items)) {
                errors.push(`"${key}" debe ser una lista`);
                return;
            }

            const idField = schema[key][0];
            const seen = new Set();
            items.forEach((item, index) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) {
                    errors.push(`${key}[${index}] no es un objeto`);
                    return;
                }
                schema[key].forEach(field => {
                    if (typeof item[field] !== 'string' || item[field].trim() === '') {
                        errors.push(`${key}[${index}] requiere "${field}" (texto no vacío)`);
                    }
                });
                if (typeof item[idField] === 'string') {
                    if (seen.has(item[idField])) {
                        errors.push(`${key}: "${idField}" duplicado (${item[idField]})`);
                    }
                    seen.add(item[idField]);
                }
            });

            if (key === 'entries') {
                items.forEach((item, index) => {
                    if (item && ['heat', 'lane'].some(f => item[f] !== undefined && !Number.isFinite(Number(item[f])))) {
                        errors.push(`entries[${index}] tiene heat/lane no numérico`);
                    }
                });
            }
            if (key === 'results') {
                items.forEach((item, index) => {
                    if (!item) return;
                    if (item.status !== undefined && !['OK', 'DQ', 'DNS', 'DNF'].includes(item.status)) {
                        errors.push(`results[${index}] tiene un estado inválido (${item.status})`);
                    }
                    if (item.time_seconds !== undefined && item.time_seconds !== null && !Number.isFinite(item.time_seconds)) {
                        errors.push(`results[${index}] tiene time_seconds no numérico`);
                    }
                });
            }
        });

        return { valid: errors.length === 0, errors };
    }

    importData(data) {
        const { valid, errors } = this.validateImportData(data);
        if (!valid) {
            console.error('Respaldo inválido:', errors);
            return false;
        }

        // Escritura atómica: si algo falla (p. ej. cuota llena) se restaura el estado previo
        const keys = [...Object.keys(SwimmingDatabase.IMPORT_SCHEMA), 'eventConfig'].filter(key => data[key] !== undefined);
        const previous = {};
        keys.forEach(key => { previous[key] = localStorage.getItem(key); });

        try {
            keys.forEach(key => localStorage.setItem(key, JSON.stringify(data[key])));
            return true;
        } catch (error) {
            console.error('Error importing data:', error);
            keys.forEach(key => {
                try {
                    if (previous[key] === null) {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, previous[key]);
                    }
                } catch (restoreError) {
                    console.error(`No se pudo restaurar "${key}":`, restoreError);
                }
            });
            return false;
        }
    }

    /** Borra todos los datos de la competencia. `keepConfig` conserva los datos del evento. */
    clearAllData({ keepConfig = false } = {}) {
        ['categories', 'events', 'participants', 'entries', 'results'].forEach(key => localStorage.removeItem(key));
        if (!keepConfig) localStorage.removeItem('eventConfig');
        this.initDatabase();
        return true;
    }

    /** Borra solo resultados (conserva participantes, pruebas e inscripciones). */
    clearResults() {
        localStorage.setItem('results', JSON.stringify([]));
        return true;
    }
}

// Instancia global de la base de datos
const db = new SwimmingDatabase();

// Permite probar la clase con node --test (en el navegador `module` no existe)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SwimmingDatabase, db };
}
