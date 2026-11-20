/** Pure host/IP classification for the Studio client. No I/O, no dependencies. */

export function normalizeHost(host: string): string {
  return (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[+|\]+$/g, "");
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

export function isPrivateIpv4(ip: string): boolean {
  const o = parseIpv4(ip);
  if (!o) return true; // falha fechada
  const a = o[0] ?? -1;
  const b = o[1] ?? -1;
  const c = o[2] ?? -1;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // documentação
  if (a === 203 && b === 0 && c === 113) return true; // documentação
  if (a >= 224) return true; // multicast e reservado
  return false;
}

export function isPrivateIpv6(ip: string): boolean {
  const h = normalizeHost(ip);
  if (!h.includes(":")) return true;
  if (h === "::" || h === "::1") return true;
  const mapped = /^::ffff:(.+)$/i.exec(h);
  if (mapped) return isPrivateIpv4(mapped[1] ?? "");
  if (/^ff[0-9a-f]/i.test(h)) return true; // multicast
  if (/^f[cd][0-9a-f]/i.test(h)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]/i.test(h)) return true; // fe80::/10 link-local
  if (/^2001:0?db8/i.test(h)) return true; // documentação
  if (/^100::/i.test(h)) return true; // discard-only
  return false;
}

export function isPrivateAddress(host: string): boolean {
  const h = normalizeHost(host);
  if (!h) return true;
  const mapped = /^::ffff:(.+)$/i.exec(h);
  if (mapped) return isPrivateIpv4(mapped[1] ?? "");
  if (h.includes(":")) return isPrivateIpv6(h);
  if (parseIpv4(h)) return isPrivateIpv4(h);
  return true; // hostname exige resolução antes da decisão
}
