const js = require('@eslint/js');
const globals = require('globals');

const shared = {
    ajustes: 'DataExporter Layout SWIM_TEMPLATES applyTemplate confirmDialog db html loadDemoEvent on toast',
    competencia: 'Layout SwimmingDatabase confirmDialog db debounce formatTime html normalizeText on openForm parseTime raw toast',
    datos: 'Layout PARTICIPANTS_CSV_TEMPLATE confirmDialog db debounce downloadFile html normalizeText on openForm parseParticipantsCsv readFileAsText toast',
    demo: 'SWIM_TEMPLATES applyTemplate getTemplate',
    evento: 'Layout db formatDate html',
    export: 'db downloadFile formatTime normalizeText readFileAsText toast',
    inicio: 'Layout confirmDialog db formatDate html loadDemoEvent on toast',
    layout: 'db debounce formatDate html raw',
    pdf: 'db downloadFile formatDate formatTime normalizeText toast',
    resultados: 'DataExporter Layout ResultsPdf SwimmingDatabase db debounce formatTime html normalizeText on raw toast'
};

module.exports = [
    { ignores: ['js/vendor/**'] },
    js.configs.recommended,
    {
        files: ['js/*.js'],
        languageOptions: { sourceType: 'script', globals: globals.browser }
    },
    ...Object.entries(shared).map(([file, names]) => ({
        files: [`js/${file}.js`],
        languageOptions: {
            globals: Object.fromEntries(names.split(' ').map(name => [name, 'readonly']))
        }
    })),
    {
        files: ['js/{csv,database,demo,export,templates,utils}.js'],
        languageOptions: { globals: { module: 'readonly' } }
    },
    {
        files: ['js/demo.js'],
        languageOptions: { globals: { require: 'readonly' } }
    },
    {
        files: ['tests/**/*.js', 'eslint.config.cjs'],
        languageOptions: { sourceType: 'commonjs', globals: globals.node }
    }
];
