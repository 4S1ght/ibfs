// Block IO Queue

import type * as T from "../../types.js"
import IBFSError from "../errors/IBFSError.js"

// Types ==========================================================================================

type TLockCallback = (next: () => void) => void

/** A temporary lock guarding filesystem I/O. */
export interface TTemporaryLock {
    release: () => T.XEavS<"L0_IO_TIMED_OUT">
}

export interface TLockOptions {
    /** 
     * The time after which the temporary lock will be timed out and the next item will be processed. 
     * @default 3000ms
     */
    timeout?: number
}

// Exports ========================================================================================

export default class BlockIOQueue {
    
    private queue: TLockCallback[] = []
    private ongoing = false

    public acquireTemporaryLock(options?: TLockOptions) {
        return new Promise<TTemporaryLock>(grant => {

            this.queue.push((next) => {

                const grantedAt = Date.now()
                const timeout = setTimeout(() => next(), options?.timeout || 3000)
                const hasExpired = () => Date.now() - grantedAt > (options?.timeout || 3000)

                grant({
                    release: () => {
                        const expired = hasExpired()
                        if (expired) {
                            return new IBFSError('L0_IO_TIMED_OUT')
                        }
                        else {
                            clearTimeout(timeout)
                            next()
                        }
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

        if (this.ongoing) return
        this.ongoing = true

        let i = 0

        while (i < this.queue.length) {
            await new Promise<void>($continue => {
                const thisTurnHandler = this.queue[i]!
                thisTurnHandler($continue)
            })
            i++
        }

        this.ongoing = false
        this.queue = []

    }

}