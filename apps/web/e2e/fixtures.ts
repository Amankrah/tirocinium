import zlib from "node:zlib";

// Page fixtures for the upload journeys, built in-test as valid grayscale PNGs
// so no binaries are committed. A hard checkerboard carries strong
// high-frequency edges and reads as sharp; a flat field has none and reads as
// blurry, which is exactly what the client blur pre-check (page-checks.ts) and
// the server preprocessing key on. Kept small; the panel downscales anyway.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = (CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function grayscalePng(
  size: number,
  at: (x: number, y: number) => number,
): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: grayscale
  // compression, filter, interlace all 0 (default)

  const raw = Buffer.alloc((size + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y += 1) {
    raw[o] = 0; // filter type: none
    o += 1;
    for (let x = 0; x < size; x += 1) {
      raw[o] = at(x, y) & 0xff;
      o += 1;
    }
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function sharpPagePng(): Buffer {
  return grayscalePng(96, (x, y) => ((x + y) % 2 === 0 ? 0 : 255));
}

export function blurryPagePng(): Buffer {
  return grayscalePng(96, () => 128);
}
