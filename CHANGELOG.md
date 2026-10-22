# 更新记录

## 0.1 — 能收、能搜了

**新增**

- `core/html.js`：自写容错 HTML 解析器（建树）+ Markdown 渲染器
  （标题 / 段落 / 粗斜体 / 行内代码 / 代码块 / 列表 / 引用 / 表格 / 图片 / 链接）
- `core/extract.js`：正文提取。剪枝 + 按「字数 + 中文加权 − 链接占比」打分选主块，再往下钻
- `core/fetch-url.js`：带 UA、超时、只接受 http(s) 的抓取
- `core/arxiv.js`：arXiv Atom 接口，检索与按 id 取单篇
- `core/store.js`：每份资料一个 Markdown 文件 + `index.json`，带 frontmatter
- `core/search.js`：中文二元组切分 + BM25（标题 ×3.2、标签 ×1.8）
- `cli/gather.js`：`add-url` / `add-file` / `arxiv` / `search` / `list` / `show` / `rm` / `rebuild` / `where`
- `serve.js` + `web/`：本地网页界面，三个标签页（检索 / 收录 / 论文）
- `tests/run.js`：38 项离线自检

**踩过的坑（写进注释了）**

- arXiv 把整页内容套在 `<div class="flex-wrap-footer">` 里：一见到 `footer` 就删会把正文删光。
  改成「只有这块内容明显小于父节点时才认定它是配件」。
- 只按总字数选主块，永远会选中最外层包裹 div。改成选完之后往下钻。
- `export.arxiv.org` 用 http 访问会返回 0 字节，必须 https + 带 User-Agent。
