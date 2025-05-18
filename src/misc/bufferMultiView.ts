export function createBufferMultiview(buffer: Buffer, chunkSize: number, firstChunkSize = chunkSize) {
    const chunks = []
    let offset = 0

    // Always return a firstChunk, even if zero-length
    const firstChunk = buffer.subarray(0, firstChunkSize)
    offset = firstChunkSize

    // Push full-sized chunks
    while (offset + chunkSize <= buffer.length) {
        chunks.push(buffer.subarray(offset, offset + chunkSize))
        offset += chunkSize
    }

    // Optional lastChunk if there's remaining data
    const lastChunk = offset < buffer.length ? buffer.subarray(offset) : undefined

    return { firstChunk, chunks, lastChunk }
}