# 拾料

把网页和论文收进本地库，能搜、能读、能存成 Markdown。

> 资料是数据，代码是引擎。

## 这是什么

一个本地资料收录器。三件事：

1. **收进来** — 给一个网址，抓正文、去掉导航广告；抓不到的站（要登录、要付费的）就手贴正文
2. **搜得到** — 本地建索引，中文按两个字一组切，BM25 打分
3. **存得住** — 每份资料一个 Markdown 文件带 frontmatter，纯文本、可读、可备份、可直接被别的工具吃

论文那条线直接接 arXiv 官方接口，搜到点一下就收。

## 为什么不用现成的

GitHub 上「中文考试资料检索」这一格基本是空的（全站只有两个仓库，合计 2 颗星）。
通用检索器（SearXNG、gpt-researcher、khoj）都是大而全的，装起来重、改起来难。
而你真正缺的那一段 —— **把搜到的东西变成能反复用的本地资料** —— 没人做，因为做题库的人都卡在版权上。

所以这里只做薄薄一层：**收、存、搜**。剩下的交给别的工具。

## 快速开始

不需要安装任何依赖，Node 22+ 就行。

```bash
# 收录一个网页
node cli/gather.js add-url https://example.com/article --tags 物理,平抛

# 手贴一份（抓不到站时用）
node cli/gather.js add-file ./某份资料.md --title "平抛运动" --tags 物理

# 搜 arXiv 论文，收录第 2 条
node cli/gather.js arxiv "world model" --max 10
node cli/gather.js arxiv "world model" --max 10 --save 2

# 本地检索
node cli/gather.js search 平抛

# 看看库里有什么
node cli/gather.js list
```

网页界面（推荐）：

```bash
node serve.js            # 默认 http://127.0.0.1:8781/
```

打开后有三个标签页：**检索**、**收录**、**论文**。

## 资料库在哪

默认是当前目录下的 `library/`，也可以用 `--root` 或环境变量 `SHILIAO_ROOT` 指定：

```bash
SHILIAO_ROOT=~/Documents/资料库 node serve.js
```

目录结构：

```
library/
  index.json                     索引（标题、来源、类型、标签、字数）
  doc-20261022223001-a1b2.md     每份资料一个文件
  paper-20261022223015-c3d4.md
```

每份文件的头部是 frontmatter：

```markdown
---
id: "doc-20261022223001-a1b2"
title: "平抛运动的分解"
source: "https://example.com/page"
kind: "article"
fetched: "2026-10-22 22:30:01"
tags: ["物理", "平抛"]
---

# 平抛运动的分解

正文……
```

**只用纯文本**：没有数据库，没有二进制。想备份就复制目录，想手改就打开编辑器。

## 正文是怎么提的

三步，全在自己的代码里，没有引第三方库：

1. **解析** — 自己写的容错 HTML 解析器，建一棵树（`core/html.js`）
2. **剪枝** — 删掉 `script`/`style`/`nav`/`form` 这类标签，再按 class/id 删导航、评论、分享条；
   但**只有当这块内容明显小于父节点时才删**，否则会误伤 —— arXiv 把整页套在 `<div class="flex-wrap-footer">` 里，
   一见 footer 就删会把正文删光（这个坑踩过）
3. **选主块** — 按「字数 + 中文加权 − 链接占比 + 标签奖励」打分选最大的容器，
   然后**往下钻**：只要子节点的分数接近父节点、内容没被腰斩，就往子节点走，避免选中外层包裹 div

Markdown 转换支持：标题、段落、粗体、斜体、行内代码、代码块、有序/无序列表、引用、表格、图片、链接（相对路径会补成绝对）。

## 检索是怎么算的

- 分词：中文按**相邻两个字**切（「平抛运动」→ 平抛、抛运、运动），英文按单词切
- 打分：BM25（k1=1.4，b=0.72），标题命中 ×3.2，标签命中 ×1.8
- 结果带一句命中附近的摘要

没有词典、没有向量库。好处是零依赖、快、可解释；代价是中文单字查询效果一般，也没法做语义检索。

## 目录

```
core/html.js        HTML 解析 + Markdown 渲染
core/extract.js     正文提取（剪枝 + 打分 + 往下钻）
core/fetch-url.js   抓网页（带 UA、超时）
core/arxiv.js       arXiv Atom 接口
core/store.js       本地库读写（frontmatter + index.json）
core/search.js      分词与 BM25
cli/gather.js       命令行
serve.js            本地服务器（静态页 + JSON 接口）
web/                网页界面
samples/            测试样例（不联网）
tests/run.js        自检
```

## 自检

```bash
node tests/run.js
```

38 项断言，覆盖实体解码、HTML→Markdown、正文提取、arXiv 解析、库读写、检索排序、索引重建。**全部离线**，用 `samples/` 里的样例。

## 路线图

- [x] 网页收录（剪枝 + 主块提取 + Markdown）
- [x] 手贴收录（抓不到的站）
- [x] arXiv 检索与收录
- [x] 本地 BM25 检索
- [ ] PDF 收录（先把 PDF 转文本再接进来）
- [ ] 标签页与筛选
- [ ] 导出成 openstudy 题库格式（`tools/import-md.js` 已经能吃 Markdown）

## 说明

- **只处理你自己有权获取的内容。** 付费墙后面的东西不要用这个绕过。
- 资料库默认不进仓库（`.gitignore` 里有 `library/`），因为里面会有版权内容。

## 许可

MIT
