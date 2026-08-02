"""Dump a class's superclass and its public static final fields (enum constants)."""
import struct
import sys
import zipfile

import classdump


def info(data):
    pool, off = classdump.parse_pool(data, 8)
    _access, this_i, super_i = struct.unpack_from(">HHH", data, off)
    off += 6
    ifc = struct.unpack_from(">H", data, off)[0]
    off += 2 + 2 * ifc

    fields = []
    n = struct.unpack_from(">H", data, off)[0]
    off += 2
    for _ in range(n):
        flags, name_i, desc_i = struct.unpack_from(">HHH", data, off)
        off += 6
        off = classdump.skip_attrs(data, off)
        if flags & 0x0001 and flags & 0x0008:
            fields.append((pool.get(name_i, "?"), pool.get(desc_i, "?")))
    return this_i, super_i, fields, pool


def main(jar, cls):
    with zipfile.ZipFile(jar) as z:
        data = z.read(cls)
    _this_i, _super_i, fields, _pool = info(data)
    print("  public static final fields:")
    for n, d in fields:
        print(f"    {n} : {d}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
