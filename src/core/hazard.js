// hazard.js - forwarding unit (EX stage) and hazard-detection unit (ID stage). Handout B5.
// Register file writes happen in the first half of a cycle and reads in the second half,
// so a consumer in ID never needs the producer that is in WB in that same cycle.

// ForwardA / ForwardB for the instruction in EX. Priority: the NEWEST producer (EX/MEM) wins.
// Returns 'NONE' | 'EX_MEM' | 'MEM_WB' for each ALU input.
export function forwardUnit(idex, exmem, memwb, enabled = true) {
  const out = { A: 'NONE', B: 'NONE' };
  if (!enabled || !idex.valid) return out;
  const pick = (uses, reg) => {
    if (!uses || reg === 0) return 'NONE';                       // x0 is never forwarded
    if (exmem.valid && exmem.ctrl.regWrite && exmem.rd === reg) return 'EX_MEM';
    if (memwb.valid && memwb.ctrl.regWrite && memwb.rd === reg) return 'MEM_WB';
    return 'NONE';
  };
  out.A = pick(idex.ctrl.usesRs1, idex.rs1);
  out.B = pick(idex.ctrl.usesRs2, idex.rs2);
  return out;
}

// Should the instruction now in ID wait one more cycle? `d` is its decode() result.
//  - forwarding ON : only a load-use hazard (producer is a load currently in EX).
//  - forwarding OFF: any RAW hazard against a producer still in EX or MEM.
export function hazardUnit(d, idex, exmem, forwarding = true) {
  const needs = (producer) =>
    producer.valid && producer.ctrl.regWrite && producer.rd !== 0 &&
    ((d.ctrl.usesRs1 && d.rs1 === producer.rd) || (d.ctrl.usesRs2 && d.rs2 === producer.rd));
  if (forwarding) {
    if (idex.ctrl.memRead && needs(idex)) return { stall: true, reason: 'load-use' };
    return { stall: false, reason: null };
  }
  if (needs(idex) || needs(exmem)) return { stall: true, reason: 'RAW' };
  return { stall: false, reason: null };
}
