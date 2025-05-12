# Possible optimizations and improvements

### FBM reuse on reads
If a file is opened in read mode, it's guaranteed its block map won't change.
That handle's FBM instance can be cached in a global share and reused on any
subsequent reads significantly reducing memory footprint of open files.

### FBM caching
Cache frequently or recently open FBM's in memory to speed up subsequent reads.

### Read batching
When streaming data from the disk, any adjisoned blocks can be read from the
disk in a batch which cuts down on latency between each individual read.
- Latency that is especially exaggerated when using volume encryption.
