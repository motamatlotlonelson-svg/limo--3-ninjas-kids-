// control.js - the ID-stage decoder and control unit (handout B4).
// Pure functions: word in, fields + control signals out. No DOM, no state.
import { lookupByEncoding } from '../assembler/isa.js';

// All-zero control word, also used for bubbles so later stages never see `undefined`.
export const NO_CTRL = Object.freeze({
  regWrite: 0, aluSrc: 0, aluOp: 'ADD', memRead: 0, memWrite: 0, memToReg: 0,
  branch: 'none', usesRs1: 0, usesRs2: 0,
});

// One-line meanings for the control view and tooltips (B4).
export const CONTROL_HELP = {
  regWrite: 'RegWrite: 1 = write a result into the register file in WB',
  aluSrc: 'ALUSrc: 0 = ALU input B is a register, 1 = it is the immediate',
  aluOp: 'ALU control: which operation the ALU performs (ADD, SUB, AND, OR, SLL)',
  memRead: 'MemRead: 1 = read the data memory in MEM (loads)',
  memWrite: 'MemWrite: 1 = write the data memory in MEM (stores)',
  memToReg: 'MemtoReg: 0 = write back the ALU result, 1 = write back the loaded data',
  branch: 'Branch: this is a conditional branch (beq or bne); decided in EX',
  pcSrc: 'PCSrc: 1 = branch taken, so the PC is replaced by the branch target',
};

const sext = (value, bitsWide) => (value << (32 - bitsWide)) >> (32 - bitsWide);
const field = (w, hi, lo) => (w >>> lo) & ((1 << (hi - lo + 1)) - 1);

// Immediate generator: rebuild the signed immediate from the instruction word (A5 layouts).
export function immediate(word, fmt) {
  switch (fmt) {
    case 'I': return sext(field(word, 31, 20), 12);
    case 'S': return sext((field(word, 31, 25) << 5) | field(word, 11, 7), 12);
    case 'B': return sext((field(word, 31, 31) << 12) | (field(word, 7, 7) << 11) |
                          (field(word, 30, 25) << 5) | (field(word, 11, 8) << 1), 13);
    default: return 0;
  }
}

// Decode one instruction word. `illegal: true` means LIMO does not define this encoding;
// it then behaves as a harmless no-op (all control signals 0).
export function decode(word) {
  const opcode = field(word, 6, 0), funct3 = field(word, 14, 12), funct7 = field(word, 31, 25);
  const hit = lookupByEncoding(opcode, funct3, funct7);
  if (!hit) return { illegal: true, mnemonic: '???', rs1: 0, rs2: 0, rd: 0, imm: 0, ctrl: { ...NO_CTRL } };
  const { mnemonic, def } = hit;
  const isStoreOrBranch = def.fmt === 'S' || def.fmt === 'B';
  const rs1 = field(word, 19, 15);
  const rs2 = field(word, 24, 20);
  return {
    illegal: false, mnemonic, rv: def.rv, fmt: def.fmt,
    rs1, rs2,
    rd: isStoreOrBranch ? 0 : field(word, 11, 7),   // S and B have no destination register
    imm: immediate(word, def.fmt),
    ctrl: {
      regWrite: isStoreOrBranch ? 0 : 1,
      aluSrc: def.fmt === 'I' || def.fmt === 'S' ? 1 : 0,
      aluOp: def.alu,
      memRead: def.rv === 'lw' ? 1 : 0,
      memWrite: def.rv === 'sw' ? 1 : 0,
      memToReg: def.rv === 'lw' ? 1 : 0,
      branch: def.fmt === 'B' ? def.rv : 'none',
      usesRs1: def.fmt === 'R' || def.fmt === 'I' || isStoreOrBranch ? 1 : 0,
      usesRs2: def.fmt === 'R' || isStoreOrBranch ? 1 : 0,
    },
  };
}

// 32-bit ALU. Inputs/outputs are unsigned 32-bit numbers.
export function alu(op, a, b) {
  switch (op) {
    case 'ADD': return (a + b) >>> 0;
    case 'SUB': return (a - b) >>> 0;
    case 'AND': return (a & b) >>> 0;
    case 'OR':  return (a | b) >>> 0;
    case 'SLL': return (a << (b & 31)) >>> 0;
    default: throw new Error(`unknown ALU op ${op}`);
  }
}
