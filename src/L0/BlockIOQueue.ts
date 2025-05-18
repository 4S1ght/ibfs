// Block IO Queue

import type * as T from "../../types.js"
import IBFSError from "../errors/IBFSError.js"

// Types ==========================================================================================

type TLockCallback = (next: () => void) => void

/** A temporary lock guarding filesystem I/O. */
export interface TTemporaryLock {
    /** Releases the lock and triggers the next I/O operation (unless expired). */
    release: () => T.XEavS<"L0_IO_TIMED_OUT">
    /** Is set to `true` if the lock has expired and `false` otherwise. */
    readonly stale: boolean
}

export interface TLockOptions {
    /** 
     * The time after which the temporary lock will be timed out and the next item will be processed. 
     * @default 3000ms
     */
    timeout?: number
}

// Exports ========================================================================================

/**
 * An IO queuing class responsible for managing the order of read & write operations.  
 * It ensures only a single read or write operation is happening at a time.   
 * This significantly decreases performance during multi-user access, but is necessary for
 * write safety and block-level atomicity. The main scenarios it's taking care of is 
 * preventing reads of any block that is currently being written to, and preventing multiple 
 * parallel writes that may produce unsafe results due to Node's FileHandle API limitations:
 * 
 * See https://nodejs.org/api/fs.html#filehandlewritestring-position-encoding
 * > "It is unsafe to use filehandle.write() multiple times on the same file without 
 * > waiting for the promise to be fulfilled (or rejected). For this scenario, use 
 * > filehandle.createWriteStream()."
 */
export default class BlockIOQueue {
    
    private queue: TLockCallback[] = []
    public  busy = false

    public acquireTemporaryLock(options?: TLockOptions) {
        return new Promise<TTemporaryLock>(grant => {

            this.queue.push((next) => {

                const grantedAt = Date.now()
                const timeout = setTimeout(() => next(), options?.timeout || 3000)
                const hasExpired = () => Date.now() - grantedAt > (options?.timeout || 3000)

                grant({
                    get stale() { return hasExpired() },
                    release: () => {
                        if (hasExpired()) return new IBFSError('L0_IO_TIMED_OUT')
                        clearTimeout(timeout)
                        next()
                    }
                })
                
            })

            this.cycle()

        })
    }

    /** 
     * Cycles through the queued items.
     */
    private async cycle() {

        if (this.busy) return
        this.busy = true

        let i = 0

        // A more complicated while loop is used here instead of passing
        // a "next" callback to the release handler due to max callstack errors
        // being thrown when a very long-running I/O operation is maintained.
        // This approach does not push onto the stack and is therefore safer
        // against long-running threads.
        while (i < this.queue.length) {
            await new Promise<void>($continue => {
                const thisTurnHandler = this.queue[i]!
                thisTurnHandler($continue)
            })
            i++
        }

        this.busy = false
        this.queue = []

    }

}