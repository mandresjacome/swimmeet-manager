const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mock mínimo de localStorage; debe existir antes de cargar database.js
const store = new Map();
globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => store.clear()
};

const { SwimmingDatabase } = require('../js/database.js');

let db;
beforeEach(() => {
    store.clear();
    db = new SwimmingDatabase();
});

function seed() {
    const category = db.addCategory('Infantil A');
    const event = db.addEvent('100 m Libre', category.category_id);
    const participant = db.addParticipant('Ana Demo', 'DELF', 'F');
    const entry = db.addEntry(event.event_id, participant.participant_id, 1, 1);
    return { category, event, participant, entry };
}

// ---------- IDs ----------

test('los IDs no se repiten después de eliminar registros', () => {
    const a = db.addParticipant('A');
    const b = db.addParticipant('B');
    db.deleteParticipant(a.participant_id);
    const c = db.addParticipant('C');

    assert.notEqual(c.participant_id, b.participant_id);
    assert.equal(c.participant_id, 'P-003');
});

test('los IDs de categorías, pruebas e inscripciones tampoco se repiten', () => {
    const c1 = db.addCategory('A');
    const c2 = db.addCategory('B');
    db.deleteCategory(c1.category_id);
    assert.equal(db.addCategory('C').category_id, 'C-003');

    const e1 = db.addEvent('E1', c2.category_id);
    db.addEvent('E2', c2.category_id);
    db.deleteEvent(e1.event_id);
    assert.equal(db.addEvent('E3', c2.category_id).event_id, 'E-003');
});

// ---------- Validación ----------

test('rechaza nombres vacíos y duplicados (sin tildes ni mayúsculas)', () => {
    assert.ok(db.addCategory('   ').error);
    assert.ok(db.addParticipant('').error);

    const category = db.addCategory('Máster');
    assert.ok(db.addCategory('master').error);
    assert.ok(db.addEvent('', category.category_id).error);
    assert.ok(db.addEvent('50 m Libre', 'C-999').error);

    db.addEvent('50 m Libre', category.category_id);
    assert.ok(db.addEvent('50 M LIBRE', category.category_id).error);
});

test('los nombres se guardan sin espacios sobrantes', () => {
    assert.equal(db.addCategory('  Juvenil  ').category_name, 'Juvenil');
});

// ---------- Cascadas ----------

test('eliminar una categoría elimina sus pruebas, inscripciones y resultados', () => {
    const { category, entry } = seed();
    db.saveResult(entry.entry_id, 30, 'OK');

    db.deleteCategory(category.category_id);

    assert.equal(db.getEvents().length, 0);
    assert.equal(db.getEntries().length, 0);
    assert.equal(db.getResults().length, 0);
    assert.equal(db.getParticipants().length, 1);
});

test('eliminar un participante elimina sus inscripciones y resultados', () => {
    const { participant, entry } = seed();
    db.saveResult(entry.entry_id, 30, 'OK');

    db.deleteParticipant(participant.participant_id);

    assert.equal(db.getEntries().length, 0);
    assert.equal(db.getResults().length, 0);
});

test('deleteEntry elimina también su resultado', () => {
    const { entry } = seed();
    db.saveResult(entry.entry_id, 40, 'OK');
    db.deleteEntry(entry.entry_id);
    assert.equal(db.getResults().length, 0);
});

// ---------- Inscripciones y carriles ----------

test('addEntry rechaza carril ocupado y doble inscripción en la misma prueba', () => {
    const { event, participant } = seed();
    const other = db.addParticipant('Otro Demo');

    assert.match(db.addEntry(event.event_id, other.participant_id, 1, 1).error, /ocupado/);
    assert.match(db.addEntry(event.event_id, participant.participant_id).error, /ya está inscrito/);
});

test('serie y carril deben ir juntos y respetar el máximo de carriles', () => {
    const { event } = seed();
    const other = db.addParticipant('Otro Demo');

    assert.ok(db.addEntry(event.event_id, other.participant_id, 2, 0).error);
    assert.ok(db.addEntry(event.event_id, other.participant_id, 1, 99).error);
    assert.ok(db.addEntry('E-999', other.participant_id).error);
});

test('assignLane mueve, libera y detecta conflictos', () => {
    const { event, entry } = seed();
    const other = db.addParticipant('Otro Demo');
    const second = db.addEntry(event.event_id, other.participant_id);

    assert.ok(db.assignLane(second.entry_id, 1, 1).error);
    assert.equal(db.assignLane(second.entry_id, 1, 2), true);
    assert.equal(db.assignLane(entry.entry_id, 0, 0), true);
    assert.equal(db.getEntryById(entry.entry_id).heat, 0);
});

