export default class Time {

    /** Returns the current timestamp in seconds. */
    public static now() {
        return Math.floor(Date.now() / 1000)
    }

}