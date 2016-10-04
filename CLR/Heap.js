const Int64 = require('int64-native').Int64;

var Heap = function () {

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

        var lastBlockBoundary = this.readInt32(oldSize - 4);

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

            this.writeInt32(newBlockBeginning, -newBlockSize);
            this.writeInt32(newBlockBeginning + newBlockSize - 4, -newBlockSize);
        } else {
            /** 
             * xx xx xx xx 01 23 45 67 ... AB CD EF F0 xx xx xx xx
             * 
             * That was an allocated block, we need
             *  to add new block at the end of buffer.
             */          
            var newBlockSize = newSize - oldSize;
            this.writeInt32(oldSize, -newBlockSize);
            this.writeInt32(oldSize + newBlockSize - 4, -newBlockSize);
        }
    }

    this.readByte = function (offset) {
        return this._Heap[offset];
    }

    this.writeByte = function (offset, value) {
        this._Heap[offset] = value & 0xFF;
    }

    /**
     * Read 16 bit integer
     */
    this.readInt16 = function (offset) {
        return this._Heap[offset] | (this._Heap[offset + 1] << 8);
    }

    /**
     * Write 16 bit integer
     */
    this.writeInt16 = function (offset, value) {
        this._Heap[offset] = value & 0xFF;
        this._Heap[offset + 1] = value >> 8;
    }

    /**
     * Read 32 bit integer 
     */
    this.readInt32 = function (offset){
        return this._Heap[offset] | (this._Heap[offset + 1] << 8) | (this._Heap[offset + 2] << 16) | (this._Heap[offset + 3] << 24);
    }

    /**
     * Write 32 bit integer
     */
    this.writeInt32 = function (offset, value) {
        this._Heap[offset]     = value & 0xFF;
        this._Heap[offset + 1] = (value >> 8) & 0xFF;
        this._Heap[offset + 2] = (value >> 16) & 0xFF;
        this._Heap[offset + 3] = (value >> 24) & 0xFF;
    }

    /**
     * Read 64 bit integer
     */
    this.readInt64 = function (offset) {
        var bytes = this._Heap.slice(offset, offset + 8);
        return new Int64(Array.from(bytes));
    }

    /**
     * Write 64 bit integer
     */
    this.writeInt64 = function (offset, value) {
        var bytes = value.toBytes();
        this._Heap.set(bytes, offset);
    }

    this.fill = function (offset, size, value) {
        for (var n = offset; n < offset + size; ++n) {
            this._Heap[n] = value;
        }
    }

    /**
     * Searches for a free block of memory with sufficient size.
     * 
     * Returns either an object which consist of block size and its position or null is there are no free blocks.
     */
    this._findBlock = function (size) {
        var pos = 0;
        while (pos < this._Heap.length) {
            var blockSize = this.readInt32(pos);
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

            this.writeInt32(block.position, newBlockSize);
            this.writeInt32(block.position + newBlockSize - 4, newBlockSize);

            var freeSpace = block.size - newBlockSize;

            if (freeSpace > 8) {
                // Create new block for the remaining free space.
                this.writeInt32(block.position + newBlockSize, -freeSpace);
                this.writeInt32(block.position + newBlockSize + freeSpace - 4, -freeSpace);
            } else if (freeSpace == 8) {
                // Create empty block record
                this.writeInt32(block.position + newBlockSize, -8);
                this.writeInt32(block.position + newBlockSize + 4, -8);
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
        var beginMarker = this.readInt32(blockBeginning);
        if (beginMarker < 0) {
            /**
             * Oooops, it looks like something went wrong.
             */
            throw "Attempting to run free() on unallocated chunk of memory";
        }

        var endMarker = this.readInt32(blockBeginning + beginMarker - 4);

        if (endMarker != beginMarker) {
            /**
             * A valid block should be surrounded by two identical metadata records.
             */
            throw "Invalid block metadata record";
        }

        this.writeInt32(blockBeginning, -beginMarker);
        this.writeInt32(blockBeginning + beginMarker - 4, -beginMarker);
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
            var blockSize = this.readInt32(pos);
            if (blockSize < 0) {
                freeBlocks.push({size : Math.abs(blockSize), position: pos});
            } else {
                if (freeBlocks.length >= 2) {
                    for (var n = 0; n < freeBlocks.length; ++n) {
                        console.log(freeBlocks[n]);
                    }

                    var mergedBlockSize = freeBlocks[freeBlocks.length - 1].size + (freeBlocks[freeBlocks.length - 1].position - freeBlocks[0].position);
                    this.writeInt32(freeBlocks[0].position, -mergedBlockSize);
                    this.writeInt32(freeBlocks[freeBlocks.length - 1].position + freeBlocks[freeBlocks.length - 1].size - 4, -mergedBlockSize);
                    
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
    this.writeInt32(0, -this._Heap.length);
    this.writeInt32(this._Heap.length - 4, -this._Heap.length);

    // var thisHeap = this;
    // setInterval(function () { thisHeap._gc.call(thisHeap) }, 100);
}

module.exports = Heap;
