const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseParticipantsCsv, PARTICIPANTS_CSV_TEMPLATE } = require('../js/csv.js');

test('parseCsv detecta delimitador y respeta comillas', () => {
    assert.deepEqual(parseCsv('a;b;c\n1;2;3'), [['a', 'b', 'c'], ['1', '2', '3']]);
    assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""'), [['a', 'b'], ['x, y', 'say "hi"']]);
    assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('parseCsv soporta BOM, CRLF, saltos dentro de comillas y filas vacías', () => {
    const rows = parseCsv('\uFEFFa,b\r\n\r\n"línea1\nlínea2",z\r\n');
    assert.deepEqual(rows, [['a', 'b'], ['línea1\nlínea2', 'z']]);
});

test('la plantilla descargable es un CSV válido', () => {
    const { participants, errors } = parseParticipantsCsv(PARTICIPANTS_CSV_TEMPLATE);
    assert.equal(errors.length, 0);
    assert.equal(participants.length, 2);
    assert.deepEqual(participants[0], { name: 'Ana Pérez', club: 'Delfines', gender: 'F', category: 'Infantil A' });
});

test('mapea columnas por encabezado en cualquier orden y con alias', () => {
    const { participants } = parseParticipantsCsv('Categoría;Sexo;Nombre;Equipo\nMáster;Masculino;Luis;Orcas');
    assert.deepEqual(participants, [{ name: 'Luis', club: 'Orcas', gender: 'M', category: 'Máster' }]);
});

test('sin encabezado usa el orden nombre, club, género, categoría', () => {
    const { participants } = parseParticipantsCsv('Ana,Delfines,femenino,Open');
    assert.deepEqual(participants, [{ name: 'Ana', club: 'Delfines', gender: 'F', category: 'Open' }]);
});

test('reporta filas sin nombre y géneros desconocidos sin abortar', () => {
    const { participants, errors } = parseParticipantsCsv('nombre,club,genero\nAna,X,F\n,Y,M\nLuis,Z,otro');
    assert.equal(participants.length, 2);
    assert.equal(participants[1].gender, '');
    assert.equal(errors.length, 2);
    assert.match(errors[0], /Fila 3: falta el nombre/);
    assert.match(errors[1], /Fila 4/);
});

test('archivo vacío o demasiado grande', () => {
    assert.ok(parseParticipantsCsv('').errors.length > 0);
    const big = 'nombre\n' + Array.from({ length: 2001 }, (_, i) => `N${i}`).join('\n');
    assert.match(parseParticipantsCsv(big).errors[0], /máximo/);
});
