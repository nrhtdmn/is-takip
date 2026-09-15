/** T.C. Kimlik No doğrulama (11 hane + algoritma) */
export function normalizeTc(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11)
}

export function isValidTc(raw: string): boolean {
  const tc = normalizeTc(raw)
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false
  const d = tc.split('').map(Number)
  const odd = d[0] + d[2] + d[4] + d[6] + d[8]
  const even = d[1] + d[3] + d[5] + d[7]
  const dig10 = ((odd * 7 - even) % 10 + 10) % 10
  if (d[9] !== dig10) return false
  const sum10 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10
  return d[10] === sum10
}

export function formatTcDisplay(tc: string): string {
  const n = normalizeTc(tc)
  if (n.length !== 11) return n
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`
}
