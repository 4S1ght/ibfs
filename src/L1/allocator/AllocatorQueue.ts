// Imports =============================================================================================================

import EventEmitter from "node:events"

// Types ===============================================================================================================

type NextTurn = () => void
type TurnCallback = (next: NextTurn) => void

/** 
 * Allocator queue turn. Represents a kind of short-timed "lock" on the address stack 
 * within which the stack can lend/retrieve an address to/from a part of the driver 
 */
export interface Turn {
    end: () => void
}

// Module ==============================================================================================================

export default interface AllocatorQueue {
    on(event: 'idle', listener: () => any): this
}
export default class AllocatorQueue extends EventEmitter {

    private currentTurn = -1
    private pending = false
    private queue: TurnCallback[] = []

    constructor() {
        super()
    }

    public newTurn = (timeout: number|null = 5000) => new Promise<Turn>((resolve) => {

        let resolved = false

        this.queue.push(next => {

            if (timeout) setTimeout(() => {
                if (!resolved) {
                    resolved = true
                    next()
                }
            }, timeout)

            resolve({
                end: () => {
                    if (!resolved) {
                        resolved = true
                        next()
                    }
                }
            })

        })

        if (!this.pending) {
            this.pending = true
            this.loop()
        }

    })
    
    private loop() {
        const callback = this.queue[this.currentTurn++]
        if (callback) {
            callback(this.loop)
        }
        else {
            this.pending = false
            this.currentTurn = -1
            this.emit('idle')
        }
    }

    
}


async function test() {

    const queue = new AllocatorQueue()

    const turn = await queue.newTurn()
    // do something async
    turn.end()

}