# Mirrors crates/platform_core/codec/src/python.rs. Bytes in, bytes out;
# dictionary identity is the caller's concern (dictionaries live in shards).

DEFAULT_LEVEL: int

def train_dictionary(samples: list[bytes], capacity: int) -> bytes: ...
def compress(
    data: bytes, dictionary: bytes | None = None, level: int | None = None
) -> bytes: ...
def decompress(data: bytes, dictionary: bytes | None = None) -> bytes: ...
