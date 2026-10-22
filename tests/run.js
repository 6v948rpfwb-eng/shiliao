// 拾料 自检：不联网，全部用 samples/ 里的样例。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { htmlToMarkdown, parseHtml, textOf, decodeEntities } from '../core/html.js'
import { extract, pickMain } from '../core/extract.js'
import { parseAtom } from '../core/arxiv.js'
import { saveDoc, loadIndex, getDoc, removeDoc, rebuildIndex, parseFrontmatter } from '../core/store.js'
import { search, tokenize } from '../core/search.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE = path.join(HERE, '..', 'samples')
let pass = 0
let fail = 0

function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')) }
}

console.log('\n1. 实体解码')
ok('&alpha; 被解成 α', decodeEntities('&alpha;') === 'α')
ok('&#65; 被解成 A', decodeEntities('&#65;') === 'A')
ok('未知实体原样保留', decodeEntities('&nosuch;') === '&nosuch;')

console.log('\n2. HTML → Markdown')
const md = htmlToMarkdown('<h2>标题</h2><p>这是<strong>粗体</strong>和<em>斜体</em>。</p><ul><li>甲</li><li>乙</li></ul>')
ok('标题变成 ##', md.includes('## 标题'), md)
ok('粗体变成 **', md.includes('**粗体**'), md)
ok('斜体变成 *', md.includes('*斜体*'), md)
ok('列表变成 -', md.includes('- 甲') && md.includes('- 乙'), md)

const tb = htmlToMarkdown('<table><tr><th>量</th><th>式</th></tr><tr><td>t</td><td>2h/g</td></tr></table>')
ok('表格变成管道行', tb.includes('| 量 | 式 |') && tb.includes('| --- | --- |'), tb)

const cd = htmlToMarkdown('<pre><code>a = 1\nb = 2</code></pre>')
ok('代码块带围栏', cd.includes('```') && cd.includes('a = 1'), cd)

const lk = htmlToMarkdown('<p><a href="/x/1">链接</a></p>', { baseUrl: 'https://e.com/a/b' })
ok('相对链接补成绝对', lk.includes('https://e.com/x/1'), lk)

console.log('\n3. 正文提取')
const html = fs.readFileSync(path.join(SAMPLE, 'page.html'), 'utf8')
const art = extract(html, { url: 'https://doc.example.com/page' })
ok('标题取自 <title>', art.title.includes('测试页'), art.title)
ok('拿到正文', art.markdown.includes('平抛运动可以看成'), art.markdown.slice(0, 80))
ok('丢掉了导航', !art.markdown.includes('目录'), '正文里出现了导航文字')
ok('丢掉了评论区', !art.markdown.includes('评论区'), '正文里出现了评论')
ok('丢掉了页脚', !art.markdown.includes('版权所有'), '正文里出现了页脚')
ok('保留了表格', art.markdown.includes('| 飞行时间 |'), '')
ok('字数合理（>120）', art.chars > 120, String(art.chars))

const tree = parseHtml(html)
const main = pickMain(tree)
ok('选中的是 article 或 main', ['article', 'main'].includes(main.tag), main.tag)

console.log('\n4. arXiv Atom 解析')
const xml = fs.readFileSync(path.join(SAMPLE, 'arxiv.xml'), 'utf8')
const papers = parseAtom(xml)
ok('解析出 1 条', papers.length === 1, String(papers.length))
ok('标题正确', papers[0].title === 'How much do language models memorize?', papers[0].title)
ok('两位作者', papers[0].authors.length === 2, String(papers[0].authors.length))
ok('摘要去掉了换行', !papers[0].summary.includes('\n'), '')
ok('有 PDF 链接', papers[0].pdf.includes('/pdf/'), papers[0].pdf)

console.log('\n5. 资料库读写')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shiliao-'))
const a = saveDoc(root, { title: '平抛运动的分解', source: 'https://a/1', kind: 'article', tags: ['物理'], markdown: '水平方向匀速，竖直方向自由落体。' })
const b = saveDoc(root, { title: '牛顿运动定律', source: 'https://a/2', kind: 'article', tags: ['物理'], markdown: '惯性、加速度与力的关系。' })
ok('两份都写进去了', loadIndex(root).length === 2, String(loadIndex(root).length))
ok('文件存在', fs.existsSync(path.join(root, a.id + '.md')), '')
const back = getDoc(root, a.id)
ok('读回来的标题一致', back.title === '平抛运动的分解', back.title)
ok('frontmatter 能解析', back.kind === 'article' && back.tags.includes('物理'), JSON.stringify(back.tags))
ok('正文在文件里', back.body.includes('竖直方向'), back.body.slice(0, 40))

const fm = parseFrontmatter(fs.readFileSync(path.join(root, a.id + '.md'), 'utf8'))
ok('frontmatter 的 id 与传入一致', fm.meta.id === a.id, fm.meta.id + ' vs ' + a.id)

console.log('\n6. 检索')
ok('中文被切成二元组', tokenize('平抛运动').includes('平抛') && tokenize('平抛运动').includes('运动'), JSON.stringify(tokenize('平抛运动')))
const docs = loadIndex(root).map((e) => ({ ...e, body: getDoc(root, e.id).body }))
const hit1 = search(docs, '平抛')
ok('搜「平抛」命中第一份', hit1.length >= 1 && hit1[0].id === a.id, JSON.stringify(hit1.map((h) => h.title)))
const hit2 = search(docs, '加速度')
ok('搜「加速度」命中第二份', hit2.length >= 1 && hit2[0].id === b.id, JSON.stringify(hit2.map((h) => h.title)))
const hit3 = search(docs, '牛顿')
ok('标题命中排在前面', hit3[0].id === b.id, '')
ok('没有命中时返回空', search(docs, '量子纠缠').length === 0, '')

console.log('\n7. 索引重建与删除')
fs.writeFileSync(path.join(root, 'index.json'), '[]')
ok('索引清空后为 0', loadIndex(root).length === 0)
const rebuilt = rebuildIndex(root)
ok('重建后回到 2 份', rebuilt.length === 2, String(rebuilt.length))
ok('删除成功', removeDoc(root, a.id) === true)
ok('删完剩 1 份', loadIndex(root).length === 1, String(loadIndex(root).length))
fs.rmSync(root, { recursive: true, force: true })

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) process.exit(1)
