
// Module ==============================================================================================================

export default class MemBlock {

    /**
     * Quick consecutive block search - Returns the first address batch of requested size
     * or the largest overall if a sufficiently large is not found.
     */
    public static quickConsecutiveBlockSearch(source: number[], maxSize = 256) {
        
        type Group = { index: number, items: number[] }

        let maxGroup:     Group = { index: 0, items: [] }
        let currentGroup: Group = { index: 0, items: [source[0]!] }

        for (let i = 1; i < source.length; i++) {
            if (source[i] === source[i - 1]! + 1) {
                currentGroup.items.push(source[i]!)
                if (currentGroup.items.length === maxSize) {
                    maxGroup = currentGroup
                    break
                }
            }
            else {
                if (currentGroup.items.length > maxGroup.items.length) {
                    maxGroup = currentGroup
                }
                currentGroup = { index: i, items: [source[i]!] }
            }            
        }

        return maxGroup

    }

    /**
     * Slow consecutive block search - Returns an address batch closest to matching the requested size.
     * This operation scans the entire source array and may yield slowly, use `quickConsecutiveBlockSearch`
     * if write speeds are of the upmost importance.
     * @throws (not implemented)
     */
    slowConsecutiveBlockSearch(source: number[], maxSize = 256) {
        throw new Error('Not implemented')
    }

}