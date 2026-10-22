#!/usr/bin/env node
// 拾料 命令行。用法：node cli/gather.js <命令> [参数]

import fs from 'node:fs'
import path from 'node:path'
import { extract } from '../core/extract.js'
import { fetchUrl } from '../core/fetch-url.js'
import { searchArxiv, fetchArxivId } from '../core/arxiv.js'
import { defaultRoot, saveDoc, loadIndex, getDoc, removeDoc, rebuildIndex } from '../core/store.js'
import { search } from '../core/search.js'

const argv = process.argv.slice(2)

function takeOpts(args) {
  const opts = {}
  const rest = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) { opts[key] = next; i++ } else { opts[key] = true }
    } else rest.push(a)
  }
  return { opts, rest }
}

const { opts, rest } = takeOpts(argv)
const cmd = rest[0]
const root = opts.root ? path.resolve(opts.root) : defaultRoot()
const tags = opts.tags ? String(opts.tags).split(',').map((s) => s.trim()).filter(Boolean) : []

function usage() {
  console.log(`拾料 0.1 — 资料收录与检索

  node cli/gather.js add-url <网址> [--tags a,b] [--kind article] [--raw]
  node cli/gather.js add-file <文件> [--title 标题] [--tags a,b]
  node cli/gather.js arxiv <关键词> [--max 10] [--save 1] [--tags a,b]
  node cli/gather.js search <关键词> [--limit 10] [--json]
  node cli/gather.js list [--kind paper]
  node cli/gather.js show <序号或id>
  node cli/gather.js rm <序号或id>
  node cli/gather.js rebuild
  node cli/gather.js where

  公共参数：--root <资料库目录>（默认 ./library 或 $SHILIAO_ROOT）`)
}

function resolveId(key) {
  const entries = loadIndex(root)
  const n = Number(key)
  if (Number.isInteger(n) && n >= 1 && n <= entries.length) return entries[n - 1].id
  return String(key)
}

async function main() {
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') return usage()

  if (cmd === 'where') {
    console.log(root)
    return
  }

  if (cmd === 'add-url') {
    const url = rest[1]
    if (!url) throw new Error('缺网址')
    const res = await fetchUrl(url)
    if (res.status >= 400) throw new Error('抓取失败 HTTP ' + res.status)
    const isHtml = /html|xml/.test(res.type)
    const doc = isHtml
      ? extract(res.body, { url: res.url })
      : { title: path.basename(new URL(res.url).pathname) || url, markdown: res.body, chars: res.body.length }
    if (opts.raw) doc.markdown = res.body
    const saved = saveDoc(root, {
      title: doc.title,
      source: res.url,
      kind: opts.kind || 'article',
      tags,
      markdown: doc.markdown,
    })
    console.log('已收录：' + saved.title)
    console.log('  文件：' + path.join(root, saved.id + '.md'))
    console.log('  正文：' + doc.chars + ' 字')
    return
  }

  if (cmd === 'add-file') {
    const file = rest[1]
    if (!file) throw new Error('缺文件路径')
    const abs = path.resolve(file)
    const text = fs.readFileSync(abs, 'utf8')
    const isHtml = /\.(html?|xhtml)$/i.test(abs)
    const doc = isHtml ? extract(text, { url: 'file://' + abs }) : { title: opts.title || path.basename(abs), markdown: text, chars: text.length }
    const saved = saveDoc(root, {
      title: opts.title || doc.title,
      source: 'file://' + abs,
      kind: opts.kind || 'article',
      tags,
      markdown: doc.markdown,
    })
    console.log('已收录：' + saved.title + '（' + doc.chars + ' 字）')
    return
  }

  if (cmd === 'arxiv') {
    const query = rest.slice(1).join(' ')
    if (!query) throw new Error('缺关键词')
    const list = await searchArxiv(query, { max: Number(opts.max) || 10 })
    if (opts.save) {
      const idx = Number(opts.save)
      const paper = Number.isInteger(idx) && idx >= 1
        ? list[idx - 1]
        : await fetchArxivId(String(opts.save))
      if (!paper) throw new Error('没有第 ' + opts.save + ' 条')
      const body = [
        '**作者**：' + paper.authors.join('、'),
        '**提交**：' + paper.published + (paper.updated !== paper.published ? '（更新 ' + paper.updated + '）' : ''),
        '**分类**：' + paper.categories.join(', '),
        '**原文**：' + paper.url,
        '**PDF**：' + paper.pdf,
        '',
        '## 摘要',
        '',
        paper.summary,
      ].join('\n')
      const saved = saveDoc(root, {
        title: paper.title,
        source: paper.url,
        kind: 'paper',
        tags: tags.length ? tags : paper.categories.slice(0, 3),
        markdown: body,
      })
      console.log('已收录：' + saved.title)
      return
    }
    list.forEach((p, i) => {
      console.log((i + 1) + '. ' + p.title)
      console.log('   ' + p.published + ' · ' + p.authors.slice(0, 3).join('、') + (p.authors.length > 3 ? ' 等' : ''))
      console.log('   ' + p.url)
    })
    if (list.length) console.log('\n收录第 n 条：node cli/gather.js arxiv "' + query + '" --save n')
    return
  }

  if (cmd === 'search') {
    const query = rest.slice(1).join(' ')
    if (!query) throw new Error('缺关键词')
    const docs = loadIndex(root).map((e) => {
      const d = getDoc(root, e.id)
      return d ? { ...e, body: d.body } : e
    })
    const hits = search(docs, query, { limit: Number(opts.limit) || 10 })
    if (opts.json) { console.log(JSON.stringify(hits, null, 2)); return }
    if (!hits.length) { console.log('没找到。'); return }
    hits.forEach((h, i) => {
      console.log((i + 1) + '. [' + h.score + '] ' + h.title)
      console.log('   ' + h.kind + ' · ' + (h.fetched || '') + ' · ' + (h.source || ''))
      if (h.snippet) console.log('   ' + h.snippet)
    })
    return
  }

  if (cmd === 'list') {
    let entries = loadIndex(root)
    if (opts.kind) entries = entries.filter((e) => e.kind === opts.kind)
    if (!entries.length) { console.log('资料库是空的。'); return }
    entries.forEach((e, i) => {
      console.log((i + 1) + '. [' + e.kind + '] ' + e.title + '  — ' + e.chars + ' 字')
    })
    return
  }

  if (cmd === 'show') {
    const id = resolveId(rest[1])
    const doc = getDoc(root, id)
    if (!doc) throw new Error('没有这份资料：' + rest[1])
    console.log('# ' + doc.title)
    console.log('来源：' + doc.source + '｜类型：' + doc.kind + '｜收录：' + doc.fetched)
    console.log('')
    console.log(doc.body)
    return
  }

  if (cmd === 'rm') {
    const id = resolveId(rest[1])
    console.log(removeDoc(root, id) ? '已删除 ' + id : '没找到 ' + rest[1])
    return
  }

  if (cmd === 'rebuild') {
    const entries = rebuildIndex(root)
    console.log('索引重建完成，共 ' + entries.length + ' 份。')
    return
  }

  usage()
}

main().catch((err) => {
  console.error('出错：' + err.message)
  process.exit(1)
})
