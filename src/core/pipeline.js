// pipeline.js - the five-stage LIMO pipeline, one clock cycle per step(). No DOM.
//
// MODEL (proposed decisions, see the design notes):
//  * step(state) returns a NEW state and never changes the old one, so the history of
//    states IS the Step Back feature.
//  * Stages are evaluated WB, MEM, EX, ID, IF, reading only the OLD pipeline registers
//    (prev) and writing only the NEW ones (s), which is what real hardware does at a clock edge.
//  * Branches are resolved in EX, predicted not-taken: a taken branch squashes the two
//    younger instructions (in IF and ID) -> 2 flush slots (A6(c)).
//  * Fetching past the last instruction yields bubbles; the machine halts when the PC is
//    past the program and every pipeline register is empty.
import { decode, alu, NO_CTRL } from './control.js';
import { forwardUnit, hazardUnit } from './hazard.js';

const bubble = () => ({ valid: false, ctrl: { ...NO_CTRL }, rd: 0, rs1: 0, rs2: 0 });

// program: array from assemble().instructions ({word, text, ...}).
// opts: { forwarding = true, dmemSize = 1024, data = { byteAddress: wordValue } }
export function createCpu(program, opts = {}) {
  const { forwarding = true, dmemSize = 1024, data = {} } = opts;
  const dmem = new Uint8Array(dmemSize);
  const view = new DataView(dmem.buffer);
  for (const [addr, val] of Object.entries(data)) view.setUint32(Number(addr), val >>> 0, true);
  return {
    cycle: 0, pc: 0,
    regs: new Array(16).fill(0),
    imem: program.map((i) => i.word),
    itext: program.map((i) => i.text),
    dmem,
    IF_ID: bubble(), ID_EX: bubble(), EX_MEM: bubble(), MEM_WB: bubble(),
    forwarding, halted: program.length === 0, fault: null, nextSeq: 0,
    stats: { cycles: 0, retired: 0, stalls: 0, flushes: 0, squashed: 0, forwards: 0 },
    last: null,   // narration/trace record of the cycle just executed
  };
}

const view32 = (mem) => new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
const stageInfo = (r) => (r.valid ? { valid: true, pc: r.pc, text: r.text, seq: r.seq } : { valid: false });

