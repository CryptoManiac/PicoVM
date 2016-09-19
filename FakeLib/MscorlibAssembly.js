/**
  * Due to extreme limitations of implemented instruction set we're not able to run real mscorlib yet. 
  * This stub has been made for testing purposes.
  */

function MscorlibAssembly() {
    this.types = {
        System$Console: {
            WriteLine$_0_1_1_14: function(thread) {
                console.log(thread.stack[thread.stack.length - 1]);
                return true;
            }
        }
    }
    this.createCall = function(type, method) {
        var typeFullName = (type.typeNamespace + "." + type.typeName).replace(".", "$");
        var nativeType = this.types[typeFullName];
        var methodFullName = method.name + "$";
        for(var i=0;i<method.signature.length;++i)
            methodFullName += "_" + method.signature[i].toString();
        var fn = nativeType[methodFullName];
        return fn;
    };
}

module.exports = MscorlibAssembly;
