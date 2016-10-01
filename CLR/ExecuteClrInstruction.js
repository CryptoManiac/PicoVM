const Int64 = require('int64-native').Int64;
const UInt64 = require('int64-native').UInt64;

function ExecuteClrInstruction(thread) {
    var frame = thread.callStack[thread.callStack.length - 1];
    var appDomain = frame.executingAssembly.appDomain;
    var methodData = frame.methodBody.data;

    if (frame.instructionPointer >= methodData.length) {
        throw "End of method body";
    }

    var opcode = methodData[frame.instructionPointer];

/*
        console.log(
            'opcode=0x' + opcode.toString(16), 
            'location=0x' + frame.instructionPointer.toString(16), 
            thread.stack, appDomain.heap // frame.locals
        ); // Under construction :)
*/

    switch (opcode) {
        case 0x00: // nop
            frame.instructionPointer++;
            return true;
        case 0x02: // ldarg.0
        case 0x03: // ldarg.1
        case 0x04: // ldarg.2
        case 0x05: // ldarg.3
            var index = methodData[frame.instructionPointer++] - 0x02;
            var value = frame.arguments[index];
            thread.stack.push(value);
            return true;
        case 0x06: // ldloc 0..3
        case 0x07:
        case 0x08:
        case 0x09:
            var index = methodData[frame.instructionPointer++] - 0x06;
            var value = frame.locals[index];
            thread.stack.push(value);
            return true;
        case 0x0E: // ldarg.s <index>
            var index = methodData[frame.instructionPointer + 1];
            var value = frame.arguments[index];
            thread.stack.push(value);
            frame.instructionPointer += 2;
            return true;
        case 0x0F: // ldarga.s <index>
            throw "Not yet implemented";
        case 0x10: // starg.s <index>
            var value = thread.stack.pop();
            var index = methodData[frame.instructionPointer + 1];
            frame.arguments[index] = value;
            frame.instructionPointer += 2;
            return true;
        case 0x11: // ldloc.s <index>
            var index = methodData[frame.instructionPointer + 1];
            var value = frame.locals[index];
            thread.stack.push(value);
            frame.instructionPointer += 2;
            return true;
        case 0x0A: // stloc 0..3
        case 0x0B:
        case 0x0C:
        case 0x0D:
            var value = thread.stack.pop();
            var index = methodData[frame.instructionPointer++] - 0x0A;
            frame.locals[index] = value;
            return true;
        case 0x13: // stloc.s <index>
            var value = thread.stack.pop();
            var index = methodData[frame.instructionPointer + 1];
            frame.locals[index] = value;
            frame.instructionPointer += 2;
            return true;
        case 0x14: // ldnull
            thread.stack.push(null);
            frame.instructionPointer++;
            return true;
        case 0x15: // ldc.i4.m1
            thread.stack.push(-1);
            frame.instructionPointer++;
            return true;
        case 0x16: // ldc.i4.0
        case 0x17: // ldc.i4.1
        case 0x18: // ldc.i4.2
        case 0x19: // ldc.i4.3
        case 0x1A: // ldc.i4.4
        case 0x1B: // ldc.i4.5
        case 0x1C: // ldc.i4.6
        case 0x1D: // ldc.i4.7
        case 0x1E: // ldc.i4.8
            thread.stack.push(opcode - 0x16);
            frame.instructionPointer++;
            return true;
        case 0x1F: // ldc.i4.s <number>
            var value = methodData[frame.instructionPointer + 1] << 24 >> 24;
            thread.stack.push(value);
            frame.instructionPointer += 2;
            return true;
        case 0x20: // ldc.i4
            {
                var value = ((methodData[frame.instructionPointer + 1]) |
                    (methodData[frame.instructionPointer + 2] << 8) |
                    (methodData[frame.instructionPointer + 3] << 16) |
                    (methodData[frame.instructionPointer + 4] << 24));
                thread.stack.push(value);
                frame.instructionPointer += 5;
                return true;
            };
        case 0x21: // ldc.i8
            {
                /**
                 * JS is incapable of handling 64 bit integers directly.
                 */
                var argBytes = methodData.slice(frame.instructionPointer + 1, frame.instructionPointer + 9);
                var value = new Int64(argBytes);
                thread.stack.push(value);
                frame.instructionPointer += 9;
                return true;
            };
        case 0x46: // ldind.i1
        case 0x48: // ldind.i2
        case 0x4A: // ldind.i4
        case 0x4C: // ldind.i8 | ldind.u8
            throw "Not yet implemented";
        case 0x47: // ldind.u1
        case 0x49: // ldind.u2
        case 0x4B: // ldind.u4
            throw "Not yet implemented";
        case 0x25: // dup
            var value = thread.stack.pop();
            thread.stack.push(value);
            thread.stack.push(value);
            frame.instructionPointer++;
            return true;
        case 0x26: // pop
            thread.stack.pop();
            frame.instructionPointer++;
            return true;
        case 0x28: // call
            var token = readToken(methodData, frame.instructionPointer + 1);
            frame.instructionPointer += 5;
            thread.callStack.push({
                callingAssembly: frame.executingAssembly,
                method: token.index | (token.table << 24), state: 0
            });
            return true;
        case 0x2A: // ret
            frame.state = 6;
            return true;

        case 0x38: // br
        case 0x39: // brnull | brfalse
        case 0x3A: // brtrue
        case 0x2B: // br.s
        case 0x2C: // brnull.s | brfalse.s
        case 0x2D: // brtrue.s
            {
                var offset;

                if (opcode >= 0x38 && opcode <= 0x3A) {
                    // Normal form
                    offset = ((methodData[frame.instructionPointer + 1]) |
                        (methodData[frame.instructionPointer + 2] << 8) |
                        (methodData[frame.instructionPointer + 3] << 16) |
                        (methodData[frame.instructionPointer + 4] << 24));
                    frame.instructionPointer += 5;
                } else {
                    // Short form
                    offset = methodData[frame.instructionPointer + 1] << 24 >> 24;
                    frame.instructionPointer += 2;
                }

                switch (opcode) {
                    case 0x2B: // br.s
                    case 0x38: // br
                        frame.instructionPointer += offset;
                        return true;
                    case 0x2C: // brnull.s | brfalse.s
                    case 0x39: // brnull | brfalse
                        var a = thread.stack.pop();
                        if (!a) {
                            frame.instructionPointer += offset;
                        }
                        return true;
                    case 0x2D: // brtrue.s
                    case 0x3A: // brtrue
                        var a = thread.stack.pop();
                        if (a) {
                            frame.instructionPointer += offset;
                        }
                        return true;
                    default:
                        throw "Unknown instruction";
                }
            };

        case 0x3B: // beq
        case 0x3C: // bge
        case 0x3D: // bgt
        case 0x3E: // ble
        case 0x3F: // blt
        case 0x40: // bne.un
        case 0x41: // bge.un
        case 0x42: // bgt.un
        case 0x43: // ble.un
        case 0x44: // blt.un

        case 0x2E: // beq.s
        case 0x2F: // bge.s
        case 0x30: // bgt.s
        case 0x31: // ble.s
        case 0x32: // blt.s
        case 0x33: // bne.un.s
        case 0x34: // bge.un.s
        case 0x35: // bgt.un.s
        case 0x36: // ble.un.s
        case 0x37: // blt.un.s
            {
                /**
                 * Standard numeric comparison operations 
                 * 
                 * In order to avoid runtime type checking we need to get rid of polymorphic instructions somehow. We're
                 *  doing this through simple translation into our own set of type-specific instructions. Instruction is being replaced
                 *  with suitable one right in the memory stream and replay is executed then. 
                 * */

                var b = thread.stack[thread.stack.length - 1];
                var a = thread.stack[thread.stack.length - 2];
                var is64 = (b.constructor == Int64);
                var newcmd;

                if (b.constructor != a.constructor) {
                    // Arguments must have identical type.
                    throw "Invalid data";
                }

                switch (opcode) {
                    case 0x3B: // beq
                        newcmd = is64 ? 0x7F : 0xE8;
                        break;
                    case 0x3C: // bge
                        newcmd = is64 ? 0x98 : 0xE9;
                        break;
                    case 0x3D: // bgt
                        newcmd = is64 ? 0x99 : 0xF0;
                        break;
                    case 0x3E: // ble
                        newcmd = is64 ? 0xFA : 0xF1;
                        break;
                    case 0x3F: // blt
                        newcmd = is64 ? 0xFB : 0xF2;
                        break;
                    case 0x40: // bne.un
                        newcmd = is64 ? 0xFC : 0xF3;
                        break;
                    case 0x41: // bge.un
                        newcmd = is64 ? 0xFD : 0xF4;
                        break;
                    case 0x42: // bgt.un
                        newcmd = is64 ? 0xFF : 0xF5;
                        break;
                    case 0x43: // ble.un
                        newcmd = is64 ? 0xF8 : 0xF6;
                        break;
                    case 0x44: // blt.un
                        newcmd = is64 ? 0xF9 : 0xF7;
                        break;
                    case 0x2E: // beq.s
                        newcmd = is64 ? 0x22 : 0x6B;
                        break;
                    case 0x2F: // bge.s
                        newcmd = is64 ? 0x23 : 0x6C;
                        break;
                    case 0x30: // bgt.s
                        newcmd = is64 ? 0x4E : 0x76;
                        break;
                    case 0x31: // ble.s
                        newcmd = is64 ? 0x56 : 0xBE;
                        break;
                    case 0x32: // blt.s
                        newcmd = is64 ? 0x57 : 0xBF;
                        break;
                    case 0x33: // bne.un.s
                        newcmd = is64 ? 0x77 : 0xCB;
                        break;
                    case 0x34: // bge.un.s
                        newcmd = is64 ? 0x78 : 0xCC;
                        break;
                    case 0x35: // bgt.un.s
                        newcmd = is64 ? 0xA0 : 0xCD;
                        break;
                    case 0x36: // ble.un.s
                        newcmd = is64 ? 0xA1 : 0xCE;
                        break;
                    case 0x37: // blt.un.s
                        newcmd = is64 ? 0xCA : 0xCF;
                        break;
                    default:
                        throw "Unknown instruction";
                }

                // Replace the current instruction and replay.
                methodData[frame.instructionPointer] = newcmd;
                return true;
            };

        case 0x7F: // beq.i8
        case 0x98: // bge.i8
        case 0x99: // bgt.i8
        case 0xFA: // ble.i8
        case 0xFB: // blt.i8
        case 0xFC: // bne.i8.un
        case 0xFD: // bge.i8.un
        case 0xFF: // bgt.i8.un
        case 0xF8: // ble.i8.un
        case 0xF9: // blt.i8.un

        case 0x22: // beq.i8.s
        case 0x23: // bge.i8.s
        case 0x4E: // bgt.i8.s
        case 0x56: // ble.i8.s
        case 0x57: // blt.i8.s
        case 0x77: // bne.i8.un.s
        case 0x78: // bge.i8.un.s
        case 0xA0: // bgt.i8.un.s
        case 0xA1: // ble.i8.un.s
        case 0xCA: // blt.i8.un.s
            {
                /* int64 comparison operations */

                var offset;

                if (opcode >= 0x7F) {
                    // Normal form
                    offset = ((methodData[frame.instructionPointer + 1]) |
                        (methodData[frame.instructionPointer + 2] << 8) |
                        (methodData[frame.instructionPointer + 3] << 16) |
                        (methodData[frame.instructionPointer + 4] << 24));
                    frame.instructionPointer += 5;
                } else {
                    // Short form
                    offset = methodData[frame.instructionPointer + 1] << 24 >> 24;
                    frame.instructionPointer += 2;
                }

                // Pop values to compare.
                var a = thread.stack.pop();
                var b = thread.stack.pop();

                var result;
                if (opcode >= 0x7F && opcode <= 0xFB || opcode >= 0x22 && opcode <= 0x57) {
                    result = a.compare(b);
                } else {
                    result = a.compare_un(b);
                }

                switch (opcode) {
                    case 0x7F: // beq.i8
                    case 0x22: // beq.i8.s
                        if (!result) {
                            frame.instructionPointer += offset;
                        }
                        return true;

                    case 0xFC: // bne.i8.un
                    case 0x77: // bne.i8.un.s
                        if (result != 0) {
                            frame.instructionPointer += offset;
                        }
                        return true;
                    case 0x98: // bge.i8
                    case 0x23: // bge.i8.s
                    case 0xFD: // bge.i8.un
                    case 0x78: // bge.i8.un.s
                        if (result <= 0) {
                            frame.instructionPointer += offset;
                        }
                        return true;

                    case 0x99: // bgt.i8
                    case 0x4E: // bgt.i8.s
                    case 0xFF: // bgt.i8.un
                    case 0xA0: // bgt.i8.un.s
                        if (result < 0) {
                            frame.instructionPointer += offset;
                        }
                        return true;

                    case 0xFA: // ble.i8
                    case 0x56: // ble.i8.s
                    case 0xF8: // ble.i8.un
                    case 0xA1: // ble.i8.un.s
                        if (result >= 0) {
                            frame.instructionPointer += offset;
                        }
                        return true;

                    case 0xFB: // blt.i8
                    case 0x57: // blt.i8.s
                    case 0xF9: // blt.i8.un
                    case 0xCA: // blt.i8.un.s
                        if (result > 0) {
                            frame.instructionPointer += offset;
                        }
                        return true;
                    default:
                        throw "Unknown instruction";
                }
            };

        case 0xE8: // beq.i
        case 0xE9: // bge.i
        case 0xF0: // bgt.i
        case 0xF1: // ble.i
        case 0xF2: // blt.i
        case 0xF3: // bne.i.un
        case 0xF4: // bge.i.un
        case 0xF5: // bgt.i.un
        case 0xF6: // ble.i.un
        case 0xF7: // blt.i.un

        case 0x6B: // beq.i.s
        case 0x6C: // bge.i.s
        case 0x76: // bgt.i.s
        case 0xBE: // ble.i.s
        case 0xBF: // blt.i.s
        case 0xCB: // bne.i.un.s
        case 0xCC: // bge.i.un.s
        case 0xCD: // bgt.i.un.s
        case 0xCE: // ble.i.un.s
        case 0xCF: // blt.i.un.s
            {
                /* Integer comparison operations */

                var offset;

                if (opcode >= 0xE8) {
                    // Normal form
                    offset = ((methodData[frame.instructionPointer + 1]) |
                        (methodData[frame.instructionPointer + 2] << 8) |
                        (methodData[frame.instructionPointer + 3] << 16) |
                        (methodData[frame.instructionPointer + 4] << 24));
                    frame.instructionPointer += 5;
                } else {
                    // Short form
                    offset = methodData[frame.instructionPointer + 1] << 24 >> 24;
                    frame.instructionPointer += 2;
                }

                // Pop values to compare.
                var a = thread.stack.pop();
                var b = thread.stack.pop();

                if (opcode >= 0xF3 && opcode <= 0xF7 || opcode >= 0xCB && opcode <= 0xCF) {
                    a = a << 32 >>> 32;
                    b = b << 32 >>> 32;
                }

                switch (opcode) {
                    case 0xE8: // beq.i
                    case 0x6B: // beq.i.s
                        if (b == a) {
                            frame.instructionPointer += offset;
                        }
                        return true;
                    case 0xF3: // bne.i.un
                    case 0xCB: // bne.i.un.s
                        if (b != a) {
                            frame.instructionPointer += offset;
                        }
                        return true;

                    case 0xE9: // bge.i
                    case 0x6C: // bge.i.s
                    case 0xF4: // bge.i.un
                    case 0xCC: // bge.i.un.s
                        if (b >= a) {
                            frame.instructionPointer += offset;
                        }
                        return true;

                    case 0xF0: // bgt.i
                    case 0x76: // bgt.i.s
                    case 0xF5: // bgt.i.un
                    case 0xCD: // bgt.i.un.s
                        if (b > a) {
                            frame.instructionPointer += offset;
                        }
                        return true;

                    case 0xF1: // ble.i
                    case 0xBE: // ble.i.s
                    case 0xF6: // ble.i.un
                    case 0xCE: // ble.i.un.s
                        if (b <= a) {
                            frame.instructionPointer += offset;
                        }
                        return true;

                    case 0xF2: // blt.i
                    case 0xBF: // blt.i.s
                    case 0xF7: // blt.i.un
                    case 0xCF: // blt.i.un.s
                        if (b < a) {
                            frame.instructionPointer += offset;
                        }
                        return true;
                    default:
                        throw "Unknown instruction";
                }
            };

        case 0x58: // add
        case 0x59: // sub
        case 0x5A: // mul
        case 0x5B: // div
        case 0x5C: // div.un
        case 0x5D: // rem
        case 0x5E: // rem.un
        case 0x5F: // and
        case 0x60: // or
        case 0x61: // xor
        case 0x62: // shl
        case 0x63: // shr
        case 0x64: // shr.un
            {
                /**
                 * Standard arithmetic and logical operations 
                 * 
                 * In order to avoid runtime type checking we need to get rid of polymorphic instructions somehow. We're
                 *  doing this through simple translation into our own set of type-specific instructions. Instruction is being replaced
                 *  with suitable one right in the memory stream and replay is executed then. 
                 * */

                var b = thread.stack[thread.stack.length - 1];
                var a = thread.stack[thread.stack.length - 2];
                var is64 = (b.constructor == Int64);
                var newcmd;

                if (b.constructor != a.constructor) {
                    // Arguments must have identical type.
                    throw "Invalid data";
                }

                switch (opcode) {
                    case 0x58: // add
                        // => add.i8 or add.i
                        newcmd = is64 ? 0xA3 : 0xC1;
                        break;
                    case 0x59: // sub
                        // => sub.i8 or sub.i
                        newcmd = is64 ? 0xA4 : 0xC4;
                        break;
                    case 0x5A: // mul
                        // => mul.i8 or mul.i
                        newcmd = is64 ? 0xA5 : 0xC5;
                        break;
                    case 0x5B: // div
                        // => div.i8 or div.i
                        newcmd = is64 ? 0xA6 : 0xC7;
                        break;
                    case 0x5C: // div.un
                        // => div.i8.un or div.i.un
                        newcmd = is64 ? 0xA7 : 0xC8;
                        break;
                    case 0x5D: // rem
                        // => rem.i8 or rem.i
                        newcmd = is64 ? 0xA8 : 0xC9;
                        break;
                    case 0x5E: // rem.un
                        // => rem.i8.un or rem.i.un
                        newcmd = is64 ? 0xA9 : 0xE1;
                        break;
                    case 0x5F: // and
                        // => and.i8 or and.i
                        newcmd = is64 ? 0xAA : 0xE2;
                        break;
                    case 0x60: // or
                        // => or.i8 or or.i
                        newcmd = is64 ? 0xAB : 0xE3;
                        break;
                    case 0x61: // xor
                        // => xor.i8 or xor.i
                        newcmd = is64 ? 0xAC : 0xE4;
                        break;
                    case 0x62: // shl
                        // => shl.i8 or shl.i
                        newcmd = is64 ? 0xAD : 0xE5;
                        break;
                    case 0x63: // shr
                        // => shr.i8 or shr.i
                        newcmd = is64 ? 0xAE : 0xE6;
                        break;
                    case 0x64: // shr.un
                        // => shr.i8.un or shr.i.un
                        newcmd = is64 ? 0xAF : 0xE7;
                        break;
                    default:
                        throw "Unknown instruction";
                }

                // Replace the current instruction and replay.
                methodData[frame.instructionPointer] = newcmd;
                return true;
            };

        case 0xC1: // add.i
        case 0xC4: // sub.i
        case 0xC5: // mul.i
        case 0xC7: // div.i
        case 0xC8: // div.i.un
        case 0xC9: // rem.i
        case 0xE1: // rem.i.un
        case 0xE2: // and.i
        case 0xE3: // or.i
        case 0xE4: // xor.i
        case 0xE5: // shl.i
        case 0xE6: // shr.i
        case 0xE7: // shr.i.un
            {
                /* Type-specific integer arithmetics */

                var b = thread.stack.pop();
                var a = thread.stack.pop();
                frame.instructionPointer++;

                switch (opcode) {
                    case 0xC1: // add.i
                        thread.stack.push(a + b);
                        break;
                    case 0xC4: // sub.i
                        thread.stack.push(a - b);
                        break;
                    case 0xC5: // mul.i
                        thread.stack.push(a * b);
                        break;
                    case 0xC7: // div.i
                        thread.stack.push(a / b >> 0);
                        break;
                    case 0xC8: // div.i.un
                        a = a << 32 >>> 32;
                        b = b << 32 >>> 32;
                        thread.stack.push(a / b >> 0);
                        break;
                    case 0xC9: // rem.i
                        thread.stack.push(a % b);
                        break;
                    case 0xE1: // rem.i.un
                        a = a << 32 >>> 32;
                        b = b << 32 >>> 32;
                        thread.stack.push(a % b);
                        break;
                    case 0xE2: // and.i
                        thread.stack.push(a & b);
                        break;
                    case 0xE3: // or.i
                        thread.stack.push(a | b);
                        break;
                    case 0xE4: // xor.i
                        thread.stack.push(a ^ b);
                        break;
                    case 0xE5: // shl.i
                        thread.stack.push(a << b);
                        break;
                    case 0xE6: // shr.i
                        thread.stack.push(a >> b);
                        break;
                    case 0xE7: // shr.i.un
                        thread.stack.push(a >>> b);
                        break;
                    default:
                        throw "Unknown instruction";
                }

                return true;
            };

        case 0xA3: // add.i8
        case 0xA4: // sub.i8
        case 0xA5: // mul.i8
        case 0xA6: // div.i8
        case 0xA7: // div.i8.un
        case 0xA8: // rem.i8
        case 0xA9: // rem.i8.un
        case 0xAA: // and.i8
        case 0xAB: // or.i8
        case 0xAC: // xor.i8
        case 0xAD: // shl.i8
        case 0xAE: // shr.i8
        case 0xAF: // shr.i8.un
            {
                /* Type-specific int64 arithmetics */

                var b = thread.stack.pop();
                var a = thread.stack.pop();
                frame.instructionPointer++;

                switch (opcode) {
                    case 0xA3: // add.i8
                        thread.stack.push(a.add(b));
                        break;
                    case 0xA4: // sub.i8
                        thread.stack.push(a.sub(b));
                        break;
                    case 0xA5: // mul.i8
                        thread.stack.push(a.mul(b));
                        break;
                    case 0xA6: // div.i8
                        thread.stack.push(a.div(b));
                        break;
                    case 0xA7: // div.i8.un
                        thread.stack.push(a.div_un(b));
                        break;
                    case 0xA8: // rem.i8
                        thread.stack.push(a.mod(b));
                        break;
                    case 0xA9: // rem.i8.un
                        thread.stack.push(a.mod_un(b));
                        break;
                    case 0xAA: // and.i8
                        thread.stack.push(a.and(b));
                        break;
                    case 0xAB: // or.i8
                        thread.stack.push(a.or(b));
                        break;
                    case 0xAC: // xor.i8
                        thread.stack.push(a.xor(b));
                        break;
                    case 0xAD: // shl.i8
                        thread.stack.push(a.shiftLeft(b));
                        break;
                    case 0xAE: // shr.i8
                        thread.stack.push(a.shiftRight(b));
                        break;
                    case 0xAF: // shr.i8.un
                        thread.stack.push(a.unsignedShiftRight(b));
                        break;
                    default:
                        throw "Unknown instruction";
                }

                return true;
            };
        case 0x65: // neg
        case 0x66: // not
        case 0x67: // conv.i1
        case 0x68: // conv.i2
        case 0x69: // conv.i4
        case 0x6A: // conv.i8
        case 0xD2: // conv.u1
        case 0xD1: // conv.u2
        case 0x6D: // conv.u4
        case 0x6E: // conv.u8
            var a = thread.stack.pop();
            frame.instructionPointer++;
            if (a.constructor == Int64) {
                switch (opcode) {
                    case 0x65: // neg
                        thread.stack.push(a.neg());
                        return true;
                    case 0x66: // not
                        thread.stack.push(a.not());
                        return true;
                    case 0x67: // conv.i1
                        thread.stack.push((a.low32() & 0x000000ff) << 24 >> 24);
                        return true;
                    case 0x68: // conv.i2
                        thread.stack.push((a.low32() & 0x0000ffff) << 16 >> 16);
                        return true;
                    case 0x69: // conv.i4
                        thread.stack.push(a.low32() << 32 >> 32);
                        return true;
                    case 0xD2: // conv.u1
                        thread.stack.push((a.low32() & 0x000000ff) << 24 >>> 24);
                        return true;
                    case 0xD1: // conv.u2
                        thread.stack.push((a.low32() & 0x0000ffff) << 16 >>> 16);
                        return true;
                    case 0x6D: // conv.u4
                        thread.stack.push(a.low32() << 32 >>> 32);
                        return true;
                    case 0x6A: // conv.i8
                    case 0x6E: // conv.u8
                        // Replace current opcode with nop and push the value back on stack
                        methodData[frame.instructionPointer - 1] = 0x00;
                        thread.stack.push(a);
                        return true;
                }
            }

            switch (opcode) {
                case 0x65: // neg
                    thread.stack.push(-a);
                    return true;
                case 0x66: // not
                    thread.stack.push(~a);
                    return true;
                case 0x67: // conv.i1
                    thread.stack.push(a & 0x000000ff);
                    return true;
                case 0x68: // conv.i2
                    thread.stack.push(a & 0x0000ffff);
                    return true;
                case 0x69: // conv.i4
                    thread.stack.push(a & 0xffffffff);
                    return true;
                case 0x6A: // conv.i8
                    thread.stack.push(new Int64(a));
                    return true;
                case 0xD2: // conv.u1
                    thread.stack.push((a & 0x000000ff) << 24 >>> 24);
                    return true;
                case 0xD1: // conv.u2
                    thread.stack.push((a & 0x0000ffff) << 16 >>> 16);
                    return true;
                case 0x6D: // conv.u4
                    thread.stack.push(a << 32 >>> 32);
                    return true;
                case 0x6E: // conv.u8
                    thread.stack.push(new Int64(a << 32 >>> 32));
                    return true;
            }
        case 0xFE: // Two-byte instructions
            {
                var suffix = methodData[frame.instructionPointer + 1];
                switch(suffix) {
                    case 0x01: // ceq
                    case 0x02: // cgt
                    case 0x03: // cgt.un
                    case 0x04: // clt
                    case 0x05: // clt.un
                        {
                            var v1 = thread.stack[thread.stack.length - 1];
                            var v2 = thread.stack[thread.stack.length - 2];
                            var is64 = (v1.constructor == Int64);
                            var newsuf;

                            if (v1.constructor != v2.constructor) {
                                // Arguments must have identical type.
                                throw "Invalid data";
                            }

                            switch (suffix) {
                                case 0x01: // ceq
                                    // => ceq.i8 or ceq.i
                                    newsuf = is64 ? 0xA1 : 0xB1;
                                    break;
                                case 0x02: // cgt
                                    // => cgt.i8 or cgt.i
                                    newsuf = is64 ? 0xA2 : 0xB2;
                                    break;
                                case 0x03: // cgt.un
                                    // => cgt.i8.un or cgt.i.un
                                    newsuf = is64 ? 0xA3 : 0xBB;
                                    break;
                                case 0x04: // clt
                                    // => clt.i8 or clt.i
                                    newsuf = is64 ? 0xA4 : 0xBC;
                                    break;
                                case 0x05: // clt.un
                                    // => clt.i8.un or clt.i.un
                                    newsuf = is64 ? 0xA5 : 0xBD;
                                    break;
                                default:
                                    throw "What is that?";
                            };

                            // Replace opcode and replay the execution.
                            methodData[frame.instructionPointer + 1] = newsuf;
                            return true;
                        };

                    case 0x09: // ldarg <index>
                        var index = methodData[frame.instructionPointer + 1] | (methodData[frame.instructionPointer + 2] << 8);
                        var value = frame.arguments[index];
                        thread.stack.push(value);
                        frame.instructionPointer += 4;
                        return true;

                    case 0x0A: // ldarga <index>
                        throw "Not yet implemented";

                    case 0x0B: // starg <index>
                        var value = thread.stack.pop();
                        var index = methodData[frame.instructionPointer + 1] | (methodData[frame.instructionPointer + 2] << 8);
                        frame.arguments[index] = value;
                        frame.instructionPointer += 4;
                        return true;
                    
                    case 0x0E: // stloc <index>
                        var value = thread.stack.pop();
                        var index = methodData[frame.instructionPointer + 1] | (methodData[frame.instructionPointer + 2] << 8);
                        frame.locals[index] = value;
                        frame.instructionPointer += 4;
                        return true;

                    /* Non-ECMA type-specific instructions */
                    case 0xA1: // ceq.i8
                    case 0xA2: // cgt.i8
                    case 0xA3: // cgt.i8.un
                    case 0xA4: // clt.i8
                    case 0xA5: // clt.i8.un
                    case 0xB1: // ceq.i
                    case 0xB2: // cgt.i
                    case 0xBB: // cgt.i.un
                    case 0xBC: // clt.i
                    case 0xBD: // clt.i.un
                        {
                            var v2 = thread.stack.pop();
                            var v1 = thread.stack.pop();

                            switch (suffix) {
                                case 0xA1: // ceq.i8
                                    thread.stack.push(~~!!(v1.compare(v2) == 0));
                                    break;
                                case 0xA2: // cgt.i8
                                    thread.stack.push(~~!!(v1.compare(v2) > 0));
                                    break;
                                case 0xA3: // cgt.i8.un
                                    thread.stack.push(~~!!(v1.compare_un(v2) > 0));
                                    break;
                                case 0xA4: // clt.i8
                                    thread.stack.push(~~!!(v1.compare(v2) < 0));
                                    break;
                                case 0xA5: // clt.i8.un
                                    thread.stack.push(~~!!(v1.compare_un(v2) < 0));
                                    break;
                                case 0xB1: // ceq.i
                                    thread.stack.push(~~!!(v1 == v2));
                                    break;
                                case 0xB2: // cgt.i
                                    thread.stack.push(~~!!(v1 > v2));
                                    break;
                                case 0xBB: // cgt.i.un
                                    thread.stack.push(~~!!((v1 << 32 >>> 32) > (v2 << 32 >>> 32)));
                                    break;
                                case 0xBC: // clt.i
                                    thread.stack.push(~~!!(v1 < v2));
                                    break;
                                case 0xBD: // clt.i.un
                                    thread.stack.push(~~!!((v1 << 32 >>> 32) < (v2 << 32 >>> 32)));
                                    break;
                                default:
                                    throw "What is that?";
                            }

                            frame.instructionPointer += 2;
                            return true;
                        };

                        break;

                    default:
                        throw "Unknown instruction: 0xfe 0x" + suffix.toString(16);
                }
            };
        case 0x72: // ldstr (T)
            var stringToken = readToken(methodData, frame.instructionPointer + 1);
            frame.instructionPointer += 5;
            var str = readUS(stringToken.index);
            thread.stack.push(str);
            return true;
        case 0x8D: // newarr
            var arraySize = thread.stack.pop();
            var array = appDomain.createObject();
            array.initArray(arraySize);
            thread.stack.push(array.objectID);
            frame.instructionPointer += 5;
            return true;
        case 0x8E: // ldlen
            var arrayID = thread.stack.pop();
            var array = appDomain.findObject(arrayID).value;
            thread.stack.push(array.length);
            frame.instructionPointer += 1;
            return true;
        case 0x9C: // stelem.i1
        case 0x9D: // stelem.i2
        case 0x9E: // stelem.i4
        case 0x9F: // stelem.i8
            var value = thread.stack.pop();
            var elementIndex = thread.stack.pop();
            var arrayID = thread.stack.pop();
            var array = appDomain.findObject(arrayID);

            switch(opcode) {
                case 0x9C: // stelem.i1
                    array.value[elementIndex] = value & 0x000000ff;
                    break;
                case 0x9D: // stelem.i2
                    array.value[elementIndex] = value & 0x0000ffff;
                    break;
                case 0x9E: // stelem.i4
                    array.value[elementIndex] = value & 0xffffffff;
                    break;
                case 0x9F: // stelem.i8
                    if (value.constructor != Int64) {
                        value = new Int64(value);
                    }
                    array.value[elementIndex] = value;
                    break;
            };

            frame.instructionPointer += 1;
            return true;
        
        case 0x90: // ldelem.i1
        case 0x92: // ldelem.i2
        case 0x94: // ldelem.i4
        case 0x96: // ldelem.i8
            {
                var elementIndex = thread.stack.pop();
                var arrayID = thread.stack.pop();
                var array = appDomain.findObject(arrayID);

                switch(opcode) {
                    case 0x90: // ldelem.i1
                        thread.stack.push(array.value[elementIndex] & 0x000000ff);
                        break;
                    case 0x92: // ldelem.i2
                        thread.stack.push(array.value[elementIndex] & 0x0000ffff);
                        break;
                    case 0x94: // ldelem.i4
                        thread.stack.push(array.value[elementIndex] & 0xffffffff);
                        break;
                    case 0x96: // ldelem.i8
                        var value = array.value[elementIndex];
                        if (value.constructor != Int64) {
                            value = new Int64(value);
                        }
                        thread.stack.push(value);
                        break;
                }

                frame.instructionPointer += 1;
                return true;
            };
        case 0x91: // ldelem.u1
        case 0x93: // ldelem.u2
        case 0x95: // ldelem.u4
            {
                var elementIndex = thread.stack.pop();
                var arrayID = thread.stack.pop();
                var array = appDomain.findObject(arrayID);

                switch(opcode) {
                    case 0x91: // ldelem.u1
                        thread.stack.push((array.value[elementIndex] & 0x000000ff) << 24 >>> 24);
                        break;
                    case 0x93: // ldelem.u2
                        thread.stack.push((array.value[elementIndex] & 0x0000ffff) << 16 >>> 16);
                        break;
                    case 0x95: // ldelem.u4
                        thread.stack.push((array.value[elementIndex] & 0xffffffff) << 32 >>> 32);
                        break;
                }

                frame.instructionPointer += 1;
                return true;
            };
        case 0x8F: // ldelema <type token>
            throw "Not yet implemented";
        case 0xE0: // conv.u
            var value = thread.stack.pop();
            thread.stack.push(value << 32 >>> 32);
            frame.instructionPointer += 1;
            return true;
        default:
            console.log(
                'opcode=0x' + opcode.toString(16), 
                'location=0x' + frame.instructionPointer.toString(16), 
                thread.stack, frame.locals
            ); // Under construction :)
            throw "Unknown instruction:" + opcode.toString(16);
    }

    function readUS(index) {
        // 24.2.4
        var cliMetadata = frame.executingAssembly.clrData.metadata;
        var data = frame.executingAssembly.clrData.data;
        var usStreamOffset = cliMetadata.getStreamOffset("#US");

        var offset = usStreamOffset + index;
        var read = readVarSize(data, offset);
        offset += read.length;
        var charCount = (read.size - 1) / 2;
        var buffer = "";
        for (var i = 0; i < charCount; ++i) {
            buffer += String.fromCharCode(data[offset] | (data[offset + 1] << 8));
            offset += 2;
        }
        buffer.interned = index;
        return buffer;
    }

    function readToken(data, index) {
        return {
            index: (data[index + 2] << 16) | (data[index + 1] << 8) | data[index + 0],
            table: data[index + 3]
        };
    }

    function readVarSize(data, offset) {
        var index = 0;
        var code;
        var b1 = data[offset + index++];
        if (b1 < 0) return null;

        if ((b1 & 0x80) == 0) {
            code = b1;
        } else if ((b1 & 0xC0) == 0x80) {
            var x = data[offset + index++];
            code = ((b1 & 0x3F) << 8) | x;
        } else if ((b1 & 0xE0) == 0xC0) {
            var x = data[offset + index++];
            var y = data[offset + index++];
            var z = data[offset + index++];
            code = ((b1 & 0x1F) << 24) | (x << 16) | (y << 8) | z;
        } else
            code = null;

        return { size: code, length: index };
    }
}

module.exports = ExecuteClrInstruction;