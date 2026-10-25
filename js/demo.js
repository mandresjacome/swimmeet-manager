/**
 * Evento de demostración: configuración, participantes y resultados 100% ficticios.
 * Es determinista (mismos datos cada vez), por lo que sirve también para pruebas.
 */

const demoTemplates = (typeof module !== 'undefined' && module.exports)
    ? require('./templates.js')
    : { getTemplate, applyTemplate };

const DEMO_FEMALE_NAMES = ['Valentina', 'Camila', 'Sofía', 'Isabella', 'Mariana', 'Daniela', 'Luciana', 'Gabriela', 'Natalia', 'Juliana', 'Paula', 'Carolina', 'Andrea', 'Laura', 'Elena'];
const DEMO_MALE_NAMES = ['Mateo', 'Santiago', 'Sebastián', 'Samuel', 'Daniel', 'Nicolás', 'Emilio', 'Tomás', 'Felipe', 'Andrés', 'Gabriel', 'Lucas', 'Diego', 'Ricardo', 'Mauricio'];
const DEMO_SURNAMES = ['Rojas', 'Mendoza', 'Vargas', 'Castro', 'Herrera', 'Molina', 'Ortega', 'Navarro', 'Paredes', 'Salazar', 'Cardona', 'Montes', 'Duarte', 'Escobar', 'Ibáñez', 'Lozano', 'Quiroga', 'Reyes', 'Sandoval', 'Tapias', 'Uribe', 'Valencia', 'Zamora', 'Arias', 'Benítez'];
const DEMO_CLUBS = ['Delfines', 'Tiburones', 'Mantarrayas', 'Corales', 'Independiente'];

// Generador pseudoaleatorio con semilla (mulberry32)
function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Genera `count` participantes ficticios únicos: [{ name, club, gender }] */
function generateDemoParticipants(count) {
    const people = [];
    const used = new Set();
    let k = 0;

    while (people.length < count) {
        const gender = k % 2 === 0 ? 'F' : 'M';
        const names = gender === 'F' ? DEMO_FEMALE_NAMES : DEMO_MALE_NAMES;
        const first = names[(k * 7 + 3) % names.length];
        const surname1 = DEMO_SURNAMES[(k * 11 + 5) % DEMO_SURNAMES.length];
        let index2 = (k * 13 + 1) % DEMO_SURNAMES.length;
        if (DEMO_SURNAMES[index2] === surname1) index2 = (index2 + 1) % DEMO_SURNAMES.length;
        const name = `${first} ${surname1} ${DEMO_SURNAMES[index2]}`;
        k++;

        if (used.has(name)) continue;
        used.add(name);
        people.push({ name, club: DEMO_CLUBS[people.length % DEMO_CLUBS.length], gender });
    }
    return people;
}

function isoDate(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Tiempo simulado (segundos) según distancia, estilo y ritmo base de la categoría. */
function simulateTime(eventName, pace50, random) {
    const distance = Number((/(\d+)\s*m/i.exec(eventName) || [])[1]) || 50;
    const name = eventName.toLowerCase();
    const stroke = name.includes('combinado') ? 1.2 : name.includes('pecho') ? 1.25 : name.includes('mariposa') ? 1.15 : name.includes('espalda') ? 1.1 : 1;
    const seconds = pace50 * Math.pow(distance / 50, 1.08) * stroke * (0.9 + random() * 0.3);
    return Math.round(seconds * 100) / 100;
}

/** Registra resultados simulados para todas las inscripciones sin resultado. */
function simulateResults(database, seed = 2025) {
    const random = createRandom(seed);
    const template = demoTemplates.getTemplate('age-groups');
    const paceByCategory = new Map((template ? template.categories : []).map(c => [c.name, c.pace50]));
    const categoryName = new Map(database.getCategories().map(c => [c.category_id, c.category_name]));
    const eventById = new Map(database.getEvents().map(e => [e.event_id, e]));

    let count = 0;
    database.getEntries().forEach(entry => {
        if (database.getResultByEntryId(entry.entry_id)) return;
        const event = eventById.get(entry.event_id);
        if (!event) return;

        const roll = random();
        const status = roll < 0.03 ? 'DQ' : roll < 0.05 ? 'DNS' : roll < 0.07 ? 'DNF' : 'OK';
        const pace = paceByCategory.get(categoryName.get(event.category_id)) || 45;
        const saved = database.saveResult(entry.entry_id, simulateTime(event.event_name, pace, random), status);
        if (!saved.error) count++;
    });
    return count;
}

/**
 * Reemplaza los datos actuales por un evento de demostración completo.
 * Devuelve las cifras creadas.
 */
function loadDemoEvent(database, { withResults = false, today = new Date(), seed = 2025 } = {}) {
    database.clearAllData();

    const eventDate = new Date(today);
    eventDate.setDate(eventDate.getDate() + 14);

    database.saveEventConfig({
        name: 'Copa Demo SwimMeet',
        organizer: 'Club Demo de Natación',
        venue: 'Piscina Municipal',
        city: 'Ciudad Demo',
        date: isoDate(eventDate),
        startTime: '08:00',
        description: 'Evento de demostración con datos ficticios para explorar SwimMeet Manager.',
        lanes: 6,
        poolLength: 25,
        contacts: [
            { name: 'Director Demo', role: 'Director del evento', phone: '300 000 0001', email: 'director@example.com' },
            { name: 'Coordinadora Demo', role: 'Inscripciones', phone: '300 000 0002', email: 'inscripciones@example.com' }
        ],
        rules: [
            'Cada nadador puede inscribirse únicamente en las pruebas de su categoría.',
            'Los menores de 18 años deben estar acompañados por un adulto responsable.',
            'Se premia a los tres primeros lugares de cada prueba.',
            'Las salidas falsas o los virajes incorrectos pueden causar descalificación (DQ).'
        ],
        schedule: [
            { time: '07:30', label: 'Llegada de equipos y registro' },
            { time: '08:00', label: 'Calentamiento' },
            { time: '08:45', label: 'Inicio de pruebas' },
            { time: '13:00', label: 'Premiación' }
        ]
    });

    const created = demoTemplates.applyTemplate(database, 'age-groups');

    const categories = database.getCategories();
    const people = generateDemoParticipants(categories.reduce((sum, _, i) => sum + 8 + ((i * 3) % 5), 0));
    let cursor = 0;
    categories.forEach((category, i) => {
        const size = 8 + ((i * 3) % 5);
        people.slice(cursor, cursor + size).forEach(person => {
            const participant = database.addParticipant(person.name, person.club, person.gender);
            database.enrollInCategory(participant.participant_id, category.category_id);
        });
        cursor += size;
    });

    database.autoAssignAll();
    const results = withResults ? simulateResults(database, seed) : 0;

    return { ...created, participants: database.getParticipants().length, entries: database.getEntries().length, results };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateDemoParticipants, simulateResults, loadDemoEvent, createRandom };
}
