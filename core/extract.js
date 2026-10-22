// 从整页 HTML 里挑出正文，丢掉导航、侧栏、评论、分享条。
// 做法是先剪枝再打分，不追求 Readability 那种完备性，但对付文档站和论文页够用。

import { parseHtml, textOf, findFirst, htmlToMarkdown } from './html.js'

const ALWAYS_DROP = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe',
  'object', 'embed', 'dialog', 'button', 'select', 'input', 'textarea',
  'video', 'audio', 'map', 'form',
])

// 这些标签/类名多半是导航、页脚、侧栏；但不能一棍子打死——
// 有的站把整页内容套在 <div class="flex-wrap-footer"> 里（arxiv 就是），
// 所以只有在"这块内容明显小于父节点"时才认定它是配件。
const SOFT_DROP_TAGS = new Set(['nav', 'header', 'footer', 'aside'])

const NOISE_ATTR = /(^|[\s_-])(nav|navbar|navigation|menu|footer|header|sidebar|side|comment|comments|share|social|ad|ads|advert|advertisement|banner|cookie|related|recommend|breadcrumb|pagination|pager|toolbar|popup|modal|subscribe|newsletter|login|signup|register|download-?app|qrcode|qr-code|print|tags?-?list)([\s_-]|$)/i

const KEEP_ATTR = /(^|[\s_-])(content|article|post|entry|main|body|markdown|prose|detail|text|paper|abstract|answer|solution)([\s_-]|$)/i

function matches(node, re) {
  const cls = node.attrs && node.attrs.class ? node.attrs.class : ''
  const id = node.attrs && node.attrs.id ? node.attrs.id : ''
  return re.test(cls) || re.test(id)
}

export function prune(node) {
  if (!node.children) return node
  const parentText = textOf(node).length
  node.children = node.children.filter((child) => {
    if (child.text !== undefined) return true
    if (ALWAYS_DROP.has(child.tag)) return false
    if (child.attrs && (child.attrs.hidden !== undefined || child.attrs['aria-hidden'] === 'true')) return false
    if (child.attrs && child.attrs.style && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(child.attrs.style)) return false

    const childText = textOf(child).length
    const tiny = childText < parentText * 0.6
    if (!tiny) return true

    if (SOFT_DROP_TAGS.has(child.tag)) return false
    if (matches(child, NOISE_ATTR) && !matches(child, KEEP_ATTR)) return false
    return true
  })
  for (const child of node.children) prune(child)
  return node
}

function linkChars(node) {
  if (!node.children) return 0
  if (node.tag === 'a') return textOf(node).length
  let n = 0
  for (const child of node.children) n += linkChars(child)
  return n
}

function cjkCount(text) {
  const m = text.match(/[\u4e00-\u9fff]/g)
  return m ? m.length : 0
}

function score(node) {
  const text = textOf(node).replace(/\s+/g, ' ')
  const len = text.length
  if (!len) return 0
  const link = linkChars(node)
  const linkRatio = link / len
  if (len < 40 && linkRatio > 0.5) return 0
  const cjk = cjkCount(text)
  // 中文按 1.6 倍权重：同样的字数，中文网页信息密度更高
  const weight = len + cjk * 0.6
  const tagBonus = node.tag === 'article' ? 220 : node.tag === 'main' ? 160 : 0
  const attrBonus = matches(node, KEEP_ATTR) ? 120 : 0
  return weight * (1 - Math.min(0.85, linkRatio)) + tagBonus + attrBonus
}

function walk(node, out) {
  if (node.children) {
    for (const child of node.children) {
      if (['div', 'article', 'main', 'section', 'td'].includes(child.tag)) out.push(child)
      walk(child, out)
    }
  }
  return out
}

export function pickMain(tree) {
  const candidates = walk(tree, [])
  let best = null
  let bestScore = 0
  for (const node of candidates) {
    const s = score(node)
    if (s > bestScore) { bestScore = s; best = node }
  }
  if (!best || bestScore < 120) {
    const body = findFirst(tree, 'body')
    return body || tree
  }

  // 外层包裹容器的总分总是最高，所以要往下钻：
  // 只要某个孩子的分数接近父节点、且内容没被腰斩，就往孩子走。
  for (let guard = 0; guard < 30; guard++) {
    const kids = (best.children || []).filter((c) => ['div', 'article', 'main', 'section'].includes(c.tag))
    let next = null
    let nextScore = 0
    const parentText = textOf(best).length
    for (const kid of kids) {
      const s = score(kid)
      const kidText = textOf(kid).length
      if (s >= 0.9 * bestScore && kidText >= 0.5 * parentText && s > nextScore) {
        next = kid
        nextScore = s
      }
    }
    if (!next) break
    best = next
    bestScore = nextScore
  }
  return best
}

export function extract(html, { url = '', keepTags = false } = {}) {
  const tree = parseHtml(html)
  prune(tree)

  const titleNode = findFirst(tree, 'title')
  let title = titleNode ? textOf(titleNode).replace(/\s+/g, ' ').trim() : ''
  if (!title) {
    const h1 = findFirst(tree, 'h1')
    if (h1) title = textOf(h1).replace(/\s+/g, ' ').trim()
  }

  const main = pickMain(tree)
  const markdown = htmlToMarkdown(
    keepTags ? serialize(main) : serialize(main),
    { baseUrl: url },
  )
  const text = markdown.replace(/[#*`>\-|!\[\]()]/g, '')
  return {
    title: title || '(无标题)',
    markdown,
    chars: text.replace(/\s+/g, '').length,
  }
}

// 把节点重新渲染成 HTML 字符串，交给 htmlToMarkdown 统一处理
export function serialize(node) {
  if (!node) return ''
  if (node.text !== undefined) return escapeHtml(node.text)
  if (node.raw !== undefined) return ''
  const tag = node.tag
  if (tag === '#root') return (node.children || []).map(serialize).join('')
  const attrs = Object.entries(node.attrs || {})
    .map(([k, v]) => ' ' + k + '="' + String(v).replace(/"/g, '&quot;') + '"')
    .join('')
  if (['br', 'hr', 'img'].includes(tag)) return '<' + tag + attrs + '>'
  return '<' + tag + attrs + '>' + (node.children || []).map(serialize).join('') + '</' + tag + '>'
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
