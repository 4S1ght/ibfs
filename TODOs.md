# Important mechanisms

## Directory name length checks
In L2, every time a directory/file is made or renamed its name (UTF-8 string) must be checked to fit within a 16-bit range.

## Limit read-only handle closures.
Currently read-only handles being shared makes it possible for a single user to close a handle multiple times
causing it to close for other users that share the same handle.