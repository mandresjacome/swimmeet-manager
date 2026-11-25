/**
 * SwimMeet Manager — capa de datos
 * Persiste en localStorage: categorías, pruebas, participantes, inscripciones,
 * resultados y configuración del evento.
 */

// Clave de comparación sin tildes ni mayúsculas ("Máster " == "master")
function normalizeKey(text) {
    return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const COLLECTION_FIELDS = {
    categories: ['category_id', 'category_name'],
    events: ['event_id', 'event_name', 'category_id'],
    participants: ['participant_id', 'name'],
    entries: ['entry_id', 'event_id', 'participant_id'],
    results: ['entry_id']
};
const ID_COLLECTIONS = { C: 'categories', E: 'events', P: 'participants', EN: 'entries' };
const DATA_KEYS = [...Object.keys(COLLECTION_FIELDS), 'eventConfig'];
const STORAGE_KEYS = [...DATA_KEYS, 'idCounters'];
const GENDERS = ['', 'F', 'M'];

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function slotInput(value) {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    return /^\d*$/.test(text) ? Number(text) : NaN;
}

function normalizedTime(value) {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()))) return NaN;
    return Math.round(Number(value) * 100) / 100;
}

class SwimmingDatabase {
    static get STATUSES() { return ['OK', 'DQ', 'DNS', 'DNF']; }
    
    getCategories() {
        return structuredClone(this.readStorage().state.categories);
    }

    addCategory(name) {
        if (!isText(name)) return { error: 'El nombre de la categoría es obligatorio' };
        const cleanName = name.trim();

        const categories = this.getCategories();
        if (categories.some(c => normalizeKey(c.category_name) === normalizeKey(cleanName))) {
            return { error: 'Ya existe una categoría con ese nombre' };
        }

        const id = this.nextId('C');
        if (id.error) return id;
        const category = {
            category_id: id.value,
            category_name: cleanName
        };
        categories.push(category);
        this.writeChanges({ categories, idCounters: id.counters });
        return category;
    }

    updateCategory(id, name) {
        if (!isText(name)) return { error: 'El nombre de la categoría es obligatorio' };
        const cleanName = name.trim();

        const categories = this.getCategories();
        const index = categories.findIndex(c => c.category_id === id);
        if (index === -1) return false;
        if (categories.some(c => c.category_id !== id && normalizeKey(c.category_name) === normalizeKey(cleanName))) {
            return { error: 'Ya existe una categoría con ese nombre' };
        }
        categories[index].category_name = cleanName;
        this.writeChanges({ categories });
        return true;
    }

    /** Elimina la categoría y, en cascada, sus pruebas, inscripciones y resultados. */
    deleteCategory(id) {
        const eventIds = new Set(this.getEventsByCategory(id).map(e => e.event_id));
        const events = this.getEvents().filter(e => !eventIds.has(e.event_id));
        const categories = this.getCategories().filter(c => c.category_id !== id);
        return this.deleteRelatedEntries(entry => eventIds.has(entry.event_id), { categories, events });
    }

    getCategoryById(id) {
        const categories = this.getCategories();
        return categories.find(c => c.category_id === id);
    }

    // ===================== EVENTS =====================
    
    getEvents() {
        return structuredClone(this.readStorage().state.events);
    }

    addEvent(name, categoryId) {
        if (!isText(name)) return { error: 'El nombre de la prueba es obligatorio' };
        const cleanName = name.trim();
        if (!this.getCategoryById(categoryId)) return { error: 'La categoría seleccionada no existe' };

        const events = this.getEvents();
        if (events.some(e => e.category_id === categoryId && normalizeKey(e.event_name) === normalizeKey(cleanName))) {
            return { error: 'Esa categoría ya tiene una prueba con ese nombre' };
        }

        const id = this.nextId('E');
        if (id.error) return id;
        const event = {
            event_id: id.value,
            event_name: cleanName,
            category_id: categoryId
        };
        events.push(event);
        this.writeChanges({ events, idCounters: id.counters });
        return event;
    }

