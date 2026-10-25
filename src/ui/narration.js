// narration.js - freshman-mode text (handout B7): what each stage did this cycle, in English and Sesotho.
// DRAFT: the Sesotho strings below were machine-drafted and MUST be reviewed and corrected by a
// Sesotho speaker on the team before the Final. Edit the ST functions only; logic stays the same.
const OPS = { ADD: 'eketsa', SUB: 'tlosa', AND: 'le', OR: 'kapa', SLL: 'phahamisa' };
const hex = (n) => '0x' + (n >>> 0).toString(16).toUpperCase();
const src = (w) => (w === 'EX_MEM' ? 'EX/MEM' : 'MEM/WB');

export function narrate(state) {
  const L = state.last;
  if (!L) return [];
  const out = [];
  const add = (stage, en, st) => out.push({ stage, en, st });
  const S = L.stages;
  // IF
  if (L.if) add('IF', `Fetch: the processor reads the instruction at address ${hex(L.if.pc)}: ${S.IF.text}.`,
                      `Ho lata taelo: processor e bala taelo ho aterese ${hex(L.if.pc)}: ${S.IF.text}.`);
  else add('IF', 'Fetch: there is no instruction to fetch, so an empty slot (bubble) enters the pipeline.',
                 'Ho lata taelo: ha ho taelo e tla lengoa, ka hona lekhalo (bubble) le kena phaepeng.');
  // ID
  if (S.ID.valid) {
    add('ID', `Decode: read the registers x${L.id.rs1} and x${L.id.rs2} and make the control signals for ${S.ID.text}.`,
              `Ho utloisisa taelo: bala lirejistara x${L.id.rs1} le x${L.id.rs2} 'me u hlahise matšoao a taolo a ${S.ID.text}.`);
    if (L.stall) add('ID', `Stall: this instruction needs a value that is still being loaded (${L.stall}), so it waits one cycle and a bubble goes forward.`,
                            `Ho ema: taelo ena e hloka boleng bo ntseng bo laoa (${L.stall}), ka hona e ema potoloho e le 'ngoe 'me lekhalo le tsoela pele.`);
  } else add('ID', 'Decode: nothing to decode (bubble).', 'Ho utloisisa taelo: ha ho letho (lekhalo).');
  // EX
  if (L.alu) {
    add('EX', `Execute: the ALU does ${L.alu.op} on ${L.alu.a} and ${L.alu.b} and gets ${L.alu.result}.`,
              `Ho phetha: ALU e etsa ${OPS[L.alu.op]} (${L.alu.op}) ho ${L.alu.a} le ${L.alu.b}, sephetho ke ${L.alu.result}.`);
    for (const w of ['A', 'B']) if (L.forward[w] !== 'NONE') {
      add('EX', `Forwarding: input ${w} was taken straight from ${src(L.forward[w])}, so there was no need to wait for write-back.`,
                `Ho fetisetsa pele: kenyo ${w} e nkiloe ka kotloloho ho ${src(L.forward[w])}, ka hona ha ho a hlokahala ho emela ho ngola.`);
    }
    if (L.branch) add('EX', L.branch.taken
      ? `Branch taken: the PC jumps to ${hex(L.branch.target)} and the 2 younger instructions are flushed.`
      : 'Branch not taken: execution carries on in order.',
      L.branch.taken
        ? `Lekala le nkiloe: PC e ea ho ${hex(L.branch.target)} 'me litaelo tse 2 tse latelang li tlosoa.`
        : 'Lekala ha le a nkuoa: ho tsoela pele ka tatellano.');
  } else add('EX', 'Execute: nothing to execute (bubble).', 'Ho phetha: ha ho letho (lekhalo).');
  // MEM
  if (L.mem) add('MEM', L.mem.op === 'read' ? `Memory: read the value ${L.mem.value} from data address ${L.mem.address}.` : `Memory: write the value ${L.mem.value} to data address ${L.mem.address}.`,
                        L.mem.op === 'read' ? `Mohopolo: bala boleng ${L.mem.value} ho aterese ${L.mem.address}.` : `Mohopolo: ngola boleng ${L.mem.value} ho aterese ${L.mem.address}.`);
  else add('MEM', 'Memory: this instruction does not use data memory.', 'Mohopolo: taelo ena ha e sebelise mohopolo oa lintlha.');
  // WB
  if (L.wb) add('WB', `Write-back: register x${L.wb.rd} now holds ${L.wb.value}.`, `Ho ngola sephetho: rejistara x${L.wb.rd} e na le ${L.wb.value}.`);
  else add('WB', 'Write-back: no register is written this cycle.', 'Ho ngola sephetho: ha ho rejistara e ngotsoeng potolohong ena.');
  return out;
}
