#include <string>
#include <sstream>
#include <unordered_map>
#include <vector>
#include <cstdint>
#include <algorithm>

// Clean syntax helpers to filter punctuation/spaces
std::string clean_token(std::string token) {
    token.erase(std::remove(token.begin(), token.end(), ','), token.end());
    token.erase(std::remove(token.begin(), token.end(), 'r'), token.end()); // strip register symbol prefix
    return token;
}

// Maps Sesotho mnemonics to base RV32I opcodes/funct values
struct OpcodeMapping {
    uint8_t opcode;
    uint8_t funct3;
    uint8_t funct7;
    char type; // 'R', 'I', 'S', 'B'
};

const std::unordered_map<std::string, OpcodeMapping> LIMO_DICTIONARY = {
    // Arithmetic & Logic
    {"eketsa",     {0x33, 0x0, 0x00, 'R'}}, // add:  eketsa rd, rs1, rs2
    {"fokotsa",    {0x33, 0x0, 0x20, 'R'}}, // sub:  fokotsa rd, rs1, rs2
    {"le",         {0x33, 0x7, 0x00, 'R'}}, // and:  le rd, rs1, rs2
    {"kapa",       {0x33, 0x6, 0x00, 'R'}}, // or:   kapa rd, rs1, rs2
    
    // Immediate Arithmetic
    {"eketsa_i",   {0x13, 0x0, 0x00, 'I'}}, // addi: eketsa_i rd, rs1, imm
    
    // Memory Touch Operations
    {"lofa",       {0x03, 0x2, 0x00, 'I'}}, // lw:   lofa rd, imm(rs1)
    {"boloka",     {0x23, 0x2, 0x00, 'S'}}, // sw:   boloka rs2, imm(rs1)
    
    // Conditional Branches
    {"tloha_le",   {0x63, 0x0, 0x00, 'B'}}, // beq:  tloha_le rs1, rs2, label_imm
    {"tloha_nse",  {0x63, 0x1, 0x00, 'B'}}  // bne:  tloha_nse rs1, rs2, label_imm
};

// ========================================================
// CORE ASSEMBLER TRANSLATOR
// ========================================================
extern "C" { // Exposed to JavaScript frontend via Emscripten WASM
    uint32_t assemble_line(const char* input_line) {
        std::stringstream ss(input_line);
        std::string mnemonic;
        ss >> mnemonic;

        // Skip comments or blank lines
        if (mnemonic.empty() || mnemonic[0] == '#') return 0;

        auto it = LIMO_DICTIONARY.find(mnemonic);
        if (it == LIMO_DICTIONARY.end()) {
            return 0xFFFFFFFF; // Error indicator flag: Mnemonic Unknown
        }

        OpcodeMapping map = it->second;
        uint32_t machine_code = map.opcode;

        std::string t1, t2, t3;
        
        if (map.type == 'R') {
            ss >> t1 >> t2 >> t3;
            uint32_t rd  = std::stoi(clean_token(t1));
            uint32_t rs1 = std::stoi(clean_token(t2));
            uint32_t rs2 = std::stoi(clean_token(t3));

            machine_code |= (rd  & 0x1F) << 7;
            machine_code |= (map.funct3 & 0x7) << 12;
            machine_code |= (rs1 & 0x1F) << 15;
            machine_code |= (rs2 & 0x1F) << 20;
            machine_code |= (map.funct7 & 0x7F) << 25;
        } 
        else if (map.type == 'I') {
            ss >> t1 >> t2 >> t3;
            uint32_t rd  = std::stoi(clean_token(t1));
            uint32_t rs1 = std::stoi(clean_token(t2));
            int32_t  imm = std::stoi(clean_token(t3));

            machine_code |= (rd  & 0x1F) << 7;
            machine_code |= (map.funct3 & 0x7) << 12;
            machine_code |= (rs1 & 0x1F) << 15;
            machine_code |= (imm & 0xFFF) << 20;
        }
        // S and B type logic tracking can be added directly underneath here...

        return machine_code;
    }
}