    updateEvent(id, name, categoryId) {
        if (!isText(name)) return { error: 'El nombre de la prueba es obligatorio' };
        const cleanName = name.trim();
        if (!this.getCategoryById(categoryId)) return { error: 'La categoría seleccionada no existe' };

        const events = this.getEvents();
        const index = events.findIndex(e => e.event_id === id);
        if (index === -1) return false;
        if (events.some(e => e.event_id !== id && e.category_id === categoryId && normalizeKey(e.event_name) === normalizeKey(cleanName))) {
            return { error: 'Esa categoría ya tiene una prueba con ese nombre' };
        }
        events[index].event_name = cleanName;
        events[index].category_id = categoryId;
        this.writeChanges({ events });
        return true;
    }

    /** Elimina la prueba y, en cascada, sus inscripciones y resultados. */
    deleteEvent(id) {
        const events = this.getEvents().filter(e => e.event_id !== id);
        return this.deleteRelatedEntries(entry => entry.event_id === id, { events });
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
        return structuredClone(this.readStorage().state.participants);
    }

    addParticipant(name, club = '', gender = '') {
        const error = this.validateParticipant(name, club, gender);
        if (error) return { error };

        const participants = this.getParticipants();
        const id = this.nextId('P');
        if (id.error) return id;
        const participant = {
            participant_id: id.value,
            name: name.trim(),
            club_or_team: club.trim(),
            gender
        };
        participants.push(participant);
        this.writeChanges({ participants, idCounters: id.counters });
        return participant;
    }

    validateParticipant(name, club, gender) {
        if (!isText(name)) return 'El nombre del participante es obligatorio';
        if (typeof club !== 'string') return 'El club debe ser texto';
        if (!GENDERS.includes(gender)) return 'El género debe ser F, M o quedar sin especificar';
        return null;
    }

    updateParticipant(id, name, club = '', gender = '') {
        const error = this.validateParticipant(name, club, gender);
        if (error) return { error };

        const participants = this.getParticipants();
        const index = participants.findIndex(p => p.participant_id === id);
        if (index !== -1) {
            participants[index].name = name.trim();
            participants[index].club_or_team = club.trim();
            participants[index].gender = gender;
            this.writeChanges({ participants });
            return true;
        }
        return false;
    }

    /** Elimina al participante y, en cascada, sus inscripciones y resultados. */
    deleteParticipant(id) {
        const participants = this.getParticipants().filter(p => p.participant_id !== id);
        return this.deleteRelatedEntries(entry => entry.participant_id === id, { participants });
    }

    getParticipantById(id) {
        const participants = this.getParticipants();
        return participants.find(p => p.participant_id === id);
    }

    // ===================== ENTRIES =====================
    
    getEntries() {
        return structuredClone(this.readStorage().state.entries);
    }

    addEntry(eventId, participantId, heat = 0, lane = 0) {
        if (!this.getEventById(eventId)) return { error: 'La prueba no existe' };
        if (!this.getParticipantById(participantId)) return { error: 'El participante no existe' };

        const heatNum = slotInput(heat);
        const laneNum = slotInput(lane);
        const slotError = this.validateSlot(heatNum, laneNum);
        if (slotError) return { error: slotError };

        const entries = this.getEntries();
        if (entries.some(e => e.event_id === eventId && e.participant_id === participantId)) {
            return { error: 'El participante ya está inscrito en esta prueba' };
        }
        if (heatNum && entries.some(e => e.event_id === eventId && e.heat === heatNum && e.lane === laneNum)) {
            return { error: 'El carril ya está ocupado en esa serie' };
        }

        const id = this.nextId('EN');
        if (id.error) return id;
        const entry = {
            entry_id: id.value,
            event_id: eventId,
            participant_id: participantId,
            heat: heatNum,
            lane: laneNum
        };
        entries.push(entry);
        this.writeChanges({ entries, idCounters: id.counters });
        return entry;
    }

    // Serie y carril van juntos: ambos 0 (sin asignar) o ambos válidos.
    validateSlot(heat, lane, lanes = this.getEventConfig().lanes) {
        if (![heat, lane].every(value => Number.isSafeInteger(value) && value >= 0)) {
            return 'Serie y carril deben ser enteros no negativos';
        }
        if ((heat === 0) !== (lane === 0)) return 'Indica serie y carril, o deja ambos sin asignar';
        if (lane > lanes) return `El carril máximo es ${lanes}`;
        return null;
    }

