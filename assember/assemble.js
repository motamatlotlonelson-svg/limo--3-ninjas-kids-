// assemble.js - two-pass assembler (M2 spec: label pass, then encode pass).
// Output per instruction: address, word, hex, binary, colour-coding fields, source line.

import {
  INSTRUCTIONS, SHAPE_OPERANDS, FIELD_LAYOUT, parseRegister,
  IMM12_MIN, IMM12_MAX, BR_MIN, BR_MAX,
} from './isa.js';
import { tokenizeLine, normaliseApostrophes } from './tokenizer.js';

// Parse decimal (-12, +7) or hex (0x1F, -0x10). Returns a number or null.
export function parseInteger(token) {
  const t = normaliseApostrophes(token.trim());
  if (/^[+-]?\d+$/.test(t)) return Number(t);
  const m = /^([+-]?)0x([0-9a-f]+)$/i.exec(t);
  if (m) return (m[1] === '-' ? -1 : 1) * parseInt(m[2], 16);
  return null;
}

// Edit distance, used only for "Did you mean ...?" hints.
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function suggest(word) {
  let best = null, bestD = 3;
  for (const m of Object.keys(INSTRUCTIONS)) {
    const dist = distance(word, m);
    if (dist < bestD) { best = m; bestD = dist; }
  }
  return best;
}

const bits = (n, hi, lo) => (n >>> lo) & ((1 << (hi - lo + 1)) - 1);

// Build the 32-bit word for each format (A5).
function encode(def, f) {
  let w;
  switch (def.fmt) {
    case 'R':
      w = (def.funct7 << 25) | (f.rs2 << 20) | (f.rs1 << 15) | (def.funct3 << 12) | (f.rd << 7) | def.opcode;
      break;
    case 'I':
      w = ((f.imm & 0xFFF) << 20) | (f.rs1 << 15) | (def.funct3 << 12) | (f.rd << 7) | def.opcode;
      break;
    case 'S':
      w = (bits(f.imm, 11, 5) << 25) | (f.rs2 << 20) | (f.rs1 << 15) | (def.funct3 << 12) | (bits(f.imm, 4, 0) << 7) | def.opcode;
      break;
    case 'B': {
      const i = f.imm & 0x1FFF;
      w = (bits(i, 12, 12) << 31) | (bits(i, 10, 5) << 25) | (f.rs2 << 20) | (f.rs1 << 15) |
          (def.funct3 << 12) | (bits(i, 4, 1) << 8) | (bits(i, 11, 11) << 7) | def.opcode;
      break;
    }
  }
  return w >>> 0;
}

function describeFields(fmt, word) {
  return FIELD_LAYOUT[fmt].map(([name, hi, lo]) => ({
    name, hi, lo, value: bits(word, hi, lo),
    binary: bits(word, hi, lo).toString(2).padStart(hi - lo + 1, '0'),
  }));
}

export function assemble(source) {
  const errors = [];
  const labels = {};          // name -> byte address
  const items = [];           // one entry per instruction line
  const err = (line, msg) => errors.push({ line, message: `Line ${line}: ${msg}` });

  // ---- Pass 1: find labels and assign addresses (4 bytes per instruction, base 0) ----
  source.split('\n').forEach((raw, idx) => {
    const line = idx + 1;
    const tok = tokenizeLine(raw);
    if (tok.label !== null) {
      if (Object.hasOwn(labels, tok.label)) err(line, `label \`${tok.label}\` is already defined`);
      else labels[tok.label] = items.length * 4;
    }
    if (tok.error) { err(line, tok.error); return; }
    if (tok.mnemonic !== null) items.push({ line, address: items.length * 4, tok, text: raw.replace(/\r/g, '').trim() });
  });

  // ---- Pass 2: encode ----
  const instructions = [];
  for (const it of items) {
    const { line, tok } = it;
    const def = INSTRUCTIONS[tok.mnemonic];
    if (!def) {
      const s = suggest(tok.mnemonic);
      err(line, `\`${tok.mnemonic}\` is not a LIMO instruction.` + (s ? ` Did you mean \`${s}\`?` : ''));
      continue;
    }
    const names = SHAPE_OPERANDS[def.shape];
    if (tok.operands.length !== names.length) {
      err(line, `\`${tok.mnemonic}\` needs ${names.length} operands (${names.join(', ')}) but got ${tok.operands.length}`);
      continue;
    }
    const startErrors = errors.length;
    const reg = (t) => { const r = parseRegister(t); if (!r.ok) { err(line, r.reason); return 0; } return r.num; };
    const imm12 = (t) => {
      const v = parseInteger(t);
      if (v === null) { err(line, `\`${t}\` is not a number (use decimal like 12 or hex like 0xC)`); return 0; }
      if (v < IMM12_MIN || v > IMM12_MAX) { err(line, `immediate ${v} does not fit in 12 bits (allowed ${IMM12_MIN} to ${IMM12_MAX})`); return 0; }
      return v;
    };
    // offset(reg) operand, e.g. 8(thuso0)
    const memOperand = (t) => {
      const m = /^(.*)\(\s*(.+?)\s*\)$/.exec(t);
      if (!m) { err(line, `\`${t}\` should look like offset(register), for example 8(thuso0)`); return { imm: 0, rs1: 0 }; }
      return { imm: m[1].trim() === '' ? 0 : imm12(m[1]), rs1: reg(m[2]) };
    };

    const f = { rd: 0, rs1: 0, rs2: 0, imm: 0 };
    const o = tok.operands;
    switch (def.shape) {
      case 'rrr':    f.rd = reg(o[0]); f.rs1 = reg(o[1]); f.rs2 = reg(o[2]); break;
      case 'ri':     f.rd = reg(o[0]); f.rs1 = reg(o[1]); f.imm = imm12(o[2]); break;
      case 'load':   { f.rd = reg(o[0]); const m = memOperand(o[1]); f.rs1 = m.rs1; f.imm = m.imm; break; }
      case 'store':  { f.rs2 = reg(o[0]); const m = memOperand(o[1]); f.rs1 = m.rs1; f.imm = m.imm; break; }
      case 'branch': {
        f.rs1 = reg(o[0]); f.rs2 = reg(o[1]);
        const target = normaliseApostrophes(o[2]);
        let offset;
        const num = parseInteger(target);
        if (num !== null) offset = num;                           // raw byte offset
        else if (Object.hasOwn(labels, target)) offset = labels[target] - it.address; // label: bytes from THIS instruction
        else { err(line, `label \`${target}\` is not defined`); break; }
        if (offset % 2 !== 0) err(line, `branch offset ${offset} is odd; branch offsets must be even (instructions are 4 bytes apart, so use a label)`);
        else if (offset < BR_MIN || offset > BR_MAX) err(line, `branch target is ${offset} bytes away; a branch reaches only ${BR_MIN} to ${BR_MAX}`);
        f.imm = offset;
        break;
      }
    }
    if (errors.length > startErrors) continue;

    const word = encode(def, f);
    instructions.push({
      line, address: it.address, text: it.text, mnemonic: tok.mnemonic, rv: def.rv, fmt: def.fmt,
      word, hex: '0x' + word.toString(16).toUpperCase().padStart(8, '0'),
      binary: word.toString(2).padStart(32, '0'), fields: describeFields(def.fmt, word),
    });
  }
  errors.sort((a, b) => a.line - b.line);
  return { instructions, labels, errors, ok: errors.length === 0 };
}