test('autoAssignLanes reparte en series sin pisar carriles ocupados', () => {
    const category = db.addCategory('Abierta');
    const event = db.addEvent('50 m Libre', category.category_id);
    const ids = Array.from({ length: 8 }, (_, i) => db.addParticipant(`Nadador ${i}`).participant_id);
    db.addEntry(event.event_id, ids[0], 1, 1);
    ids.slice(1).forEach(id => db.addEntry(event.event_id, id));

    const assigned = db.autoAssignLanes(event.event_id, 4);

    assert.equal(assigned, 7);
    const slots = db.getEntriesByEvent(event.event_id).map(e => `${e.heat}-${e.lane}`);
    assert.equal(new Set(slots).size, 8);
    assert.ok(db.getEntriesByEvent(event.event_id).every(e => e.heat >= 1 && e.lane >= 1 && e.lane <= 4));
    assert.equal(db.autoAssignLanes(event.event_id, 4), 0);
});

test('enrollInCategory inscribe en todas las pruebas de la categoría', () => {
    const category = db.addCategory('Abierta');
    db.addEvent('50 m Libre', category.category_id);
    db.addEvent('50 m Espalda', category.category_id);
    const participant = db.addParticipant('Nadador');

    assert.equal(db.enrollInCategory(participant.participant_id, category.category_id).length, 2);
    assert.equal(db.enrollInCategory(participant.participant_id, category.category_id).length, 0);
});

// ---------- Resultados ----------

test('saveResult valida entrada, estado y tiempo', () => {
    const { entry } = seed();

    assert.ok(db.saveResult('EN-999', 30).error);
    assert.ok(db.saveResult(entry.entry_id, 30, 'XX').error);
    assert.ok(db.saveResult(entry.entry_id, 0, 'OK').error);
    assert.ok(db.saveResult(entry.entry_id, 'rápido', 'OK').error);
    assert.equal(db.getResults().length, 0);
});

test('saveResult reemplaza el resultado previo y DQ no guarda tiempo', () => {
    const { entry } = seed();
    db.saveResult(entry.entry_id, 31.567, 'OK');
    assert.equal(db.getResultByEntryId(entry.entry_id).time_seconds, 31.57);

    const dq = db.saveResult(entry.entry_id, 50, 'DQ');
    assert.equal(dq.time_seconds, null);
    assert.equal(db.getResults().length, 1);
});

test('deleteResult quita el resultado', () => {
    const { entry } = seed();
    db.saveResult(entry.entry_id, 31.5, 'OK');
    db.deleteResult(entry.entry_id);
    assert.equal(db.getResultByEntryId(entry.entry_id), undefined);
    assert.equal(db.getResultRows().length, 0);
});

test('getResultRows calcula posiciones con empates y excluye no-OK del ranking', () => {
    const category = db.addCategory('Abierta');
    const event = db.addEvent('50 m Libre', category.category_id);
    const times = [['A', 30, 'OK'], ['B', 28.5, 'OK'], ['C', 30, 'OK'], ['D', null, 'DQ'], ['E', 35, 'OK']];
    times.forEach(([name, time, status]) => {
        const p = db.addParticipant(name);
        const entry = db.addEntry(event.event_id, p.participant_id);
        db.saveResult(entry.entry_id, time, status);
    });

    const rows = db.getResultRows({ eventId: event.event_id });
    const positions = Object.fromEntries(rows.map(r => [r.participant_name, r.position]));

    assert.deepEqual(positions, { B: 1, A: 2, C: 2, E: 4, D: null });
    assert.equal(rows[rows.length - 1].participant_name, 'D');
    assert.equal(db.getResultRows({ categoryId: 'C-999' }).length, 0);
});

test('getStats resume el estado de la competencia', () => {
    const { entry } = seed();
    db.saveResult(entry.entry_id, 30, 'OK');

    assert.deepEqual(db.getStats(), {
        categories: 1, events: 1, participants: 1, entries: 1, assigned: 1,
        results: 1, ok: 1, dq: 0, eventsWithResults: 1, completion: 100
    });
});

// ---------- Configuración del evento ----------

test('getEventConfig devuelve valores por defecto genéricos', () => {
    const config = db.getEventConfig();
    assert.equal(config.lanes, 6);
    assert.equal(config.poolLength, 25);
    assert.ok(config.name.length > 0);
});

