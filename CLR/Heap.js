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
        var newHeap = new Uint8Array(newSize);
        newHeap.set(this._Heap)
        this._Heap = newHeap;

        var lastBlockBoundary = this.readInt(oldSize - 4);

        if (lastBlockBoundary <= 0) {
            lastBlockBoundary = Math.abs(lastBlockBoundary);
            /**
             * xx xx xx xx 00 00 00 00 ... 00 00 00 00 xx xx xx xx
             * 
             * That was a block of free memory, so we 
             *   need to adjust its size.
             */
            var newBlockBeginning = oldSize - lastBlockBoundary;
            var newBlockSize = this._Heap.length - newBlockBeginning;

            this.writeInt(newBlockBeginning, -newBlockSize);
            this.writeInt(newBlockBeginning + newBlockSize - 4, -newBlockSize);
        } else {
            /** 
             * xx xx xx xx 01 23 45 67 ... AB CD EF F0 xx xx xx xx
             * 
             * That was an allocated block, we need
             *  to add new block at the end of buffer.
             */          
            var newBlockSize = newSize - oldSize;
            this.writeInt(oldSize, -newBlockSize);
            this.writeInt(oldSize + newBlockSize - 4, -newBlockSize);
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
     * Searches for a free block of memory with sufficient size.
     * 
     * Returns either an object which consist of block size and its position or null is there are no free blocks.
     */
    this._findBlock = function (size) {
        var pos = 0;
        while (pos < this._Heap.length) {
            var blockSize = this.readInt(pos);
            if (blockSize < 0) {
                if (!size || Math.abs(blockSize) - 8 >= size) {
                    return {size : Math.abs(blockSize), position: pos};
                }
            }

            pos += Math.abs(blockSize);
        }

        return null;
    }

    /**
     * Mark some chunk of memory as used.
     * 
     * Returns an index of the block data section.
     */
    this.alloc = function (size) {
        var newBlockSize = size + 8;
        /**
        * Rounding up to the nearest power of two.
        */
        newBlockSize--;
        newBlockSize |= newBlockSize >> 1;
        newBlockSize |= newBlockSize >> 2;
        newBlockSize |= newBlockSize >> 4;
        newBlockSize |= newBlockSize >> 8;
        newBlockSize |= newBlockSize >> 16;
        newBlockSize++;

        var block = this._findBlock(newBlockSize);

        if (block) {
             // Split found block in two, one for the data and 
             //   one for remaining free space.

            this.writeInt(block.position, newBlockSize);
            this.writeInt(block.position + newBlockSize - 4, newBlockSize);

            var freeSpace = block.size - newBlockSize;

            if (freeSpace > 8) {
                // Create new block for the remaining free space.
                this.writeInt(block.position + newBlockSize, -freeSpace);
                this.writeInt(block.position + newBlockSize + freeSpace - 4, -freeSpace);
            } else if (freeSpace == 8) {
                // Create empty block record
                this.writeInt(block.position + newBlockSize, -8);
                this.writeInt(block.position + newBlockSize + 4, -8);
            } else {
                throw "WTF??";
            }

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
        var blockBeginning = offset - 4;
        var beginMarker = this.readInt(blockBeginning);
        if (beginMarker < 0) {
            /**
             * Oooops, it looks like something went wrong.
             */
            throw "Attempting to run free() on unallocated chunk of memory";
        }

        var endMarker = this.readInt(blockBeginning + beginMarker - 4);

        if (endMarker != beginMarker) {
            /**
             * A valid block should be surrounded by two identical metadata records.
             */
            throw "Invalid block metadata record";
        }

        this.writeInt(blockBeginning, -beginMarker);
        this.writeInt(blockBeginning + beginMarker - 4, -beginMarker);
    }

    /**
     * Garbage collector routine.
     */
    this._gc = function () {
        /*
         * Simplest and ugliest garbage collector which ever has been written. 
         */

        var pos = 0;
        var freeBlocks = [];
        while (pos < this._Heap.length) {
            var blockSize = this.readInt(pos);
            if (blockSize < 0) {
                freeBlocks.push({size : Math.abs(blockSize), position: pos});
            } else {
                if (freeBlocks.length >= 2) {
                    for (var n = 0; n < freeBlocks.length; ++n) {
                        console.log(freeBlocks[n]);
                    }

                    var mergedBlockSize = freeBlocks[freeBlocks.length - 1].size + (freeBlocks[freeBlocks.length - 1].position - freeBlocks[0].position);
                    this.writeInt(freeBlocks[0].position, -mergedBlockSize);
                    this.writeInt(freeBlocks[freeBlocks.length - 1].position + freeBlocks[freeBlocks.length - 1].size - 4, -mergedBlockSize);
                    
                } else {
                    freeBlocks.length = 0;
                }
                // console.log('---------');
            }

            pos += Math.abs(blockSize);
        }
    }

    /**
     * New heap is a block of 1024 bytes 
     * which is surrounded by 4 byte chunks of metadata.
     */ 
    this._Heap = new Uint8Array(1024 + 8);
    
    /**
     * Fill the block metadata. 
     * 
     * Basically, block metadata is presented by a block length markers 
     *  at the beginning and the end of block. Negative integer means that 
     *  block is free, available for allocation.
     */
    this.writeInt(0, -this._Heap.length);
    this.writeInt(this._Heap.length - 4, -this._Heap.length);

    // var thisHeap = this;
    // setInterval(function () { thisHeap._gc.call(thisHeap) }, 100);
}

module.exports = Heap;
