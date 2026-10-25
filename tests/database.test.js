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
