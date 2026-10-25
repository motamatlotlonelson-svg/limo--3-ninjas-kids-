// programs.test.js - the B8 test programs. Every expected value below was derived on paper
// (cycles = instructions + 4 + stalls + flush slots) before running anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/assembler/assemble.js';
import { run } from '../src/core/pipeline.js';
import { narrate } from '../src/ui/narration.js';

const load = (n) => { const r = assemble(readFileSync(new URL(`../examples/${n}`, import.meta.url), 'utf8')); assert.deepEqual(r.errors, []); return r.instructions; };
const word = (st, a) => new DataView(st.dmem.buffer).getUint32(a, true);

test('program4 logic: 12&10=8, 12|10=14, 12-10=2, 12<<3=96; 7 instr, 4 forwards, no stalls, 11 cycles', () => {
  // forwards: and (A from MEM/WB, B from EX/MEM) = 2; or (B from MEM/WB) = 1; sll (B from EX/MEM) = 1
  const { final: f } = run(load('program4_logic.limo'));
  assert.deepEqual([f.regs[12], f.regs[13], f.regs[14], f.regs[15]], [8, 14, 2, 96]);
  assert.deepEqual([f.stats.retired, f.stats.forwards, f.stats.stalls, f.stats.cycles], [7, 4, 0, 11]);
});
test('program5 array sum: data 1,2,3 -> x12=6, x10=12; 15 instr + 3 load-use stalls + 4 flush slots + 4 = 26 cycles', () => {
  const { final: f } = run(load('program5_array_sum.limo'), { data: { 0: 1, 4: 2, 8: 3 } });
  assert.deepEqual([f.regs[12], f.regs[10]], [6, 12]);
  assert.deepEqual([f.stats.retired, f.stats.stalls, f.stats.flushes, f.stats.cycles], [15, 3, 4, 26]);
});
test('program6 store/load: Mem[16]=77, Mem[20]=5, x14=72; 7 instr + 1 load-use stall + 4 = 12 cycles, 3 forwards', () => {
  const { final: f } = run(load('program6_store_load.limo'));
  assert.deepEqual([word(f, 16), word(f, 20), f.regs[12], f.regs[13], f.regs[14]], [77, 5, 77, 5, 72]);
  assert.deepEqual([f.stats.stalls, f.stats.forwards, f.stats.cycles], [1, 3, 12]);
});
test('program7 branches: beq taken flushes 2 wrong-path instrs, bne not taken is free; 6 instr + 2 flush + 4 = 12 cycles', () => {
  const { final: f } = run(load('program7_branches.limo'));
  assert.deepEqual([f.regs[10], f.regs[11], f.regs[12], f.regs[13], f.regs[14]], [4, 4, 0, 1, 2]);
  assert.deepEqual([f.stats.retired, f.stats.flushes, f.stats.squashed, f.stats.cycles], [6, 2, 2, 12]);
});

test('narration gives one English and one Sesotho line for each stage in every cycle', () => {
  const { states } = run(load('program2_load_use.limo'), { data: { 100: 21 } });
  for (const st of states.slice(1)) {
    const n = narrate(st);
    for (const stage of ['IF', 'ID', 'EX', 'MEM', 'WB']) assert.ok(n.some((x) => x.stage === stage && x.en && x.st), stage);
  }
  assert.ok(narrate(states[4]).some((x) => /Stall/.test(x.en)));   // cycle 4: the load-use stall
});
