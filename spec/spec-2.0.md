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
        - [head blocks](#head-block) - Roots of every filesystem structure's metadata.
        - [Link blocks](#link-block) - N'th link following a root block.
        - [Storage blocks](#storage-block) - Hold actual user file data.
    - Encryption
        - Encryption key constraints
        - Encryption strategies & compatibility
    - Data integrity


# IBFS disk file

## Physical data structure

### Filesystem root
### Driver metadata
### Head block
### Link block
### Storage block
