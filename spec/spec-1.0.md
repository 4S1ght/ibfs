
# IBFS Specification v1.0

1. [Overview](#overview)
    - [Use cases](#use-cases)
2. [Structural design](#structural-design)
    - Root sector & volume metadata
    - Index blocks
        - Head block
        - Link block
    - Storage block
3. Operational details
    - Address pools
    - Sector allocation
    - Directories
        - Directory permissions

# Overview
IBFS (Indirect-block filesystem) is a fully custom filesystem designed specifically to provide a virtualization layer for any software that needs to expose filesystem access to the local network, such as self-hosted file servers, network attached storage, upload sites and anything else that requires user-provided data and may benefit from extra security against directory traversal, file inclusion or arbitrary file upload attacks.

> **Note:** This specification will evolve alongside the project and is subject to change.
Currently it's not as much of a specification as it is a form of organizing the plethora of structures, patterns and mechanics used by the filesystem.

## Use cases
The main use cases for the IBFS filesystem are network file sharing and hosting.
The virtualized nature of the filesystem isolates the physical host filesystem from consumers and greatly reduces the surface of many types of attacks.

# Structural design
IBFS is a 64-bit filesystem utilizing a hybrid model that combines unrolled-linked-list and FAT-like allocation table patterns.
At a high level each file and directory consists of a chain of [index blocks](#index-blocks) linked together in an unrolled-linked-list pattern - each of the blocks containing a list of sector addresses pointing to the first sector of a [storage block](#storage-block).

## Root sector
The root sector stores all crucial filesystem metadata necessary for mounting and operation.
Most importantly, it holds the root directory address and cryptographic metadata used to verify decryption keys necessary to operate on the volume if encryption is enabled.

**Sector size**  
The maximum safely usable space inside the root sector is equal to the minimum sector size allowed by the specification - **1024 bytes.**

**Encryption & Data safety**  
The root sector, along with the root metadata block are the only regions that do not undergo encryption and therefore absolutely no sensitive data should be stored inside them.
```
Size | Type  | Description
-----|-------|----------------------------------------------------------------
2B   | Int16 | Major spec version the volume is compliant with.
2B   | Int16 | Minor version
-----|-------|----------------------------------------------------------------
4B   | Int32 | Specifies size of individual sectors in the volume. Allowed 
     |       | values are 1, 2, 4, 8, 16 and 32 kiB respectively, although 
     |       | the implementation does allow for arbitrary values that fit
     |       | within the 1-32kiB range.
-----|-------|----------------------------------------------------------------
8B   | Int64 | Address of the root directory.
-----|-------|----------------------------------------------------------------
2B   | Int16 | AES encryption type used. Allowed values are:
     |       | 0   - No encryption is used.
     |       | 128 - Using AES/XTS 128-bit encryption.
     |       | 256 - Using AES/XTS 256-bit encryption.
-----|-------|----------------------------------------------------------------
16B  | Raw   | AES/XTS initialization vector
     |       |
     |       | Note:
     |       | Due to the native NodeJS crypto module's lack of API for
     |       | manipulating tweak values for individual sectors, this
     |       | reference implementation uses only the first first 8 bytes of 
     |       | the IV together with a 64-bit sector address to emulate 
     |       | individual sector tweaks.
     |       |  - Although with lower resulting encryption strength.
-----|-------|----------------------------------------------------------------
16B  | Raw   | AES/XTS key check - 16 null bytes encrypted with the original
     |       | key. This region is used to verify whether the correct 
     |       | encryption key is used whenever a user wants to access the 
     |       | volume's content.
-----|-------|----------------------------------------------------------------
8B   | Int64 | Sector count - Total number of sectors inside the volume.
     |       | This value must be set when creating/resizing volumes in order
     |       | to serve as one of multiple volume integrity checks.
-----|-------|----------------------------------------------------------------
2B   | Int16 | Metadata block size - The number of sectors following the 
     |       | root sector allocated specifically to store arbitrary 
     |       | JSON metadata used by the filesystem drivers to store
     |       | configuration, user settings, debug information, etc.
     |       | This value is dependant on volume's sector size, but must
     |       | guarantee to amount to a minimum of 1 MiB usable space.
```