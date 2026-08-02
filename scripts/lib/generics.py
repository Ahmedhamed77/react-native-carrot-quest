"""Dump methods with their generic Signature attribute (JVM generics erasure recovery)."""
import struct
import sys
import zipfile

import classdump


def parse(data, want):
    pool, off = classdump.parse_pool(data, 8)
    off += 6
    ifc = struct.unpack_from(">H", data, off)[0]
    off += 2 + 2 * ifc

    def section():
        nonlocal off
        n = struct.unpack_from(">H", data, off)[0]
        off += 2
        out = []
        for _ in range(n):
            flags, name_i, desc_i = struct.unpack_from(">HHH", data, off)
            off += 6
            # read attributes looking for Signature
            na = struct.unpack_from(">H", data, off)[0]
            off += 2
            sig = None
            for _ in range(na):
                an_i, alen = struct.unpack_from(">HI", data, off)
                off += 6
                if pool.get(an_i) == "Signature":
                    idx = struct.unpack_from(">H", data, off)[0]
                    sig = pool.get(idx)
                off += alen
            out.append((flags, pool.get(name_i), pool.get(desc_i), sig))
        return out

    section()  # fields
    methods = section()

    for flags, name, desc, sig in methods:
        if not (flags & 0x0001):
            continue
        if want and want.lower() not in (name or "").lower():
            continue
        print(f"  {name}{sig or desc}")


if __name__ == "__main__":
    jar, cls = sys.argv[1], sys.argv[2]
    want = sys.argv[3] if len(sys.argv) > 3 else None
    with zipfile.ZipFile(jar) as z:
        parse(z.read(cls), want)