    /** Asigna (o libera con 0/0) la serie y el carril de una inscripción. */
    assignLane(entryId, heat, lane) {
        const heatNum = slotInput(heat);
        const laneNum = slotInput(lane);
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
        this.writeChanges({ entries });
        return true;
    }

    /**
     * Reparte las inscripciones sin asignar de una prueba en series, llenando los
     * carriles libres. Devuelve cuántas inscripciones se asignaron.
     */
    autoAssignLanes(eventId, lanes = this.getEventConfig().lanes) {
        if (!Number.isInteger(lanes) || lanes < 1 || lanes > this.getEventConfig().lanes) return 0;
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

        if (pending.length) this.writeChanges({ entries });
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
        return this.deleteRelatedEntries(entry => entry.entry_id === id);
    }

    deleteRelatedEntries(matches, changes = {}) {
        const removed = new Set();
        const entries = this.getEntries().filter(entry => {
            if (!matches(entry)) return true;
            removed.add(entry.entry_id);
            return false;
        });
        const results = this.getResults().filter(result => !removed.has(result.entry_id));
        this.writeChanges({ ...changes, entries, results });
        return true;
    }

    getEntriesByEvent(eventId) {
        const entries = this.getEntries();
        return entries.filter(e => e.event_id === eventId);
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
        return structuredClone(this.readStorage().state.results);
    }

    /** Guarda (o reemplaza) el resultado de una inscripción. Solo `OK` lleva tiempo. */
    saveResult(entryId, timeSeconds, status = 'OK') {
        if (!this.getEntryById(entryId)) return { error: 'La inscripción no existe' };
        if (!SwimmingDatabase.STATUSES.includes(status)) return { error: `Estado inválido: ${status}` };

        let time = null;
        if (status === 'OK') {
            time = normalizedTime(timeSeconds);
            if (!Number.isFinite(time) || time <= 0) return { error: 'El tiempo debe ser un número mayor que cero' };
        }

        const results = this.getResults();
        const existingIndex = results.findIndex(r => r.entry_id === entryId);
        const resultId = results[existingIndex]?.result_id ?? `R-${entryId}`;
        if (results.some(r => r.entry_id !== entryId && r.result_id === resultId)) {
            return { error: 'El identificador del resultado ya está en uso' };
        }
        const result = {
            result_id: resultId,
            entry_id: entryId,
            time_seconds: time,
            status: status
        };

        if (existingIndex !== -1) {
            results[existingIndex] = result;
        } else {
            results.push(result);
        }

        this.writeChanges({ results });
        return result;
    }

    deleteResult(entryId) {
        const results = this.getResults().filter(r => r.entry_id !== entryId);
        this.writeChanges({ results });
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
        return structuredClone(this.readStorage().state.eventConfig);
    }

