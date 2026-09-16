---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '63c22054-7462-4479-a5f3-283a2083557e'
  PropagateID: '63c22054-7462-4479-a5f3-283a2083557e'
  ReservedCode1: 'bdf75de0-aecb-41e4-a1d0-e08a1b58c089'
  ReservedCode2: 'bdf75de0-aecb-41e4-a1d0-e08a1b58c089'
---

# Flux · 表达式优先脚本语言

Flux 是一门**从零设计的脚本语言**，面向实验室与教学场景。与 Python 不同，Flux 以**表达式优先**为核心设计：if 是表达式、管道是一等运算符、变量默认不可变、空值安全内建。

## 与 Python 的核心区别

| 特性 | Python | Flux |
|---|---|---|
| 数据变换 | `sum(map(f, filter(g, data)))` 嵌套 | `data \|> filter(g) \|> map(f) \|> sum` 管道 |
| 变量 | 全部可变 | `let` 不可变 / `var` 可变 |
| if | 语句，不返回值 | 表达式，`let x = if cond { 1 } else { 2 }` |
| 分支 | if/elif 链 | `match` 模式匹配 |
| 空值 | `None` 运行时崩溃 | `obj?.prop` 安全访问，`v ?? 默认值` |
| 字符串 | f-string (3.6+) | `f"${expr}"` 一等公民 |
| 区间 | `range(1,10)` 函数 | `1..<10` / `1..=10` 运算符 |
| 断言 | `assert` 语句 | `assert cond, "msg"` 一等公民 |
| 块结构 | 缩进 | `{ }` 花括号 |
| 函数 | `def` | `fn` + 箭头函数 `fn(x) => x * x` |

## 快速开始

### 浏览器 IDE
双击 `index.html`（需与 `core.js` 同目录）。

### 命令行
```bash
node cli.js examples/pipeline.flux   # 运行脚本
node cli.js -e 'print(1..<10 |> fn(a){a.reduce(fn(x,y){x+y},0)})'  # 求值
node cli.js                           # REPL
```

## 语言速览

```ruby
# 变量
let x = 10            # 不可变
var y = 20            # 可变
y = 30                # OK

# 管道 — 数据像流水一样流动
[1,2,3,4,5]
  |> fn(arr) { arr.filter(fn(x) { x > 2 }) }
  |> fn(arr) { arr.map(fn(x) { x * x }) }
  |> fn(arr) { arr.reduce(fn(a, b) { a + b }, 0) }

# 表达式 if
let grade = if score >= 90 { "A" } else { "B" }

# match 模式匹配
let r = match color {
  "red"   => { 1 }
  "green" => { 2 }
  _       => { 0 }
}

# 函数
fn fib(n) {
  if n < 2 { return n }
  return fib(n - 1) + fib(n - 2)
}
let sq = fn(x) => x * x    # 箭头函数

# 范围
for i in 1..<5 { print(i) }   # 1 2 3 4
for i in 1..=5 { print(i) }   # 1 2 3 4 5

# 空值安全
let name = user?.name ?? "匿名"

# 字符串插值
print(f"Hello, ${name}! 2+2=${2+2}")

# 断言
assert sorted == [1, 2, 3], "排序结果不正确"
```

## 内置库
- **基础**：`print` `len` `type` `str` `int` `float` `abs` `min` `max` `sum` `round` `range`
- **math**：`sqrt` `sin` `cos` `tan` `exp` `log` `pow` `floor` `ceil` `pi` `e`
- **random**：`random` `randint` `uniform` `choice` `shuffle`
- **数组**：`map` `filter` `reduce` `push` `pop` `sort` `reverse` `join` `slice` `contains` `first` `last` `each` `flat`
- **字符串**：`upper` `lower` `trim` `split` `replace` `contains` `find` `slice` `repeat`
- **draw**（浏览器）：`line` `circle` `fill_circle` `rect` `fill_rect` `plot` `text` `point` `background`

## 目录结构
```
flux-lang/
├── core.js        # 核心解释器（UMD，浏览器/Node 通用）
├── cli.js         # 命令行入口
├── index.html     # 浏览器 IDE
├── examples/      # 示例脚本
│   ├── fib.flux
│   ├── pipeline.flux
│   ├── sort.flux
│   ├── pi.flux
│   └── sin.flux
└── README.md
```

---
Flux v0.1 · 由星辰超级智能体辅助开发

> AI生成