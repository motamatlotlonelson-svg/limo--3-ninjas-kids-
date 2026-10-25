// assembler.test.js - run with `npm test`.
// EXPECTED VALUES ARE HAND-DERIVED from the field layouts in the spec (A5), NOT copied
// from the assembler's output. The derivation is shown beside each case so you can
// redo it at a defence. Layout reminders (bit 31 on the left):
//   R: funct7|rs2|rs1|funct3|rd|opcode      I: imm12|rs1|funct3|rd|opcode
//   S: imm[11:5]|rs2|rs1|funct3|imm[4:0]|opcode
//   B: imm[12]|imm[10:5]|rs2|rs1|funct3|imm[4:1]|imm[11]|opcode
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/assembler/assemble.js';
import { tokenizeLine } from '../src/assembler/tokenizer.js';

const one = (line) => {
  const r = assemble(line);
  assert.deepEqual(r.errors, [], 'unexpected errors');
  return r.instructions[0].hex;
};
const errorsOf = (src) => assemble(src).errors.map((e) => e.message);

// ---------- one valid encoding per instruction ----------
test('R-type: eketsa x5,x6,x7 = 0x007302B3 (A5 example)', () => {
  // 0000000 00111 00110 000 00101 0110011
  assert.equal(one('eketsa x5, x6, x7'), '0x007302B3');
});
test('R-type: tlosa differs only in funct7 = 0100000 -> +0x40000000', () => {
  assert.equal(one('tlosa x5, x6, x7'), '0x407302B3');
});
test('R-type: le (funct3=111 -> +0x7000)', () => assert.equal(one('le x5, x6, x7'), '0x007372B3'));
test('R-type: kapa (funct3=110 -> +0x6000)', () => assert.equal(one('kapa x5, x6, x7'), '0x007362B3'));
test('R-type: phahamisa (funct3=001 -> +0x1000)', () => assert.equal(one('phahamisa x5, x6, x7'), '0x007312B3'));
test('I-type: eketsa-i x5,x6,10 = 0x00A30293', () => {
  // imm 10<<20=0x00A00000, rs1 6<<15=0x30000, rd 5<<7=0x280, opcode 0x13
  assert.equal(one('eketsa-i x5, x6, 10'), '0x00A30293');
});
test('I-type load: lata x5,8(x6) = 0x00832283', () => {
  // 0x00800000 + 0x30000 + (funct3 2<<12=0x2000) + 0x280 + opcode 0x03
  assert.equal(one('lata x5, 8(x6)'), '0x00832283');
});
test('S-type: boloka x7,8(x6) = 0x00732423', () => {
  // rs2 7<<20=0x700000, rs1 0x30000, funct3 0x2000, imm[4:0]=8<<7=0x400, opcode 0x23
  assert.equal(one('boloka x7, 8(x6)'), '0x00732423');
});
test('S-type negative offset: boloka x7,-4(x6) = 0xFE732E23', () => {
  // -4 = 0xFFC: imm[11:5]=1111111 -> 0xFE000000, imm[4:0]=11100 -> 0x1C<<7=0xE00
  assert.equal(one('boloka x7, -4(x6)'), '0xFE732E23');
});
test('B-type: haeba-lekana x5,x6,8 = 0x00628463', () => {
  // imm 8: imm[4:1]=0100 -> 4<<8=0x400; rs2 6<<20=0x600000; rs1 5<<15=0x28000; opcode 0x63
  assert.equal(one('haeba-lekana x5, x6, 8'), '0x00628463');
});
test('B-type: haeba-sa-lekane differs only in funct3=001 -> +0x1000', () => {
  assert.equal(one('haeba-sa-lekane x5, x6, 8'), '0x00629463');
});

// ---------- registers: all three spellings are the same register ----------
test('register spellings x10 / r10 / thuso0 agree', () => {
  const a = one('eketsa x10, x10, x10'), b = one('eketsa r10, r10, r10'), c = one('eketsa thuso0, thuso0, thuso0');
  assert.equal(a, b); assert.equal(b, c);
});
test('Sesotho names map to numbers: khutla=x1, sephuthelo=x2, lefela=x0, poloko1=x9, thuso5=x15', () => {
  assert.equal(one('eketsa khutla, sephuthelo, lefela'), one('eketsa x1, x2, x0'));
  assert.equal(one('eketsa poloko1, thuso5, molemo3'), one('eketsa x9, x15, x7'));
});

// ---------- immediates: boundaries ----------
test('addi immediate boundaries (12-bit signed)', () => {
  assert.equal(one('eketsa-i x5, x6, 2047'), '0x7FF30293');   // 0x7FF<<20
  assert.equal(one('eketsa-i x5, x6, -2048'), '0x80030293');  // 0x800<<20
  assert.equal(one('eketsa-i x5, x6, -1'), '0xFFF30293');     // 0xFFF<<20
  assert.equal(one('eketsa-i x5, x6, 0xA'), '0x00A30293');    // hex == 10
});
test('addi immediate one past each boundary is an error', () => {
  assert.match(errorsOf('eketsa-i x5, x6, 2048')[0], /does not fit in 12 bits/);
  assert.match(errorsOf('eketsa-i x5, x6, -2049')[0], /does not fit in 12 bits/);
});

