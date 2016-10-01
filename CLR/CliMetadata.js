/* MIT License. Copyright 2010 by notmasteryet. */

/* Web Browser CLR Execution Environment */
/* Ecma-335 spec. Partion 2 */

var CliMetadataTableIndex = {
    Assembly: 0x20,
    AssemblyOS: 0x22,
    AssemblyProcessor: 0x21,
    AssemblyRef: 0x23,
    AssemblyRefOS: 0x25,
    AssemblyRefProcessor: 0x24,
    ClassLayout: 0x0F,
    Constant: 0x0B,
    CustomAttribute: 0x0C,
    DeclSecurity: 0x0E,
    EventMap: 0x12,
    Event: 0x14,
    ExportedType: 0x27,
    Field: 0x04,
    FieldLayout: 0x10,
    FieldMarshal: 0x0D,
    FieldRVA: 0x1D,
    File: 0x26,
    GenericParam: 0x2A,
    GenericParamConstraint: 0x2C,
    ImplMap: 0x1C,
    InterfaceImpl: 0x09,
    ManifestResource: 0x28,
    MemberRef: 0x0A,
    MethodDef: 0x06,
    MethodImpl: 0x19,
    MethodSemantics: 0x18,
    MethodSpec: 0x2B,
    Module: 0x00,
    ModuleRef: 0x1A,
    NestedClass: 0x29,
    Param: 0x08,
    Property: 0x17,
    PropertyMap: 0x15,
    StandAloneSig: 0x11,
    TypeDef: 0x02,
    TypeRef: 0x01,
    TypeSpec: 0x1B
};

var CliElementTypes = [
    undefined,
    "VOID", "BOOLEAN", "CHAR", "I1", "U1", "I2", "U2", "I4", "U4", "I8", "U8", "R4", "R8",
    "STRING", "PTR", "BYREF", "VALUETYPE", "CLASS", "VAR", "ARRAY", "GENERICINST",
    "TYPEDBYREF", undefined, "I", "U", undefined, "FNPTR", "OBJECT", "SZARRAY", "MVAR"
];

