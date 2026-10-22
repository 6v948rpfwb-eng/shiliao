// 本地检索：中文按二元组切，英文按单词切，BM25 打分。
// 不需要分词词典，代价是中文单字查询效果一般——够用。

const CJK = /[\u4e00-\u9fff]/

export function tokenize(text) {
  const tokens = []
  const lower = String(text || '').toLowerCase()
  const re = /[\u4e00-\u9fff]+|[a-z0-9][a-z0-9._+#-]*/g
  let m
  while ((m = re.exec(lower))) {
    const piece = m[0]
    if (CJK.test(piece)) {
      if (piece.length === 1) { tokens.push(piece); continue }
      for (let i = 0; i < piece.length - 1; i++) tokens.push(piece.slice(i, i + 2))
    } else {
      tokens.push(piece)
    }
  }
  return tokens
}

function countTokens(text) {
  const map = new Map()
  for (const t of tokenize(text)) map.set(t, (map.get(t) || 0) + 1)
  return map
}

const K1 = 1.4
const B = 0.72

export function search(docs, query, { limit = 20 } = {}) {
  const terms = tokenize(query)
  if (!terms.length) return []
  const N = docs.length || 1

  const prepared = docs.map((doc) => {
    const title = countTokens(doc.title || '')
    const tags = countTokens((doc.tags || []).join(' '))
    const body = countTokens(doc.body || doc.text || '')
    const len = tokenize(doc.body || doc.text || '').length || 1
    return { doc, title, tags, body, len }
  })

  const avgLen = prepared.reduce((s, p) => s + p.len, 0) / prepared.length

  // 每个词在多少篇里出现过
  const df = new Map()
  for (const term of new Set(terms)) {
    let n = 0
    for (const p of prepared) {
      if (p.title.has(term) || p.tags.has(term) || p.body.has(term)) n++
    }
    df.set(term, n)
  }

  const scored = []
  for (const p of prepared) {
    let score = 0
    const hits = []
    for (const term of terms) {
      const n = df.get(term) || 0
      if (!n) continue
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      const tf = (p.body.get(term) || 0)
      const norm = tf ? (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (p.len / avgLen))) : 0
      const titleBoost = p.title.has(term) ? 3.2 : 0
      const tagBoost = p.tags.has(term) ? 1.8 : 0
      const sub = idf * (norm + titleBoost + tagBoost)
      if (sub > 0) { score += sub; hits.push(term) }
    }
    if (score > 0) scored.push({ ...p.doc, score: Number(score.toFixed(3)), hits })
  }

  scored.sort((a, b) => b.score - a.score || String(b.fetched).localeCompare(String(a.fetched)))
  return scored.slice(0, limit).map((r) => ({ ...r, snippet: snippet(r.body || r.text || '', terms) }))
}

export function snippet(text, terms, width = 90) {
  const clean = String(text || '').replace(/\s+/g, ' ')
  if (!clean) return ''
  let at = -1
  for (const term of terms) {
    const i = clean.toLowerCase().indexOf(term)
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  if (at < 0) at = 0
  const start = Math.max(0, at - Math.floor(width / 3))
  const piece = clean.slice(start, start + width)
  return (start > 0 ? '…' : '') + piece + (start + width < clean.length ? '…' : '')
}