test('saveEventConfig guarda cambios parciales y valida', () => {
    const saved = db.saveEventConfig({ name: '  Copa Primavera ', date: '2026-03-14', lanes: 8 });
    assert.equal(saved.name, 'Copa Primavera');
    assert.equal(db.getEventConfig().lanes, 8);
    assert.equal(db.getEventConfig().poolLength, 25);

    assert.ok(db.saveEventConfig({ name: '   ' }).error);
    assert.ok(db.saveEventConfig({ date: '14/03/2026' }).error);
    assert.ok(db.saveEventConfig({ lanes: 0 }).error);
    assert.ok(db.saveEventConfig({ poolLength: 33 }).error);
    assert.ok(db.saveEventConfig({ contacts: [{ name: 'x' }] }).error);
    assert.equal(db.getEventConfig().name, 'Copa Primavera');
});

test('el máximo de carriles sale de la configuración', () => {
    db.saveEventConfig({ lanes: 4 });
    const { event } = seed();
    const other = db.addParticipant('Otro');
    assert.ok(db.addEntry(event.event_id, other.participant_id, 1, 5).error);
});

// ---------- Exportar / importar ----------

test('exportData → importData conserva datos y configuración (ida y vuelta)', () => {
    const { entry } = seed();
    db.saveEventConfig({ name: 'Copa Demo' });
    db.saveResult(entry.entry_id, 33.2, 'OK');
    const backup = JSON.parse(JSON.stringify(db.exportData()));

    store.clear();
    db = new SwimmingDatabase();

    assert.equal(db.importData(backup), true);
    assert.equal(db.getParticipants().length, 1);
    assert.equal(db.getEventConfig().name, 'Copa Demo');
    assert.equal(db.getResultByEntryId(entry.entry_id).time_seconds, 33.2);
});

const invalidBackups = {
    'null': null,
    'un arreglo': [],
    'un objeto sin colecciones': { foo: 'bar' },
    'colección que no es lista': { categories: 'abc' },
    'elemento que no es objeto': { categories: [1, 2] },
    'falta el identificador': { participants: [{ name: 'Sin ID' }] },
    'ID duplicado': { categories: [{ category_id: 'C-001', category_name: 'A' }, { category_id: 'C-001', category_name: 'B' }] },
    'estado de resultado inválido': { results: [{ entry_id: 'EN-1', status: 'XX' }] },
    'tiempo no numérico': { results: [{ entry_id: 'EN-1', time_seconds: 'rápido' }] },
    'heat no numérico': { entries: [{ entry_id: 'EN-1', event_id: 'E-001', participant_id: 'P-001', heat: 'x' }] },
    'configuración inválida': { eventConfig: { name: '', lanes: 99 } }
};

for (const [name, backup] of Object.entries(invalidBackups)) {
    test(`importData rechaza un respaldo inválido: ${name}`, () => {
        db.addParticipant('Existente');
        const before = localStorage.getItem('participants');

        assert.equal(db.importData(backup), false);
        assert.equal(localStorage.getItem('participants'), before);
    });
}

test('importData restaura el estado previo si falla la escritura', () => {
    db.addCategory('Original');
    const before = localStorage.getItem('categories');

    const realSetItem = localStorage.setItem;
    let failed = false;
    localStorage.setItem = (key, value) => {
        if (key === 'events' && !failed) {
            failed = true;
            throw new Error('QuotaExceededError');
        }
        realSetItem(key, value);
    };

    try {
        const ok = db.importData({
            categories: [{ category_id: 'C-009', category_name: 'Nueva' }],
            events: [{ event_id: 'E-001', event_name: 'X', category_id: 'C-009' }]
        });
        assert.equal(ok, false);
    } finally {
        localStorage.setItem = realSetItem;
    }

    assert.equal(localStorage.getItem('categories'), before);
});

test('clearAllData borra todo; con keepConfig conserva el evento', () => {
    seed();
    db.saveEventConfig({ name: 'Copa Demo' });

    db.clearAllData({ keepConfig: true });
    assert.equal(db.getParticipants().length, 0);
    assert.equal(db.getEventConfig().name, 'Copa Demo');

    db.clearAllData();
    assert.notEqual(db.getEventConfig().name, 'Copa Demo');
});

