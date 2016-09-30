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
        case 0x10: // starg.s
            var value = thread.stack.pop();
            var index = methodData[frame.instructionPointer + 1];
            frame.arguments[index] = value;
            frame.instructionPointer += 2;
            return true;
        case 0x11: // ldloc.s
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
        case 0x13: // stloc.s
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
        case 0x1F: // ldc.i4.s
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

        case 0x2B: // br.s
        case 0x2C: // brnull.s | brfalse.s
        case 0x2D: // brtrue.s
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
                var offset;
                
                if (opcode >= 0x38 && opcode <= 0x44) {
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
                    case 0x3A: // brue
                        var a = thread.stack.pop();
                        if (a) {
                            frame.instructionPointer += offset;
                        }
                        return true;
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
                            var a = thread.stack.pop();
                            var b = thread.stack.pop();

                            var a64, b64;
                            if ((a64 = a.constructor == Int64) || (b64 = b.constructor == Int64)) {
                                var result;
                                if (opcode >= 0x3B && opcode <= 0x3F) {
                                    result = a64 ? a.compare(b) : -(b.compare(a));
                                } else {
                                    result = a64 ? a.compare_un(b) : -(b.compare_un(a));
                                }

                                switch (opcode) {
                                    case 0x2E: // beq.s
                                    case 0x3B: // beq
                                        if (!result) {
                                            frame.instructionPointer += offset;
                                        }
                                        return true;
                                    case 0x33: // bne.un.s
                                    case 0x40: // bne.un
                                        if (result != 0) {
                                            frame.instructionPointer += offset;
                                            return true;
                                        }
                                    case 0x2F: // bge.s
                                    case 0x3C: // bge
                                    case 0x34: // bge.un.s
                                    case 0x41: // bge.un
                                        if (result <= 0) {
                                            frame.instructionPointer += offset;
                                        }
                                        return true;
                                    case 0x3D: // bgt
                                    case 0x30: // bgt.s
                                    case 0x35: // bgt.un.s
                                    case 0x42: // bgt.un
                                        if (result < 0) {
                                            frame.instructionPointer += offset;
                                        }
                                        return true;
                                    case 0x31: // ble.s
                                    case 0x36: // ble.un.s
                                    case 0x3E: // ble
                                    case 0x43: // ble.un
                                        if (result >= 0) {
                                            frame.instructionPointer += offset;
                                        }
                                        return true;
                                    case 0x32: // blt.s
                                    case 0x3F: // blt
                                    case 0x37: // blt.un.s
                                    case 0x44: // blt.un
                                        if (result > 0) {
                                            frame.instructionPointer += offset;
                                        }
                                        return true;
                                }

                                return true;
                            }

                            if (opcode >= 0x41 && opcode <= 0x44 || opcode >= 0x34 && opcode <= 0x37) {
                                a = a << 32 >>> 32;
                                b = b << 32 >>> 32;
                            }

                            switch (opcode) {
                                case 0x2E: // beq.s
                                case 0x3B: // beq
                                    if (b == a) {
                                        frame.instructionPointer += offset;
                                    }
                                    return true;
                                case 0x2F: // bge.s
                                case 0x34: // bge.un.s
                                case 0x41: // bge.un
                                case 0x3C: // bge
                                    if (b >= a) {
                                        frame.instructionPointer += offset;
                                    }
                                    return true;
                                case 0x30: // bgt.s
                                case 0x35: // bgt.un.s
                                case 0x42: // bgt.un
                                case 0x3D: // bgt
                                    if (b > a) {
                                        frame.instructionPointer += offset;
                                    }
                                    return true;
                                case 0x36: // ble.un.s
                                case 0x43: // ble.un
                                case 0x31: // ble.s
                                case 0x3E: // ble
                                    if (b <= a) {
                                        frame.instructionPointer += offset;
                                    }
                                    return true;
                                case 0x37: // blt.un.s
                                case 0x44: // blt.un
                                case 0x32: // blt.s
                                case 0x3F: // blt
                                    if (b < a) {
                                        frame.instructionPointer += offset;
                                    }
                                    return true;
                                case 0x33: // bne.un.s
                                case 0x40: // bne.un
                                    if (b != a) {
                                        frame.instructionPointer += offset;
                                    }
                                    return true;
                            }
                        }
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
                var b = thread.stack.pop();
                var a = thread.stack.pop();
                frame.instructionPointer++;

                var a64, b64;
                if ((a64 = a.constructor == Int64) || (b64 = b.constructor == Int64)) {
                    /**
                     * int64-native workaround for 64 bit integers.
                     */
                    switch (opcode) {
                        case 0x59: // sub
                        case 0x5B: // div
                        case 0x5C: // div.un
                        case 0x5D: // rem
                        case 0x5E: // rem.un
                        case 0x59: // sub
                        case 0x5D: // rem
                        case 0x62: // shl
                        case 0x63: // shr
                        case 0x64: // shr.un
                            {
                                if (!a64) {
                                    // Reinitialize "a" variable as an instance of 64 bit integer class
                                    a = new Int64(a);
                                }

                                switch (opcode) {
                                    case 0x59: // sub
                                        thread.stack.push(a.sub(b));
                                        return true;
                                    case 0x5B: // div
                                        thread.stack.push(a.div(b));
                                        return true;
                                    case 0x5C: // div.un
                                        thread.stack.push(a.div_un(b));
                                        return true;
                                    case 0x5D: // rem
                                        thread.stack.push(a.mod(b));
                                        return true;
                                    case 0x5E: // rem.un
                                        thread.stack.push(a.mod_un(b));
                                        return true;
                                    case 0x62: // shl
                                        thread.stack.push(a.shiftLeft(b));
                                        return true;
                                    case 0x63: // shr
                                        thread.stack.push(a.shiftRight(b));
                                        return true;
                                    case 0x64: // shr.un
                                        thread.stack.push(a.unsignedShiftRight(b));
                                        return true;
                                }
                            };
                        case 0x58: // add
                        case 0x5A: // mul
                        case 0x5F: // and
                        case 0x60: // or
                        case 0x61: // xor
                            {
                                if (!a64) {
                                    // Swap parameter values
                                    a = [b, a = b][0];
                                }

                                switch (opcode) {
                                    case 0x58: // add
                                        thread.stack.push(a.add(b));
                                        return true;
                                    case 0x5A: // mul
                                        thread.stack.push(a.mul(b)); // NOTE: patched version required
                                        return true;
                                    case 0x5F: // and
                                        thread.stack.push(a.and(b));
                                        return true;
                                    case 0x60: // or
                                        thread.stack.push(a.or(b));
                                        return true;
                                    case 0x61: // xor
                                        thread.stack.push(a.xor(b));
                                        return true;
                                }
                            };
                    }
                }

                switch (opcode) {
                    case 0x5A: // mul
                        thread.stack.push(a * b);
                        return true;
                    case 0x5F: // and
                        thread.stack.push(a & b);
                        return true;
                    case 0x58: // add
                        thread.stack.push(a + b);
                        return true;
                    case 0x59: // sub
                        thread.stack.push(a - b);
                        return true;
                    case 0x60: // or
                        thread.stack.push(a | b);
                        return true;
                    case 0x61: // xor
                        thread.stack.push(a ^ b);
                        return true;
                    case 0x5B: // div
                        thread.stack.push(a / b >> 0);
                        return true;
                    case 0x5C: // div.un
                        a = a << 32 >>> 32;
                        b = b << 32 >>> 32;
                        thread.stack.push(a / b >> 0);
                        return true;
                    case 0x5D: // rem
                        thread.stack.push(a % b);
                        return true;
                    case 0x5E: // rem.un
                        a = a << 32 >>> 32;
                        b = b << 32 >>> 32;
                        thread.stack.push(a % b);
                        return true;
                    case 0x62: // shl
                        thread.stack.push(a << b);
                        return true;
                    case 0x63: // shr
                        thread.stack.push(a >> b);
                        return true;
                    case 0x64: // shr.un
                        thread.stack.push(a >>> b);
                        return true;
                };
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
            //console.log('offset=' + frame.instructionPointer.toString(16), opcode.toString(16), thread.stack);

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
                    case 0x6A: // conv.i8
                        thread.stack.push(a);
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
                    case 0x6E: // conv.u8
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
        case 0xfe:
            {
                var suffix = methodData[frame.instructionPointer + 1];
                switch(suffix) {
                    case 0x01: // ceq
                    case 0x02: // cgt
                    case 0x03: // cgt.un
                    case 0x04: // clt
                    case 0x05: // clt.un
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
                                newsuf = is64 ? 0xA3 : 0xB3;
                                break;
                            case 0x04: // clt
                                // => clt.i8 or clt.i
                                newsuf = is64 ? 0xA4 : 0xB4;
                                break;
                            case 0x05: // clt.un
                                // => clt.i8.un or clt.i.un
                                newsuf = is64 ? 0xA5 : 0xB5;
                                break;
                            default:
                                throw "What is that?";
                        };

                        // Replace opcode and replay the execution.
                        methodData[frame.instructionPointer + 1] = newsuf;
                        return true;

                    /* Non-ECMA type-specific instructions */
                    case 0xA1: // ceq.i8
                    case 0xA2: // cgt.i8
                    case 0xA3: // cgt.i8.un
                    case 0xA4: // clt.i8
                    case 0xA5: // clt.i8.un
                    case 0xB1: // ceq.i
                    case 0xB2: // cgt.i
                    case 0xB3: // cgt.i.un
                    case 0xB4: // clt.i
                    case 0xB5: // clt.i.un
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
                            case 0xB3: // cgt.i.un
                                thread.stack.push(~~!!((v1 << 32 >>> 32) > (v2 << 32 >>> 32)));
                                break;
                            case 0xB4: // clt.i
                                thread.stack.push(~~!!(v1 < v2));
                                break;
                            case 0xB5: // clt.i.un
                                thread.stack.push(~~!!((v1 << 32 >>> 32) < (v2 << 32 >>> 32)));
                                break;
                        }

                        break;

                    default:
                        throw "Unknown instruction: 0xfe 0x" + suffix.toString(16);
                }

                frame.instructionPointer += 2;
                return true;                        
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