// 本地资料库：每份资料一个 Markdown 文件，头部有 frontmatter，索引另存 index.json。

import fs from 'node:fs'
import path from 'node:path'

export const KINDS = ['paper', 'exam', 'article', 'note']

export function defaultRoot() {
  return process.env.SHILIAO_ROOT || path.join(process.cwd(), 'library')
}

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function slugify(title, fallback = 'untitled') {
  const base = String(title || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base || fallback
}

export function makeId(prefix = 'doc') {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const rand = Math.random().toString(36).slice(2, 6)
  return prefix + '-' + stamp + '-' + rand
}

function frontmatter(doc) {
  const esc = (s) => String(s == null ? '' : s).replace(/\n/g, ' ').replace(/"/g, '\\"')
  const tags = Array.isArray(doc.tags) ? doc.tags : []
  return [
    '---',
    'id: "' + esc(doc.id) + '"',
    'title: "' + esc(doc.title) + '"',
    'source: "' + esc(doc.source) + '"',
    'kind: "' + esc(doc.kind || 'article') + '"',
    'fetched: "' + esc(doc.fetched) + '"',
    'tags: [' + tags.map((t) => '"' + esc(t) + '"').join(', ') + ']',
    '---',
    '',
  ].join('\n')
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { meta: {}, body: text }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (!kv) continue
    let value = kv[2].trim()
    if (value.startsWith('[')) {
      meta[kv[1]] = value.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
    } else {
      meta[kv[1]] = value.replace(/^"|"$/g, '')
    }
  }
  return { meta, body: text.slice(m[0].length) }
}

export function loadIndex(root) {
  const file = path.join(root, 'index.json')
  if (!fs.existsSync(file)) return []
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] }
}

export function saveIndex(root, entries) {
  ensure(root)
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(entries, null, 2) + '\n')
}

export function saveDoc(root, { title, source = '', kind = 'article', tags = [], markdown, id }) {
  ensure(root)
  const docId = id || makeId(kind === 'paper' ? 'paper' : 'doc')
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fetched = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
    + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
  const doc = { id: docId, title: title || '(无标题)', source, kind, fetched, tags }
  const file = docId + '.md'
  const text = frontmatter(doc) + '# ' + doc.title + '\n\n' + String(markdown || '').trim() + '\n'
  fs.writeFileSync(path.join(root, file), text)
  const entries = loadIndex(root).filter((e) => e.id !== docId)
  entries.push({
    ...doc,
    file,
    chars: String(markdown || '').replace(/\s+/g, '').length,
  })
  entries.sort((a, b) => String(b.fetched).localeCompare(String(a.fetched)))
  saveIndex(root, entries)
  return doc
}

export function getDoc(root, id) {
  const entry = loadIndex(root).find((e) => e.id === id)
  if (!entry) return null
  const file = path.join(root, entry.file)
  if (!fs.existsSync(file)) return null
  const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
  return { ...entry, ...meta, body }
}

export function removeDoc(root, id) {
  const entries = loadIndex(root)
  const entry = entries.find((e) => e.id === id)
  if (!entry) return false
  const file = path.join(root, entry.file)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  saveIndex(root, entries.filter((e) => e.id !== id))
  return true
}

export function rebuildIndex(root) {
  if (!fs.existsSync(root)) return []
  const files = fs.readdirSync(root).filter((f) => f.endsWith('.md'))
  const entries = files.map((f) => {
    const text = fs.readFileSync(path.join(root, f), 'utf8')
    const { meta, body } = parseFrontmatter(text)
    return {
      id: meta.id || f.replace(/\.md$/, ''),
      title: meta.title || f,
      source: meta.source || '',
      kind: meta.kind || 'article',
      fetched: meta.fetched || '',
      tags: meta.tags || [],
      file: f,
      chars: body.replace(/\s+/g, '').length,
    }
  })
  entries.sort((a, b) => String(b.fetched).localeCompare(String(a.fetched)))
  saveIndex(root, entries)
  return entries
}
