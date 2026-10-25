/**
 * Plantillas de categorías y pruebas para arrancar una competencia en un clic.
 * Los rangos de edad van en el nombre de la categoría; edítalos libremente después.
 */

const SWIM_TEMPLATES = [
    {
        id: 'age-groups',
        name: 'Torneo por edades',
        description: '7 categorías por grupo de edad, de pre-infantil a máster, con 2–3 pruebas cada una.',
        categories: [
            { name: 'Pre-infantil (6-8 años)', pace50: 70, events: ['25 m Libre', '25 m Espalda'] },
            { name: 'Infantil A (9-10 años)', pace50: 58, events: ['25 m Libre', '25 m Espalda', '50 m Libre'] },
            { name: 'Infantil B (11-12 años)', pace50: 46, events: ['50 m Libre', '50 m Espalda', '50 m Pecho'] },
            { name: 'Juvenil A (13-14 años)', pace50: 36, events: ['50 m Libre', '100 m Libre', '50 m Mariposa'] },
            { name: 'Juvenil B (15-17 años)', pace50: 33, events: ['50 m Libre', '100 m Libre', '50 m Mariposa'] },
            { name: 'Mayores (18-29 años)', pace50: 31, events: ['50 m Libre', '100 m Libre', '100 m Combinado'] },
            { name: 'Máster (30+ años)', pace50: 37, events: ['50 m Libre', '50 m Espalda', '50 m Pecho'] }
        ]
    },
    {
        id: 'school-festival',
        name: 'Festival escolar',
        description: '3 niveles (principiantes, intermedios, avanzados) con pruebas cortas.',
        categories: [
            { name: 'Principiantes', pace50: 75, events: ['25 m Libre', '25 m Espalda'] },
            { name: 'Intermedios', pace50: 55, events: ['25 m Libre', '25 m Espalda', '50 m Libre'] },
            { name: 'Avanzados', pace50: 42, events: ['50 m Libre', '50 m Espalda', '50 m Pecho'] }
        ]
    },
    {
        id: 'open',
        name: 'Open (femenino y masculino)',
        description: '2 categorías abiertas con las 6 pruebas más comunes.',
        categories: [
            { name: 'Open Femenino', pace50: 32, events: ['50 m Libre', '100 m Libre', '50 m Espalda', '50 m Pecho', '50 m Mariposa', '100 m Combinado'] },
            { name: 'Open Masculino', pace50: 29, events: ['50 m Libre', '100 m Libre', '50 m Espalda', '50 m Pecho', '50 m Mariposa', '100 m Combinado'] }
        ]
    }
];

function getTemplate(templateId) {
    return SWIM_TEMPLATES.find(t => t.id === templateId) || null;
}

function sameName(a, b) {
    const clean = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return clean(a) === clean(b);
}

/**
 * Agrega a la base las categorías y pruebas de una plantilla (omite las que ya existen).
 * Devuelve { categories, events } con la cantidad realmente creada.
 */
function applyTemplate(database, templateId) {
    const template = getTemplate(templateId);
    if (!template) return { error: 'Plantilla no encontrada' };

    const created = { categories: 0, events: 0 };
    template.categories.forEach(spec => {
        let category = database.getCategories().find(c => sameName(c.category_name, spec.name));
        if (!category) {
            category = database.addCategory(spec.name);
            if (category.error) return;
            created.categories++;
        }
        spec.events.forEach(eventName => {
            const event = database.addEvent(eventName, category.category_id);
            if (!event.error) created.events++;
        });
    });
    return created;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SWIM_TEMPLATES, getTemplate, applyTemplate };
}
