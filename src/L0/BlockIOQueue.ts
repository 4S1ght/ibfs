// Block IO Queue

// Types ==========================================================================================

type TTurnCallback = (next: () => void) => void

export interface TBlockIOTurn {
    end: () => void
}

// Exports ========================================================================================

export default class BlockIOQueue {
    
    private queue = []

    public acquireLock() {

    }

    private cycle() {

    }


}

const b = new BlockIOQueue()
const releaseLock = await b.acquireLock()
releaseLock()