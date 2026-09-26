// A random UUID v4 string that works in every context, not just secure ones.
//
// crypto.randomUUID() is only defined in a secure context (HTTPS or
// localhost). On staging the app is served over plain HTTP behind a TLS
// proxy, so randomUUID is undefined there and every id mint would throw.
// crypto.getRandomValues IS available in insecure contexts, so we build the
// UUID from 16 random bytes ourselves and format them per RFC 4122.
export function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Version 4 (random) and RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));
  const h = (i: number) => hex[bytes[i]];
  return (
    h(0) + h(1) + h(2) + h(3) + "-" +
    h(4) + h(5) + "-" +
    h(6) + h(7) + "-" +
    h(8) + h(9) + "-" +
    h(10) + h(11) + h(12) + h(13) + h(14) + h(15)
  );
}
