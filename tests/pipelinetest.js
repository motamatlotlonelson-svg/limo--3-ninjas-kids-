// pipeline.test.js - core tests. Cycle counts are derived by hand with the rule
//   cycles = instructions + 4 (pipeline fill) + stall bubbles + flush bubbles
// and by drawing the cycle diagram, NOT by running the simulator first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/assembler/assemble.js';
import { decode } from '../src/core/control.js';
import { forwardUnit, hazardUnit } from '../src/core/hazard.js';
import { createCpu, step, run } from '../src/core/pipeline.js';

const prog = (src) => { const r = assemble(src); assert.deepEqual(r.errors, []); return r.instructions; };
const file = (n) => prog(readFileSync(new URL(`../examples/${n}`, import.meta.url), 'utf8'));
const stage = (r) => ({ valid: true, ...r, ctrl: { regWrite: 1, memRead: 0, usesRs1: 0, usesRs2: 0, ...r.ctrl } });

// ---------- control decoder ----------
test('decode R-type 0x007302B3 (eketsa x5,x6,x7)', () => {
  const d = decode(0x007302B3);
  assert.equal(d.mnemonic, 'eketsa');
  assert.deepEqual([d.rd, d.rs1, d.rs2], [5, 6, 7]);
  assert.deepEqual(d.ctrl, { regWrite: 1, aluSrc: 0, aluOp: 'ADD', memRead: 0, memWrite: 0, memToReg: 0, branch: 'none', usesRs1: 1, usesRs2: 1 });
});
test('decode lata 0x00832283: load -> memRead, memToReg, aluSrc, regWrite, imm 8', () => {
  const d = decode(0x00832283);
  assert.deepEqual([d.ctrl.memRead, d.ctrl.memToReg, d.ctrl.aluSrc, d.ctrl.regWrite, d.ctrl.memWrite, d.imm], [1, 1, 1, 1, 0, 8]);
});
test('decode boloka 0xFE732E23: store -> memWrite, no regWrite, imm -4, rs2=7, rs1=6', () => {
  const d = decode(0xFE732E23);
  assert.deepEqual([d.ctrl.memWrite, d.ctrl.regWrite, d.ctrl.aluSrc, d.imm, d.rs2, d.rs1, d.rd], [1, 0, 1, -4, 7, 6, 0]);
});
test('decode branches: beq imm +8 (0x00628463); bne imm -4 (0xFEB51EE3)', () => {
  const a = decode(0x00628463), b = decode(0xFEB51EE3);
  assert.deepEqual([a.ctrl.branch, a.imm, a.ctrl.regWrite, a.ctrl.aluOp], ['beq', 8, 0, 'SUB']);
  assert.deepEqual([b.ctrl.branch, b.imm, b.rs1, b.rs2], ['bne', -4, 10, 11]);
});
test('decode tlosa uses SUB; unknown word is an illegal no-op', () => {
  assert.equal(decode(0x407302B3).ctrl.aluOp, 'SUB');
  const bad = decode(0xFFFFFFFF);
  assert.equal(bad.illegal, true); assert.equal(bad.ctrl.regWrite, 0);
});

// ---------- forwarding / hazard units ----------
test('forwardUnit: EX/MEM beats MEM/WB when both match; x0 never forwarded; off -> NONE', () => {
  const idex = stage({ rs1: 1, rs2: 0, ctrl: { usesRs1: 1, usesRs2: 1 } });
  const exmem = stage({ rd: 1 }), memwb = stage({ rd: 1 });
  assert.deepEqual(forwardUnit(idex, exmem, memwb, true), { A: 'EX_MEM', B: 'NONE' });
  assert.deepEqual(forwardUnit(idex, { valid: false, ctrl: {} }, memwb, true), { A: 'MEM_WB', B: 'NONE' });
  assert.deepEqual(forwardUnit(idex, exmem, memwb, false), { A: 'NONE', B: 'NONE' });
});
test('hazardUnit: load-use stalls with forwarding; plain RAW does not; RAW stalls without forwarding', () => {
  const d = decode(0x00B58633);          // eketsa x12,x11,x11
  const loadInEx = stage({ rd: 11, ctrl: { memRead: 1 } });
  const aluInEx = stage({ rd: 11 });
  const none = { valid: false, ctrl: {} };
  assert.deepEqual(hazardUnit(d, loadInEx, none, true), { stall: true, reason: 'load-use' });
  assert.equal(hazardUnit(d, aluInEx, none, true).stall, false);
  assert.deepEqual(hazardUnit(d, aluInEx, none, false), { stall: true, reason: 'RAW' });
});

