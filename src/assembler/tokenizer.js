// tokenizer.js - splits one source line into { label, mnemonic, operands }.
// Pure string work; no knowledge of the ISA (that lives in isa.js).
//
// DECISION D-APOS (proposed, team must confirm; spec A4 requires a justification):
//   An apostrophe is a LETTER in Sesotho orthography (ts', ch'), so it is part of a word,
//   not a quote. The tokenizer therefore keeps ' inside identifiers (mnemonics and labels)
//   and normalises the typographic apostrophe (U+2019, what phones/Word insert) to the
//   typeable ASCII ' so both spellings are the same word.
//   Comments start with '#'; because ' never starts a comment or string, it cannot confuse parsing.

const WORD = /^[A-Za-z_][A-Za-z0-9_'\-]*$/;      // mnemonic or label: letters, digits, _, -, '
const LABEL_AT_START = /^\s*([^\s:,()]+)\s*:/;   // "name:" at the beginning of the line

export function normaliseApostrophes(s) {
  return s.replace(/[\u2019\u2018\u02BC]/g, "'");
}

export function isWord(s) {
  return WORD.test(s);
}

// Returns { label, mnemonic, operands, error } for a raw source line (CRLF/LF safe).
export function tokenizeLine(raw) {
  let text = normaliseApostrophes(raw.replace(/\r/g, ''));
  const hash = text.indexOf('#');
  if (hash >= 0) text = text.slice(0, hash);       // strip comment (may contain any Unicode)
  const out = { label: null, mnemonic: null, operands: [], error: null };

  const lm = LABEL_AT_START.exec(text);
  if (lm) {
    if (!isWord(lm[1])) {
      out.error = `\`${lm[1]}\` is not a valid label name. Use letters, digits, _, - or '; start with a letter`;
      return out;
    }
    out.label = lm[1];
    text = text.slice(lm[0].length);
  }

  text = text.trim();
  if (text === '') return out;                      // blank, comment-only or label-only line

  const m = /^(\S+)\s*(.*)$/.exec(text);
  const word = m[1];
  if (word.includes(':')) {
    out.error = 'A line can have only one label, and it must come first';
    return out;
  }
  if (!isWord(word)) {
    out.error = `\`${word}\` is not a valid instruction name`;
    return out;
  }
  out.mnemonic = word.toLowerCase();
  const rest = m[2].trim();
  out.operands = rest === '' ? [] : rest.split(',').map((s) => s.trim());
  if (out.operands.some((s) => s === '')) {
    out.error = 'An operand is empty (check for a doubled or trailing comma)';
  }
  return out;
}
