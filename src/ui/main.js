// main.js - thin UI layer. It only calls the assembler and draws; it never decides CPU behaviour.
// Colour is never the only cue: every field carries its name as text and a distinct border style.
import { assemble } from '../assembler/assemble.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Pure function (testable in Node): assemble() result -> HTML table string.
export function renderTable(result) {
  if (result.instructions.length === 0) return '<p>No instructions assembled.</p>';
  const rows = result.instructions.map((ins) => {
    const fields = ins.fields.map((f, i) =>
      `<span class="fld k${i}" title="${esc(f.name)} = ${f.value}"><b>${f.binary}</b><i>${esc(f.name)}</i></span>`).join('');
    const addr = '0x' + ins.address.toString(16).toUpperCase().padStart(4, '0');
    return `<tr><td>${addr}</td><td>${esc(ins.text)}</td><td>${ins.hex}</td><td>${fields}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Address</th><th>Source</th><th>Hex</th><th>Binary (fields)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const run = () => {
    const r = assemble($('source').value);
    $('errors').innerHTML = r.errors.map((e) => `<li>${esc(e.message)}</li>`).join('');
    $('status').textContent = r.ok ? `Assembled ${r.instructions.length} instructions.` : `${r.errors.length} error(s). Fix them and assemble again.`;
    $('output').innerHTML = renderTable(r);
  };
  $('assemble').addEventListener('click', run);
  $('example').addEventListener('change', async (e) => {
    if (!e.target.value) return;
    try {
      $('source').value = await (await fetch(`examples/${e.target.value}`)).text();
      run();
    } catch { $('status').textContent = 'Could not load the example (serve the folder over http, not file://).'; }
  });
  run();
}