// ---------- whole programs ----------
test('program1, forwarding ON: 7 cycles (3+4), x10=5 x11=7 x12=12, 2 forwards (A from MEM/WB, B from EX/MEM)', () => {
  const { final } = run(file('program1_arithmetic.limo'));
  assert.deepEqual([final.regs[10], final.regs[11], final.regs[12]], [5, 7, 12]);
  assert.equal(final.stats.cycles, 7); assert.equal(final.stats.retired, 3);
  assert.equal(final.stats.stalls, 0); assert.equal(final.stats.forwards, 2);
});
test('program1, forwarding OFF: add waits in ID for cycles 4,5 -> 2 stalls, 9 cycles, same result', () => {
  const { final } = run(file('program1_arithmetic.limo'), { forwarding: false });
  assert.equal(final.regs[12], 12);
  assert.equal(final.stats.stalls, 2); assert.equal(final.stats.cycles, 9);
});
test('program2 load-use, forwarding ON: 1 stall, 8 cycles, x12 = 2*21 = 42', () => {
  const { final, trace } = run(file('program2_load_use.limo'), { data: { 100: 21 } });
  assert.deepEqual([final.regs[10], final.regs[11], final.regs[12]], [100, 21, 42]);
  assert.equal(final.stats.stalls, 1); assert.equal(final.stats.cycles, 8);
  assert.equal(trace[3].stall, 'load-use');                     // cycle 4: add in ID, lw in EX
});
test('program2, forwarding OFF: 2 stalls for lw + 2 for add = 4 stalls, 11 cycles', () => {
  const { final } = run(file('program2_load_use.limo'), { forwarding: false, data: { 100: 21 } });
  assert.equal(final.regs[12], 42);
  assert.equal(final.stats.stalls, 4); assert.equal(final.stats.cycles, 11);
});
test('program3 loop: 12 instructions, 4 taken branches x 2 flush slots -> 12+4+8 = 24 cycles', () => {
  const { final } = run(file('program3_loop.limo'));
  assert.deepEqual([final.regs[10], final.regs[11]], [5, 5]);
  assert.equal(final.stats.retired, 12); assert.equal(final.stats.flushes, 8);
  assert.equal(final.stats.stalls, 0); assert.equal(final.stats.cycles, 24);
});
test('taken branch squashes 2 wrong-path instructions: x1,x2 stay 0; x3=3; 2+4+2 = 8 cycles', () => {
  const { final } = run(prog('haeba-lekana x0, x0, skip\neketsa-i x1, x0, 1\neketsa-i x2, x0, 2\nskip: eketsa-i x3, x0, 3'));
  assert.deepEqual([final.regs[1], final.regs[2], final.regs[3]], [0, 0, 3]);
  assert.deepEqual([final.stats.flushes, final.stats.squashed, final.stats.retired, final.stats.cycles], [2, 2, 2, 8]);
});
test('not-taken branch costs nothing: all 3 instructions run, 7 cycles', () => {
  const { final } = run(prog('haeba-sa-lekane x0, x0, end\neketsa-i x1, x0, 1\nend: eketsa-i x2, x0, 2'));
  assert.deepEqual([final.regs[1], final.regs[2], final.stats.flushes, final.stats.cycles], [1, 2, 0, 7]);
});
test('newest producer wins: addi x1,1 ; addi x1,x1,2 ; addi x2,x1,0 -> x2 = 3', () => {
  const { final } = run(prog('eketsa-i x1, x0, 1\neketsa-i x1, x1, 2\neketsa-i x2, x1, 0'));
  assert.deepEqual([final.regs[1], final.regs[2], final.stats.cycles], [3, 3, 7]);
});
test('x0 stays zero even if written, and is not forwarded', () => {
  const { final } = run(prog('eketsa-i x0, x0, 5\neketsa x1, x0, x0'));
  assert.deepEqual([final.regs[0], final.regs[1], final.stats.cycles], [0, 0, 6]);
});
test('store: sw of a value produced the cycle before (store data forwarded), memory word at 16 = 77', () => {
  const { final } = run(prog('eketsa-i x1, x0, 77\nboloka x1, 16(x0)'));
  assert.equal(final.dmem[16], 77); assert.equal(final.dmem[17], 0);   // little-endian
  assert.equal(final.stats.cycles, 6);
});
test('misaligned data access halts with a fault', () => {
  const { final } = run(prog('lata x1, 2(x0)'));
  assert.match(final.fault, /not word-aligned/); assert.equal(final.halted, true);
});

// ---------- Step Back relies on this ----------
test('step() never mutates the previous state', () => {
  const s0 = createCpu(file('program3_loop.limo'));
  const before = JSON.stringify({ ...s0, dmem: Array.from(s0.dmem) });
  let s = s0; for (let i = 0; i < 10; i++) s = step(s);
  assert.equal(JSON.stringify({ ...s0, dmem: Array.from(s0.dmem) }), before);
});
test('infinite loop is stopped by the cycle limit', () => {
  const { final } = run(prog('loop: haeba-lekana x0, x0, loop'), {}, 50);
  assert.match(final.fault, /Stopped after 50 cycles/);
});