    /** Devuelve la lista de errores de una configuración (vacía si es válida). */
    validateEventConfig(config) {
        const errors = [];
        if (!isRecord(config)) return ['La configuración debe ser un objeto'];

        ['name', 'organizer', 'venue', 'city', 'description'].forEach(key => {
            if (config[key] !== undefined && typeof config[key] !== 'string') errors.push(`"${key}" debe ser texto`);
        });
        if (config.name !== undefined && String(config.name).trim() === '') errors.push('El nombre del evento es obligatorio');
        if (config.date !== undefined && config.date !== '') {
            const date = typeof config.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(config.date)
                ? new Date(`${config.date}T00:00:00Z`)
                : null;
            if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== config.date) {
                errors.push('La fecha debe ser válida y tener formato AAAA-MM-DD');
            }
        }
        const validHour = value => value === '' || (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
        if (config.startTime !== undefined && !validHour(config.startTime)) errors.push('La hora debe ser válida y tener formato HH:MM');
        if (config.lanes !== undefined && !(Number.isInteger(config.lanes) && config.lanes >= 1 && config.lanes <= 12)) errors.push('Los carriles deben ser un entero entre 1 y 12');
        if (config.poolLength !== undefined && ![25, 50].includes(config.poolLength)) errors.push('La piscina debe ser de 25 o 50 metros');

        const listOfObjects = (key, fields) => {
            if (config[key] === undefined) return;
            if (!Array.isArray(config[key])) { errors.push(`"${key}" debe ser una lista`); return; }
            config[key].forEach((item, i) => {
                if (!isRecord(item) || fields.some(f => typeof item[f] !== 'string')) {
                    errors.push(`${key}[${i}] debe tener los campos de texto: ${fields.join(', ')}`);
                }
            });
        };
        listOfObjects('contacts', ['name', 'role', 'phone', 'email']);
        listOfObjects('schedule', ['time', 'label']);
        if (Array.isArray(config.schedule) && config.schedule.some(item => !validHour(item?.time))) {
            errors.push('Las horas del programa deben tener formato HH:MM');
        }
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
        if (this.getEntries().some(entry => entry.lane > merged.lanes)) {
            return { error: 'Reasigna o libera los carriles que superan el nuevo máximo antes de guardar' };
        }
        this.writeChanges({ eventConfig: merged });
        return merged;
    }

    emptyState() {
        return {
            categories: [], events: [], participants: [], entries: [], results: [],
            eventConfig: SwimmingDatabase.DEFAULT_EVENT_CONFIG,
            idCounters: {}
        };
    }

    collectCounters(state) {
        const counters = {};
        for (const [prefix, key] of Object.entries(ID_COLLECTIONS)) {
            const pattern = new RegExp(`^${prefix}-(\\d+)$`);
            const idField = COLLECTION_FIELDS[key][0];
            const storedCounter = state.idCounters?.[prefix];
            const minimum = Number.isSafeInteger(storedCounter) && storedCounter >= 0 ? storedCounter : 0;
            const items = Array.isArray(state[key]) ? state[key] : [];
            counters[prefix] = items.reduce((max, item) => {
                const id = item?.[idField];
                const suffix = typeof id === 'string' ? Number(pattern.exec(id)?.[1]) : NaN;
                return Number.isSafeInteger(suffix) ? Math.max(max, suffix) : max;
            }, minimum);
        }
        return counters;
    }

    nextId(prefix) {
        const counters = { ...this.readStorage().state.idCounters };
        const next = counters[prefix] + 1;
        if (!Number.isSafeInteger(next)) return { error: 'Se agotaron los identificadores de esta colección' };
        counters[prefix] = next;
        return { value: `${prefix}-${String(next).padStart(3, '0')}`, counters };
    }

