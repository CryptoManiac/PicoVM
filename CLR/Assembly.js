const fs = require('fs');
const CliMetadataTableIndex = require('./CliMetadata').CliMetadataTableIndex;

function InitAssembly(appDomain, name, clrData) {
    this.appDomain = appDomain;
    this.name = name;
    this.clrData = clrData;
    this.run = function () {
        var entryPoint = this.clrData.header.entryPointToken;
        if ((entryPoint >> 24) == CliMetadataTableIndex.MethodDef) {
            var args = appDomain.createObject();
            args.initArray();
            // TODO command line args
            var callFrame = { callingAssembly: this, method: entryPoint, state: 0 };

            var thread = appDomain.createThread();
            thread.stack.push(args);
            thread.callStack.push(callFrame);
        }
        else
            throw "Invalid entry point token";
    };
}

function readAssembly(path, callback) {
    var assemblyPath = 'appcode/' + path;
    fs.readFile(assemblyPath, function (status, data) {
        if (status) {
            throw status;
        }
        parseAssemblyData(data, callback);
    });

    function parseAssemblyData(data, callback) {
        // validate MZ (25.1)
        var mzHeader = [
            0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00,
            0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, undefined, undefined, undefined, undefined,
            0x0e, 0x1f, 0xba, 0x0e, 0x00, 0xb4, 0x09, 0xcd, 0x21, 0xb8, 0x01, 0x4c, 0xcd, 0x21, 0x54, 0x68,
            0x69, 0x73, 0x20, 0x70, 0x72, 0x6f, 0x67, 0x72, 0x61, 0x6d, 0x20, 0x63, 0x61, 0x6e, 0x6e, 0x6f,
            0x74, 0x20, 0x62, 0x65, 0x20, 0x72, 0x75, 0x6e, 0x20, 0x69, 0x6e, 0x20, 0x44, 0x4f, 0x53, 0x20,
            0x6d, 0x6f, 0x64, 0x65, 0x2e, 0x0d, 0x0d, 0x0a, 0x24, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ];

        for (var i = 0; i < mzHeader.length; ++i) {
            if (mzHeader[i] != data[i] && mzHeader[i] != undefined)
                throw "Invalid MZ header";
        }

        // PE headers (25.2)
        var peOffset = read32bit(data, 0x3c);
        var peHeader = {};
        if (data[peOffset + 0] != 0x50 || data[peOffset + 1] != 0x45 || data[peOffset + 2] != 0x00 || data[peOffset + 3] != 0x00)
            throw "Invalid PE header";
        peOffset += 4;

        if (data[peOffset + 0] != 0x4c || data[peOffset + 1] != 0x01) throw "Invalid PE machine";
        peHeader.sectionsCount = data[peOffset + 2] | (data[peOffset + 3] << 8);
        peHeader.timeDateStamp = data[peOffset + 4] | (data[peOffset + 5] << 8) | (data[peOffset + 6] << 16) | (data[peOffset + 7] << 24); // since January 1st 1970 00:00:00
        peHeader.symbolTableOffset = data[peOffset + 8] | (data[peOffset + 9] << 8) | (data[peOffset + 10] << 16) | (data[peOffset + 11] << 24);
        peHeader.symbolsCount = data[peOffset + 12] | (data[peOffset + 13] << 8) | (data[peOffset + 14] << 16) | (data[peOffset + 15] << 24);
        peHeader.optionalHeaderSize = data[peOffset + 16] | (data[peOffset + 17] << 8);
        peHeader.characteristics = data[peOffset + 18] | (data[peOffset + 19] << 8);
        peOffset += 20;

        peHeader.optional = { standard: {}, nt: {}, directories: {} };
        if (data[peOffset + 0] != 0x0B || data[peOffset + 1] != 0x01)
            throw "Invalid PE standard magic" + data[peOffset + 0] + ' ' + data[peOffset + 1];
        if (data[peOffset + 2] != 0x08 && data[peOffset + 2] != 0x30)
            throw "Invalid PE standard lmajor: " + data[peOffset + 2];
        if (data[peOffset + 3] != 0x00)
            throw "Invalid PE standard lminor" + data[peOffset + 3];
        peHeader.optional.standard.codeSize = read32bit(data, peOffset + 4);
        peHeader.optional.standard.initializedDataSize = read32bit(data, peOffset + 8);
        peHeader.optional.standard.uninitializedDataSize = read32bit(data, peOffset + 12);
        peHeader.optional.standard.entryPointRVA = read32bit(data, peOffset + 16);
        peHeader.optional.standard.baseOfCode = read32bit(data, peOffset + 20);
        peHeader.optional.standard.baseOfData = read32bit(data, peOffset + 24);

        peHeader.optional.nt.imageBase = read32bit(data, peOffset + 28);
        peHeader.optional.nt.sectionAlignment = read32bit(data, peOffset + 32);
        peHeader.optional.nt.fileAlignment = read32bit(data, peOffset + 36);
        peHeader.optional.nt.imageSize = read32bit(data, peOffset + 56);
        peHeader.optional.nt.headerSize = read32bit(data, peOffset + 60);
        peHeader.optional.nt.subSystem = read16bit(data, peOffset + 68);

        peHeader.optional.directories.importTable = readRVASize(data, peOffset + 104);
        peHeader.optional.directories.baseRelocationTable = readRVASize(data, peOffset + 136);
        peHeader.optional.directories.iat = readRVASize(data, peOffset + 192);
        peHeader.optional.directories.cliHeader = readRVASize(data, peOffset + 208);
        peOffset += peHeader.optionalHeaderSize;

        // Section Headers (25.3)
        peHeader.sections = [];
        for (var i = 0; i < peHeader.sectionsCount; ++i) {
            var section = {};
            section.name = readAsciiz(data, peOffset, 8);
            section.virtualSize = read32bit(data, peOffset + 8);
            section.virtualAddress = read32bit(data, peOffset + 12);
            section.sizeOfRawData = read32bit(data, peOffset + 16);
            section.pointerToRawData = read32bit(data, peOffset + 20);
            section.pointerToRelocation = read32bit(data, peOffset + 24);
            section.relocationsCount = read16bit(data, peOffset + 32);
            section.characteristics = read32bit(data, peOffset + 36);
            peHeader.sections.push(section);
            peOffset += 40;
        }

        peHeader.getDataOffset = function (address) {
            for (var i = 0; i < this.sectionsCount; ++i) {
                if (this.sections[i].virtualAddress <= address && address < this.sections[i].virtualAddress + this.sections[i].virtualSize) {
                    return this.sections[i].pointerToRawData + (address - this.sections[i].virtualAddress);
                }
            }
        };

        // CLI Header (25.3.3)
        var cliHeaderOffset = peHeader.getDataOffset(peHeader.optional.directories.cliHeader.rva);
        var cliHeader = {};
        cliHeader.majorRuntime = read16bit(data, cliHeaderOffset + 4);
        cliHeader.minorRuntime = read16bit(data, cliHeaderOffset + 6);
        cliHeader.metaData = readRVASize(data, cliHeaderOffset + 8);
        cliHeader.flags = read32bit(data, cliHeaderOffset + 16);
        cliHeader.entryPointToken = read32bit(data, cliHeaderOffset + 20);
        cliHeader.resources = readRVASize(data, cliHeaderOffset + 24);
        cliHeader.strongNameSignature = readRVASize(data, cliHeaderOffset + 32);
        cliHeader.vtableFixups = readRVASize(data, cliHeaderOffset + 48);

        // CLI Meta Data (24.2.1)
        var cliMetadata = {};
        var cliMetadataOffset = peHeader.getDataOffset(cliHeader.metaData.rva);
        if (read32bit(data, cliMetadataOffset) != 0x424A5342)
            throw "Invalid CLI metadata";
        var versionLength = read32bit(data, cliMetadataOffset + 12);
        cliMetadata.version = readUtf8z(data, cliMetadataOffset + 16, versionLength);
        cliMetadata.streamsCount = read16bit(data, cliMetadataOffset + versionLength + 18);
        var streamsOffset = cliMetadataOffset + versionLength + 20;
        cliMetadata.streams = [];
        for (var i = 0; i < cliMetadata.streamsCount; ++i) {
            var stream = {};
            stream.offset = read32bit(data, streamsOffset);
            stream.size = read32bit(data, streamsOffset + 4);
            stream.name = readAsciiz(data, streamsOffset + 8, 32);
            cliMetadata.streams.push(stream);
            streamsOffset += 8 + ((stream.name.length + 4) & 0xFC);
        }
        cliMetadata.getStreamOffset = function (name) {
            for (var i = 0; i < this.streamsCount; ++i) {
                if (this.streams[i].name == name) {
                    return cliMetadataOffset + this.streams[i].offset;
                }
            }
        };


        var metadataTablesOffset = cliMetadata.getStreamOffset("#~");
        var metadataTables = {};
        metadataTables.heapSizes = data[metadataTablesOffset + 6];
        metadataTables.tables = [];
        var metadataTablesOffset2 = metadataTablesOffset + 24;
        for (var i = 0; i < 64; i++) {
            var bit = 1 << (i & 7);
            if ((data[metadataTablesOffset + 8 + (i >> 3)] & bit) != 0) {
                var table = {};
                table.sorted = (data[metadataTablesOffset + 16 + (i >> 3)] & bit) != 0;
                table.rowsCount = read32bit(data, metadataTablesOffset2);

                metadataTables.tables.push(table);
                metadataTablesOffset2 += 4;
            } else {
                metadataTables.tables.push(undefined);
            }
        }

        fillTables(
            {
                data: data,
                offset: metadataTablesOffset2,
                read16bit: function () {
                    var n = read16bit(this.data, this.offset); this.offset += 2; return n;
                },
                read32bit: function () {
                    var n = read32bit(this.data, this.offset); this.offset += 4; return n;
                }
            }, cliMetadata, metadataTables);

        var cliData = {
            data: data,
            pe: peHeader,
            header: cliHeader,
            metadata: cliMetadata,
            metadataTables: metadataTables,
            getMethodBody: cliData_getMethodBody
        };

        callback(cliData);
    }

    function cliData_getMethodBody(index) {
        var methodDef = this.metadataTables._MethodDef[index];
        var offset = this.pe.getDataOffset(methodDef.rva);
        var format = this.data[offset] & 0x03;
        var methodBody = { methodDef: methodDef };
        if (format == 0x02) {
            // tiny format
            var length = this.data[offset++] >> 2;

            methodBody.data = readBytes(this.data, offset, length);
            methodBody.maxStack = 8;
        } else if (format == 0x03) {
            // fat format
            var flags = read16bit(this.data, offset);
            var headerSize = (flags >> 12) * 4;
            var maxStack = read16bit(this.data, offset + 2);
            var codeSize = read32bit(this.data, offset + 4);
            var localVarSigTok = read32bit(this.data, offset + 8);
            offset += headerSize;
            methodBody.data = readBytes(this.data, offset, codeSize);
            methodBody.maxStack = maxStack;
            methodBody.localVarSigTok = localVarSigTok;
            offset += (codeSize + 3) & ~3;
            if ((flags & 0x08) != 0) {
                methodBody.sections = [];
                var hasMoreSections;
                do {
                    var section = {};
                    var sectionHeader = read32bit(this.data, offset);
                    hasMoreSections = (sectionHeader & 0x80) != 0;
                    var fatFormat = (sectionHeader & 0x40) != 0;
                    if ((sectionHeader & 0x03) == 0x01) {
                        offset += 4;
                        section.kind = "Exception";
                        var n = fatFormat ? ((sectionHeader >> 8) - 4) / 24 : (((sectionHeader >> 8) & 0xFF) - 4) / 12;
                        for (var i = 0; i < n; ++i) {
                            if (!fatFormat) {
                                section.flags = read16bit(this.data, offset);
                                section.tryOffset = read16bit(this.data, offset + 2);
                                section.tryLength = this.data[offset + 4];
                                section.handlerOffset = read16bit(this.data, offset + 5);
                                section.handlerLength = this.data[offset + 7];
                                section.classTokenOrFilterOffset = read32bit(this.data, offset + 8);
                                offset += 12;
                            } else {
                                section.flags = read32bit(this.data, offset);
                                section.tryOffset = read32bit(this.data, offset + 4);
                                section.tryLength = read32bit(this.data, offset + 8);
                                section.handlerOffset = read16bit(this.data, offset + 12);
                                section.handlerLength = read32bit(this.data, offset + 16);
                                section.classTokenOrFilterOffset = read32bit(this.data, offset + 20);
                                offset += 24;
                            }
                        }
                    } else {
                        throw "Invalid method section kind";
                    }
                    methodBody.sections.push(section);
                } while (hasMoreSections);
            }
            if ((flags & 0x10) != 0) methodBody.initLocals = true;

        } else {
            throw "Invalid method body format";
        }
        return methodBody;
    }

    function fillTables(reader, cliMetadata, metadataTables) {
        var stringStreamOffset = cliMetadata.getStreamOffset("#Strings");
        var blobStreamOffset = cliMetadata.getStreamOffset("#Blob");
        var usStreamOffset = cliMetadata.getStreamOffset("#US");
        var guidStreamOffset = cliMetadata.getStreamOffset("#GUID");

        fillTable(CliMetadataTableIndex.Module, "Module", function () {
            var row = {};
            row.generation = reader.read16bit();
            row.name = readString();
            row.mvid = readGuid();
            row.encId = readGuid();
            row.endBaseId = readGuid();
            return row;
        });

        fillTable(CliMetadataTableIndex.TypeRef, "TypeRef", function () {
            var row = {};
            row.resolutionScope = readRowIndexChoice(CliMetadataTableIndex.Module, CliMetadataTableIndex.ModuleRef, CliMetadataTableIndex.AssemblyRef, CliMetadataTableIndex.TypeRef);
            // ^ ResolutionScope
            row.typeName = readString();
            row.typeNamespace = readString();
            return row;
        });

        fillTable(CliMetadataTableIndex.TypeDef, "TypeDef", function () {
            var row = {};
            row.flags = reader.read32bit();
            row.typeName = readString();
            row.typeNamespace = readString();
            row.extendsType = readRowIndexChoice(CliMetadataTableIndex.TypeDef, CliMetadataTableIndex.TypeRef, CliMetadataTableIndex.TypeSpec);
            // ^ TypeDefOrRef
            row.fieldList = readRowIndex(CliMetadataTableIndex.Field);
            row.methodList = readRowIndex(CliMetadataTableIndex.MethodDef);
            return row;
        });

        fillTable(CliMetadataTableIndex.Field, "Field", function () {
            var row = {};
            row.flags = reader.read16bit();
            row.name = readString();
            row.signature = readSignature();
            return row;
        });

        fillTable(CliMetadataTableIndex.MethodDef, "MethodDef", function () {
            var row = {};
            row.rva = reader.read32bit();
            row.implFlags = reader.read16bit();
            row.flags = reader.read16bit();
            row.name = readString();
            row.signature = readSignature();
            row.paramList = readRowIndex(CliMetadataTableIndex.Param);
            return row;
        });

        fillTable(CliMetadataTableIndex.Param, "Param", function () {
            var row = {};
            row.flags = reader.read16bit();
            row.sequence = reader.read16bit();
            row.name = readString();
            return row;
        });

        fillTable(CliMetadataTableIndex.InterfaceImpl, "InterfaceImpl", function () {
            var row = {};
            row.classRef = readRowIndex(CliMetadataTableIndex.TypeDef);
            row.interfaceRef = readRowIndexChoice(CliMetadataTableIndex.TypeDef, CliMetadataTableIndex.TypeRef, CliMetadataTableIndex.TypeSpec);
            // ^ TypeDefOrRef
            return row;
        });

        fillTable(CliMetadataTableIndex.MemberRef, "MemberRef", function () {
            var row = {};
            row.classRef = readRowIndexChoice(CliMetadataTableIndex.TypeDef /*ul*/, CliMetadataTableIndex.TypeRef, CliMetadataTableIndex.ModuleRef, CliMetadataTableIndex.MethodDef, CliMetadataTableIndex.TypeSpec);
            // ^ MemberRefParent
            row.name = readString();
            row.signature = readSignature();
            return row;
        });

        fillTable(CliMetadataTableIndex.Constant, "Constant", function () {
            var row = {};
            row.type = reader.read16bit();
            row.parent = readRowIndexChoice(CliMetadataTableIndex.Field, CliMetadataTableIndex.Param, CliMetadataTableIndex.Property);
            // ^ HasConstant
            row.value = readBlob();
            return row;
        });

        fillTable(CliMetadataTableIndex.CustomAttribute, "CustomAttribute", function () {
            var row = {};
            // iss.4,page 296 -> HasCustomAttribute -> Permission ???
            row.parent = readRowIndexChoice(CliMetadataTableIndex.MethodDef, CliMetadataTableIndex.Field, CliMetadataTableIndex.TypeRef, CliMetadataTableIndex.TypeDef,
                CliMetadataTableIndex.Param, CliMetadataTableIndex.InterfaceImpl, CliMetadataTableIndex.MemberRef, CliMetadataTableIndex.Module, undefined /* ??? was Permission */,
                CliMetadataTableIndex.Property, CliMetadataTableIndex.Event, CliMetadataTableIndex.StandAloneSig, CliMetadataTableIndex.ModuleRef, CliMetadataTableIndex.TypeSpec,
                CliMetadataTableIndex.Assembly, CliMetadataTableIndex.AssemblyRef, CliMetadataTableIndex.File, CliMetadataTableIndex.ExportedType, CliMetadataTableIndex.ManifestResource);
            // ^ HasCustomAttribute
            row.type = readRowIndexChoice(undefined, undefined, CliMetadataTableIndex.MethodDef, CliMetadataTableIndex.MemberRef, undefined);
            // ^ CustomAttributeType
            row.value = readBlob();
            return row;
        });

        fillTable(CliMetadataTableIndex.FieldMarshal, "FieldMarshal", function () {
            var row = {};
            row.parent = readRowIndexChoice(CliMetadataTableIndex.Field, CliMetadataTableIndex.Param);
            // ^ HasFieldMarshal
            row.nativeType = readBlob();
            return row;
        });

        fillTable(CliMetadataTableIndex.DeclSecurity, "DeclSecurity", function () {
            var row = {};
            row.action = reader.read16bit();
            row.parent = readRowIndexChoice(CliMetadataTableIndex.TypeDef, CliMetadataTableIndex.MethodDef, CliMetadataTableIndex.Assembly);
            // ^ HasDeclSecurity
            row.permissionSet = readBlob();
            return row;
        });

        fillTable(CliMetadataTableIndex.ClassLayout, "ClassLayout", function () {
            var row = {};
            row.packingSize = reader.read16bit();
            row.classSize = reader.read32bit();
            row.parent = readRowIndex(CliMetadataTableIndex.TypeDef);
            return row;
        });

        fillTable(CliMetadataTableIndex.FieldLayout, "FieldLayout", function () {
            var row = {};
            row.offset = reader.read32bit();
            row.parent = readRowIndex(CliMetadataTableIndex.Field);
            return row;
        });

        fillTable(CliMetadataTableIndex.StandAloneSig, "StandAloneSig", function () {
            return readSignature();
        });

        fillTable(CliMetadataTableIndex.EventMap, "EventMap", function () {
            var row = {};
            row.parent = readRowIndex(CliMetadataTableIndex.TypeDef);
            row.eventList = readRowIndex(CliMetadataTableIndex.Event);
            return row;
        });

        fillTable(CliMetadataTableIndex.Event, "Event", function () {
            var row = {};
            row.eventFlags = reader.read16bit();
            row.name = readString();
            row.eventType = readRowIndexChoice(CliMetadataTableIndex.TypeDef, CliMetadataTableIndex.TypeRef, CliMetadataTableIndex.TypeSpec);
            // ^ TypeDefOrRef
            return row;
        });

        fillTable(CliMetadataTableIndex.PropertyMap, "PropertyMap", function () {
            var row = {};
            row.parent = readRowIndex(CliMetadataTableIndex.TypeDef);
            row.propertyList = readRowIndex(CliMetadataTableIndex.Property);
            return row;
        });

        fillTable(CliMetadataTableIndex.Property, "Property", function () {
            var row = {};
            row.flags = reader.read16bit();
            row.name = readString();
            row.signature = readSignature();
            return row;
        });

        fillTable(CliMetadataTableIndex.MethodSemantics, "MethodSemantics", function () {
            var row = {};
            row.semantics = reader.read16bit();
            row.method = readRowIndex(CliMetadataTableIndex.MethodDef);
            row.association = readRowIndexChoice(CliMetadataTableIndex.Event, CliMetadataTableIndex.Property);
            // ^ HasSemantics
            return row;
        });

        fillTable(CliMetadataTableIndex.MethodImpl, "MethodImpl", function () {
            var row = {};
            row.classRef = readRowIndex(CliMetadataTableIndex.TypeDef);
            row.methodBody = readRowIndexChoice(CliMetadataTableIndex.MethodDef, CliMetadataTableIndex.MemberRef);
            // ^ MethodDefOrRef
            row.methodDeclaration = readRowIndexChoice(CliMetadataTableIndex.MethodDef, CliMetadataTableIndex.MemberRef);
            // ^ MethodDefOrRef
            return row;
        });

        fillTable(CliMetadataTableIndex.ModuleRef, "ModuleRef", function () {
            return readString();
        });

        fillTable(CliMetadataTableIndex.TypeSpec, "TypeSpec", function () {
            return readSignature();
        });

        fillTable(CliMetadataTableIndex.ImplMap, "ImplMap", function () {
            var row = {};
            row.mappingFlags = reader.read16bit();
            row.memberForwarded = readRowIndexChoice(CliMetadataTableIndex.Field, CliMetadataTableIndex.MethodDef);
            // ^ MemberForwarded
            row.importName = readString();
            row.importScope = readRowIndex(CliMetadataTableIndex.ModuleRef);
            return row;
        });

        fillTable(CliMetadataTableIndex.FieldRVA, "FieldRVA", function () {
            var row = {};
            row.rva = reader.read32bit();
            row.field = readRowIndex(CliMetadataTableIndex.Field);
            return row;
        });

        fillTable(CliMetadataTableIndex.Assembly, "Assembly", function () {
            var row = {};
            row.hashAlgId = reader.read32bit();
            row.version = [reader.read16bit(), reader.read16bit(), reader.read16bit(), reader.read16bit()];
            row.flags = reader.read32bit();
            row.publicKey = readBlob();
            row.name = readString();
            row.culture = readString();
            return row;
        });

        fillTable(CliMetadataTableIndex.AssemblyProcessor, "AssemblyProcessor", function () {
            return reader.read32bit();
        });

        fillTable(CliMetadataTableIndex.AssemblyOS, "AssemblyOS", function () {
            var row = {};
            row.osPlatformID = reader.read32bit();
            row.osMajorVersion = reader.read32bit();
            row.osMinorVersion = reader.read32bit();
            return row;
        });

        fillTable(CliMetadataTableIndex.AssemblyRef, "AssemblyRef", function () {
            var row = {};
            row.version = [reader.read16bit(), reader.read16bit(), reader.read16bit(), reader.read16bit()];
            row.flags = reader.read32bit();
            row.publicKeyOrToken = readBlob();
            row.name = readString();
            row.culture = readString();
            row.hashValue = readBlob();
            return row;
        });

        fillTable(CliMetadataTableIndex.AssemblyRefProcessor, "AssemblyRefProcessor", function () {
            var row = {};
            row.processor = reader.read32bit();
            row.assemblyRef = readRowIndex(CliMetadataTableIndex.AssemblyRef);
            return row;
        });

        fillTable(CliMetadataTableIndex.AssemblyRefOS, "AssemblyRefOS", function () {
            var row = {};
            row.osPlatformID = reader.read32bit();
            row.osMajorVersion = reader.read32bit();
            row.osMinorVersion = reader.read32bit();
            row.assemblyRef = readRowIndex(CliMetadataTableIndex.AssemblyRef);
            return row;
        });

        fillTable(CliMetadataTableIndex.File, "File", function () {
            var row = {};
            row.flags = reader.read32bit();
            row.name = readString();
            row.hashValue = readBlob();
            return row;
        });

        fillTable(CliMetadataTableIndex.ExportedType, "ExportedType", function () {
            var row = {};
            row.flags = reader.read32bit();
            row.typeDefId = reader.read32bit();
            row.typeName = readString();
            row.typeNamespace = readString();
            row.implementation = readRowIndexChoice(CliMetadataTableIndex.File, CliMetadataTableIndex.AssemblyRef /*nl*/, CliMetadataTableIndex.ExportedType);
            // ^ Implementation
            return row;
        });

        fillTable(CliMetadataTableIndex.ManifestResource, "ManifestResource", function () {
            var row = {};
            row.offset = reader.read32bit();
            row.flags = reader.read32bit();
            row.name = readString();
            row.implementation = readRowIndexChoice(CliMetadataTableIndex.File, CliMetadataTableIndex.AssemblyRef, CliMetadataTableIndex.ExportedType /*nl*/);
            // ^ Implementation
            return row;
        });

        fillTable(CliMetadataTableIndex.NestedClass, "NestedClass", function () {
            var row = {};
            row.nestedClass = readRowIndex(CliMetadataTableIndex.TypeDef);
            row.enclosingClass = readRowIndex(CliMetadataTableIndex.TypeDef);
            return row;
        });

        fillTable(CliMetadataTableIndex.GenericParam, "GenericParam", function () {
            var row = {};
            row.number = reader.read16bit();
            row.flags = reader.read16bit();
            row.owner = readRowIndexChoice(CliMetadataTableIndex.TypeDef, CliMetadataTableIndex.MethodDef);
            // ^ TypeOrMethodDef
            row.name = readString();
            return row;
        });

        fillTable(CliMetadataTableIndex.MethodSpec, "MethodSpec", function () {
            var row = {};
            row.method = readRowIndexChoice(CliMetadataTableIndex.MethodDef, CliMetadataTableIndex.MemberRef);
            // ^ MethodDefOrRef
            row.instantiation = readSignature();
            return row;
        });

        fillTable(CliMetadataTableIndex.GenericParamConstraint, "GenericParamConstraint", function () {
            var row = {};
            row.owner = readRowIndex(CliMetadataTableIndex.GenericParam);
            row.constraint = readRowIndexChoice(CliMetadataTableIndex.TypeDef, CliMetadataTableIndex.TypeRef, CliMetadataTableIndex.TypeSpec);
            // ^ TypeDefOrRef
            return row;
        });

        buildList(CliMetadataTableIndex.TypeDef, "fieldList", CliMetadataTableIndex.Field, "_Fields");
        buildList(CliMetadataTableIndex.TypeDef, "methodList", CliMetadataTableIndex.MethodDef, "_Methods");
        buildList(CliMetadataTableIndex.MethodDef, "paramList", CliMetadataTableIndex.Param, "_Params");
        buildList(CliMetadataTableIndex.EventMap, "eventList", CliMetadataTableIndex.Event, "_Events");
        buildList(CliMetadataTableIndex.PropertyMap, "propertyList", CliMetadataTableIndex.Property, "_Properties");

        function fillTable(index, name, rowReader) {
            if (metadataTables.tables[index] != undefined) {
                metadataTables.tables[index].name = name;
                metadataTables.tables[index].rows = [undefined];
                for (var i = 0; i < metadataTables.tables[index].rowsCount; i++) {
                    metadataTables.tables[index].rows.push(rowReader());
                }
                metadataTables["_" + name] = metadataTables.tables[index].rows;
            }
        }

        function buildList(parentTableIndex, startPropertyName, itemTableIndex, propertyName) {
            var parentTable = metadataTables.tables[parentTableIndex];
            var itemTable = metadataTables.tables[itemTableIndex];
            if (parentTable != undefined && parentTable.rows.length > 0) {
                for (var i = 2; i < parentTable.rows.length; ++i) {
                    var result = [];
                    for (var j = parentTable.rows[i - 1][startPropertyName]; j < parentTable.rows[i][startPropertyName]; ++j) {
                        result.push(itemTable.rows[j]);
                    }
                    parentTable.rows[i - 1][propertyName] = result;
                }
                if (itemTable != undefined) {
                    var result = [];
                    for (var j = parentTable.rows[parentTable.rows.length - 1][startPropertyName]; j < itemTable.rows.length; ++j) {
                        result.push(itemTable.rows[j]);
                    }
                    parentTable.rows[parentTable.rows.length - 1][propertyName] = result;
                }
            }
        }

        function readRowIndex(tableIndex) {
            if (metadataTables.tables[tableIndex] != undefined)
                return metadataTables.tables[tableIndex].rowsCount >= 65536 ? reader.read32bit() : reader.read16bit();
            else
                return reader.read16bit();
        }

        function readRowIndexChoice() {
            var max = 0;
            for (var i = 0; i < arguments.length; ++i)
                if (arguments[i] != undefined && metadataTables.tables[arguments[i]] != undefined && max < metadataTables.tables[arguments[i]].rowsCount)
                    max = metadataTables.tables[arguments[i]].rowsCount;
            var shift = 0, bit = 1;
            while (arguments.length > bit) {
                bit <<= 1;
                ++shift;
            }
            var index = (max << shift) >= 65536 ? reader.read32bit() : reader.read16bit();
            return {
                index: index >> shift,
                table: arguments[index & (bit - 1)],
                getItem: function () {
                    return metadataTables.tables[this.table].rows[this.index];
                }
            };
        }

        function readSignature() {
            var result = [];
            var buffer = readBlob();
            var i = 0;
            while (i < buffer.length) {
                var read = readVarSize(buffer, i);
                result.push(read.size);
                i += read.length;
            }
            result.createReader = function () {
                return new ArrayReader(result);
            }
            return result;
        }

        function ArrayReader(array) {
            this.array = array;
            this.offset = 0;
        }
        ArrayReader.prototype.peek = function () { return this.array[this.offset]; };
        ArrayReader.prototype.read = function () { return this.array[this.offset++]; };

        function readString() {
            var index = (metadataTables.heapSizes & 0x01) != 0 ? reader.read32bit() : reader.read16bit();
            return readUtf8z(reader.data, stringStreamOffset + index, 0xFFFF);
        }
        function readGuid() {
            var index = (metadataTables.heapSizes & 0x02) != 0 ? reader.read32bit() : reader.read16bit();
            if (index == 0)
                return undefined;
            return readBytes(reader.data, guidStreamOffset + ((index - 1) << 4), 16);
        }
        function readBlob() {
            var index = (metadataTables.heapSizes & 0x04) != 0
                ? reader.read32bit() : reader.read16bit();
            var offset = blobStreamOffset + index;
            var read = readVarSize(reader.data, offset);
            return readBytes(reader.data, offset + read.length, read.size);
        }
    }

    function readBytes(data, offset, length) {
        var buffer = [];
        for (var i = 0; i < length; ++i)
            buffer.push(data[offset + i]);
        return buffer;
    }

    function read16bit(data, offset) {
        return data[offset] | (data[offset + 1] << 8);
    }

    function read32bit(data, offset) {
        return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    }

    function readRVASize(data, offset) {
        return { rva: read32bit(data, offset), size: read32bit(data, offset + 4) };
    }

    function readUtf8z(data, offset, limit) {
        var s = "";
        for (var i = 0; i < limit;) {
            var read = readUtf8Number(data, offset + i);
            if (read.code == 0) break;
            s += String.fromCharCode(read.code);
            i += read.length;
        }
        return s;
    }

    function readAsciiz(data, offset, limit) {
        var s = "";
        for (var i = 0; i < limit && data[offset + i] != 0; ++i)
            s += String.fromCharCode(data[offset + i]);
        return s;
    }

    function readUtf8Number(data, offset) {
        var index = 0;
        var code;
        var b1 = data[offset + index++];
        if (b1 < 0) return null;

        if ((b1 & 0x80) == 0) {
            code = b1;
        }
        else {
            var currentPrefix = 0xC0;
            var validBits = 5;
            do {
                var mask = currentPrefix >> 1 | 0x80;
                if ((b1 & mask) == currentPrefix) break;
                currentPrefix = currentPrefix >> 1 | 0x80;
                --validBits;
            } while (validBits >= 0);
            if (validBits > 0) {
                code = (b1 & ((1 << validBits) - 1));
                for (var i = 5; i >= validBits; --i) {
                    var bi = data[offset + index++];
                    if ((bi & 0xC0) != 0x80) throw "Invalid sequence character";
                    code = (code << 6) | (bi & 0x3F);
                }
            }
            else
                throw "Invalid character";
        }
        return { code: code, length: index };
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

module.exports.InitAssembly = InitAssembly;
module.exports.readAssembly = readAssembly;
