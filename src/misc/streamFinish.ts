import { Readable, Writable } from "stream";

/**
 * Resolves after the stream is finished, rejects on stream error.
 * @param stream Readable, Writable or their extensions.
 */
export default function streamFinish(stream: Readable | Writable) {
    return new Promise<void>((resolve, reject) => {
        stream.once('finish', () => resolve())
        stream.once('close', () => resolve())
        stream.once('error', (error) => reject(error))
    })
}