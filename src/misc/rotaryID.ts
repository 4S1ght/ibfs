
/**
 * Returns a generator yielding incrementing numbers in a given range (1 to `range`).  
 * This method is used mainly to generate operation IDs for recursive deletes.
 */
export default function *createRotaryID(range: number): Generator<number> {
    
    let current = 0

    while (true) {
        yield current + 1
        current = (current + 1) % range
    }

}