export * from './types.js';
export { renderDeckToHtml, countTablesInPlan, defaultStyleSpec, layoutCatalog } from './render/render-deck.js';
export { buildDeck } from './pipeline/build-deck.js';
export { exportHtmlFileToPptx } from './pipeline/export-html-file.js';
export { exportDeckToPptxBuffer } from './export/export-pptx.js';
export { runF0EnvProbe } from './preflight/f0-env.js';
export { lintPresentationHtml, countRootSlides } from './preflight/lint-html.js';
