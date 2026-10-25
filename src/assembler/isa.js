// isa.js - the ONE place where LIMO ISA facts live (spec M1 sections A2, A3, A5).
// If the spec changes, change it here and nowhere else.
//
// DECISION D-REG (proposed, team must confirm): register FIELDS stay 5 bits wide,
// exactly as RV32I, but only x0..x15 exist. This matches the hand-encoded example in
// A5 (eketsa x5,x6,x7 = 0x007302B3) and keeps Ripes cross-checking trivial.
// Using x16..x31 is an assembler error. See A6(a) for what this does and does not buy.

export const REG_FIELD_BITS = 5;   // width of rd/rs1/rs2 in the encoding
export const REG_COUNT = 16;       // registers that actually exist (A2)

// A2: number -> Sesotho name. (PC is NOT a numbered register; spec still needs a name for it.)
export const REG_NAMES = [
  'lefela', 'khutla', 'sephuthelo', 'thari',      // x0..x3  zero, ra, sp, temp/frame
  'molemo0', 'molemo1', 'molemo2', 'molemo3',     // x4..x7  temporaries
  'poloko0', 'poloko1',                           // x8..x9  saved
  'thuso0', 'thuso1', 'thuso2', 'thuso3', 'thuso4', 'thuso5', // x10..x15 args/results
];

// Instruction table (A3 + A5). `shape` says how operands are written in assembly:
//   rrr  : rd, rs1, rs2        ri  : rd, rs1, imm
//   load : rd, offset(rs1)     store: rs2, offset(rs1)     branch: rs1, rs2, label|offset
// `fmt` is the RV32I encoding format (R, I, S, B).
export const INSTRUCTIONS = {
  'eketsa':          { fmt: 'R', shape: 'rrr',    opcode: 0b0110011, funct3: 0b000, funct7: 0b0000000, rv: 'add'  },
  'tlosa':           { fmt: 'R', shape: 'rrr',    opcode: 0b0110011, funct3: 0b000, funct7: 0b0100000, rv: 'sub'  },
  'le':              { fmt: 'R', shape: 'rrr',    opcode: 0b0110011, funct3: 0b111, funct7: 0b0000000, rv: 'and'  },
  'kapa':            { fmt: 'R', shape: 'rrr',    opcode: 0b0110011, funct3: 0b110, funct7: 0b0000000, rv: 'or'   },
  'phahamisa':       { fmt: 'R', shape: 'rrr',    opcode: 0b0110011, funct3: 0b001, funct7: 0b0000000, rv: 'sll'  },
  'eketsa-i':        { fmt: 'I', shape: 'ri',     opcode: 0b0010011, funct3: 0b000, rv: 'addi' },
  'lata':            { fmt: 'I', shape: 'load',   opcode: 0b0000011, funct3: 0b010, rv: 'lw'   },
  'boloka':          { fmt: 'S', shape: 'store',  opcode: 0b0100011, funct3: 0b010, rv: 'sw'   },
  'haeba-lekana':    { fmt: 'B', shape: 'branch', opcode: 0b1100011, funct3: 0b000, rv: 'beq'  },
  'haeba-sa-lekane': { fmt: 'B', shape: 'branch', opcode: 0b1100011, funct3: 0b001, rv: 'bne'  },
};

// Operand names per shape, used for plain-language error messages.
export const SHAPE_OPERANDS = {
  rrr:    ['rd', 'rs1', 'rs2'],
  ri:     ['rd', 'rs1', 'imm'],
  load:   ['rd', 'offset(rs1)'],
  store:  ['rs2', 'offset(rs1)'],
  branch: ['rs1', 'rs2', 'label'],
};

// Immediate ranges (A5). I/S: 12-bit signed. B: 13-bit signed, bit 0 always 0 (even byte offset).
export const IMM12_MIN = -2048, IMM12_MAX = 2047;
export const BR_MIN = -4096, BR_MAX = 4094;

// Field layouts, MSB first, as [name, hiBit, loBit]. Used to colour-code machine code in the UI.
export const FIELD_LAYOUT = {
  R: [['funct7', 31, 25], ['rs2', 24, 20], ['rs1', 19, 15], ['funct3', 14, 12], ['rd', 11, 7], ['opcode', 6, 0]],
  I: [['imm[11:0]', 31, 20], ['rs1', 19, 15], ['funct3', 14, 12], ['rd', 11, 7], ['opcode', 6, 0]],
  S: [['imm[11:5]', 31, 25], ['rs2', 24, 20], ['rs1', 19, 15], ['funct3', 14, 12], ['imm[4:0]', 11, 7], ['opcode', 6, 0]],
  B: [['imm[12|10:5]', 31, 25], ['rs2', 24, 20], ['rs1', 19, 15], ['funct3', 14, 12], ['imm[4:1|11]', 11, 7], ['opcode', 6, 0]],
};

// Register lookup. Accepts x0..x15, r0..r15 (the handout writes r3) and Sesotho names.
const NAME_TO_NUM = new Map(REG_NAMES.map((n, i) => [n, i]));
export function parseRegister(token) {
  const t = token.trim().toLowerCase();
  if (NAME_TO_NUM.has(t)) return { ok: true, num: NAME_TO_NUM.get(t) };
  const m = /^[xr](\d+)$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (n < REG_COUNT) return { ok: true, num: n };
    return { ok: false, reason: `LIMO has only ${REG_COUNT} registers (x0 to x${REG_COUNT - 1}), so \`${token}\` does not exist` };
  }
  return { ok: false, reason: `\`${token}\` is not a register. Use x0-x${REG_COUNT - 1}, r0-r${REG_COUNT - 1} or a Sesotho name such as thuso0` };
}
