// Imports =============================================================================================================

import EventEmitter from "node:events"

// Types ===============================================================================================================

type NextTurn = () => void
type TurnCallback = (next: NextTurn) => void

interface Turn {
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

        this.on
    }

    public newTurn = (timeout: number|null = 5000) => new Promise<Turn>((resolve) => {
        this.turn((next) => {

            let resolved = false

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
    })

    private turn(callback: TurnCallback) {
        this.queue.push(callback)
        if (!this.pending) {
            this.pending = true
            this.loop()
        }
    } 

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