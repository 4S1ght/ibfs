The design of the user permission system in the scope of directory and file operations.
Renaming, moving, deletion, writing, etc...

# Files

-----------------------------------------------------------------------------------------------------------------------

Create
Create a new empty file inside a directory.

Requires:
    - Read access to the entire leading route.
    - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Read
Read an existing file inside a directory.

Requires:
    - Read access to the entire leading route.

-----------------------------------------------------------------------------------------------------------------------

Write
Write to an existing file inside a directory.

Requires:
    - Read access to the entire leading route.
    - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Rename
Rename an existing file "in place" - It can not move files around, just change its name inside a single directory.

Requires:
    - Read access to the entire leading route.
    - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Move
Move the file from one parent directory to another.

Requires:

    - Source directory
        - Read access to the entire leading route.
        - Write access to the direct parent directory.

    - Destination directory
        - Read access to the entire leading route.
        - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Delete
Delete a file.

Requires:
    - Read access to the entire leading route.
    - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

# Directories

Create
Create a new empty directory inside another directory.

Requires:
    - Read access to the entire leading route.
    - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Read
Read the contents of an existing directory.

Requires:
    - Read access to the entire leading route

-----------------------------------------------------------------------------------------------------------------------

Update
Update the contents of a directory - Specifically, add, remove or update child items.

Requires:
    - Read access to the entire leading route.
    - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Rename
Rename the directory in place - It can not move directories around, just change its name inside a single directory.

Requires:
    - Read access to the entire leading route.
    - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Move
Move the given directory from one parent directory to another.

Requires:

    - Source directory
        - Read access to the entire leading route.
        - Write access to the direct parent directory.

    - Destination directory
        - Read access to the entire leading route.
        - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Delete
Delete a directory.

Requires:
    - Read access to the entire leading route.
    - Write access to the direct parent directory.

-----------------------------------------------------------------------------------------------------------------------

Grant
Grant, update or remove a permission for a given user group inside a specific directory.

Requires
    - Read access to the entire leading route.
    - Manage level starting at any parent directory or root access globally.


