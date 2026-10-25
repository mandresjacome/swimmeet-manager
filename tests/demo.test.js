const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const store = new Map();
globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => store.clear()
};

const { SwimmingDatabase } = require('../js/database.js');
const { SWIM_TEMPLATES, applyTemplate } = require('../js/templates.js');
const { generateDemoParticipants, loadDemoEvent } = require('../js/demo.js');

let db;
beforeEach(() => {
    store.clear();
    db = new SwimmingDatabase();
});

test('cada plantilla se aplica sin errores y es idempotente', () => {
    for (const template of SWIM_TEMPLATES) {
        store.clear();
        db = new SwimmingDatabase();
        const expectedEvents = template.categories.reduce((sum, c) => sum + c.events.length, 0);

        const first = applyTemplate(db, template.id);
        assert.deepEqual(first, { categories: template.categories.length, events: expectedEvents }, template.id);

        const second = applyTemplate(db, template.id);
        assert.deepEqual(second, { categories: 0, events: 0 }, `${template.id} no debe duplicar`);
    }
});

test('applyTemplate rechaza plantillas inexistentes', () => {
    assert.ok(applyTemplate(db, 'no-existe').error);
});

test('los participantes demo son ficticios, únicos y deterministas', () => {
    const people = generateDemoParticipants(80);
    assert.equal(people.length, 80);
    assert.equal(new Set(people.map(p => p.name)).size, 80);
    assert.ok(people.every(p => ['F', 'M'].includes(p.gender) && p.club));
    assert.ok(people.every(p => { const w = p.name.split(' '); return w[1] !== w[2]; }));
    assert.equal(JSON.stringify(generateDemoParticipants(80)), JSON.stringify(people));
});

test('loadDemoEvent crea un evento completo y consistente', () => {
    const summary = loadDemoEvent(db, { today: new Date(2026, 0, 1) });
    const config = db.getEventConfig();

    assert.equal(config.name, 'Copa Demo SwimMeet');
    assert.equal(config.date, '2026-01-15');
    assert.ok(summary.participants > 50);
    assert.equal(summary.results, 0);
    assert.equal(db.getStats().assigned, db.getEntries().length, 'todas las inscripciones tienen carril');
    assert.ok(db.getEntries().every(e => e.lane <= config.lanes));
});

test('loadDemoEvent con resultados genera tiempos válidos y rankings', () => {
    const summary = loadDemoEvent(db, { withResults: true });

    assert.equal(summary.results, summary.entries);
    const rows = db.getResultRows();
    assert.ok(rows.some(r => r.status === 'OK'));
    assert.ok(rows.filter(r => r.status === 'OK').every(r => r.time > 5 && r.time < 400 && r.position >= 1));
    assert.ok(rows.every(r => r.status === 'OK' || r.time === null));
});

test('loadDemoEvent reemplaza los datos anteriores', () => {
    db.addCategory('Antigua');
    loadDemoEvent(db);
    assert.equal(db.getCategories().some(c => c.category_name === 'Antigua'), false);
});
