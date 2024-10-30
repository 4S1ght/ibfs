interface TWEvent {
    expiration: number,
    callback: () => any
}

/**
 * Manages the revocation of lended sector addresses.
 * 
 * **Note**  
 * This class is here specifically to avoid creating thousands of timeouts
 * as batches of sector addresses are lended to the driver, as it would
 * quickly clog up the event loop.
 */
export default class TimeWheel {

    private bucketCount: number
    private currentBucket: number
    private interval: number
    private buckets: Array<TWEvent[]>
    private declare timer: NodeJS.Timeout

    constructor(bucketCount = 10, interval = 500) {
        this.bucketCount = bucketCount
        this.currentBucket = 0
        this.interval = interval
        this.buckets = Array.from({ length: bucketCount }, () => [])
        this.start()
    }

    /** Starts the time wheel. */
    public start() {
        this.timer = setInterval(() => this.tick(), this.interval)
    }

    /** Stops the time wheel */
    public stop() {
        clearInterval(this.timer)
    }

    /**
     * Adds an event to the time wheel.
     * @param timeout eviction timeout (in `ms`)
     * @param callback callback called on eviction.
     */
    public add(timeout: number, callback: () => any) {
        const expirationTime = Date.now() + timeout
        const bucket = (this.currentBucket + Math.floor(timeout / this.interval)) % this.bucketCount
        this.buckets[bucket]!.push({ expiration: expirationTime, callback });
    }

    /**
     * Ticks over the buckets and times out expired events.
     */
    private tick() {

        // Holds items that have not yet expired.
        const stash: TWEvent[] = []
        const bucket = this.buckets[this.currentBucket]!

        while (bucket.length > 0) {
            const item = bucket.pop()!
            if (item.expiration < Date.now()) {
                item.callback()
            }
            else {
                stash.push(item)
            }
        }

        this.buckets[this.currentBucket] = stash
        this.currentBucket = (this.currentBucket + 1) % this.bucketCount;

    }

}