#include "pipeline_registers.h"
#include <vector>
#include <iostream>

// Global or class instance representing the active hardware state
PipelineState currentState;
PipelineState nextState;

// Simple memory spaces for the simulator
std::vector<uint32_t> instructionMemory(1024, 0); // Simulated instruction memory
std::vector<uint32_t> dataMemory(1024, 0);        // Simulated data memory

// ========================================================
// 1. INSTRUCTION FETCH (IF)
// ========================================================
void stage_fetch() {
    // Read instruction from memory using word alignment
    uint32_t word_address = currentState.pc / 4;
    nextState.IFID.instruction = instructionMemory[word_address];
    nextState.IFID.pc = currentState.pc;
    
    // Default speculative PC increment
    nextState.pc = currentState.pc + 4;
}

// ========================================================
// 2. INSTRUCTION DECODE & REGISTER READ (ID)
// ========================================================
void stage_decode() {
    uint32_t inst = currentState.IFID.instruction;
    nextState.IDEX.pc = currentState.IFID.pc;
    
    // Extract fields using standard RV32I bitmasks
    nextState.IDEX.rs1_num = (inst >> 15) & 0x1F;
    nextState.IDEX.rs2_num = (inst >> 20) & 0x1F;
    nextState.IDEX.rd_num  = (inst >> 7)  & 0x1F;
    
    // Read values from our 16-register file
    nextState.IDEX.rs1_val = currentState.registers[nextState.IDEX.rs1_num];
    nextState.IDEX.rs2_val = currentState.registers[nextState.IDEX.rs2_num];
    
    // --- CONTROL UNIT DECODER (Example for 'eketsa' R-Type) ---
    uint8_t opcode = inst & 0x7F;
    if (opcode == 0x33) { // R-Type
        nextState.IDEX.ctrl.RegWrite = true;
        nextState.IDEX.ctrl.ALUSrc   = false;
        nextState.IDEX.ctrl.MemRead  = false;
        nextState.IDEX.ctrl.MemWrite = false;
        nextState.IDEX.ctrl.MemToReg = false;
    }
    // Add additional Sesotho-mapped opcode decoding here...
}

// ========================================================
// 3. EXECUTE & HAZARD FORWARDING (EX)
// ========================================================
void stage_execute() {
    nextState.EXMEM.rd_num = currentState.IDEX.rd_num;
    nextState.EXMEM.ctrl = currentState.IDEX.ctrl;
    
    // --- HAZARD-UNIT: RAW Forwarding Logic ---
    uint32_t operand_a = currentState.IDEX.rs1_val;
    uint32_t operand_b = currentState.IDEX.rs2_val;
    
    // Forwarding A from EX/MEM or MEM/WB
    if (currentState.EXMEM.ctrl.RegWrite && (currentState.EXMEM.rd_num != 0) && (currentState.EXMEM.rd_num == currentState.IDEX.rs1_num)) {
        operand_a = currentState.EXMEM.alu_result; // Forward from EX/MEM
    } else if (currentState.MEMWB.ctrl.RegWrite && (currentState.MEMWB.rd_num != 0) && (currentState.MEMWB.rd_num == currentState.IDEX.rs1_num)) {
        // Forward from MEM/WB (value chosen via MemToReg)
        operand_a = currentState.MEMWB.ctrl.MemToReg ? currentState.MEMWB.mem_read_data : currentState.MEMWB.alu_result;
    }
    
    // Forwarding B from EX/MEM or MEM/WB
    if (currentState.EXMEM.ctrl.RegWrite && (currentState.EXMEM.rd_num != 0) && (currentState.EXMEM.rd_num == currentState.IDEX.rs2_num)) {
        operand_b = currentState.EXMEM.alu_result;
    } else if (currentState.MEMWB.ctrl.RegWrite && (currentState.MEMWB.rd_num != 0) && (currentState.MEMWB.rd_num == currentState.IDEX.rs2_num)) {
        operand_b = currentState.MEMWB.ctrl.MemToReg ? currentState.MEMWB.mem_read_data : currentState.MEMWB.alu_result;
    }
    
    // Select ALU input based on ALUSrc signal
    uint32_t alu_in2 = currentState.IDEX.ctrl.ALUSrc ? currentState.IDEX.imm : operand_b;
    
    // Execute operation (example assumes addition/eketsa)
    nextState.EXMEM.alu_result = operand_a + alu_in2;
    nextState.EXMEM.rs2_val = operand_b;
}

// ========================================================
// 4. MEMORY ACCESS (MEM)
// ========================================================
void stage_memory() {
    nextState.MEMWB.rd_num = currentState.EXMEM.rd_num;
    nextState.MEMWB.alu_result = currentState.EXMEM.alu_result;
    nextState.MEMWB.ctrl = currentState.EXMEM.ctrl;
    
    uint32_t mem_word_addr = currentState.EXMEM.alu_result / 4;
    
    if (currentState.EXMEM.ctrl.MemRead) {
        nextState.MEMWB.mem_read_data = dataMemory[mem_word_addr];
    }
    if (currentState.EXMEM.ctrl.MemWrite) {
        dataMemory[mem_word_addr] = currentState.EXMEM.rs2_val;
    }
}

// ========================================================
// 5. WRITE BACK (WB)
// ========================================================
void stage_writeback() {
    if (currentState.MEMWB.ctrl.RegWrite && currentState.MEMWB.rd_num != 0) {
        uint32_t write_val = currentState.MEMWB.ctrl.MemToReg ? currentState.MEMWB.mem_read_data : currentState.MEMWB.alu_result;
        nextState.registers[currentState.MEMWB.rd_num] = write_val;
    }
}

// ========================================================
// CLOCK TICK (Advance Pipeline Registers)
// ========================================================
extern "C" { // Marks this out for Emscripten WASM exposure
    void step_cycle() {
        // Run all stages concurrently inside the same clock domain
        stage_fetch();
        stage_decode();
        stage_execute();
        stage_memory();
        stage_writeback();
        
        // Ensure x0/r0 stays hardwired to zero per ISA spec
        nextState.registers[0] = 0; 
        
        // Clock edge: commit next state entries into current processing slots
        currentState = nextState;
    }
}