test('los contadores sobreviven al borrar el mayor ID y reabrir el navegador', () => {
    const { category, event, participant, entry } = seed();
    db.deleteCategory(category.category_id);
    db.deleteParticipant(participant.participant_id);
    db = new SwimmingDatabase();

    const newCategory = db.addCategory('Máster QA');
    const newEvent = db.addEvent('100 m Espalda', newCategory.category_id);
    const newParticipant = db.addParticipant('Nadadora Ficticia');
    const newEntry = db.addEntry(newEvent.event_id, newParticipant.participant_id);
    assert.deepEqual(
        [newCategory.category_id, newEvent.event_id, newParticipant.participant_id, newEntry.entry_id],
        ['C-002', 'E-002', 'P-002', 'EN-002']
    );
    assert.notEqual(newEntry.entry_id, entry.entry_id);
    assert.notEqual(newEvent.event_id, event.event_id);
});

test('una copia antigua sin contadores y un restablecimiento conservan los máximos conocidos', () => {
    store.set('participants', JSON.stringify([{ participant_id: 'P-009', name: 'Nadadora Ficticia' }]));
    db.deleteParticipant('P-009');
    const oldBackup = { version: 2, participants: [{ participant_id: 'P-001', name: 'Otra Ficticia' }] };
    assert.equal(db.importData(oldBackup), true);
    assert.equal(db.addParticipant('Tercera Ficticia').participant_id, 'P-010');
    db.clearAllData();
    assert.equal(db.addParticipant('Cuarta Ficticia').participant_id, 'P-011');
});

test('respalda los contadores y restablece el consecutivo en otro perfil', () => {
    const first = db.addParticipant('Primera Ficticia');
    db.deleteParticipant(first.participant_id);
    const backup = db.exportData();
    store.clear();
    db = new SwimmingDatabase();
    assert.equal(db.importData(backup), true);
    assert.equal(db.addParticipant('Segunda Ficticia').participant_id, 'P-002');
});

test('rechaza respaldos parciales que crearían referencias huérfanas', () => {
    const { entry } = seed();
    db.saveResult(entry.entry_id, 30);
    const before = new Map(store);
    for (const key of ['categories', 'events', 'participants', 'entries']) {
        assert.match(db.validateImportData({ [key]: [] }).errors.join(' '), /inexistente/);
        assert.equal(db.importData({ [key]: [] }), false);
        assert.deepEqual(store, before);
    }
    assert.equal(db.importData({ results: [] }), true);
    assert.equal(db.getEntries().length, 1);
});

test('rechaza respaldos con inscripciones duplicadas o carriles compartidos', () => {
    const { event, participant, entry } = seed();
    const other = db.addParticipant('Otra Ficticia');
    const duplicate = { ...entry, entry_id: 'EN-002', lane: 2, participant_id: participant.participant_id };
    const collision = { ...entry, entry_id: 'EN-002', participant_id: other.participant_id, event_id: event.event_id };
    assert.match(db.validateImportData({ entries: [entry, duplicate] }).errors.join(' '), /inscripciones duplicadas/);
    assert.match(db.validateImportData({ entries: [entry, collision] }).errors.join(' '), /carril ocupado/);
    assert.deepEqual(db.getEntries(), [entry]);
});

test('valida estados y tiempos de resultados importados', () => {
    const { entry } = seed();
    for (const fields of [
        { status: 'OK', time_seconds: -3 }, { status: 'OK', time_seconds: 0.001 },
        { status: 'OK' }, { status: 'DQ', time_seconds: 30 }, { time_seconds: 30 }
    ]) {
        assert.equal(db.importData({ results: [{ entry_id: entry.entry_id, ...fields }] }), false);
    }
    assert.equal(db.importData({ results: [{ entry_id: entry.entry_id, status: 'OK', time_seconds: 31.567 }] }), true);
    assert.equal(db.getResultRows()[0].time, 31.57);
    for (const invalid of [true, [], '0x1e', -3, Infinity]) assert.ok(db.saveResult(entry.entry_id, invalid).error);
});

test('valida series y carriles enteros en altas, cambios y respaldos', () => {
    const { event, entry } = seed();
    const person = db.addParticipant('Nadadora Ficticia');
    for (const [heat, lane] of [[1.9, 2], ['2parcial', 2], [1, 2.8], [true, 2], [1, 0], [0, 2], [1, 7], [2 ** 53, 2]]) {
        assert.ok(db.addEntry(event.event_id, person.participant_id, heat, lane).error);
        assert.ok(db.assignLane(entry.entry_id, heat, lane).error);
        assert.equal(db.importData({ entries: [{ ...entry, heat, lane }] }), false);
    }
    const pending = db.addEntry(event.event_id, person.participant_id);
    assert.equal(db.autoAssignLanes(event.event_id, 9), 0);
    assert.equal(db.getEntryById(pending.entry_id).lane, 0);
    assert.equal(db.assignLane(pending.entry_id, '2', '3'), true);
});

