// Block IO Queue

import type * as T from "../../types.js"
import IBFSError from "../errors/IBFSError.js"

// Types ==========================================================================================

type TTurnCallback = (next: () => void) => void

export interface TBlockIOTurn {
    release: () => T.XEavS<"L0_IO_TIMED_OUT">
}

export interface TLockOptions {
    /** 
     * The time after which the temporary lock will be timed out and the next item will be processed. 
     * 
     * @default 3000ms
     */
    timeout?: number
}

// Exports ========================================================================================

export default class BlockIOQueue {
    
    private queue: TTurnCallback[] = []
    private ongoing = false

    public acquireLock(options?: TLockOptions) {
        return new Promise<TBlockIOTurn>(grant => {

            const time = this.createTimer(options && options.timeout)

            this.queue.push((next) => {
                grant({
                    release: () => {
                        if (time.expired) return new IBFSError('L0_IO_TIMED_OUT')
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

        if (this.ongoing) return
        this.ongoing = true

        let i = 0

        while (i < this.queue.length) {
            await new Promise<void>($continue => {
                const thisTurnHandler = this.queue[i]!
                thisTurnHandler($continue)
            })
        }

        this.ongoing = false

    }

    private createTimer(timeout: number = 3000) {
        const start = Date.now()
        return {
            get expired() { return Date.now() - start >= timeout }
        }
    }

}

const b = new BlockIOQueue()
const lock = await b.acquireLock()
lock.release()