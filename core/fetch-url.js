// 抓网页。带 UA、超时、只接受 html/文本；不跟随到非 http(s)。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 shiliao/0.1'

export async function fetchUrl(url, { timeoutMs = 25000 } = {}) {
  const target = new URL(url)
  if (!/^https?:$/.test(target.protocol)) throw new Error('只支持 http/https')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(target.toString(), {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    const type = res.headers.get('content-type') || ''
    const body = await res.text()
    return { status: res.status, type, body, url: res.url || target.toString() }
  } finally {
    clearTimeout(timer)
  }
}
