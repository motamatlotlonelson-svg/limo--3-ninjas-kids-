# LIMO Instruction Set Architecture Specification (M2 Freeze)
**Track Owner:** Member 1 (ISA Architect / Assembler Lead)

## 1. D1 Defence Feedback Adjustments
- **Apostrophe Handling:** Confirmed that the assembler safely isolates tokens containing Lesotho orthography apostrophes (`ts'`, `ch'`) without breaking string parsing boundaries.
- **Register Constraints:** Hard-wired register count frozen at 32 registers to minimize forwarding-comparator physical width and optimize encoding bit usage.

## 2. Core Sesotho Instruction Glossary (Sample Subset)
- `eketsa rd, rs1, rs2`  (RV32I Equivalent: `add`) -> Arithmetic addition
- `eketsai rd, rs1, imm` (RV32I Equivalent: `addi`) -> Immediate arithmetic addition
- `laela rd, imm(rs1)`   (RV32I Equivalent: `lw`)   -> Load word from memory
- `boloka rs2, imm(rs1)`  (RV32I Equivalent: `sw`)   -> Store word to memory
- `ch'aka rs1, rs2, imm`  (RV32I Equivalent: `bne`)  -> Conditional branch if not equal