    validateState(state) {
        const errors = this.validateEventConfig(state.eventConfig);
        if (!isRecord(state.idCounters) || Object.entries(state.idCounters).some(
            ([key, value]) => !Object.hasOwn(ID_COLLECTIONS, key) || !Number.isSafeInteger(value) || value < 0
        )) {
            errors.push('Los contadores de identificadores deben ser enteros no negativos');
        }

        const ids = {};
        for (const [key, fields] of Object.entries(COLLECTION_FIELDS)) {
            const items = state[key];
            if (!Array.isArray(items)) {
                errors.push(`"${key}" debe ser una lista`);
                continue;
            }
            const [idField] = fields;
            ids[key] = new Set();
            items.forEach((item, index) => {
                const label = `${key}[${index}]`;
                if (!isRecord(item)) {
                    errors.push(`${label} debe ser un objeto`);
                    return;
                }
                for (const field of fields) {
                    if (!isText(item[field])) errors.push(`${label} requiere "${field}" (texto no vacío)`);
                    else if (field.endsWith('_id') && item[field] !== item[field].trim()) {
                        errors.push(`${label} contiene un identificador con espacios externos`);
                    }
                }
                if (ids[key].has(item[idField])) errors.push(`${label} repite "${idField}"`);
                ids[key].add(item[idField]);
            });
        }
        if (errors.length) return errors;

        const unique = (seen, key, message) => {
            if (seen.has(key)) errors.push(message);
            seen.add(key);
        };
        const categoryNames = new Set();
        for (const category of state.categories) {
            unique(categoryNames, normalizeKey(category.category_name), 'Hay categorías con el mismo nombre');
        }
        const eventNames = new Set();
        for (const event of state.events) {
            if (!ids.categories.has(event.category_id)) errors.push('Una prueba referencia una categoría inexistente');
            unique(eventNames, JSON.stringify([event.category_id, normalizeKey(event.event_name)]),
                'Hay pruebas con el mismo nombre en una categoría');
        }
        for (const person of state.participants) {
            const { name, club_or_team: club = '', gender = '' } = person;
            const error = this.validateParticipant(name, club, gender);
            if (error) errors.push(error);
        }

        const enrollments = new Set();
        const slots = new Set();
        const lanes = state.eventConfig.lanes ?? SwimmingDatabase.DEFAULT_EVENT_CONFIG.lanes;
        for (const entry of state.entries) {
            const { event_id: eventId, participant_id: participantId, heat = 0, lane = 0 } = entry;
            if (!ids.events.has(eventId)) errors.push('Una inscripción referencia una prueba inexistente');
            if (!ids.participants.has(participantId)) errors.push('Una inscripción referencia un participante inexistente');
            unique(enrollments, JSON.stringify([eventId, participantId]), 'Hay inscripciones duplicadas en una prueba');
            const error = this.validateSlot(heat, lane, lanes);
            if (error) errors.push(error);
            else if (heat) unique(slots, JSON.stringify([eventId, heat, lane]), 'Hay un carril ocupado dos veces en una serie');
        }

        const resultIds = new Set();
        for (const result of state.results) {
            const { entry_id: entryId, result_id: resultId = `R-${entryId}`, status, time_seconds: time = null } = result;
            if (!ids.entries.has(entryId)) errors.push('Un resultado referencia una inscripción inexistente');
            if (!isText(resultId) || resultId !== resultId.trim()) errors.push('El identificador del resultado es inválido');
            else unique(resultIds, resultId, 'Hay identificadores de resultados duplicados');
            if (!SwimmingDatabase.STATUSES.includes(status)) errors.push('Un resultado tiene un estado inválido');
            else if (status === 'OK') {
                if (!Number.isFinite(time) || !Number.isFinite(normalizedTime(time)) || normalizedTime(time) <= 0) {
                    errors.push('Un resultado válido requiere un tiempo positivo en segundos');
                }
            } else if (time !== null) errors.push('Solo los resultados con estado OK pueden tener tiempo');
        }
        return errors;
    }

    normalizeState(state) {
        return {
            ...state,
            eventConfig: { ...SwimmingDatabase.DEFAULT_EVENT_CONFIG, ...state.eventConfig },
            participants: state.participants.map(person => ({ club_or_team: '', gender: '', ...person })),
            entries: state.entries.map(entry => ({ heat: 0, lane: 0, ...entry })),
            results: state.results.map(result => ({
                result_id: `R-${result.entry_id}`,
                ...result,
                time_seconds: result.status === 'OK' ? normalizedTime(result.time_seconds) : null
            })),
            idCounters: this.collectCounters(state)
        };
    }

    readStorage() {
        let raw;
        try {
            raw = Object.fromEntries(STORAGE_KEYS.map(key => [key, localStorage.getItem(key)]));
        } catch {
            return { raw: null, state: this.emptyState(), errors: ['El navegador bloqueó el acceso al almacenamiento'] };
        }
        if (this.loaded && STORAGE_KEYS.every(key => raw[key] === this.loaded.raw[key])) return this.loaded;

        const parsed = this.emptyState();
        const errors = [];
        for (const key of STORAGE_KEYS) {
            if (raw[key] === null) continue;
            try {
                parsed[key] = JSON.parse(raw[key]);
            } catch {
                errors.push(`No se pudo leer "${key}" del almacenamiento`);
            }
        }
        errors.push(...this.validateState(parsed));
        const state = errors.length
            ? { ...this.emptyState(), idCounters: this.collectCounters(parsed) }
            : this.normalizeState(parsed);
        this.loaded = { raw, state, errors };
        return this.loaded;
    }

    getStorageProblems() {
        return [...this.readStorage().errors];
    }

