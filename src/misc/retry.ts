/**
 * Calls the callback `fn` and retries a given number of times if it throws an error.
 * If the error is thrown more times than the number of allowed `retries` it's thrown outwards to be caught by the caller.
 * @param fn Callback that's to be called
 * @param retries Number of retries (default: 3)
 * @returns The result of the callback
 */
export default async function retry<T>(fn: () => Promise<T> | T, retries = 3): Promise<T> {

    let attempt = 0
    let result: T

    while (attempt < retries) {
        try {
            result = await fn()
        } 
        catch (error) {
            attempt++
            if (attempt >= retries) throw error
        }
    }

    return result!

}