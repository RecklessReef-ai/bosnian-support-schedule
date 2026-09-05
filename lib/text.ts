/**
 * Some upstream records are partially double-encoded: "Hodžić" arrives as
 * "HodžiÄ\x87", where "ž" survived but "ć" became UTF-8 bytes read as Latin-1.
 *
 * Round-tripping the whole string would corrupt the characters that are already
 * correct — "ž" (U+017E) has no Latin-1 representation and truncates to "~" — so
 * only the mojibake byte-runs are decoded.
 */
const MOJIBAKE_RUN = /[Â-ô][-¿]{1,3}/g;

export function repairMojibake(value: string): string {
  return value.replace(MOJIBAKE_RUN, (run) => {
    const bytes = Buffer.from([...run].map((c) => c.charCodeAt(0)));
    const decoded = bytes.toString("utf8");
    // A run that wasn't really mojibake decodes to U+FFFD; leave it untouched.
    return decoded.includes("�") ? run : decoded;
  });
}