test('solo acepta género F, M o sin especificar y clubes de texto', () => {
    const { participant } = seed();
    assert.ok(db.addParticipant('Nadadora Ficticia', '', 'X').error);
    assert.ok(db.updateParticipant(participant.participant_id, participant.name, '', null).error);
    assert.equal(db.importData({ participants: [{ ...participant, gender: 'x' }] }), false);
    assert.equal(db.importData({ participants: [{ ...participant, club_or_team: {} }] }), false);
    assert.equal(db.getParticipantById(participant.participant_id).gender, 'F');
    assert.equal(db.addParticipant('Nadadora Ficticia').gender, '');
});

test('impide bajar el máximo de carriles hasta reasignar o liberar las plazas', () => {
    const { entry } = seed();
    db.assignLane(entry.entry_id, 1, 6);
    assert.match(db.saveEventConfig({ lanes: 4 }).error, /Reasigna o libera/);
    assert.equal(db.importData({ eventConfig: { lanes: 4 } }), false);
    assert.equal(db.getEventConfig().lanes, 6);
    assert.equal(db.getEntryById(entry.entry_id).lane, 6);
    db.assignLane(entry.entry_id, 1, 4);
    assert.equal(db.saveEventConfig({ lanes: 4 }).lanes, 4);
});

test('rechaza fechas, horas, versiones y contadores inválidos', () => {
    assert.ok(db.saveEventConfig({ date: '2026-02-30' }).error);
    assert.ok(db.saveEventConfig({ startTime: '24:00' }).error);
    assert.ok(db.saveEventConfig({ schedule: [{ time: '12:75', label: 'QA' }] }).error);
    assert.ok(db.validateImportData({ version: 999, categories: [] }).errors.length);
    assert.ok(db.validateImportData({ idCounters: { P: -1 }, categories: [] }).errors.length);
    assert.equal(db.saveEventConfig({ date: '2028-02-29', startTime: '23:59' }).date, '2028-02-29');
});

test('protege los datos locales dañados y permite recuperar desde una copia completa', () => {
    seed();
    const backup = db.exportData();
    store.set('participants', '{JSON truncado');
    const before = new Map(store);
    const reopened = new SwimmingDatabase();
    assert.deepEqual(reopened.getParticipants(), []);
    assert.ok(reopened.getStorageProblems().length);
    const recovery = reopened.exportData();
    assert.equal(recovery.storageRecovery.raw.participants, '{JSON truncado');
    assert.equal(recovery.storageRecovery.raw.entries, before.get('entries'));
    assert.throws(() => reopened.addParticipant('Nadadora Ficticia'), /requiere recuperación/);
    assert.equal(reopened.importData({ participants: backup.participants }), false);
    assert.equal(reopened.importData(recovery), false);
    assert.deepEqual(store, before);
    assert.equal(reopened.importData(backup), true);
    assert.deepEqual(reopened.getStorageProblems(), []);
    assert.deepEqual(reopened.getParticipants(), backup.participants);
});

test('un restablecimiento explícito recupera estructuras locales inválidas', () => {
    const { participant } = seed();
    store.set('idCounters', 'null');
    store.set('results', JSON.stringify([{ entry_id: 'EN-inexistente', status: 'OK', time_seconds: 30 }]));
    assert.ok(db.getStorageProblems().length);
    assert.equal(db.clearAllData(), true);
    assert.deepEqual(db.getStorageProblems(), []);
    assert.deepEqual(db.getResults(), []);
    assert.notEqual(db.addParticipant('Nadadora Ficticia').participant_id, participant.participant_id);
});

test('informa cuando el navegador también impide revertir una restauración fallida', () => {
    const { category, event } = seed();
    const realSetItem = localStorage.setItem;
    localStorage.setItem = (key, value) => {
        if (key === 'events' || (key === 'categories' && value.includes('Infantil A'))) throw new Error('cuota');
        realSetItem(key, value);
    };
    try {
        assert.equal(db.importData({
            categories: [{ ...category, category_id: 'C-002', category_name: 'QA' }],
            events: [{ ...event, category_id: 'C-002' }]
        }), false);
        assert.match(db.lastImportError, /ni recuperar todo el estado anterior/);
    } finally {
        localStorage.setItem = realSetItem;
    }
    assert.ok(db.getStorageProblems().length);
});
