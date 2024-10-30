
/**
 * The address stack holds a stack of unallocated sector addresses and manages their allocation.  
 * An address is "lended" by a the program for set amount of time and committed on successful write, 
 * otherwise it's revoked and returned to the stack.
 */
export default class AddressStack {

}