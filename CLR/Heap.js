var Heap = function() {

    /**
     * Increase heap size
     */
    this._expand = function (newSize) {
        var oldSize = this._Heap.length;

        if (newSize < oldSize) {
            newSize += oldSize;
        }

        /**
         * Rounding up to the nearest power of two.
         */
        newSize--;
        newSize |= newSize >> 1;
        newSize |= newSize >> 2;
        newSize |= newSize >> 4;
        newSize |= newSize >> 8;
        newSize |= newSize >> 16;
        newSize++;

        /**
         * Allocate new buffer which size is enough to contain
         *  the current buffer and metadata. 
         */
        var newHeap = new Uint8Array(newSize + 8);
        newHeap.set(this._Heap)
        this._Heap = newHeap;

        var lastBlockBoundary = this.readInt(oldSize - 4);

        if (lastBlockBoundary < 0) {
            /**
             * xx xx xx xx 00 00 00 00 ... 00 00 00 00 xx xx xx xx
             * 
             * That was a block of free memory, so we 
             *   need to adjust its size.
             */
            var newBlockBeginning = oldSize - Math.abs(lastBlockBoundary) - 8;
            var newBlockSize = this._Heap.length - oldSize - lastBlockBoundary;

            this.writeInt(newBlockBeginning, -newBlockSize);
            this.writeInt(newBlockBeginning + newBlockSize + 4, -newBlockSize);
        } else {
            /** 
             * xx xx xx xx 01 23 45 67 ... AB CD EF F0 xx xx xx xx
             * 
             * That was an allocated block, we need
             *  to add new block at the end of buffer.
             */          
            var newBlockSize = oldSize - newSize - 8;
            this.writeInt(oldSize, newBlockSize);
            this.writeInt(this._Heap.length - 4, newBlockSize);
        }
    }

    /**
     * Read 32 bit integer 
     */
    this.readInt = function(offset){
        var value = 0;
        for (var n = 0; n < 4; ++n) {     
            value += this._Heap[offset + n];
            if (n < 3) {
                value = value << 8;
            }
        }

        return value;
    }

    /**
     * Write 32 bit integer
     */
    this.writeInt = function(offset, value){
        var n = offset + 4;
        do {
            this._Heap[--n] = value & (255);
            value = value >> 8;
        } while ( n > offset );
    }

    /**
     * Searches for a free block of memory with sufficient size, starting the from provided offset.
     * 
     * Returns either an object which consist of block size and its position or null is there are no free blocks.
     */
    this._findBlock = function (offset, size) {
        var pos = offset;
        while (pos < this._Heap.length) {
            var blockSize = this.readInt(pos);
            if (blockSize < 0) {
                if (!size || (-blockSize) >= (size + 8)) {
                    return {size : Math.abs(blockSize), position: pos};
                }
            }

            pos += (Math.abs(blockSize) + 8);
        }

        return null;
    }

    /**
     * Mark some chunk of memory as used.
     * 
     * Returns an index of the block data section.
     */
    this.alloc = function (size) {
        var block = this._findBlock(0, size);

        if (block) {
             // Split found block in two, one for the data and 
             //   one for remaining free space.

            this.writeInt(block.position, size);
            this.writeInt(block.position + size + 4, size);

            // Create new block for the remaining free space.
            var freeSpace = block.size - size - 8;
            this.writeInt(block.position + size + 8, freeSpace);
            this.writeInt(block.position + size + 8 + freeSpace, freeSpace);

            return block.position + 4;
        } else {
            // Increase heap size and try again.
            this._expand(this._Heap.length + 2 * size);
            return this.alloc(size);
        }
    }

    /**
     * Mark as unused.
     * 
     * Note that real purpose of this operation is to simply negate the block size values. Negative value of block
     *  size is a flag which allows garbage collector to find and merge consequent free blocks into larger one.
     */
    this.free = function (offset) {      
        var beginMarker = this.readInt(offset - 4);
        if (beginMarker < 0) {
            /**
             * Oooops, it looks like something went wrong.
             */
            throw "Attempting to run free() on unallocated chunk of memory";
        }

        var endMarker = this.readInt(offset + beginMarker + 4);

        if (endMarker != beginMarker) {
            /**
             * A valid block should be surrounded by two identical metadata records.
             */
            throw "Invalid block metadata record";
        }

        this.writeInt(offset - 4, -beginMarker);
        this.writeInt(offset + Math.abs(beginMarker) + 4, -beginMarker);
    }

    /**
     * Garbage collector routine.
     */
    this._gc = function () {
        // TODO: merge free chunks of memory

        // console.log('GC:', this._Heap.length);
    }

    /**
     * New heap is a block of 1024 bytes 
     * which is surrounded by 4 byte chunks of metadata.
     */ 
    this._Heap = new Uint8Array(16 + 8);
    
    /**
     * Fill the block metadata. 
     * 
     * Basically, block metadata is presented by a block length markers 
     *  at the beginning and the end of block. Negative integer means that 
     *  block is free, available for allocation.
     */
    this.writeInt(0, -this._Heap.length + 8); 
    this.writeInt(this._Heap.length - 4, -this._Heap.length + 8);

    // var thisHeap = this;
    // setInterval(function () { thisHeap._gc.call(thisHeap) }, 100);
}

var h = new Heap();

var v = h.alloc(8);
var w = h.alloc(64);

console.log(h._Heap.slice(h._Heap.length - 16, h._Heap.length));


