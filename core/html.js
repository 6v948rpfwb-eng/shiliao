// 一个够用的 HTML 解析器 + Markdown 渲染器。零依赖。
// 目的只有一个：把网页正文变成能读、能搜的 Markdown，不做浏览器级的容错。

const VOID = new Set([
  'br', 'img', 'hr', 'meta', 'link', 'input', 'source', 'area',
  'base', 'col', 'embed', 'param', 'track', 'wbr',
])

const RAW_TEXT = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas'])

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', mdash: '—',
  ndash: '–', hellip: '…', middot: '·', times: '×', divide: '÷',
  deg: '°', plusmn: '±', le: '≤', ge: '≥', ne: '≠', rarr: '→',
  larr: '←', sup2: '²', sup3: '³', frac12: '½', ensp: ' ', emsp: ' ',
  copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infin: '∞', sum: '∑', radic: '√', int: '∫', asymp: '≈', equiv: '≡',
  prime: '′', Prime: '″', bull: '•', dagger: '†', sect: '§', para: '¶',
  frac14: '¼', frac34: '¾', sup1: '¹', micro: 'µ', ohm: 'Ω', ang: '∠',
  perp: '⊥', sim: '∼', prop: '∝', there4: '∴', isin: '∈', notin: '∉',
}

export function decodeEntities(text) {
  if (!text || text.indexOf('&') < 0) return text
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole
      try { return String.fromCodePoint(code) } catch { return whole }
    }
    const key = body.toLowerCase()
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : whole
  })
}

function parseAttrs(raw) {
  const attrs = {}
  if (!raw) return attrs
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase()
    const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''
    attrs[name] = decodeEntities(value)
  }
  return attrs
}

export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
  let last = 0
  let m
  const top = () => stack[stack.length - 1]

  while ((m = re.exec(html))) {
    if (m.index > last) top().children.push({ text: decodeEntities(html.slice(last, m.index)) })
    last = re.lastIndex
    const full = m[0]
    if (full.startsWith('<!--') || full.startsWith('<!')) continue
    const tag = (m[1] || '').toLowerCase()
    if (!tag) continue

    if (full.startsWith('</')) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) { stack.length = k; break }
      }
      continue
    }

    const node = { tag, attrs: parseAttrs(m[2] || ''), children: [] }
    top().children.push(node)

    if (RAW_TEXT.has(tag)) {
      // 原样吞到对应的结束标签，避免 script 里的尖括号把树搞乱
      const close = html.toLowerCase().indexOf('</' + tag, re.lastIndex)
      if (close >= 0) {
        node.raw = html.slice(re.lastIndex, close)
        const end = html.indexOf('>', close)
        re.lastIndex = end >= 0 ? end + 1 : html.length
        last = re.lastIndex
      }
      continue
    }

    if (m[3] === '/' || VOID.has(tag)) continue
    stack.push(node)
  }

  if (last < html.length) top().children.push({ text: decodeEntities(html.slice(last)) })
  return root
}

export function textOf(node) {
  if (!node) return ''
  if (node.text !== undefined) return node.text
  if (node.raw !== undefined) return node.raw
  let out = ''
  for (const child of node.children || []) out += textOf(child)
  return out
}

export function findFirst(node, tag) {
  if (!node) return null
  if (node.tag === tag) return node
  for (const child of node.children || []) {
    const hit = findFirst(child, tag)
    if (hit) return hit
  }
  return null
}

export function collect(node, tag, out = []) {
  if (!node) return out
  if (node.tag === tag) out.push(node)
  for (const child of node.children || []) collect(child, tag, out)
  return out
}

// ---------- Markdown ----------

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'blockquote', 'pre', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'address',
])

function resolveUrl(href, base) {
  if (!href) return ''
  if (!base) return href
  try { return new URL(href, base).toString() } catch { return href }
}

