
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
Main use cases for the IBFS filesystem are network file sharing and hosting.
The virtualized nature of the filesystem isolates the physical host filesystem from consumers and greatly reduces the surface of many types of attacks.

# Structural design
IBFS is a 64-bit filesystem utilizing a hybrid model that combines unrolled-linked-list and FAT-like allocation table patterns.
At a high level each file and directory consists of a chain of [index blocks](#index-blocks) linked together in an unrolled-linked-list pattern - each of the blocks containing a list of sector addresses pointing to the first sector of a [storage block](#storage-block).

## Root sector
The root sector stores all crucial filesystem metadata necessary for mounting and operation.
Most importantly, it holds a root directory address and cryptographic metadata used to verify decryption keys necessary to operate on the volume if volume encryption is enabled.
```
Size | Type   | Description
-----|--------|----------------------------------------------------------------
4B   | Int32  | Specifies size of individual sectors in the volume. Allowed 
     |        | values are 1, 2, 4, 8, 16 and 32 kiB respectively, although 
     |        | the implementation does allow for arbitrary values.
-----|--------|----------------------------------------------------------------
2B   | Int16  | Major driver version used to create the archive.
-----|--------|----------------------------------------------------------------
2B   | Int16  | Minor -//-
-----|--------|----------------------------------------------------------------
2B   | Int16  | Patch -//-
-----|--------|----------------------------------------------------------------
8B   | Int32  | Root directory pointer
-----|--------|----------------------------------------------------------------
1B   | Int8   | Comment chars
-----|--------|----------------------------------------------------------------
64B  | String | Comment (single-byte chars only)
-----|--------|----------------------------------------------------------------
2B   | Int16  | AES key size used, 0 = no encryption.
-----|--------|----------------------------------------------------------------
8B   | Binary | AES/XTS initialization vector
-----|--------|----------------------------------------------------------------
1B   | Int8   | Block size
-----|--------|----------------------------------------------------------------
8B   | Int64  | Volume size
-----|--------|----------------------------------------------------------------
16B  | Binary | AES/XTS key validity check.
-----|--------|----------------------------------------------------------------
```