export function step(prev) {
  if (prev.halted) return prev;
  const s = structuredClone(prev);
  s.cycle = prev.cycle + 1;
  s.stats.cycles = s.cycle;
  const events = [];
  const progEnd = prev.imem.length * 4;
  const last = {
    cycle: s.cycle,
    stages: { IF: null, ID: stageInfo(prev.IF_ID), EX: stageInfo(prev.ID_EX), MEM: stageInfo(prev.EX_MEM), WB: stageInfo(prev.MEM_WB) },
    forward: { A: 'NONE', B: 'NONE' }, stall: null, flush: false, events,
    wb: null, alu: null, mem: null, branch: null, squashed: [], id: null, if: null, nextPc: 0,
  };
  s.last = last;

  // ---------------- WB ----------------
  const wb = prev.MEM_WB;
  if (wb.valid) {
    s.stats.retired++;
    if (wb.ctrl.regWrite && wb.rd !== 0) {
      const v = wb.ctrl.memToReg ? wb.memData : wb.aluResult;
      s.regs[wb.rd] = v;
      last.wb = { rd: wb.rd, value: v };
    }
  }
  const wbValue = wb.valid ? (wb.ctrl.memToReg ? wb.memData : wb.aluResult) : 0;

  // ---------------- MEM ----------------
  const m = prev.EX_MEM;
  s.MEM_WB = bubble();
  if (m.valid) {
    let memData = 0;
    if (m.ctrl.memRead || m.ctrl.memWrite) {
      const a = m.aluResult;
      if (a % 4 !== 0 || a + 4 > s.dmem.length) {
        s.fault = `Line of "${m.text}": data address ${a} is ${a % 4 !== 0 ? 'not word-aligned' : 'outside data memory'}`;
        s.halted = true; return s;
      }
      if (m.ctrl.memRead) { memData = view32(s.dmem).getUint32(a, true); last.mem = { op: 'read', address: a, value: memData }; }
      else { view32(s.dmem).setUint32(a, m.rv2 >>> 0, true); last.mem = { op: 'write', address: a, value: m.rv2 }; }
    }
    s.MEM_WB = { valid: true, pc: m.pc, seq: m.seq, text: m.text, rd: m.rd, memData, aluResult: m.aluResult,
                 ctrl: { regWrite: m.ctrl.regWrite, memToReg: m.ctrl.memToReg } };
  }

  // ---------------- EX ----------------
  const x = prev.ID_EX;
  s.EX_MEM = bubble();
  let flush = false, target = 0;
  if (x.valid) {
    const fwd = forwardUnit(x, prev.EX_MEM, prev.MEM_WB, prev.forwarding);
    last.forward = fwd;
    const source = (which, regValue) => which === 'EX_MEM' ? prev.EX_MEM.aluResult : which === 'MEM_WB' ? wbValue : regValue;
    const a = source(fwd.A, x.rv1);
    const b = source(fwd.B, x.rv2);
    for (const [name, w] of [['A', fwd.A], ['B', fwd.B]]) {
      if (w !== 'NONE') { s.stats.forwards++; events.push({ type: 'forward', input: name, from: w, text: `RAW hazard on ALU input ${name}: forwarded from ${w === 'EX_MEM' ? 'EX/MEM' : 'MEM/WB'}` }); }
    }
    const aluB = x.ctrl.aluSrc ? x.imm : b;
    const result = alu(x.ctrl.aluOp, a, aluB);
    last.alu = { a, b: aluB, op: x.ctrl.aluOp, result };
    let taken = false;
    target = (x.pc + x.imm) >>> 0;
    last.alu.target = target;
    if (x.ctrl.branch !== 'none') {
      const zero = result === 0;
      taken = x.ctrl.branch === 'beq' ? zero : !zero;
      last.branch = { taken, target, zero };
      events.push({ type: taken ? 'branch-taken' : 'branch-not-taken', text: taken ? `Branch taken to 0x${target.toString(16)}` : 'Branch not taken' });
      if (taken && target % 4 !== 0) { s.fault = `Branch target ${target} is not word-aligned`; s.halted = true; return s; }
    }
    s.EX_MEM = { valid: true, pc: x.pc, seq: x.seq, text: x.text, aluResult: result, rv2: b, rd: x.rd,
                 branchTaken: taken, branchTarget: target,
                 ctrl: { memRead: x.ctrl.memRead, memWrite: x.ctrl.memWrite, memToReg: x.ctrl.memToReg, regWrite: x.ctrl.regWrite } };
    flush = taken;
  }

  // ---------------- ID ----------------
  s.ID_EX = bubble();
  let stall = false;
  const f = prev.IF_ID;
  if (f.valid) {
    const d = decode(f.instr);
    last.id = { rs1: d.rs1, rs2: d.rs2, rd: d.rd, rv1: s.regs[d.rs1], rv2: s.regs[d.rs2], imm: d.imm, ctrl: d.ctrl };
    const hz = hazardUnit(d, prev.ID_EX, prev.EX_MEM, prev.forwarding);
    if (hz.stall && !flush) {
      stall = true;
      s.stats.stalls++;
      last.stall = hz.reason;
      events.push({ type: 'stall', reason: hz.reason, text: hz.reason === 'load-use' ? 'Load-use hazard: bubble inserted, IF and ID held' : 'RAW hazard (forwarding off): bubble inserted until the result is written back' });
    } else {
      s.ID_EX = { valid: true, pc: f.pc, seq: f.seq, text: f.text, mnemonic: d.mnemonic,
                  rs1: d.rs1, rs2: d.rs2, rd: d.rd, rv1: s.regs[d.rs1], rv2: s.regs[d.rs2], imm: d.imm, ctrl: d.ctrl };
    }
  }

  // ---------------- IF ----------------
  let fetched = bubble();
  if (prev.pc < progEnd) {
    fetched = { valid: true, pc: prev.pc, pcPlus4: prev.pc + 4, instr: prev.imem[prev.pc / 4], text: prev.itext[prev.pc / 4], seq: prev.nextSeq,
                ctrl: { ...NO_CTRL }, rd: 0, rs1: 0, rs2: 0 };
  }
  if (flush) {
    // squash the instruction in ID (prev.IF_ID) and the one just fetched
    last.flush = true;
    s.stats.flushes += 2;
    s.stats.squashed += (f.valid ? 1 : 0) + (fetched.valid ? 1 : 0);
    s.ID_EX = bubble();
    s.IF_ID = bubble();
    s.pc = target;
    if (fetched.valid) s.nextSeq = prev.nextSeq + 1;
    events.push({ type: 'flush', text: 'Control hazard: the 2 younger instructions in IF and ID are flushed' });
  } else if (stall) {
    s.IF_ID = prev.IF_ID;                  // hold
    s.pc = prev.pc;
  } else {
    s.IF_ID = fetched;
    if (fetched.valid) { s.pc = prev.pc + 4; s.nextSeq = prev.nextSeq + 1; }
  }
  last.if = fetched.valid ? { pc: fetched.pc, pcPlus4: fetched.pcPlus4 } : null;
  last.nextPc = s.pc;
  last.stages.IF = stageInfo(fetched);   // during a stall this instruction is held and fetched again next cycle
  if (flush) last.squashed = [f.valid ? f.seq : null, fetched.valid ? fetched.seq : null].filter((q) => q !== null);

  // ---------------- halt check ----------------
  if (s.pc >= progEnd && !s.IF_ID.valid && !s.ID_EX.valid && !s.EX_MEM.valid && !s.MEM_WB.valid) s.halted = true;
  return s;
}

// Run to completion. Returns { final, trace, states } (states[i] is the state after i cycles: Step Back).
export function run(program, opts = {}, maxCycles = 10000) {
  let st = createCpu(program, opts);
  const states = [st], trace = [];
  while (!st.halted && st.cycle < maxCycles) {
    st = step(st);
    states.push(st);
    if (st.last) trace.push(st.last);
  }
  if (!st.halted) st.fault = `Stopped after ${maxCycles} cycles (possible infinite loop)`;
  return { final: st, trace, states };
}