function inlineText(node, ctx) {
  if (node.text !== undefined) return collapseInline(node.text)
  const tag = node.tag
  if (tag === 'br') return '\n'
  if (RAW_TEXT.has(tag)) return ''
  const kids = () => (node.children || []).map((c) => inlineText(c, ctx)).join('')

  if (tag === 'strong' || tag === 'b') return wrap(kids(), '**')
  if (tag === 'em' || tag === 'i') return wrap(kids(), '*')
  if (tag === 'del' || tag === 's') return wrap(kids(), '~~')
  if (tag === 'code') return '`' + textOf(node).replace(/`/g, "'").trim() + '`'
  if (tag === 'a') {
    const label = kids().trim() || node.attrs.href || ''
    const href = resolveUrl(node.attrs.href, ctx.baseUrl)
    if (!href) return label
    return '[' + label + '](' + href + ')'
  }
  if (tag === 'img') {
    const alt = (node.attrs.alt || '').trim()
    const src = resolveUrl(node.attrs.src || node.attrs['data-src'], ctx.baseUrl)
    if (!src) return ''
    return '![' + alt + '](' + src + ')'
  }
  return kids()
}

function wrap(inner, mark) {
  const t = inner.trim()
  if (!t) return ''
  return mark + t + mark
}

function collapseInline(text) {
  if (!text) return ''
  return text.replace(/[\t\r\n ]+/g, ' ')
}

function renderChildren(node, ctx) {
  return (node.children || []).map((c) => renderNode(c, ctx)).join('')
}

function renderNode(node, ctx) {
  if (node.text !== undefined) return collapseInline(node.text)
  if (node.raw !== undefined) return ''
  const tag = node.tag
  if (RAW_TEXT.has(tag)) return ''

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    const t = inlineText(node, ctx).replace(/\s+/g, ' ').trim()
    if (!t) return ''
    return '\n\n' + '#'.repeat(level) + ' ' + t + '\n\n'
  }
  if (tag === 'hr') return '\n\n---\n\n'
  if (tag === 'br') return '\n'
  if (tag === 'p') {
    const t = inlineText(node, ctx).replace(/\s+/g, ' ').trim()
    return t ? '\n\n' + t + '\n\n' : ''
  }
  if (tag === 'pre') {
    const body = (node.raw !== undefined ? node.raw : textOf(node)).replace(/\r\n/g, '\n').replace(/^\n+|\s+$/g, '')
    return '\n\n```\n' + body + '\n```\n\n'
  }
  if (tag === 'blockquote') {
    const inner = renderChildren(node, ctx).trim()
    if (!inner) return ''
    return '\n\n' + inner.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n') + '\n\n'
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = (node.children || []).filter((c) => c.tag === 'li')
    if (!items.length) return renderChildren(node, ctx)
    const lines = items.map((li, i) => {
      const body = renderChildren(li, ctx).replace(/\s+/g, ' ').trim()
      const mark = tag === 'ol' ? String(i + 1) + '. ' : '- '
      return body ? mark + body : ''
    }).filter(Boolean)
    return '\n\n' + lines.join('\n') + '\n\n'
  }
  if (tag === 'li') {
    const body = renderChildren(node, ctx).replace(/\s+/g, ' ').trim()
    return body ? '\n- ' + body + '\n' : ''
  }
  if (tag === 'table') {
    const rows = collect(node, 'tr')
    if (!rows.length) return renderChildren(node, ctx)
    const cells = rows.map((tr) => collect(tr, 'td').concat(collect(tr, 'th')))
    const width = Math.max(...cells.map((r) => r.length))
    if (!width) return renderChildren(node, ctx)
    const lineFor = (list) => {
      const out = []
      for (let i = 0; i < width; i++) {
        const cell = list[i]
        const t = cell ? inlineText(cell, ctx).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() : ''
        out.push(t)
      }
      return '| ' + out.join(' | ') + ' |'
    }
    const body = [lineFor(cells[0]), '| ' + Array(width).fill('---').join(' | ') + ' |']
    for (let i = 1; i < cells.length; i++) body.push(lineFor(cells[i]))
    return '\n\n' + body.join('\n') + '\n\n'
  }
  if (BLOCK_TAGS.has(tag)) {
    return renderChildren(node, ctx) + '\n'
  }
  return inlineText(node, ctx)
}

export function htmlToMarkdown(html, { baseUrl = '' } = {}) {
  const tree = parseHtml(html)
  const body = findFirst(tree, 'body') || tree
  const ctx = { baseUrl }
  let md = renderChildren(body, ctx)
  md = md.replace(/\u00a0/g, ' ')
  md = md.replace(/[ \t]+\n/g, '\n')
  md = md.replace(/\n{3,}/g, '\n\n')
  md = md.replace(/^\s+|\s+$/g, '')
  return md
}