// ---------- labels ----------
test('backward label: bne at 0xC back to loop at 0x8 -> offset -4 -> 0xFEB51EE3', () => {
  // -4 in 13 bits = 1 1111 1111 1100: imm[12]=1, imm[11]=1, imm[10:5]=111111, imm[4:1]=1110
  const r = assemble('nop_pad1: eketsa-i x0,x0,0\nnop_pad2: eketsa-i x0,x0,0\nloop: eketsa-i x10,x10,1\nhaeba-sa-lekane x10, x11, loop');
  assert.deepEqual(r.errors, []);
  assert.equal(r.labels.loop, 8);
  assert.equal(r.instructions[3].hex, '0xFEB51EE3');
});
test('forward label: beq at 0 to done at 8 -> offset +8 -> 0x00208463', () => {
  const r = assemble('haeba-lekana x1, x2, done\neketsa-i x1, x1, 1\ndone: eketsa-i x2, x2, 1');
  assert.deepEqual(r.errors, []);
  assert.equal(r.instructions[0].hex, '0x00208463');
});
test('label alone on a line applies to the NEXT instruction', () => {
  const r = assemble('start:\n\neketsa-i x1, x0, 1');
  assert.equal(r.labels.start, 0);
});

// ---------- apostrophes (D-APOS) ----------
test("apostrophes: ts' stays inside a word; curly and straight apostrophes are the same label", () => {
  const t = tokenizeLine("ts'oara: eketsa x1, x2, x3");
  assert.equal(t.label, "ts'oara");
  const r = assemble("haeba-lekana x1, x2, ts\u2019oara\neketsa-i x1, x1, 1\nts'oara: eketsa-i x2, x2, 1");
  assert.deepEqual(r.errors, []);
  assert.equal(r.instructions[0].hex, '0x00208463');   // same as the forward-label case
});

// ---------- every error type, with line numbers ----------
test('error: unknown mnemonic with suggestion and line number', () => {
  assert.deepEqual(errorsOf('eketsa x1,x2,x3\neketsaa x1,x2,x3'),
    ['Line 2: `eketsaa` is not a LIMO instruction. Did you mean `eketsa`?']);
});
test('error: bad register (x16 does not exist, nonsense name)', () => {
  assert.match(errorsOf('eketsa x16, x1, x2')[0], /only 16 registers/);
  assert.match(errorsOf('eketsa banana, x1, x2')[0], /is not a register/);
});
test('error: missing operand', () => {
  assert.equal(errorsOf('eketsa x1, x2')[0], 'Line 1: `eketsa` needs 3 operands (rd, rs1, rs2) but got 2');
});
test('error: undefined label, duplicate label', () => {
  assert.match(errorsOf('haeba-lekana x1, x2, nowhere')[0], /label `nowhere` is not defined/);
  assert.match(errorsOf('a: eketsa x1,x2,x3\na: eketsa x1,x2,x3')[0], /Line 2: label `a` is already defined/);
});
test('error: branch offset odd or out of reach; bad memory operand; bad number', () => {
  assert.match(errorsOf('haeba-lekana x1, x2, 3')[0], /odd/);
  assert.match(errorsOf('haeba-lekana x1, x2, 4096')[0], /reaches only -4096 to 4094/);
  assert.equal(assemble('haeba-lekana x1, x2, 4094').errors.length, 0);   // boundary OK
  assert.equal(assemble('haeba-lekana x1, x2, -4096').errors.length, 0);  // boundary OK
  assert.match(errorsOf('lata x1, x2')[0], /offset\(register\)/);
  assert.match(errorsOf('eketsa-i x1, x2, abc')[0], /is not a number/);
});
test('all errors are reported, not just the first', () => {
  assert.equal(errorsOf('foo\neketsa x1\nlata x1, 0(x99)').length, 3);
});

// ---------- the three M1 sample programs, end to end (files are CRLF and contain a Unicode arrow) ----------
const prog = (n) => assemble(readFileSync(new URL(`../examples/${n}`, import.meta.url), 'utf8'));
test('program1_arithmetic: addi x10,x0,5 ; addi x11,x0,7 ; add x12,x10,x11', () => {
  const r = prog('program1_arithmetic.limo');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.instructions.map((i) => i.hex), ['0x00500513', '0x00700593', '0x00B50633']);
});
test('program2_load_use: addi x10,x0,100 ; lw x11,0(x10) ; add x12,x11,x11', () => {
  const r = prog('program2_load_use.limo');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.instructions.map((i) => i.hex), ['0x06400513', '0x00052583', '0x00B58633']);
});
test('program3_loop: back-branch at 0xC to loop at 0x8', () => {
  const r = prog('program3_loop.limo');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.instructions.map((i) => i.hex), ['0x00000513', '0x00500593', '0x00150513', '0xFEB51EE3']);
  assert.equal(r.labels.loop, 8);
});
