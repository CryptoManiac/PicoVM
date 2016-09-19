function ExecuteClrInstruction(thread) {
    var frame = thread.callStack[thread.callStack.length - 1];
    var methodData = frame.methodBody.data;
    
    if(frame.instructionPointer >= methodData.length) {
        throw "End of method body";
    }
    	
    switch(methodData[frame.instructionPointer]) {
    case 0x00: // nop
        frame.instructionPointer++;
        return true;
    case 0x06: // ldloc 0..3
    case 0x07:
    case 0x08:
    case 0x09:
        var index = methodData[frame.instructionPointer++] - 0x06;
        var value = frame.locals[index];
        thread.stack.push(value);
        return true;
    case 0x0A: // stloc 0..3
    case 0x0B:
    case 0x0C:
    case 0x0D:
        var value = thread.stack.pop();
        var index = methodData[frame.instructionPointer++] - 0x0A;
        frame.locals[index] = value;
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
	case 0x15:
		thread.stack.push(-1);
		frame.instructionPointer += 1;
		return true;
	case 0x16: // ldc.i4.0
        thread.stack.push(0);
		frame.instructionPointer += 1;
		return true;
	case 0x17: // ldc.i4.1
		thread.stack.push(1);
		frame.instructionPointer += 1;
		return true;
	case 0x18: // ldc.i4.2
        thread.stack.push(2);
		frame.instructionPointer += 1;
		return true;
	case 0x19: // ldc.i4.3
        thread.stack.push(3);
		frame.instructionPointer += 1;
		return true;
	case 0x1A: // ldc.i4.4
        thread.stack.push(4);
		frame.instructionPointer += 1;
		return true;
	case 0x1B: // ldc.i4.5
        thread.stack.push(5);
		frame.instructionPointer += 1;
		return true;
	case 0x1C: // ldc.i4.6
        thread.stack.push(6);
		frame.instructionPointer += 1;
		return true;
	case 0x1D: // ldc.i4.7
        thread.stack.push(7);
		frame.instructionPointer += 1;
		return true;
	case 0x1E: // ldc.i4.8
        thread.stack.push(8);
		frame.instructionPointer += 1;
		return true;
	case 0x5F: // and
		var a = thread.stack.pop();
		var b = thread.stack.pop();
        thread.stack.push(a & b);
		frame.instructionPointer += 1;
		return true;
	case 0x58: // add
		var a = thread.stack.pop();
		var b = thread.stack.pop();
        thread.stack.push(a+b);
		frame.instructionPointer += 1;
		return true;
	case 0x60: // or
		var a = thread.stack.pop();
		var b = thread.stack.pop();
        thread.stack.push(a | b);
		frame.instructionPointer += 1;
		return true;
	case 0x61: // xor
		var a = thread.stack.pop();
		var b = thread.stack.pop();
        thread.stack.push(a ^ b);
		frame.instructionPointer += 1;
		return true;
	case 0x66: // not
		var a = thread.stack.pop();
        thread.stack.push(~a);
		frame.instructionPointer += 1;
		return true;
    case 0x72: // ldstr (T)
        var stringToken = readToken(methodData, frame.instructionPointer + 1);
        frame.instructionPointer += 5;
        var str = readUS(stringToken.index);
        thread.stack.push(str);
        return true;
    default: 
        throw "Unknown instruction";
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