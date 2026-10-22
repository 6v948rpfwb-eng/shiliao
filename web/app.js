// 拾料 前端。没有框架，直接操作 DOM。

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const md = (s) => esc(s)
  .replace(/^### (.*)$/gm, '<h3>$1</h3>')
  .replace(/^## (.*)$/gm, '<h2>$1</h2>')
  .replace(/^# (.*)$/gm, '<h1>$1</h1>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  .replace(/\n{2,}/g, '</p><p>')
  .replace(/\n/g, '<br>')

async function api(path, body) {
  const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}
  const res = await fetch('/api/' + path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status))
  return data
}

function tab(name) {
  for (const [id, panel] of [['search', 'panel-search'], ['add', 'panel-add'], ['arxiv', 'panel-arxiv']]) {
    $('tab-' + id).classList.toggle('on', id === name)
    $(panel).hidden = id !== name
  }
}

$('tab-search').onclick = () => tab('search')
$('tab-add').onclick = () => tab('add')
$('tab-arxiv').onclick = () => tab('arxiv')

function renderHits(items, emptyText) {
  const box = $('hits')
  if (!items.length) { box.innerHTML = '<div class="msg muted">' + esc(emptyText) + '</div>'; return }
  box.innerHTML = items.map((h) => `
    <div class="hit" data-id="${esc(h.id)}">
      <div class="t">${esc(h.title)}</div>
      <div class="meta">${esc(h.kind)} · ${esc(h.fetched || '')} · ${esc(h.source || '')}${h.score ? ' · 相关度 ' + h.score : ''}</div>
      ${h.snippet ? '<div class="snip">' + esc(h.snippet) + '</div>' : ''}
    </div>`).join('')
  for (const el of box.querySelectorAll('.hit')) el.onclick = () => openDoc(el.dataset.id)
}

async function openDoc(id) {
  const doc = await api('doc?id=' + encodeURIComponent(id))
  const box = $('reader')
  box.hidden = false
  box.innerHTML = `<div class="row" style="justify-content:space-between">
      <div><h2 style="margin:0">${esc(doc.title)}</h2>
      <div class="meta" style="margin-top:6px">${esc(doc.kind)} · ${esc(doc.fetched)} · ${(doc.tags || []).map((t) => '<span class="tag">' + esc(t) + '</span>').join('')}</div>
      <div class="meta">${doc.source ? '<a href="' + esc(doc.source) + '" target="_blank" rel="noreferrer">' + esc(doc.source) + '</a>' : ''}</div></div>
      <button class="plain" id="close">收起</button>
    </div><div style="margin-top:14px"><p>${md(doc.body)}</p></div>`
  $('close').onclick = () => { box.hidden = true }
  box.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

$('go').onclick = doSearch
$('q').onkeydown = (e) => { if (e.key === 'Enter') doSearch() }

async function doSearch() {
  const q = $('q').value.trim()
  if (!q) return
  const data = await api('search?q=' + encodeURIComponent(q))
  renderHits(data.items, '没找到。')
}

$('reload').onclick = async () => {
  const data = await api('list')
  renderHits(data.items, '资料库还是空的。先去「收录」放一份进来。')
}

$('addurl').onclick = async () => {
  const url = $('url').value.trim()
  const msg = $('addmsg')
  if (!url) return
  msg.className = 'msg muted'
  msg.textContent = '抓取中…'
  try {
    const data = await api('add', { url, kind: $('kind').value, tags: splitTags($('tags').value) })
    msg.className = 'msg ok'
    msg.textContent = '已收录：' + data.doc.title
    $('url').value = ''
    await $('reload').onclick()
  } catch (e) {
    msg.className = 'msg bad'
    msg.textContent = '抓不到：' + e.message + '（可以改用下面的手贴框）'
  }
}

$('addtext').onclick = async () => {
  const title = $('title').value.trim()
  const markdown = $('body').value.trim()
  const msg = $('addmsg')
  if (!title || !markdown) { msg.className = 'msg bad'; msg.textContent = '标题和正文都要填。'; return }
  try {
    const data = await api('add', {
      title, markdown, source: $('source').value.trim(), kind: $('kind').value,
      tags: splitTags($('tags').value),
    })
    msg.className = 'msg ok'
    msg.textContent = '已存：' + data.doc.title
    $('title').value = ''; $('body').value = ''; $('source').value = ''
  } catch (e) {
    msg.className = 'msg bad'
    msg.textContent = '失败：' + e.message
  }
}

function splitTags(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
}

$('asearch').onclick = async () => {
  const q = $('aq').value.trim()
  if (!q) return
  const box = $('ares')
  box.innerHTML = '<div class="msg muted">查 arXiv…</div>'
  try {
    const data = await api('arxiv?q=' + encodeURIComponent(q))
    if (!data.items.length) { box.innerHTML = '<div class="msg muted">没有结果。</div>'; return }
    box.innerHTML = data.items.map((p, i) => `
      <div class="hit">
        <div class="t">${esc(p.title)}</div>
        <div class="meta">${esc(p.published)} · ${esc((p.authors || []).slice(0, 3).join('、'))}${(p.authors || []).length > 3 ? ' 等' : ''} · ${esc(p.url)}</div>
        <div class="snip">${esc((p.summary || '').slice(0, 260))}…</div>
        <div style="margin-top:8px"><button class="plain" data-i="${i}">收进资料库</button></div>
      </div>`).join('')
    for (const btn of box.querySelectorAll('button[data-i]')) {
      btn.onclick = async () => {
        btn.disabled = true
        try {
          const data = await api('save-arxiv', { paper: box.__papers[Number(btn.dataset.i)] })
          btn.textContent = '已收录'
        } catch (e) {
          btn.disabled = false
          btn.textContent = '失败：' + e.message
        }
      }
    }
    box.__papers = data.items
  } catch (e) {
    box.innerHTML = '<div class="msg bad">arXiv 出错：' + esc(e.message) + '</div>'
  }
}

$('reload').onclick()
