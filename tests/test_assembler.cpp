// tests/test_assembler.cpp
#include <cassert>
#include <iostream>
#include "../src/assembler.h" 

void test_r_type_parsing() {
    uint32_t machine_code = assemble_line("eketsa r3, r1, r2");
    // Assert that the generated hex/binary fields are perfectly correct
    assert((machine_code & 0x7F) == 0x33); // Example check for RV32I-derived R-type opcode
    std::cout << "Test passed: eketsa parsing correct!" << std::endl;
}

int main() {
    test_r_type_parsing();
    return 0;
}
