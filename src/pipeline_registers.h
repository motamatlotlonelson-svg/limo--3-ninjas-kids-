#include <string>
#include <cstdint>

// Control signals generated in the ID stage
struct ControlSignals {
    bool RegWrite = false;
    bool ALUSrc = false;
    uint8_t ALUControl = 0;
    bool MemRead = false;
    bool MemWrite = false;
    bool MemToReg = false;
    bool Branch = false;
    bool PCSrc = false;
};

// Stage-to-stage registers
struct IF_ID_Register {
    uint32_t pc = 0;
    uint32_t instruction = 0;
};

struct ID_EX_Register {
    uint32_t pc = 0;
    uint32_t rs1_val = 0;
    uint32_t rs2_val = 0;
    uint32_t imm = 0;
    uint8_t rd = 0;
    ControlSignals ctrl;
};

// Main Microarchitectural State Tracker
struct SystemState {
    uint32_t pc = 0;
    uint32_t registers[16]; // Example 16-register file
    IF_ID_Register IFID;
    ID_EX_Register IDEX;
    // ... Repeat for EXMEM and MEMWB
};

