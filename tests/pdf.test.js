const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function read(file) {
    return readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('el PDF local conserva todos los nombres del podio y la tabla en un empate numeroso', () => {
    const sandbox = vm.createContext({
        atob, btoa, TextEncoder, TextDecoder,
        db: { getEventConfig: () => ({ name: 'Copa Ficticia' }) }
    });
    for (const file of ['js/vendor/jspdf.umd.min.js', 'js/utils.js', 'js/pdf.js']) {
        vm.runInContext(read(file), sandbox, { filename: file });
    }
    const rows = Array.from({ length: 35 }, (_, i) => ({
        category_id: 'C-001', category_name: 'Categoría QA',
        event_id: 'E-001', event_name: 'Prueba Ficticia',
        participant_name: 'Ficticia ' + String(i + 1).padStart(2, '0'),
        club: 'Club QA', heat: Math.floor(i / 6) + 1, lane: i % 6 + 1,
        status: 'OK', position: 1, time: 32.12
    }));
    sandbox.rows = rows;
    const doc = vm.runInContext('ResultsPdf.buildDocument(jspdf.jsPDF, rows, {})', sandbox);
    const body = doc.output();
    assert.ok(doc.getNumberOfPages() >= 3);
    assert.ok(body.startsWith('%PDF-'));
    assert.ok(body.includes('podio'));
    for (const { participant_name: name } of rows) {
        const matches = [...body.matchAll(new RegExp('(-?[\\d.]+) Td\\n\\(' + name + '\\) Tj', 'g'))];
        assert.equal(matches.length, 2, name);
        assert.ok(matches.every(match => Number(match[1]) > 48), name + ' debe quedar por encima del pie');
    }
});

test('el receptor de PDF documentado valida la petición antes de escribir en Drive', () => {
    const fence = String.fromCharCode(96).repeat(3);
    const script = read('INSTRUCCIONES_PDF.md').split(fence + 'javascript')[1].split(fence)[0];
    const files = [];
    const sandbox = vm.createContext({
        DriveApp: { getFolderById: () => ({ createFile: file => files.push(file) }) },
        Utilities: {
            base64Decode: input => [...Buffer.from(input, 'base64')],
            newBlob: (bytes, mime, filename) => ({ bytes, mime, filename })
        },
        ContentService: {
            createTextOutput: output => ({ setMimeType: () => JSON.parse(output) }),
            MimeType: { JSON: 'json' }
        }
    });
    const post = vm.runInContext(script + '\ndoPost', sandbox);
    const encode = text => Buffer.from(text).toString('base64');
    const pdf = encode('%PDF-1.3\nDocumento ficticio QA\n%%EOF\n');
    const send = data => post({ postData: { contents: JSON.stringify(data) } });
    assert.equal(post({}).success, false);
    assert.equal(send({ filename: 'ficticio.pdf', content: '###=' }).success, false);
    assert.equal(send({ filename: '../ficticio.pdf', content: pdf }).success, false);
    assert.equal(send({ filename: 'ficticio.txt', content: pdf }).success, false);
    assert.equal(send({ filename: 'ficticio.pdf', content: encode('Ficticio') }).success, false);
    assert.equal(send({ filename: 'ficticio.pdf', content: encode('%PDF-1.3\nSin cierre') }).success, false);
    assert.equal(send({ filename: 'ficticio.pdf', content: 'A'.repeat(10_000_000) }).success, false);
    assert.equal(files.length, 0);
    assert.equal(send({ filename: 'ficticio.pdf', content: pdf }).success, true);
    assert.equal(files.length, 1);
    assert.equal(files[0].mime, 'application/pdf');
});
