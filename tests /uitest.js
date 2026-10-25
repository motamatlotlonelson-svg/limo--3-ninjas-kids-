// ui.test.js - tests for the pure rendering functions in src/ui/main.js (no browser needed).
// Expected values come from hand-drawn cycle diagrams, not from the simulator's own output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/assembler/assemble.js';
import { createCpu, step } from '../src/core/pipeline.js';
import {
  renderTable, renderStages, renderChart, renderStats, renderDatapath, parseData,
} from '../src/ui/main.js';

// Run a program to completion and return every state (states[i] = state after i cycles).
const runStates = (src, opts = {}) => {
  let s = createCpu(assemble(src).instructions, opts);
  const all = [s];
  while (!s.halted) { s = step(s); all.push(s); }
  return all;
};

// ---------- machine-code table ----------
test('renderTable shows address, hex and every field name as text', () => {
  const html = renderTable(assemble('eketsa x5, x6, x7'));
  assert.match(html, /0x0000/); assert.match(html, /0x007302B3/);
  for (const name of ['funct7', 'rs2', 'rs1', 'funct3', 'rd', 'opcode']) {
    assert.ok(html.includes(`<i>${name}</i>`), name);
  }
  assert.ok(html.includes('<b>0110011</b>'));   // opcode field bits
});

test('renderTable escapes HTML in source text', () => {
  const r = { instructions: [{ address: 0, text: '<b>x</b>', hex: '0x0', fields: [] }] };
  assert.ok(!renderTable(r).includes('<b>x</b>'));
});

// ---------- pipeline chart and statistics ----------
test('chart: program 1 has 3 rows and 7 cycle columns; add is in EX at cycle 5', () => {
  const st = runStates('eketsa-i x10, x0, 5\neketsa-i x11, x0, 7\neketsa x12, x10, x11');
  const html = renderChart(st, st.length - 1);
  assert.equal((html.match(/<tr><th>0x/g) || []).length, 3);
  assert.equal((html.match(/<th>\d+<\/th>/g) || []).length, 7);
  assert.match(html, /<th>5<\/th>/);
});

test('chart marks a load-use stall and stats show CPI', () => {
  const st = runStates('eketsa-i x10, x0, 100\nlata x11, 0(x10)\neketsa x12, x11, x11', { data: { 100: 21 } });
  assert.match(renderChart(st, st.length - 1), /ID stall/);
  assert.match(renderStats(st.at(-1)), /CPI<\/th><td>2\.67/);   // 8 cycles / 3 instructions
});

// ---------- stage view ----------
test('stage view tags a flush and a branch in text, not colour alone', () => {
  const st = runStates('haeba-lekana x0, x0, skip\neketsa-i x1, x0, 1\neketsa-i x2, x0, 2\nskip: eketsa-i x3, x0, 3');
  assert.match(renderStages(st[3]), /BRANCH TAKEN/);
  assert.match(renderStages(st[3]), /FLUSH 2/);
  assert.match(renderChart(st, st.length - 1), /flushed/);
});

// ---------- input parsing ----------
test('parseData reads address=value pairs', () => {
  assert.deepEqual(parseData('100=21, 104=-5'), { 100: 21, 104: -5 });
});

// ---------- datapath diagram ----------
test('datapath cycle 5 of program 1: ALU adds forwarded 5 and 7 = 12; forwarding wires active', () => {
  const st = runStates('eketsa-i x10, x0, 5\neketsa-i x11, x0, 7\neketsa x12, x10, x11');
  const html = renderDatapath(st[5]);
  assert.match(html, /5, 7/); assert.match(html, /= 12/);
  assert.match(html, /A:MEM_WB B:EX_MEM/);
  assert.equal((html.match(/class="w on"/g) || []).length >= 2, true);
  assert.match(html, /<title>ALU:/);                       // tooltip on the unit
});

test('datapath cycle 4 of the load-use program shows the hazard unit active with the reason', () => {
  const st = runStates('eketsa-i x10, x0, 100\nlata x11, 0(x10)\neketsa x12, x11, x11', { data: { 100: 21 } });
  assert.match(renderDatapath(st[4]), /Hazard unit \[on\]/);
  assert.match(renderDatapath(st[4]), /STALL load-use/);
});
