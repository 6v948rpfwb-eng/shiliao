#!/usr/bin/env node
// 拾料 本地服务器：静态页面 + 几个 JSON 接口。零依赖。

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extract } from './core/extract.js'
import { fetchUrl } from './core/fetch-url.js'
import { searchArxiv } from './core/arxiv.js'
import { defaultRoot, saveDoc, loadIndex, getDoc, rebuildIndex } from './core/store.js'
import { search } from './core/search.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
function opt(name, fallback) {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const PORT = Number(opt('port', process.env.SHILIAO_PORT || 8781))
const ROOT = path.resolve(opt('root', defaultRoot()))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

function json(res, code, body) {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 8 * 1024 * 1024) reject(new Error('请求体太大'))
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) } catch (e) { reject(new Error('请求体不是 JSON')) }
    })
    req.on('error', reject)
  })
}

function docsWithBody() {
  return loadIndex(ROOT).map((e) => {
    const d = getDoc(ROOT, e.id)
    return d ? { ...e, body: d.body } : e
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    const p = url.pathname

    if (p === '/api/health') return json(res, 200, { ok: true, root: ROOT, count: loadIndex(ROOT).length })

    if (p === '/api/list') {
      const kind = url.searchParams.get('kind')
      let list = loadIndex(ROOT)
      if (kind) list = list.filter((e) => e.kind === kind)
      return json(res, 200, { items: list })
    }

    if (p === '/api/doc') {
      const doc = getDoc(ROOT, url.searchParams.get('id') || '')
      return doc ? json(res, 200, doc) : json(res, 404, { error: '没有这份资料' })
    }

    if (p === '/api/search') {
      const q = url.searchParams.get('q') || ''
      const limit = Number(url.searchParams.get('limit') || 20)
      const hits = search(docsWithBody(), q, { limit })
      return json(res, 200, { query: q, items: hits })
    }

    if (p === '/api/arxiv' && req.method === 'GET') {
      const q = url.searchParams.get('q') || ''
      if (!q) return json(res, 400, { error: '缺关键词' })
      const items = await searchArxiv(q, { max: Number(url.searchParams.get('max') || 10) })
      return json(res, 200, { items })
    }

    if (p === '/api/add' && req.method === 'POST') {
      const body = await readBody(req)
      if (body.url) {
        const r = await fetchUrl(body.url)
        if (r.status >= 400) return json(res, 502, { error: '抓取失败 HTTP ' + r.status })
        const isHtml = /html|xml/.test(r.type)
        const doc = isHtml ? extract(r.body, { url: r.url }) : { title: r.url, markdown: r.body, chars: r.body.length }
        const saved = saveDoc(ROOT, { title: doc.title, source: r.url, kind: body.kind || 'article', tags: body.tags || [], markdown: doc.markdown })
        return json(res, 200, { ok: true, doc: saved })
      }
      if (body.markdown && body.title) {
        const saved = saveDoc(ROOT, {
          title: body.title,
          source: body.source || '',
          kind: body.kind || 'note',
          tags: body.tags || [],
          markdown: body.markdown,
        })
        return json(res, 200, { ok: true, doc: saved })
      }
      return json(res, 400, { error: '要么给 url，要么给 title + markdown' })
    }

    if (p === '/api/save-arxiv' && req.method === 'POST') {
      const body = await readBody(req)
      const paper = body.paper
      if (!paper || !paper.title) return json(res, 400, { error: '缺 paper' })
      const markdown = [
        '**作者**：' + (paper.authors || []).join('、'),
        '**提交**：' + (paper.published || ''),
        '**分类**：' + (paper.categories || []).join(', '),
        '**原文**：' + (paper.url || ''),
        '**PDF**：' + (paper.pdf || ''),
        '',
        '## 摘要',
        '',
        paper.summary || '',
      ].join('\n')
      const saved = saveDoc(ROOT, {
        title: paper.title,
        source: paper.url || '',
        kind: 'paper',
        tags: body.tags && body.tags.length ? body.tags : (paper.categories || []).slice(0, 3),
        markdown,
      })
      return json(res, 200, { ok: true, doc: saved })
    }

    if (p === '/api/rebuild' && req.method === 'POST') {
      return json(res, 200, { ok: true, count: rebuildIndex(ROOT).length })
    }

    // 静态文件
    const rel = p === '/' ? '/index.html' : p
    const file = path.normalize(path.join(HERE, 'web', rel))
    if (!file.startsWith(path.join(HERE, 'web'))) return json(res, 403, { error: '越界' })
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: '没有这个文件' })
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  } catch (err) {
    json(res, 500, { error: err.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('拾料 已启动：http://127.0.0.1:' + PORT + '/')
  console.log('资料库：' + ROOT)
})