var CliSignatureParser = {
    parseMethodDefSig: function (reader) {
        var signature = {};
        if (reader.peek() == 0x20) {
            signature.HASTHIS = true;
            reader.read();
        }
        if (reader.peek() == 0x40) {
            signature.EXPLICITTHIS = true;
            reader.read()
        }
        switch (reader.read()) {
            case 0x00:
                signature.DEFAULT = true;
                break;
            case 0x05:
                signature.VARARG = true;
                break;
            case 0x10:
                signature.GENERIC = true;
                signature.GenericParamCount = reader.read();
                break;
            /* for StandAloneMethodSig */
            case 0x01:
                signature.C = true;
                break;
            case 0x02:
                signature.STDCALL = true;
                break;
            case 0x03:
                signature.THISCALL = true;
                break;
            case 0x04:
                signature.FASTCALL = true;
                break;
        }
        signature.ParamCount = reader.read();
        signature.RetType = this.parseRetType(reader);
        signature.Params = [];
        for (var i = 0; i < signature.ParamCount; ++i) {
            if (reader.peek() == 0x41) {
                signature.SENTINEL = true;
                signature.SentinelBefore = i;
                reader.read();
            }
            var param = this.parseParam(reader);
            signature.Params.push(param);
        }
        return signature;
    },
    parseFieldSig: function (reader) {
        if (reader.read() != 0x06) {
            throw "Invalid field sig";
        }
        var signature = {};
        signature.FIELD = true;
        signature.CustomMods = [];
        var customMod;
        while ((customMod = this.parseCustomMod(reader)) != undefined) {
            signature.CustomMods.push(customMod);
        }
        signature.Type = this.parseType(reader);
        return signature;
    },
    parsePropertySig: function (reader) {
        var hasThis = false;
        switch (reader.read()) {
            case 0x08:
                break;
            case 0x28:
                hasThis = true;
            default:
                throw "Invalid property signature";
        }
        var signature = {};
        signature.PROPERTY = true;
        if (hasThis) signature.THIS = true;
        signature.ParamCount = reader.read();
        signature.CustomMods = [];
        var customMod;
        while ((customMod = this.parseCustomMod(reader)) != undefined) {
            signature.CustomMods.push(customMod);
        }
        signature.Type = this.parseType(reader);
        signature.Params = [];
        for (var i = 0; i < signature.ParamCount; ++i) {
            var param = this.parseParam(reader);
            signature.Params.push(param);
        }
        return signature;
    },
    parseLocalVarSig: function (reader) {
        if (reader.read() != 0x07) {
            throw "Invalid local signature";
        }
        var signature = {};
        signature.LOCAL_SIG = true;
        signature.Count = reader.read();
        signature.Locals = [];
        for (var i = 0; i < signature.Count; ++i) {
            var local = {};
            if (reader.peek() == 0x16) {
                local.TYPEDBYREF = true;
                reader.read();
            } else {
                local.CustomModsAndConstaints = [];
                var customMod = this.parseCustomMod(reader);
                var constraint = this.parseConstraint(reader);
                while (customMod != undefined || constraint != undefined) {
                    if (customMod != undefined) local.CustomModsAndConstaints.push(customMod);
                    if (constraint != undefined) local.CustomModsAndConstaints.push(constraint);
                    customMod = this.parseCustomMod(reader);
                    constraint = this.parseConstraint(reader);
                }

                if (reader.read() != 0x10) {
                    throw "BYREF expected";
                }

                local.Type = this.parseType(reader);
            }
            signature.Locals.push(local);
        }
    },
    parseCustomMod: function (reader) {
        var signature;
        if (reader.peek() == 0x20) {
            signature.CMOD_OPT = true;
        } else if (reader.peek() == 0x1f) {
            signature.CMOD_REQD = true;
        } else
            return undefined;
        reader.read(); // skip CMOD_???
        signature.TypeDefOrRef = this.parseTypeDefOrRef(reader);
        return signature;
    },
    parseTypeDefOrRef: function (reader) {
        return reader.read();
    },
    parseConstraint: function (reader) {
        if (reader.peek() == 0x45) {
            var signature = {};
            signature.PINNED = true;
            return signature;
        } else
            return undefined;
    },
    parseParam: function (reader) {
        var signature = {};
        signature.CustomMods = [];
        var customMod;
        while ((customMod = this.parseCustomMod(reader)) != undefined) {
            signature.CustomMods.push(customMod);
        }
        if (reader.peek() == 0x16) {
            signature.TYPEDBYREF = true;
            reader.read();
        } else {
            if (reader.peek() == 0x10) {
                signature.BYREF = true;
                reader.read();
            }
            signature.Type = this.parseType(reader);
        }
        return signature;
    },
    parseRetType: function (reader) {
        var signature = {};
        signature.CustomMods = [];
        var customMod;
        while ((customMod = this.parseCustomMod(reader)) != undefined) {
            signature.CustomMods.push(customMod);
        }

        if (reader.peek() == 0x16) {
            signature.TYPEDBYREF = true;
            reader.read();
        } else if (reader.peek() == 0x01) {
            signature.VOID = true;
            reader.read();
        } else {
            if (reader.peek() == 0x10) {
                signature.BYREF = true;
                reader.read();
            }
            signature.Type = this.parseType(reader);
        }
        return signature;
    },
    parseType: function (reader) {
        var typeId = reader.read();
        var signature = {};
        signature.TypeId = typeId;
        signature.TypeName = CliElementTypes[typeId];
        if (typeId >= 0x02 && typeId <= 0x0d ||
            typeId >= 0x18 && typeId <= 0x19 ||
            typeId == 0x0e || typeId == 0x1c) {
            // BOOLEAN | CHAR | I1 | U1 | I2 | U2 | I4 | U4 | I8 | U8 | R4 | R8 | I | U
            // STRING
            // OBJECT
        } else if (typeId == 0x14) {
            // ARRAY Type ArrayShape
            signature.ArrayType = this.parseType(reader);
            signature.ArrayShape = this.parseArrayShape(reader);
        } else if (typeId == 0x12) {
            // CLASS TypeDefOrRefEncoded
            signature.TypeDefOrRef = this.parseTypeDefOrRef(reader);
        } else if (typeId == 0x1b) {
            // FNPTR MethodDefSig
            signature.MethodSignature = this.parseMethodDefSig(reader);
        } else if (typeId == 0x15) {
            // GENERICINST (CLASS | VALUETYPE) TypeDefOrRefEncoded GenArgCount Type *
            var classOrValue = reader.read();
            if (classOrValue == 0x12)
                signature.CLASS = true;
            else
                signature.VALUETYPE = true;
            signature.TypeDefOrRef = this.parseTypeDefOrRef(reader);
            signature.GenArgCount = reader.read();
            signature.GenArgTypes = [];
            for (var i = 0; i < signature.GenArgCount; ++i) {
                var type = this.parseType(reader);
                signature.GenArgTypes.push(type);
            }
        } else if (typeId == 0x1e) {
            // MVAR number
            signature.GenArgIndex = reader.read();
        } else if (typeId == 0x0f || typeId == 0x1d) {
            // PTR *CustomMod (Type | VOID)
            // SZARRAY CustomMod* Type
            signature.CustomMods = [];
            var customMod;
            while ((customMod = this.parseCustomMod(reader)) != undefined) {
                signature.CustomMods.push(customMod);
            }
            if (reader.peek() == 0x01) {
                signature.VOID = true;
                reader.read();
            } else {
                signature.PtrType = this.parseType(reader);
            }
        } else if (typeId == 0x11) {
            // VALUETYPE TypeDefOrRefEncoded
            signature.TypeDefOrRef = this.parseTypeDefOrRef(reader);
        } else if (typeId == 0x13) {
            // VAR number
            signature.GenArgIndex = reader.read();
        }
        return signature;
    },
    parseArrayShape: function (reader) {
        var signature = {};
        signature.Rank = reader.read();
        signature.NumSizes = reader.read();
        signature.Sizes = [];
        for (var i = 0; i < signature.NumSizes; ++i) {
            signature.Sizes.push(reader.read());
        }
        signature.NumLoBounds = reader.read();
        signature.LoBounds = [];
        for (var i = 0; i < signature.NumLoBounds; ++i) {
            signature.LoBounds.push(reader.read());
        }
        return signature;
    }
};

