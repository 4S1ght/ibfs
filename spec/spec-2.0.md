# IBFS Specification v2
This document describes the specification version 2.0 as of December 24 or 2024.

# Overview
IBFS (Indirect Block File System) is a 64-bit virtual filesystem designed with strict focus on 
security and low implementation complexity. The primary purpose of this project is to provide an 
easy to implement security layer for network file sharing services through **virtualization**, 
native **encryption** and fine-grained **directory-scoped permissions**.

## Use cases
The main use case for IBFS is providing a layer of security for network storage solutions
by separating user content and filesystem operation from the host machine through virtualization and
protecting against unauthorized access through native encryption. The virtualized nature greatly 
reduces the risk of native filesystem access by decreasing the surface of many types of attacks such
as directory traversal which could be combined with file injection to achieve remote code execution - if server authentication and/or path sanitization are not implemented correctly.