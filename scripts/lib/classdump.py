"""Minimal JVM .class parser: dumps the method table (name + descriptor + flags).

Enough to compare public API surface between two AAR versions without a JDK.
"""
import struct
import sys
import zipfile

ACC = [
    (0x0001, "public"), (0x0002, "private"), (0x0004, "protected"),
    (0x0008, "static"), (0x0010, "final"), (0x0400, "abstract"),
]


def parse_pool(data, off):
    count = struct.unpack_from(">H", data, off)[0]
    off += 2
    pool = {}
    i = 1
    while i < count:
        tag = data[off]
        off += 1
        if tag == 1:  # Utf8
            ln = struct.unpack_from(">H", data, off)[0]
            off += 2
            pool[i] = data[off:off + ln].decode("utf-8", "replace")
            off += ln
        elif tag in (7, 8, 16, 19, 20):
            off += 2
        elif tag == 15:
            off += 3
        elif tag in (3, 4, 9, 10, 11, 12, 17, 18):
            off += 4
        elif tag in (5, 6):
            off += 8
            i += 1  # long/double take two slots
        else:
            raise ValueError(f"bad constant tag {tag} at {off}")
        i += 1
    return pool, off


def skip_attrs(data, off):
    n = struct.unpack_from(">H", data, off)[0]
    off += 2
    for _ in range(n):
        ln = struct.unpack_from(">I", data, off + 2)[0]
        off += 6 + ln
    return off


def dump(data):
    assert data[:4] == b"\xca\xfe\xba\xbe", "not a class file"
    off = 8
    pool, off = parse_pool(data, off)
    off += 6  # access, this, super
    ifc = struct.unpack_from(">H", data, off)[0]
    off += 2 + 2 * ifc
    for _ in range(2):  # fields then methods share the layout
        n = struct.unpack_from(">H", data, off)[0]
        off += 2
        entries = []
        for _ in range(n):
            flags, name_i, desc_i = struct.unpack_from(">HHH", data, off)
            off += 6
            off = skip_attrs(data, off)
            entries.append((flags, pool.get(name_i, "?"), pool.get(desc_i, "?")))
        off = skip_attrs(data, off) if False else off
        yield entries


def main(jar, cls):
    with zipfile.ZipFile(jar) as z:
        data = z.read(cls)
    sections = list(dump(data))
    methods = sections[1] if len(sections) > 1 else []
    for flags, name, desc in methods:
        mods = " ".join(m for bit, m in ACC if flags & bit)
        if "public" in mods or "protected" in mods:
            print(f"  {mods} {name}{desc}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
