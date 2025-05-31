import { Readable, Writable } from "stream";

/**
 * Resolves after the stream is finished, rejects on stream error.
 * @param stream Readable, Writable or their extensions.
 */
export default function streamFinish(stream: Readable | Writable): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            stream.off('finish', onDone)
            stream.off('end', onDone)
            stream.off('close', onDone)
            stream.off('error', onError)
        }

        const onDone = () => {
            cleanup()
            resolve()
        }

        const onError = (err: Error) => {
            cleanup()
            reject(err)
        }

        // Writable
        stream.once('finish', onDone)

        // Readable
        stream.once('end', onDone)

        // Fallbacks
        stream.once('close', onDone)
        stream.once('error', onError)
    })
}
