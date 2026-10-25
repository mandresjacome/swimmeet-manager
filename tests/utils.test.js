const { test } = require('node:test');
const assert = require('node:assert/strict');
const { html, raw, escapeHtml, formatTime, parseTime, formatDate, normalizeText } = require('../js/utils.js');

test('escapeHtml neutraliza etiquetas y comillas', () => {
    assert.equal(escapeHtml(`<img src=x onerror="alert('x')">`), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;');
    assert.equal(escapeHtml(null), '');
});

test('html`` escapa los valores interpolados, anida plantillas y une listas', () => {
    const name = '<script>alert(1)</script>';
    const rows = ['a', 'b'].map(x => html`<li>${x}</li>`);
    assert.equal(String(html`<td>${name}</td>`), '<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>');
    assert.equal(String(html`<ul>${rows}</ul>`), '<ul><li>a</li><li>b</li></ul>');
    assert.equal(String(html`${raw('<b>ok</b>')}${false}${undefined}`), '<b>ok</b>');
});

test('formatTime formatea segundos y minutos', () => {
    assert.equal(formatTime(31.5), '31.50');
    assert.equal(formatTime(65.32), '1:05.32');
    assert.equal(formatTime(125), '2:05.00');
    assert.equal(formatTime(null), '—');
    assert.equal(formatTime(''), '—');
});

test('parseTime acepta segundos, mm:ss.cc y coma decimal', () => {
    assert.equal(parseTime('31.5'), 31.5);
    assert.equal(parseTime('31,5'), 31.5);
    assert.equal(parseTime('1:05.32'), 65.32);
    assert.equal(parseTime('1:05'), 65);
    assert.equal(parseTime('  '), null);
});

test('parseTime rechaza entradas inválidas', () => {
    ['abc', '1:75', '0', '-3', '1:2:3', '12.3456'].forEach(value => {
        assert.ok(Number.isNaN(parseTime(value)), `debería rechazar "${value}"`);
    });
});

test('formatTime y parseTime son inversos', () => {
    [0.5, 29.99, 59.99, 60, 61.01, 305.5].forEach(seconds => {
        assert.equal(parseTime(formatTime(seconds)), seconds);
    });
});

test('formatDate no se desfasa por zona horaria', () => {
    assert.match(formatDate('2026-03-14'), /14 de marzo de 2026/);
    assert.equal(formatDate(''), '');
    assert.equal(formatDate('14/03/2026'), '');
});

test('normalizeText quita tildes y mayúsculas', () => {
    assert.equal(normalizeText('  María Pérez '), 'maria perez');
});
