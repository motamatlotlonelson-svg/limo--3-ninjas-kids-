# LIMO ISA Specification
**Team:** 3 Ninjas Kids  
**Milestone:** M1  
**Date:** October 2026

---

## A1 – Style

- 32-bit load-store architecture
- Byte-addressed, little-endian, word-aligned
- Fixed 32-bit instructions
- Formats used: **R, I, S, B** (exactly as RV32I)
- No multiply, divide, floating-point, CSRs or exceptions

---

## A2 – Registers (16 registers)

| Number | Sesotho Name | English meaning     | Notes                  |
|--------|--------------|---------------------|------------------------|
| x0     | lefela       | zero                | Hard-wired 0           |
| x1     | khutla       | return address      | Like `ra`              |
| x2     | sephuthelo   | stack pointer       | Like `sp`              |
| x3     | thari        | temporary / frame   |                        |
| x4–x7  | molemo0–3    | temporaries         |                        |
| x8–x9  | poloko0–1    | saved registers     |                        |
| x10–x15| thuso0–5     | arguments / results |                        |

**Why 16 registers?**  
4-bit register fields → simpler encoding and narrower forwarding comparators. Still enough for student programs.

---

## A3 – Instruction Set

### Arithmetic
- `eketsa`     rd, rs1, rs2     → add
- `tlosa`      rd, rs1, rs2     → sub
- `eketsa-i`   rd, rs1, imm     → addi

### Logic
- `le`         rd, rs1, rs2     → and
- `kapa`       rd, rs1, rs2     → or
- `phahamisa`  rd, rs1, rs2     → sll (shift left logical)

### Memory
- `lata`       rd, offset(rs1)  → lw
- `boloka`     rs2, offset(rs1) → sw

### Branches
- `haeba-lekana`     rs1, rs2, label → beq
- `haeba-sa-lekane`  rs1, rs2, label → bne

---

## A4 – Sesotho Glossary

| Mnemonic          | Meaning (Sesotho)        | Operation                | RV32I equivalent |
|-------------------|--------------------------|--------------------------|------------------|
| eketsa            | eketsa                   | rd = rs1 + rs2           | add              |
| tlosa             | tlosa                    | rd = rs1 - rs2           | sub              |
| eketsa-i          | eketsa ka nomoro         | rd = rs1 + imm           | addi             |
| le                | le                       | rd = rs1 & rs2           | and              |
| kapa              | kapa                     | rd = rs1 \| rs2          | or               |
| phahamisa         | phahamisa (shift left)   | rd = rs1 << rs2          | sll              |
| lata              | lata                     | rd = Mem[rs1+offset]     | lw               |
| boloka            | boloka                   | Mem[rs1+offset] = rs2    | sw               |
| haeba-lekana      | haeba li lekana          | if rs1 == rs2 go to label| beq              |
| haeba-sa-lekane   | haeba ha li lekane       | if rs1 ≠ rs2 go to label | bne              |

---

## A5 – Encoding Examples

### R-type: `eketsa x5, x6, x7`

Binary: `00000000011100110000001010110011`  
Hex: `0x007302B3`

### I-type: `eketsa-i x5, x6, 10`


### S-type and B-type
(To be filled with full diagrams in the official template)

---

## A6 – Design-Decision Log

**(a) Register-file size**  
16 registers use 4-bit fields instead of 5-bit. This saves encoding space and makes forwarding comparators simpler. Register pressure is acceptable for student programs.

**(b) Architectural vs microarchitectural registers**  
Architectural: 16 GPRs + PC.  
Microarchitectural: pipeline registers (IF/ID, ID/EX, EX/MEM, MEM/WB).  
The ISA only specifies the programmer-visible state.

**(c) Branch resolution stage**  
Branches are resolved in the EX stage (classic 5-stage pipeline). This may flush up to two instructions but avoids extra hardware in the ID stage.

**(d) Load-use still stalls**  
Even with full forwarding, a load produces data only at the end of the MEM stage. A dependent instruction in EX still needs a one-cycle stall.

**(e) Flags register**  
LIMO follows RISC-V style and does **not** use a flags register. Branches compare two registers directly. This avoids extra data hazards.

**(f) What breaks first**  
The 12-bit immediate / branch offset range will become limiting before the number of registers (16) does.

---

## Sample Programs

See the `/examples` folder for:
- `program1_arithmetic.limo`
- `program2_load_use.limo`
- `program3_loop.limo`
