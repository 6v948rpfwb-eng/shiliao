// arXiv 的 Atom 接口。注意：http://export.arxiv.org 会返回 0 字节，必须用 https 并带 UA。

const API = 'https://export.arxiv.org/api/query'
const UA = 'shiliao/0.1 (local research notebook)'

function pick(block, tag) {
  const m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'))
  return m ? m[1] : ''
}

function clean(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseAtom(xml) {
  const entries = xml.split('<entry>').slice(1)
  return entries.map((raw) => {
    const block = raw.split('</entry>')[0]
    const id = clean(pick(block, 'id'))
    const title = clean(pick(block, 'title'))
    const summary = clean(pick(block, 'summary'))
    const published = clean(pick(block, 'published')).slice(0, 10)
    const updated = clean(pick(block, 'updated')).slice(0, 10)
    const authors = []
    const authorRe = /<author>([\s\S]*?)<\/author>/g
    let m
    while ((m = authorRe.exec(block))) {
      const name = clean(pick(m[1], 'name'))
      if (name) authors.push(name)
    }
    const categories = []
    const catRe = /<category[^>]*term="([^"]+)"/g
    while ((m = catRe.exec(block))) categories.push(m[1])
    const absUrl = id
    const pdfUrl = (absUrl.match(/arxiv\.org\/abs\/(.+?)(v\d+)?$/) || [])[0]
      ? absUrl.replace('/abs/', '/pdf/')
      : ''
    return { id, title, summary, published, updated, authors, categories, url: absUrl, pdf: pdfUrl }
  })
}

export async function searchArxiv(query, { max = 10, sortBy = 'relevance' } = {}) {
  const url = API
    + '?search_query=' + encodeURIComponent('all:' + query)
    + '&start=0&max_results=' + max
    + '&sortBy=' + sortBy + '&sortOrder=descending'
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error('arXiv 返回 HTTP ' + res.status)
  const xml = await res.text()
  return parseAtom(xml)
}

export async function fetchArxivId(id) {
  const clean0 = String(id).replace(/^.*arxiv\.org\/(abs|pdf)\//, '').replace(/\.pdf$/, '')
  const res = await fetch(API + '?id_list=' + encodeURIComponent(clean0), {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error('arXiv 返回 HTTP ' + res.status)
  const list = parseAtom(await res.text())
  if (!list.length) throw new Error('arXiv 没找到 ' + clean0)
  return list[0]
}