    writeChanges(changes, { allowRecovery = false } = {}) {
        const { raw, state, errors } = this.readStorage();
        if (!raw || (errors.length && !allowRecovery)) {
            throw new Error('El almacenamiento requiere recuperación desde Ajustes');
        }
        const values = { ...changes };
        if (!Object.hasOwn(changes, 'idCounters')) values.idCounters = state.idCounters;
        const written = [];
        try {
            for (const [key, value] of Object.entries(values)) {
                const serialized = value === null ? null : JSON.stringify(value);
                if (serialized === raw[key]) continue;
                if (serialized === null) localStorage.removeItem(key);
                else localStorage.setItem(key, serialized);
                written.push(key);
            }
        } catch {
            let restored = true;
            for (const key of written.reverse()) {
                try {
                    if (raw[key] === null) localStorage.removeItem(key);
                    else localStorage.setItem(key, raw[key]);
                } catch {
                    restored = false;
                }
            }
            throw new Error(restored
                ? 'No se pudo guardar. Se conservaron los datos anteriores.'
                : 'No se pudo guardar ni recuperar todo el estado anterior. Revisa el almacenamiento en Ajustes.');
        }
    }

    exportData() {
        const { raw, state, errors } = this.readStorage();
        return {
            app: 'SwimMeet Manager',
            version: 2,
            ...(errors.length ? { storageRecovery: { raw, errors } } : structuredClone(state)),
            exportDate: new Date().toISOString()
        };
    }

    prepareImport(data) {
        if (!isRecord(data)) return { errors: ['El respaldo debe ser un objeto JSON'] };
        if (Object.hasOwn(data, 'storageRecovery')) {
            return { errors: ['Esta copia de recuperación contiene datos sin procesar y requiere revisión manual'] };
        }
        if ((data.app !== undefined && data.app !== 'SwimMeet Manager')
            || (data.version !== undefined && ![1, 2].includes(data.version))) {
            return { errors: ['El archivo no es un respaldo compatible de SwimMeet Manager'] };
        }
        const keys = DATA_KEYS.filter(key => Object.hasOwn(data, key));
        if (!keys.length) return { errors: ['El archivo no contiene datos reconocibles'] };

        const current = this.readStorage();
        if (current.errors.length && keys.length !== DATA_KEYS.length) {
            return { errors: ['Para recuperar el almacenamiento se requiere un respaldo completo'] };
        }
        const state = { ...current.state };
        for (const key of keys) state[key] = data[key];
        if (data.idCounters !== undefined) state.idCounters = data.idCounters;
        const errors = this.validateState(state);
        if (errors.length) return { errors };

        const clean = this.normalizeState(state);
        for (const [prefix, counter] of Object.entries(current.state.idCounters)) {
            clean.idCounters[prefix] = Math.max(clean.idCounters[prefix], counter);
        }
        return { errors, changes: Object.fromEntries([...keys, 'idCounters'].map(key => [key, clean[key]])) };
    }

    validateImportData(data) {
        const { errors } = this.prepareImport(data);
        return { valid: errors.length === 0, errors };
    }

    importData(data) {
        const { errors, changes } = this.prepareImport(data);
        this.lastImportError = errors[0];
        if (errors.length) return false;
        try {
            this.writeChanges(changes, { allowRecovery: true });
            return true;
        } catch (error) {
            this.lastImportError = error.message;
            return false;
        }
    }

    /** Borra los datos de la competencia y conserva los contadores disponibles. */
    clearAllData({ keepConfig = false } = {}) {
        const keys = DATA_KEYS.filter(key => key !== 'eventConfig' || !keepConfig);
        this.writeChanges(Object.fromEntries(keys.map(key => [key, null])), { allowRecovery: !keepConfig });
        return true;
    }

    /** Borra solo resultados (conserva participantes, pruebas e inscripciones). */
    clearResults() {
        this.writeChanges({ results: [] });
        return true;
    }
}

// Instancia global de la base de datos
const db = new SwimmingDatabase();

// Permite probar la clase con node --test (en el navegador `module` no existe)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SwimmingDatabase, db };
}
