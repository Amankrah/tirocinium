# Mirrors crates/platform_core/preprocess/src/python.rs. Camera bytes in; a
# cleaned grayscale PNG, an adaptive-binarized PNG, and a metrics JSON string
# out. An unreadable page raises PageRejected (args: reason_code, message,
# metrics_json); undecodable bytes raise ValueError.

MAX_LONG_EDGE: int

class PageRejected(Exception): ...

def preprocess(data: bytes) -> tuple[bytes, bytes, str]: ...
