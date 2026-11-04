import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Control has no browser print action or browser fallback recommendation',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const printer=readFileSync(new URL('../js/print-agent.js',import.meta.url),'utf8');
 assert.doesNotMatch(app+printer,/window\.print\(|popup\.print\(|data-browser-print|printReceiptBrowser|imprimirlo desde el navegador|impresión del navegador/);
});
