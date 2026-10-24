#!/usr/bin/env python3
"""
Byte-preserving search/replace for the docs in this repo.

The sources here carry MIXED line endings (README.md is 161 CRLF + 56 LF,
CONTEXT.md all-CRLF, STATUS.md all-LF). A whole-file rewrite by an editor or a
patch tool normalises every line, which turns a two-line change into a
two-hundred-line diff and buries the real edit.

This does exact substring replacement on bytes, so untouched lines keep their
original terminators exactly. Fails loudly if the anchor is missing or ambiguous
rather than silently editing the wrong place.

USAGE
  ./scripts/docpatch.py <file> <old-file> <new-file>     # replace old text with new
  ./scripts/docpatch.py <file> --append <new-file>        # append to end of file
  ./scripts/docpatch.py --check <file> <old> <new>        # report match count only
"""

import sys


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) < 4:
        die(__doc__)

    if sys.argv[1] == "--check":
        path, old_f, new_f = sys.argv[2], sys.argv[3], sys.argv[4]
        data = open(path, "rb").read()
        old = open(old_f, "rb").read()
        new = open(new_f, "rb").read()
        n = data.count(old)
        print(f"{path}: {n} match(es); would change {len(data)} -> {len(data) - n * len(old) + n * len(new)} bytes")
        if n != 1:
            die(f"expected exactly 1 match, found {n}")
        return

    if sys.argv[2] == "--append":
        path = sys.argv[1]
        data = open(path, "rb").read()
        add = open(sys.argv[3], "rb").read()
        # Match the file's dominant terminator rather than the new content's.
        crlf = data.count(b"\r\n")
        lf = data.count(b"\n") - crlf
        if lf > crlf and b"\r\n" not in add:
            add = add.replace(b"\n", b"\r\n")
        elif crlf >= lf and b"\r\n" not in add:
            add = add.replace(b"\n", b"\r\n")
        if not data.endswith(b"\n"):
            data += b"\r\n" if crlf else b"\n"
        open(path, "wb").write(data + add)
        print(f"{path}: appended {len(add)} bytes")
        return

    path, old_f, new_f = sys.argv[1], sys.argv[2], sys.argv[3]
    data = open(path, "rb").read()
    old = open(old_f, "rb").read()
    new = open(new_f, "rb").read()
    n = data.count(old)
    if n != 1:
        die(f"expected exactly 1 match in {path}, found {n} — refusing to guess")
    open(path, "wb").write(data.replace(old, new, 1))
    print(f"{path}: patched, {len(data)} -> {len(data) - len(old) + len(new)} bytes")


if __name__ == "__main__":
    main()
