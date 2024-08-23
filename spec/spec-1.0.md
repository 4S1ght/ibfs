
# IBFS Specification v1.0

1. [Overview](#overview)
    - [Use cases](#use-cases)
2. [Structural design](#structural-design)
    - [File topology](#file-topology)
    - [Sector types](#sector-types)
        - [Root sector](#root-sector)
        - [Head Sector](#head-sector)
    - [Blocks](#blocks)
        - Index blocks
            - Head block
            - Link block
        - Storage block
            - Storage sector
3. Operational details
    - 

# Overview
IBFS (Indirect-block filesystem) is a fully custom 64-bit filesystem designed specifically to
provide a virtualization layer for any software that needs to expose filesystem access over the
network, such as self-hosted file servers, network attached storage, upload sites and anything else
that requires user-provided data and may benefit from extra security against directory traversal,
file inclusion or arbitrary file upload attacks.

> **Note:** This specification will evolve alongside the project and is subject to change. Currently
it's not as much of a specification as it is a form of organizing the plethora of structures,
patterns and mechanics used by the filesystem.

## Use cases
The main use cases for the IBFS filesystem are network file sharing and hosting. The virtualized
nature of the filesystem isolates the physical host filesystem from consumers and greatly reduces
the surface of many types of attacks.

# Structural design
IBFS is a filesystem utilizing a hybrid model that combines unrolled-linked-list and FAT-like
allocation table patterns. This design balances real world performance with the difficulty of
implementation.

## File topology
At a high level each file and directory consists of a chain of [index blocks](#index-blocks) linked
together in an unrolled-linked-list pattern - each of the blocks containing a list of sector
addresses pointing to the first sector of a [storage block](#storage─block).
```
┌──────────────────┬─────────────────[ IBFS file topology ]────────────────────────────────────┐
│                  │                                                                           │
│                  │ ╔════════════╗     ┌────────────┐     ┌────────────┐                      │
│  Index blocks    │ ║ Head block ║ ──> │ Link block │ ──> │ Link block │ ──────────────> ...  │
│                  │ ╚════════════╝     └────────────┘     └────────────┘                      │
│                  │   │                  │                      └┐                            │
├──────────────────┤   ├─────────> ...    ├──────────────────┬────│─────────────────────> ...  │
│                  │   │                  │                  │   ┌┘        │                   │
│                  │   V                  V                  V   │         V                   │
│                  │ ┌───────────────┐  ┌───────────────┐┌───────────────┐┌───────────────┐    │
│  Storage blocks  │ │ Storage block │  │ Storage block ││ Storage block ││ Storage block │    │
│                  │ └───────────────┘  └───────────────┘└───────────────┘└───────────────┘    │
│                  │                                             │                             │
│                  │                                             ├────────────────┬─────> ...  │
│                  │                                             V                V            │
│                  │                                     ┌───────────────┐┌───────────────┐    │
│  Storage blocks  │                                     │ Storage block ││ Storage block │    │
│                  │                                     └───────────────┘└───────────────┘    │
│                  │                                                                           │ 
└──────────────────┴───────────────────────────────────────────────────────────────────────────┘
```
ś
# Sector types
Unlike general in terms used to describe physical filesystems, "sector" and "block" do not hold the
same meaning in regard to IBFS as they do in more widely known physical filesystems. Traditional
filesystems distinguish blocks as the most atomic logical unit of data that's read from or written
to the disk. IBFS being a virtual filesystem does not operate directly on a physical medium composed
of sectors. Each IBFS "volume" is its own virtual disk living inside consists of a file located on
the host's filesystem. This file is the divided into sectors of specific size (known in general
terms "block size"), such as 1 or 2 kiB. These sectors are then grouped logically into what IBFS
knows as a "[blocks](#blocks)".

IBFS makes use of multiple sector types, which are `root`, `head`, `link`, `storage` and `raw`
sectors. all of which are constructed according to their purposes.

## Root sector
The root sector stores all crucial filesystem metadata necessary for mounting and operation. Most
importantly, it holds the root directory address and cryptographic metadata used to verify
decryption keys, effectively serving as the entry point into the filesystem.

**Root sector size**  
The maximum safely usable space inside the root sector is equal to the minimum sector size allowed
by the specification ─ **1024 bytes.**. The actual size of the root sector may be larger, depending
on sector size configured.

**Encryption & Data safety**  
The root sector, along with the root metadata block are the only regions that do not undergo
encryption and therefore absolutely no sensitive data should be stored inside them.

```
Size │ Type  │ Description
─────┼───────┼────────────────────────────────────────────────────────────────
2B   │ Int16 │ Major spec version the volume is compliant with.
2B   │ Int16 │ Minor version
─────┼───────┼────────────────────────────────────────────────────────────────
4B   │ Int32 │ Specifies size of individual sectors in the volume. Allowed 
     │       │ values are 1, 2, 4, 8, 16 and 32 kiB respectively, although 
     │       │ the implementation does allow for arbitrary values that fit
     │       │ within the 1-32kiB range.
─────┼───────┼────────────────────────────────────────────────────────────────
8B   │ Int64 │ Address of the root directory.
─────┼───────┼────────────────────────────────────────────────────────────────
2B   │ Int16 │ AES encryption type used. Allowed values are:
     │       │ 0   - No encryption is used.
     │       │ 128 - Using AES/XTS 128-bit encryption.
     │       │ 256 - Using AES/XTS 256-bit encryption.
─────┼───────┼────────────────────────────────────────────────────────────────
16B  │ Raw   │ AES/XTS initialization vector
     │       │
     │       │ Note:
     │       │ Due to the native NodeJS crypto module's lack of API for
     │       │ manipulating tweak values for individual sectors, this
     │       │ reference implementation uses only the first first 8 bytes of 
     │       │ the IV together with a 64-bit sector address to emulate 
     │       │ individual sector tweaks.
     │       │  ─ Although with lower resulting encryption strength.
─────┼───────┼────────────────────────────────────────────────────────────────
16B  │ Raw   │ AES/XTS key check - 16 null bytes encrypted with the original
     │       │ key. This region is copied, the copy is decrypted and checked
     │       │ again for 16 null bytes to verify the correct AES key was used
     │       │ to access the volume.
─────┼───────┼────────────────────────────────────────────────────────────────
8B   │ Int64 │ Sector count - Total number of sectors inside the volume.
     │       │ This value must be set when creating/resizing volumes in order
     │       │ to serve as one of multiple volume integrity checks.
─────┼───────┼────────────────────────────────────────────────────────────────
2B   │ Int16 │ Metadata block size - The number of sectors following the 
     │       │ root sector allocated specifically to store arbitrary 
     │       │ JSON metadata used by the filesystem drivers to store
     │       │ configuration, user settings, debug information, etc.
     │       │ This value is dependant on volume's sector size, but must
     │       │ guarantee to amount to a minimum of 1 MiB usable space.
─────┴───────┴────────────────────────────────────────────────────────────────

Remaining space up to the 1024th byte is left empty, reserved for future 
changes and additions. The actual size of the sector depends on the 
padding applied to fit the set sector size.
```

## Head sector
A head sector is the starting sector inside a [head block](#head-block), which itself is the
starting block in a chain of index blocks mapping out file data.
