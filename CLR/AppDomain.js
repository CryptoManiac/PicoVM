const Assembly = require('./Assembly');
const MscorlibAssembly = require('../FakeLib/MscorlibAssembly');

function AppDomain(tickerInterval) {
    tickerInterval = tickerInterval || 1;

    var currentAppDomain = this;

    this.createThread = function() {
        var thread  = new Thread(this);
        this.threads.push(thread);
        return thread;
    }

    this.heap = new Array();

    this.createObject = function() {
        var obj = new Reference();
        this.heap.push(obj);
        return obj;
    }
    
    var index = 0;    
    
    function Reference() {
        this.index = index++;                
    }

    Reference.prototype.initStruct = function() { this.value = new Struct(); };
    Reference.prototype.initArray = function() { this.value = new Array(); };
    
    this.threads = new Array();
    var currentThreadIndex = 0;
    
    function Thread(appDomain) {
        this.appDomain = appDomain;
        this.state = undefined;
        this.stack = [];
        this.callStack = [];
        this.dispose = function() {
            var newThreads = [];
            for(var i=0;i<this.appDomain.threads.length;++i) {
                if(this.appDomain.threads[i] != this) {
                    newThreads.push(appDomain.threads[i]);
                } else if(currentThreadIndex >= i) 
                    --currentThreadIndex;
            }
            this.appDomain.threads = newThreads;
        }
    }
    Thread.prototype.execute = require('./ThreadExecute');
    
    this.collectGarbage = function() {
        var i, j;    
        for(i=0;i<this.heap.length;++i) {
            this.heap[i].used = false;
        }
        
        var queue = [];
        for(i=0;i<this.threads.length;++i) {
            var thread = this.threads[i];
            for(j=0;j<thread.stack.length;++j) {
                if(thread.stack[j] == undefined) continue;
                var obj = thread.stack[j];
                if(obj.constructor == Reference) {
                    if(!obj.used) {
                        queue.push(obj);
                        obj.used = true;
                    }
                } else if(obj.constructor == Struct) {
                    queue.push(obj);
                }
            }
            
            for(j=0;j<this.thead.callStack.length;++j) {
                var frame = this.thead.callStack[j];
                if(frame.locals != undefined) {
                    queue.push(frame.locals);
                }
            }
        }
        
        while(queue.length > 0) {
            var obj = queue.shift();
            
            if(typeof obj.value != "object" || obj.value == null) continue;
            
            var fields = [obj.value];
            while(fields.length > 0)
            {
                var field = fields.shift();   
                             
                if(field.constructor == Array) {
                    for(var i=0;i<field.length;++i) {
                        if(typeof field[i] == "object" && field[i] != null) 
                            fields.push(field[i]);
                    }
                } else if(field.constructor == Struct) {
                    for(var i in field) {
                        if(typeof field[i] == "object" && field[i] != null) 
                            fields.push(field[i]);
                    }
                } else if(field.constructor == Reference) {
                    if(!field.used) {
                        queue.push(field);
                        field.used = true;
                    }                    
                }
            }
        }

        var newHeap = new Array();
        var finalizables = new Array();
        for(i=0;i<this.heap.length;++i) {
            if(this.heap[i].used) 
                newHeap.push(this.heap[i]);
            else if(this.heap[i].isFinalizable) 
                finalizables.push(this.heap[i]);
            delete this.heap[i].used;
        }
        this.heap = newHeap;
        
        // TODO run finalizables
    }
    
    var thisClr = this;
    setInterval(
        function() { AppDomain_tick.call(thisClr); },
        tickerInterval
    );
    
    function AppDomain_tick() {
        if(this.threads.length > 0) {    
            for(var attempts = this.threads.length; attempts > 0; --attempts) {
                if(currentThreadIndex >= this.threads.length)
                    currentThreadIndex = 0;
                var thread = this.threads[currentThreadIndex];            
                var active = thread.execute();

                if(thread.callStack.length == 0) {
                    // thread finished
                    thread.dispose();
                    ++currentThreadIndex;
                }
                else {                
                    ++currentThreadIndex;
                }     
                         
                if(active) break;
           }
        }
    };        

    this.assemblies = new Object();
    this.loadAssembly = function(name, callback) {
        var currentDomain = this;
        var lowerName = name.toLowerCase();
        if(this.assemblies.hasOwnProperty(lowerName)) {
            callback(this.assemblies[lowerName]);
            return;
        }

        Assembly.readAssembly(name, function(data) {
            if(data == undefined) {
                callback(undefined);
            } else {
                callback(createAssembly.call(currentDomain, lowerName, data));
            }
        });
    }

    
    var mscorlib = createAssembly.call(this, "mscorlib", null);
    mscorlib.nativeLib = new MscorlibAssembly();    

    function createAssembly(name, clrData) {
        var assemby = new Assembly.InitAssembly(this, name, clrData);
        this.assemblies[name] = assemby;
        return assemby;
    }
}

module.exports = AppDomain;
