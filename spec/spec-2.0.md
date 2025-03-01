# IBFS Core Specification (v2)
This document describes the specification version 2.0 as of December 24 or 2024.

# Overview
IBFS (Indirect Block File System) is a 64-bit virtual filesystem designed with strict focus on 
security and low implementation complexity. The primary purpose of this project is to provide an 
easy to implement security layer for network file sharing services through **virtualization**, 
native **encryption** and fine-grained **directory-scoped permissions**.

**Note:** The IBFS v2 specification is subject to minor changes and clarification as new issues and
inconsistencies are discovered.

## Use cases
The main use case for IBFS is providing a layer of security for network storage solutions
by separating user content and filesystem operation from the host machine through virtualization and
protecting against unauthorized access through native encryption. The virtualized nature greatly 
reduces the risks associated with native filesystem access by effectively removing the surface of 
many types of attacks such as directory traversal which could be combined with file injection to 
achieve remote code execution - if server authentication and/or path sanitization are not 
implemented correctly or compromised.

The additional side effect of virtualization is easier implementation of disk management and 
allocation - storage space does not need to be resized and formatted using native utilities that 
differ greatly between operating environments both in terms of supported formats and their APIs.

## Scope
The core IBFS v2 specification covers primarily the physical data layout in order to allow for 
intercompatibility between different driver implementations, but is not strictly limited to it.  
The scope covers:

- [IBFS disk file](#ibfs-disk-file)
    - [Physical data layout](#physical-data-layout) - Forms the foundation of the filesystem, these 
      include:
        - [filesystem root](#filesystem-root) - Critical filesystem settings & information.
        - [Driver metadata](#driver-metadata) - Arbitrary driver configuration
        - [head blocks](#head-block) - Roots of every filesystem structure.
        - [Link blocks](#link-block) - N'th link following a root block.
        - [Storage blocks](#storage-block) - Holds actual user file data.
    - Encryption
        - Encryption key constraints
        - Encryption strategies & compatibility
        - Types of encrypted data
    - Data integrity


# Conventions, Notations & Definitions

## Unit Conventions
All sizes in this specification, unless explicitly stated otherwise, are expressed in binary units 
based on powers of 2:

```
kB (kilobyte): 1 kB = 1024 bytes  
MB (megabyte): 1 MB = 1024 kB = 1,048,576 bytes  
GB (gigabyte): 1 GB = 1024 MB = 1,073,741,824 bytes  
TB (terabyte): 1 TB = 1024 GB = 1,099,511,627,776 bytes  
```

This convention follows the standard binary system widely used in computing and ensures consistency 
when interpreting sizes in IBFS. If decimal-based units (e.g., 1 kB = 1000 bytes) are referenced, 
their use will be explicitly stated.

## Data formats

### Binary integers and booleans
The filesystem uses exclusively little-endian values for for all integers and booleans.
This applies to all filesystem metadata. User data stored within storage block bodies does not have 
to follow this pattern.

### Text encoding
All plain-text metadata must be encoded using the UTF-8 encoding unless stated otherwise.


# IBFS disk file

## Physical data structure

### Filesystem root
### Driver metadata
### Head block
### Link block
### Storage block