function CorSigUncompressData(data) {
    var result = 0;

    if ((data[0] & 0x80) == 0x00) {
        return data[0];
    }
    else if ((data[0] & 0xC0) == 0x80) {
        result = (data[0] & 0x3F) << 8;
        result |= data[1];
    } else if ((data[0] & 0xE0) == 0xC0) {
        result = (data[0] & 0x1F) << 24;
        result |= data[1] << 16;
        result |= data[2] << 8;
        result |= data[3];
    }

    return result;
}

/*
function Struct() {
}

function PrimitiveValue(type, value) {
    this.type = type;
    this.value = value;
}

function MemoryPointer(getter, setter) {
    this.getter = getter;
    this.setter = setter;
}
*/

/* Types mapping 

    BOOLEAN 0x02 - boolean
    CHAR 0x03 - Primitive: number
    I1 0x04 - Primitive: number
    U1 0x05 - Primitive: number
    I2 0x06 - Primitive: number
    U2 0x07 - Primitive: number
    I4 0x08 - Primitive: number
    U4 0x09 - Primitive: number
    I8 0x0a - Primitive: string
    U8 0x0b  - Primitive: string
    R4 0x0c - Primitive: number
    R8 0x0d - number
    STRING 0x0e - string
    PTR 0x0f - Primitive: number
    BYREF 0x10 - MemoryPointer
    VALUETYPE 0x11 - Struct
    CLASS 0x12 - Reference
    VAR 0x13 - n/a
    ARRAY 0x14 - CliArray
    GENERICINST 0x15 - n/a
    TYPEDBYREF 0x16 - n/a
    I 0x18 - Primitive: number
    U 0x19 - Primitive: number
    FNPTR 0x1b - Delegate
    OBJECT 0x1c - Reference
    SZARRAY 0x1d - Array
    MVAR 0x1e - n/a

*/

module.exports.CliMetadataTableIndex = CliMetadataTableIndex;
module.exports.CliSignatureParser = CliSignatureParser;
module.exports.CorSigUncompressData = CorSigUncompressData;