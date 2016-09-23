const Int64 = require('int64-native');

function ExecuteClrInstruction(thread) {
    var frame = thread.callStack[thread.callStack.length - 1];
    var methodData = frame.methodBody.data;
    
    if(frame.instructionPointer >= methodData.length) {
        throw "End of method body";
    }

    var opcode = methodData[frame.instructionPointer];

/*
    console.log(
        'opcode=0x' + opcode.toString(16), 
        'location=0x' + frame.instructionPointer.toString(16), 
        thread.stack, frame.locals
    ); // Under construction :)
*/

    switch(opcode) {
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
        // console.log('ldloc.s ', index);
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
        // console.log('stloc.s ', index);
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
        var value = methodData[frame.instructionPointer + 1];
        if (value > 127)
            value -= 256;
        thread.stack.push(value);
        frame.instructionPointer += 2;
        return true;
    case 0x20: // ldc.i4
        var value = ((methodData[frame.instructionPointer + 1]) | 
                    (methodData[frame.instructionPointer  + 2] << 8) | 
                    (methodData[frame.instructionPointer  + 3] << 16) | 
                    (methodData[frame.instructionPointer  + 4] << 24));
        thread.stack.push(value);
        frame.instructionPointer += 5;
        return true;
    case 0x21: // ldc.i8
        /**
         * JS is incapable of handling 64 bit integers directly.
         */
        var v1 = ((methodData[frame.instructionPointer + 1]) | 
                    (methodData[frame.instructionPointer  + 2] << 8) | 
                    (methodData[frame.instructionPointer  + 3] << 16) | 
                    (methodData[frame.instructionPointer  + 4] << 24));
        var v2 = ((methodData[frame.instructionPointer + 5]) | 
                    (methodData[frame.instructionPointer  + 6] << 8) | 
                    (methodData[frame.instructionPointer  + 7] << 16) | 
                    (methodData[frame.instructionPointer  + 8] << 24));
        var value = new Int64(v2, v1);
        thread.stack.push(value);
        frame.instructionPointer += 9;
        return true;
	case 0x26: // pop
        thread.stack.pop();
		frame.instructionPointer++;
		return true;
    case 0x28: // call
        var token = readToken(methodData, frame.instructionPointer + 1);
        frame.instructionPointer += 5;
        thread.callStack.push({callingAssembly:frame.executingAssembly, 
            method:token.index | (token.table << 24), state:0});
        return true;
    case 0x2A: // ret
        frame.state = 6;
        return true;
    case 0x38: // br
    case 0x39: // brnull
    case 0x3C: // bge
    case 0x3D: // bgt
    case 0x3E: // ble
    case 0x3F: // blt
         var offset = ((methodData[frame.instructionPointer + 1]) | 
                    (methodData[frame.instructionPointer + 2] << 8) | 
                    (methodData[frame.instructionPointer + 3] << 16) | 
                    (methodData[frame.instructionPointer + 4] << 24));
        frame.instructionPointer+=5;
        switch(opcode) {
        case 0x38: // br
            frame.instructionPointer += offset;
            return true;
        case 0x39: // brnull | brfalse
            var a = thread.stack.pop();
            if (!a) {
                frame.instructionPointer += offset;
            }
            return true;
        case 0x3C: // bge
        case 0x3D: // bgt
        case 0x3E: // ble
        case 0x3F: // blt
            var a = thread.stack.pop();
            var b = thread.stack.pop();
            switch(opcode) {
            case 0x3C: // bge
                if (b >= a) {
                    frame.instructionPointer += offset;
                }
                return true;
            case 0x3D: // bgt
                if (b > a) {
                    frame.instructionPointer += offset;
                }
                return true;
            case 0x3E: // ble
                if (b <= a) {
                    frame.instructionPointer += offset;
                }
                return true;
            }
            case 0x3F: // blt
                if (b < a) {
                    frame.instructionPointer += offset;
                }
                return true;
        };
	case 0x5A: // mul
	case 0x5F: // and
	case 0x58: // add
	case 0x59: // sub
	case 0x60: // or
	case 0x61: // xor
		var b = thread.stack.pop();
		var a = thread.stack.pop();
        frame.instructionPointer++;

        if (typeof a == 'object') {
            /**
             * int64-native workaround for 64 bit integers.
             */
            switch(opcode) {
            case 0x5A: // mul
                thread.stack.push(a.mul(b)); // NOTE: patched version required
                return true;
            case 0x5F: // and
                thread.stack.push(a.and(b));
                return true;
            case 0x58: // add
                thread.stack.push(a.add(b));
                return true;
            case 0x59: // sub
                thread.stack.push(a.sub(b));
                return true;
            case 0x60: // or
                thread.stack.push(a.or(b));
                return true;
            case 0x61: // xor
                thread.stack.push(a.xor(b));
                return true;
            };
        } else {
            switch(opcode) {
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
            };
        }
    case 0x65: // neg
    case 0x66: // not
    case 0x6A: // conv.i8
        var a = thread.stack.pop();
        frame.instructionPointer++;
        switch(opcode) {
        case 0x65: // neg
            thread.stack.push(-a); // TODO: Int64 
            return true;
        case 0x66: // not
            thread.stack.push(~a); // TODO: Int64 
            return true;
        case 0x6A: // conv.i8
            thread.stack.push(new Int64(a)); 
            return true;
        }
    case 0x72: // ldstr (T)
        var stringToken = readToken(methodData, frame.instructionPointer + 1);
        frame.instructionPointer += 5;
        var str = readUS(stringToken.index);
        thread.stack.push(str);
        return true;
    default: 
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
        var charCount = (read.size - 1)/2;
        var buffer = "";
        for(var i=0;i<charCount;++i) {
            buffer += String.fromCharCode(data[offset] | (data[offset + 1] << 8));
            offset+=2;
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
        if(b1 < 0) return null;
        
        if((b1 & 0x80) == 0) 
        {
            code = b1;
        } else if((b1 & 0xC0) == 0x80) {
            var x = data[offset + index++];
            code = ((b1 & 0x3F) << 8) | x; 
        } else if((b1 & 0xE0) == 0xC0) {
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