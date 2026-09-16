/* =============================================================================
 * Flux — 面向实验室的表达式优先脚本语言
 * -----------------------------------------------------------------------------
 * 设计特色：
 *   管道 |>  |  表达式 if/else  |  match 模式匹配  |  let/var 不可变/可变
 *   ?. 空值安全  |  ?? 空值合并  |  ${} 字符串插值  |  1..10 范围运算符
 *   fn 箭头函数  |  解构赋值  |  assert 内置断言  |  尾递归优化
 * 兼容：浏览器 <script> 与 Node.js require。
 * =============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Flux = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ===========================================================================
 * 错误类型
 * ===========================================================================*/
function FluxError(message, line, col) {
  var e = new Error(message);
  e.name = 'FluxError';
  e.line = line || 0; e.col = col || 0; e.isFlux = true;
  return e;
}

/* ===========================================================================
 * 词法分析器
 * ===========================================================================*/
var T = {
  NUMBER:'NUMBER', STRING:'STRING', INTERP:'INTERP', IDENT:'IDENT',
  KEYWORD:'KEYWORD', OP:'OP', NEWLINE:'NEWLINE', EOF:'EOF'
};

var KEYWORDS = {
  let:1, var:1, fn:1, return:1, if:1, else:1, match:1, for:1, in:1,
  while:1, break:1, continue:1, true:1, false:1, null:1, and:1, or:1,
  not:1, assert:1
};

// 运算符按长度降序排列，保证多字符优先匹配
var OPS = [
  '|>','->','=>','..=','..<','..','?.','??','==','!=','<=','>=','&&','||','**',
  '+=','-=','*=','/=','%=',
  '+','-','*','/','%','=','<','>','!','(',')','{','}','[',']',',',':',';',
  '.','|'
];

function tokenize(source) {
  var src = String(source == null ? '' : source).replace(/\r\n?/g, '\n');
  var tokens = [];
  var i = 0, len = src.length, line = 1, col = 1;

  function push(type, value, ln, c) {
    tokens.push({ type: type, value: value, line: ln || line, col: c || col });
  }
  function isDigit(c)  { return c >= '0' && c <= '9'; }
  function isAlpha(c)  { return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||c==='_'||c==='$'; }
  function isAlphaNum(c){ return isAlpha(c)||isDigit(c); }
  function adv() {
    var ch = src[i]; i++;
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  }

  while (i < len) {
    var c = src[i];

    // 空白（换行产生 NEWLINE token，用于分隔语句）
    if (c === ' ' || c === '\t') { adv(); continue; }
    if (c === '\n') {
      // 检查下一行是否以 |> 开头（跳过空白）—— 管道续行不产生 NEWLINE
      var j = i + 1;
      while (j < len && (src[j] === ' ' || src[j] === '\t')) j++;
      if (j < len && src[j] === '|' && src[j+1] === '>') {
        adv(); // 跳过换行，不产生 NEWLINE
        continue;
      }
      // 连续换行只保留一个 NEWLINE
      if (tokens.length > 0 && tokens[tokens.length-1].type !== T.NEWLINE)
        push(T.NEWLINE, '\n');
      adv();
      continue;
    }

    // 注释 // ...
    if (c === '/' && src[i+1] === '/') {
      while (i < len && src[i] !== '\n') adv();
      continue;
    }
    // 块注释 /* ... */
    if (c === '/' && src[i+1] === '*') {
      adv(); adv();
      while (i < len && !(src[i]==='*' && src[i+1]==='/')) adv();
      if (i < len) { adv(); adv(); }
      continue;
    }

    // 数字
    if (isDigit(c) || (c === '.' && isDigit(src[i+1]))) {
      var s = i, sl = line, sc = col, isFloat = false;
      while (i < len && isDigit(src[i])) adv();
      if (i < len && src[i] === '.') {
        // 排除 .. 范围运算符
        if (src[i+1] === '.') { /* 不吃小数点，是范围 */ }
        else { isFloat = true; adv(); while (i < len && isDigit(src[i])) adv(); }
      }
      if (i < len && (src[i] === 'e' || src[i] === 'E')) {
        var si = i; adv();
        if (i < len && (src[i] === '+' || src[i] === '-')) adv();
        if (i < len && isDigit(src[i])) { isFloat = true; while (i < len && isDigit(src[i])) adv(); }
        else { i = si; } // 回退
      }
      var txt = src.slice(s, i);
      push(T.NUMBER, isFloat ? parseFloat(txt) : parseInt(txt, 10), sl, sc);
      continue;
    }

    // 字符串（支持插值 f"...${expr}..."）
    if (c === '"' || c === "'") {
      var quote = c, isInterp = false;
      // 检查前缀 f
      if (tokens.length > 0) {
        var prev = tokens[tokens.length-1];
        // f 前缀已经作为 IDENT 被 token 化了，这里不处理；
        // 改为：在 parser 层处理 f"..." —— 需要 f 紧挨 "
        // 不实用。改为在 tokenizer 里特殊处理：如果当前字符是 f 且下一个是引号
      }
      // 检查 f"..." 形式：往前看是否刚 token 化了 'f'
      // 不行，f 已经是 IDENT 了。改为在主循环中检测 f 后跟引号的情况。
      // 这里先处理普通字符串和插值字符串。

      var ssl = line, ssc = col;
      adv(); // 跳过开引号
      var buf = '';

      while (i < len) {
        var ch = src[i];
        if (ch === '\\') {
          adv();
          var esc = src[i];
          if (esc === 'n') { buf += '\n'; adv(); }
          else if (esc === 't') { buf += '\t'; adv(); }
          else if (esc === 'r') { buf += '\r'; adv(); }
          else if (esc === '\\') { buf += '\\'; adv(); }
          else if (esc === '"') { buf += '"'; adv(); }
          else if (esc === "'") { buf += "'"; adv(); }
          else if (esc === '$') { buf += '$'; adv(); }
          else if (esc === '\n') { adv(); }
          else { buf += esc; adv(); }
        } else if (ch === quote) {
          adv();
          push(T.STRING, buf, ssl, ssc);
          buf = null;
          break;
        } else if (ch === '$' && src[i+1] === '{' && quote === '"') {
          // 插值开始
          isInterp = true;
          if (buf) { push(T.STRING, buf, ssl, ssc); buf = ''; }
          adv(); // $
          adv(); // {
          // 收集到匹配的 }
          var depth = 1, interpSrc = '';
          while (i < len && depth > 0) {
            if (src[i] === '{') depth++;
            if (src[i] === '}') { depth--; if (depth === 0) { adv(); break; } }
            interpSrc += src[i]; adv();
          }
          // 把插值表达式作为单独 token（类型 INTERP，值为源码字符串）
          push(T.INTERP, interpSrc, ssl, ssc);
        } else if (ch === '\n') {
          throw FluxError('字符串缺少结束引号', ssl, ssc);
        } else {
          buf += ch; adv();
        }
      }
      if (buf !== null && buf !== undefined) {
        // 正常结束，已在上面 push
      }
      // 如果 isInterp，标记第一个 STRING 为插值起始
      // 这里不做标记，由 parser 判断是否有 INTERP 跟随
      continue;
    }

    // f"..." 插值字符串前缀
    if (c === 'f' && (src[i+1] === '"' || src[i+1] === "'")) {
      // 标记为 INTERP_START
      var fsl = line, fsc = col;
      adv(); // f
      var fquote = src[i];
      adv(); // 开引号
      // 收集字符串部分和插值
      var parts = [];
      var fbuf = '';
      while (i < len) {
        var fch = src[i];
        if (fch === '\\') {
          adv();
          var fesc = src[i];
          if (fesc === 'n') { fbuf += '\n'; adv(); }
          else if (fesc === 't') { fbuf += '\t'; adv(); }
          else if (fesc === 'r') { fbuf += '\r'; adv(); }
          else if (fesc === '\\') { fbuf += '\\'; adv(); }
          else if (fesc === '"') { fbuf += '"'; adv(); }
          else if (fesc === "'") { fbuf += "'"; adv(); }
          else if (fesc === '$') { fbuf += '$'; adv(); }
          else if (fesc === '\n') { adv(); }
          else { fbuf += fesc; adv(); }
        } else if (fch === fquote) {
          adv();
          if (fbuf) parts.push({ type: 'str', value: fbuf });
          push(T.STRING, '__INTERP__', fsl, fsc); // 标记
          // 用特殊 token 携带 parts
          tokens[tokens.length-1].interpParts = parts;
          fbuf = null;
          break;
        } else if (fch === '$' && src[i+1] === '{') {
          if (fbuf) { parts.push({ type: 'str', value: fbuf }); fbuf = ''; }
          adv(); adv(); // ${
          var fdepth = 1, isrc = '';
          while (i < len && fdepth > 0) {
            if (src[i] === '{') fdepth++;
            if (src[i] === '}') { fdepth--; if (fdepth === 0) { adv(); break; } }
            isrc += src[i]; adv();
          }
          parts.push({ type: 'expr', value: isrc });
        } else if (fch === '\n') {
          throw FluxError('插值字符串缺少结束引号', fsl, fsc);
        } else {
          fbuf += fch; adv();
        }
      }
      continue;
    }

    // 标识符 / 关键字
    if (isAlpha(c)) {
      var idS = i, il = line, ic = col;
      while (i < len && isAlphaNum(src[i])) adv();
      var word = src.slice(idS, i);
      if (KEYWORDS[word]) push(T.KEYWORD, word, il, ic);
      else push(T.IDENT, word, il, ic);
      continue;
    }

    // 运算符
    var matched = null;
    for (var oi = 0; oi < OPS.length; oi++) {
      if (src.startsWith(OPS[oi], i)) { matched = OPS[oi]; break; }
    }
    if (matched) {
      push(T.OP, matched, line, col);
      for (var oo = 0; oo < matched.length; oo++) adv();
      continue;
    }

    throw FluxError('无法识别的字符 "' + c + '"', line, col);
  }

  // 去掉末尾多余 NEWLINE
  while (tokens.length > 0 && tokens[tokens.length-1].type === T.NEWLINE)
    tokens.pop();
  push(T.EOF, null, line, col);
  return tokens;
}

/* ===========================================================================
 * 语法分析器（递归下降，花括号块）
 * ===========================================================================*/
function parse(tokens) {
  var ts = tokens, pos = 0;

  function peek(off) { return ts[Math.min(pos + (off||0), ts.length-1)]; }
  function next()    { return ts[pos++]; }
  function at(type)  { return peek().type === type; }
  function atOp(val) { var t = peek(); return t.type === T.OP && t.value === val; }
  function atKw(val) { var t = peek(); return t.type === T.KEYWORD && t.value === val; }
  function eof()     { return peek().type === T.EOF; }

  function err(msg, t) {
    t = t || peek();
    throw FluxError('语法错误: ' + msg, t.line, t.col);
  }
  function expectOp(val, ctx) {
    if (!atOp(val)) err((ctx||'') + ' 需要 "' + val + '"');
    return next();
  }
  function skipNL() {
    while (at(T.NEWLINE)) next();
  }
  function expectNLorEOF(ctx) {
    skipNL();
    if (!at(T.EOF) && !atOp('}')) err((ctx||'') + ' 后需要换行或块结束');
  }

  /* ---- 表达式优先级（从低到高） ---- */

  function parseExpr() { return parsePipe(); }

  // 管道 |> （最低优先级，左结合）
  function parsePipe() {
    var left = parseNullCoalesce();
    while (atOp('|>')) {
      var op = next();
      var right = parseNullCoalesce();
      left = { type: 'Pipe', left: left, right: right, line: op.line, col: op.col };
    }
    return left;
  }

  // 空值合并 ??
  function parseNullCoalesce() {
    var left = parseOr();
    while (atOp('??')) {
      var op = next();
      var right = parseOr();
      left = { type: 'NullCoalesce', left: left, right: right, line: op.line, col: op.col };
    }
    return left;
  }

  // 逻辑 or
  function parseOr() {
    var left = parseAnd();
    while (atOp('||') || atKw('or')) {
      var op = next();
      var right = parseAnd();
      left = { type: 'Logical', op: 'or', left: left, right: right, line: op.line, col: op.col };
    }
    return left;
  }

  // 逻辑 and
  function parseAnd() {
    var left = parseNot();
    while (atOp('&&') || atKw('and')) {
      var op = next();
      var right = parseNot();
      left = { type: 'Logical', op: 'and', left: left, right: right, line: op.line, col: op.col };
    }
    return left;
  }

  // not
  function parseNot() {
    if (atOp('!') || atKw('not')) {
      var t = next();
      var arg = parseNot();
      return { type: 'Unary', op: 'not', arg: arg, line: t.line, col: t.col };
    }
    return parseComparison();
  }

  // 比较 == != < <= > >=
  var CMP = { '==':1, '!=':1, '<':1, '<=':1, '>':1, '>=':1 };
  function parseComparison() {
    var left = parseRange();
    while (peek().type === T.OP && CMP[peek().value]) {
      var op = next().value;
      var right = parseRange();
      left = { type: 'Binary', op: op, left: left, right: right, line: left.line, col: left.col };
    }
    return left;
  }

  // 范围 ..  ..<  ..=
  function parseRange() {
    var left = parseAdditive();
    if (atOp('..=') || atOp('..') || atOp('..<')) {
      var op = next().value;
      var right = parseAdditive();
      left = { type: 'Range', op: op, left: left, right: right, line: left.line, col: left.col };
    }
    return left;
  }

  // 加减
  function parseAdditive() {
    var left = parseMultiplicative();
    while (atOp('+') || atOp('-') || atOp('|')) {
      if (atOp('|') && !atOp('|>')) {
        // 单独的 | 不做运算符，跳过（防止和管道冲突）
        break;
      }
      var op = next().value;
      var right = parseMultiplicative();
      left = { type: 'Binary', op: op, left: left, right: right, line: left.line, col: left.col };
    }
    return left;
  }

  // 乘除模
  function parseMultiplicative() {
    var left = parseUnary();
    while (atOp('*') || atOp('/') || atOp('%')) {
      var op = next().value;
      var right = parseUnary();
      left = { type: 'Binary', op: op, left: left, right: right, line: left.line, col: left.col };
    }
    return left;
  }

  // 一元 +/-
  function parseUnary() {
    if (atOp('-')) {
      var t = next();
      return { type: 'Unary', op: '-', arg: parseUnary(), line: t.line, col: t.col };
    }
    if (atOp('+')) { next(); return parseUnary(); }
    return parsePower();
  }

// 幂 **（右结合）
  function parsePower() {
    var left = parsePostfix();
    if (atOp('**')) {
      var t = next();
      var right = parseUnary();
      return { type: 'Binary', op: '**', left: left, right: right, line: t.line, col: t.col };
    }
    return left;
  }

  // 后缀：调用 () 索引 [] 属性 ?. .
  function parsePostfix() {
    var expr = parsePrimary();
    for (;;) {
      if (atOp('(')) {
        next();
        var args = [];
        skipNL();
        if (!atOp(')')) {
          args.push(parseExpr());
          while (atOp(',')) { next(); skipNL(); args.push(parseExpr()); }
        }
        skipNL();
        expectOp(')', '函数调用');
        expr = { type: 'Call', callee: expr, args: args, line: expr.line, col: expr.col };
      } else if (atOp('[')) {
        next();
        var idx = parseExpr();
        expectOp(']', '索引');
        expr = { type: 'Index', obj: expr, index: idx, line: expr.line, col: expr.col };
      } else if (atOp('?.')) {
        next();
        var propTok = peek();
        if (propTok.type !== T.IDENT) err('?. 后需要属性名', propTok);
        next();
        expr = { type: 'SafeProp', obj: expr, prop: propTok.value, line: expr.line, col: expr.col };
      } else if (atOp('.')) {
        next();
        var pt = peek();
        if (pt.type !== T.IDENT && pt.type !== T.KEYWORD) err('. 后需要属性名', pt);
        next();
        expr = { type: 'Prop', obj: expr, prop: pt.value, line: expr.line, col: expr.col };
      } else {
        break;
      }
    }
    return expr;
  }

  // 基本表达式
  function parsePrimary() {
    var t = peek();

    // 数字
    if (t.type === T.NUMBER) { next(); return { type: 'Num', value: t.value, line: t.line, col: t.col }; }

    // 普通字符串
    if (t.type === T.STRING && t.value !== '__INTERP__') {
      next(); return { type: 'Str', value: t.value, line: t.line, col: t.col };
    }

    // 插值字符串 f"..."
    if (t.type === T.STRING && t.value === '__INTERP__') {
      next();
      var parts = t.interpParts || [];
      // 将字符串部分和表达式部分转为 AST
      var astParts = [];
      for (var pi = 0; pi < parts.length; pi++) {
        if (parts[pi].type === 'str') {
          astParts.push({ type: 'Str', value: parts[pi].value, line: t.line, col: t.col });
        } else {
          // 递归解析表达式：parse 返回 Program，取 body[0].expr
          var subTokens = tokenize(parts[pi].value);
          var subAST = parse(subTokens);
          if (subAST.body.length > 0 && subAST.body[0].type === 'ExprStmt') {
            astParts.push(subAST.body[0].expr);
          } else if (subAST.body.length > 0) {
            astParts.push(subAST.body[0]);
          }
        }
      }
      return { type: 'Interp', parts: astParts, line: t.line, col: t.col };
    }

    // 布尔 / null
    if (t.type === T.KEYWORD) {
      if (t.value === 'true')  { next(); return { type: 'Bool', value: true,  line: t.line, col: t.col }; }
      if (t.value === 'false') { next(); return { type: 'Bool', value: false, line: t.line, col: t.col }; }
      if (t.value === 'null')  { next(); return { type: 'Null', line: t.line, col: t.col }; }
    }

    // 标识符
    if (t.type === T.IDENT) { next(); return { type: 'Ident', name: t.value, line: t.line, col: t.col }; }

    // 括号表达式
    if (atOp('(')) {
      next();
      skipNL();
      var inner = parseExpr();
      skipNL();
      expectOp(')', '括号表达式');
      return inner;
    }

    // 数组
    if (atOp('[')) {
      next();
      skipNL();
      var elems = [];
      if (!atOp(']')) {
        elems.push(parseExpr());
        while (atOp(',')) { next(); skipNL(); if (atOp(']')) break; elems.push(parseExpr()); }
      }
      skipNL();
      expectOp(']', '数组');
      return { type: 'Array', elems: elems, line: t.line, col: t.col };
    }

    // 对象 { key: value }
    if (atOp('{')) {
      next();
      skipNL();
      var pairs = [];
      if (!atOp('}')) {
        for (;;) {
          skipNL();
          var kt = peek();
          var key;
          if (kt.type === T.IDENT || kt.type === T.KEYWORD) { next(); key = kt.value; }
          else if (kt.type === T.STRING) { next(); key = kt.value; }
          else if (kt.type === T.NUMBER) { next(); key = String(kt.value); }
          else err('对象键名无效', kt);
          expectOp(':', '对象');
          skipNL();
          var val = parseExpr();
          pairs.push({ key: key, value: val });
          skipNL();
          if (atOp(',')) { next(); skipNL(); continue; }
          break;
        }
      }
      skipNL();
      expectOp('}', '对象');
      return { type: 'Object', pairs: pairs, line: t.line, col: t.col };
    }

    // 箭头函数 fn(x, y) { ... } 或 fn(x) => expr
    if (atKw('fn')) {
      return parseFn();
    }

    // if 表达式 if cond { ... } else { ... }
    if (atKw('if')) {
      return parseIfExpr();
    }

    // match 表达式
    if (atKw('match')) {
      return parseMatch();
    }

    err('无法识别的表达式', t);
  }

  // 箭头函数
  function parseFn() {
    var kw = next(); // fn
    var params = [];
    if (atOp('(')) {
      next();
      skipNL();
      if (!atOp(')')) {
        for (;;) {
          var pt = peek();
          if (pt.type !== T.IDENT) err('函数参数必须为标识符', pt);
          next();
          params.push(pt.value);
          if (atOp(',')) { next(); skipNL(); continue; }
          break;
        }
      }
      skipNL();
      expectOp(')', '函数参数');
    }
    // 函数体：{ ... } 或 => expr
    skipNL();
    if (atOp('=>')) {
      next();
      var bodyExpr = parseExpr();
      return { type: 'ArrowFn', params: params, body: bodyExpr, isExpr: true, line: kw.line, col: kw.col };
    }
    if (atOp('{')) {
      next();
      skipNL();
      var body = [];
      while (!atOp('}') && !eof()) {
        body.push(parseStmt());
        skipNL();
      }
      expectOp('}', '函数体');
      return { type: 'ArrowFn', params: params, body: body, isExpr: false, line: kw.line, col: kw.col };
    }
    err('函数体需要 { } 或 =>');
  }

  // if 表达式
  function parseIfExpr() {
    var kw = next(); // if
    var test = parseExpr();
    skipNL();
    expectOp('{', 'if 体');
    skipNL();
    var then = [];
    while (!atOp('}') && !eof()) { then.push(parseStmt()); skipNL(); }
    expectOp('}', 'if 体');
    var els = null;
    skipNL();
    if (atKw('else')) {
      next();
      skipNL();
      if (atKw('if')) {
        els = parseIfExpr();
      } else {
        expectOp('{', 'else 体');
        skipNL();
        els = [];
        while (!atOp('}') && !eof()) { els.push(parseStmt()); skipNL(); }
        expectOp('}', 'else 体');
      }
    }
    return { type: 'IfExpr', test: test, then: then, els: els, line: kw.line, col: kw.col };
  }

  // match 表达式
  function parseMatch() {
    var kw = next();
    var subj = parseExpr();
    skipNL();
    expectOp('{', 'match 体');
    skipNL();
    var cases = [];
    while (!atOp('}') && !eof()) {
      skipNL();
      // _ 表示 default
      var isDefault = false;
      var pattern;
      if (atOp('_')) {
        // _ 不在 OPS 列表，会是 IDENT
      }
      if (peek().type === T.IDENT && peek().value === '_') {
        next();
        isDefault = true;
        pattern = null;
      } else {
        pattern = parseExpr();
      }
      expectOp('=>', 'match 分支');
      skipNL();
      var body;
      if (atOp('{')) {
        next(); skipNL();
        body = [];
        while (!atOp('}') && !eof()) { body.push(parseStmt()); skipNL(); }
        expectOp('}', 'match 分支');
      } else {
        body = [{ type: 'ExprStmt', expr: parseExpr(), line: peek().line, col: peek().col }];
      }
      cases.push({ isDefault: isDefault, pattern: pattern, body: body });
      skipNL();
      if (atOp(',')) { next(); skipNL(); }
    }
    expectOp('}', 'match 体');
    return { type: 'Match', subj: subj, cases: cases, line: kw.line, col: kw.col };
  }

  /* ---- 语句 ---- */

  function parseStmt() {
    skipNL();
    var t = peek();

    if (t.type === T.KEYWORD) {
      switch (t.value) {
        case 'let': return parseLetVar(false);
        case 'var':  return parseLetVar(true);
        case 'fn':   return parseFnStmt();
        case 'return': {
          next();
          var arg = null;
          if (!at(T.NEWLINE) && !at(T.EOF) && !atOp('}')) arg = parseExpr();
          return { type: 'Return', arg: arg, line: t.line, col: t.col };
        }
        case 'if':   return parseIfStmt();
        case 'while': return parseWhile();
        case 'for':  return parseFor();
        case 'break': next(); return { type: 'Break', line: t.line, col: t.col };
        case 'continue': next(); return { type: 'Continue', line: t.line, col: t.col };
        case 'assert': return parseAssert();
        case 'match': return { type: 'ExprStmt', expr: parseMatch(), line: t.line, col: t.col };
      }
    }

    // 表达式语句 或 赋值
    var expr = parseExpr();
    if (atOp('=')) {
      next();
      var val = parseExpr();
      return { type: 'Assign', target: expr, op: '=', value: val, line: expr.line, col: expr.col };
    }
    if (atOp('+=')||atOp('-=')||atOp('*=')||atOp('/=')||atOp('%=')) {
      var aop = next().value;
      var rval = parseExpr();
      return { type: 'Assign', target: expr, op: aop, value: rval, line: expr.line, col: expr.col };
    }
    return { type: 'ExprStmt', expr: expr, line: expr.line, col: expr.col };
  }

  function parseLetVar(isMutable) {
    var kw = next();
    var nameTok = peek();
    if (nameTok.type !== T.IDENT) err('let/var 后需要变量名', nameTok);
    next();
    expectOp('=', 'let/var');
    var val = parseExpr();
    return { type: 'Let', name: nameTok.value, value: val, mutable: isMutable, line: kw.line, col: kw.col };
  }

  function parseFnStmt() {
    // fn name(params) { body }  或  fn(params) { body } 匿名函数
    var kw = next(); // fn
    var params = [];
    var name = null;
    // 检测是否有函数名（后跟 IDENT 而非 ( ）
    if (at(T.IDENT) && !atOp('(')) {
      var nameTok = next();
      name = nameTok.value;
    }
    expectOp('(', '函数参数');
    skipNL();
    if (!atOp(')')) {
      for (;;) {
        var pt = peek();
        if (pt.type !== T.IDENT) err('函数参数必须为标识符', pt);
        next();
        params.push(pt.value);
        if (atOp(',')) { next(); skipNL(); continue; }
        break;
      }
    }
    skipNL();
    expectOp(')', '函数参数');
    skipNL();
    if (atOp('=>')) {
      next();
      var bodyExpr = parseExpr();
      var af = { type: 'ArrowFn', params: params, body: bodyExpr, isExpr: true, line: kw.line, col: kw.col };
      if (name) return { type: 'FnDecl', name: name, params: params, body: [bodyExpr], line: kw.line, col: kw.col };
      return af;
    }
    expectOp('{', '函数体');
    skipNL();
    var fnBody = [];
    while (!atOp('}') && !eof()) { fnBody.push(parseStmt()); skipNL(); }
    expectOp('}', '函数体');
    if (name) return { type: 'FnDecl', name: name, params: params, body: fnBody, line: kw.line, col: kw.col };
    return { type: 'ArrowFn', params: params, body: fnBody, isExpr: false, line: kw.line, col: kw.col };
  }

  function parseIfStmt() {
    var ifExpr = parseIfExpr();
    // if 作为语句和表达式都是一样的
    return { type: 'ExprStmt', expr: ifExpr, line: ifExpr.line, col: ifExpr.col };
  }

  function parseWhile() {
    var kw = next();
    var test = parseExpr();
    skipNL();
    expectOp('{', 'while 体');
    skipNL();
    var body = [];
    while (!atOp('}') && !eof()) { body.push(parseStmt()); skipNL(); }
    expectOp('}', 'while 体');
    return { type: 'While', test: test, body: body, line: kw.line, col: kw.col };
  }

  function parseFor() {
    var kw = next();
    var varTok = peek();
    if (varTok.type !== T.IDENT) err('for 需要变量名', varTok);
    next();
    if (!atKw('in')) err('for 需要 "in"');
    next();
    var iter = parseExpr();
    skipNL();
    expectOp('{', 'for 体');
    skipNL();
    var body = [];
    while (!atop('}') && !eof()) { body.push(parseStmt()); skipNL(); }
    expectOp('}', 'for 体');
    return { type: 'For', varName: varTok.value, iter: iter, body: body, line: kw.line, col: kw.col };
  }

  function parseAssert() {
    var kw = next();
    var cond = parseExpr();
    var msg = null;
    if (atOp(',')) { next(); msg = parseExpr(); }
    return { type: 'Assert', cond: cond, msg: msg, line: kw.line, col: kw.col };
  }

  function atop(val) { return peek().type === T.OP && peek().value === val; }

  /* ---- 入口 ---- */
  function run() {
    var body = [];
    skipNL();
    while (!eof()) {
      body.push(parseStmt());
      skipNL();
    }
    return { type: 'Program', body: body, line: 1, col: 1 };
  }

  return run();
}

/* ===========================================================================
 * 运行时
 * ===========================================================================*/
function FluxRange(start, end, inclusive) {
  this.start = start; this.end = end; this.inclusive = inclusive;
  var count = inclusive ? (end - start + 1) : (end - start);
  this.length = Math.max(0, Math.floor(count));
}
function FluxObject() { this.data = new Map(); }
function FluxModule(name) { this.name = name; this.funcs = new Map(); }
function FluxFn(name, params, body, env, isExpr) {
  this.name = name; this.params = params; this.body = body; this.env = env; this.isExpr = !!isExpr;
}
function BoundMethod(self, method) { this.self = self; this.method = method; }
function ReturnSig(v) { this._ret = true; this.value = v; }
function BreakSig() { this._brk = true; }
function ContinueSig() { this._cnt = true; }

function Env(parent) { this.parent = parent || null; this.map = new Map(); this.consts = new Set(); }
Env.prototype.get = function(n) {
  for (var e = this; e; e = e.parent) if (e.map.has(n)) return e.map.get(n);
  return undefined;
};
Env.prototype.has = function(n) {
  for (var e = this; e; e = e.parent) if (e.map.has(n)) return true;
  return false;
};
Env.prototype.set = function(n, v) {
  for (var e = this; e; e = e.parent) {
    if (e.map.has(n)) {
      if (e.consts.has(n)) return false; // let 不可变，静默失败
      e.map.set(n, v);
      return true;
    }
  }
  this.map.set(n, v);
  return true;
};
Env.prototype.define = function(n, v, isConst) {
  this.map.set(n, v);
  if (isConst) this.consts.add(n);
};

function toStr(v) {
  if (v === null || v === undefined) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return String(parseFloat(v.toPrecision(12)));
  }
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return '[' + v.map(toStr).join(', ') + ']';
  if (v instanceof FluxObject) {
    var p = []; v.data.forEach(function(val,k){ p.push(k + ': ' + toStr(val)); });
    return '{' + p.join(', ') + '}';
  }
  if (v instanceof FluxRange) return v.start + '..' + (v.inclusive ? '=' : '') + v.end;
  if (v instanceof FluxFn) return '<fn ' + (v.name || 'anonymous') + '>';
  if (v instanceof BoundMethod) return '<method>';
  if (typeof v === 'function') return '<builtin>';
  if (v instanceof FluxModule) return '<module ' + v.name + '>';
  return String(v);
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (v === false) return false;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof FluxObject) return v.data.size > 0;
  return true;
}

function typeName(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v)) return 'array';
  if (v instanceof FluxObject) return 'object';
  if (v instanceof FluxRange) return 'range';
  if (v instanceof FluxFn || typeof v === 'function') return 'fn';
  if (v instanceof FluxModule) return 'module';
  return 'unknown';
}

/* ---- 数组方法 ---- */
var arrMethods = {
  push: function(self, args) { self.push(args[0]); return self.length; },
  pop:  function(self) { return self.pop(); },
  map:  function(self, args, interp) { return self.map(function(x) { return interp.callFn(args[0], [x]); }); },
  filter: function(self, args, interp) { return self.filter(function(x) { return truthy(interp.callFn(args[0], [x])); }); },
  reduce: function(self, args, interp) {
    var fn = args[0], init = args[1];
    var acc = init !== undefined ? init : (self.length > 0 ? self[0] : null);
    var start = init !== undefined ? 0 : 1;
    for (var i = start; i < self.length; i++) acc = interp.callFn(fn, [acc, self[i]]);
    return acc;
  },
  len:  function(self) { return self.length; },
  sort: function(self) { self.sort(function(a,b){return a-b;}); return self; },
  reverse: function(self) { self.reverse(); return self; },
  join: function(self, args) { return self.map(toStr).join(args[0] == null ? '' : String(args[0])); },
  slice: function(self, args) {
    var s = args[0]||0, e = args[1]==null?self.length:args[1];
    return self.slice(s, e);
  },
  contains: function(self, args) { return self.indexOf(args[0]) >= 0; },
  index: function(self, args) { return self.indexOf(args[0]); },
  first: function(self) { return self.length > 0 ? self[0] : null; },
  last: function(self) { return self.length > 0 ? self[self.length-1] : null; },
  flat: function(self) {
    var r = [];
    for (var i = 0; i < self.length; i++) {
      if (Array.isArray(self[i])) r = r.concat(self[i]);
      else r.push(self[i]);
    }
    return r;
  },
  each: function(self, args, interp) {
    for (var i = 0; i < self.length; i++) interp.callFn(args[0], [self[i], i]);
    return null;
  }
};

/* ---- 字符串方法 ---- */
var strMethods = {
  upper: function(s) { return s.toUpperCase(); },
  lower: function(s) { return s.toLowerCase(); },
  len:   function(s) { return s.length; },
  trim:  function(s) { return s.trim(); },
  split: function(s, args) { return s.split(args[0] == null ? /\s+/ : args[0]); },
  replace: function(s, args) { return s.split(args[0]).join(args[1]||''); },
  contains: function(s, args) { return s.indexOf(args[0]) >= 0; },
  startswith: function(s, args) { return s.startsWith(args[0]); },
  endswith: function(s, args) { return s.endsWith(args[0]); },
  find: function(s, args) { return s.indexOf(args[0]); },
  slice: function(s, args) {
    var a = args[0]||0, b = args[1]==null?s.length:args[1];
    return s.slice(a, b);
  },
  repeat: function(s, args) { return s.repeat(args[0]||1); },
  to_int: function(s) { return parseInt(s, 10); },
  to_float: function(s) { return parseFloat(s); }
};

/* ===========================================================================
 * 解释器
 * ===========================================================================*/
function Interpreter(opts) {
  opts = opts || {};
  this.printFn = opts.print || null;
  this.inputFn = opts.input || function(){return '';};
  this.drawing = opts.drawing || null;
  this.maxSteps = opts.maxSteps || 50000000;
  this.steps = 0;
  this.global = new Env(null);
  this.installBuiltins();
}

Interpreter.prototype.raise = function(msg, node) {
  throw FluxError(msg, node ? node.line : 0, node ? node.col : 0);
};
Interpreter.prototype.check = function(node) {
  if (++this.steps > this.maxSteps) this.raise('运行步数超出上限（' + this.maxSteps + '，疑似死循环）', node);
};
Interpreter.prototype.print = function() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) parts.push(toStr(arguments[i]));
  var line = parts.join(' ');
  if (this.printFn) this.printFn(line);
  return null;
};

/* ---- 执行语句 ---- */
Interpreter.prototype.exec = function(node, env) {
  if (!node) return null;
  switch (node.type) {
    case 'Program':
      for (var i = 0; i < node.body.length; i++) this.exec(node.body[i], env);
      return null;
    case 'ExprStmt':
      return this.eval(node.expr, env);
    case 'Let':
      var v = this.eval(node.value, env);
      env.define(node.name, v, !node.mutable);
      return null;
    case 'Assign':
      return this.execAssign(node, env);
    case 'Return': throw new ReturnSig(this.eval(node.arg, env));
    case 'Break': throw new BreakSig();
    case 'Continue': throw new ContinueSig();
    case 'FnDecl':
      env.define(node.name, new FluxFn(node.name, node.params, node.body, env, false), true);
      return null;
    case 'While': return this.execWhile(node, env);
    case 'For': return this.execFor(node, env);
    case 'Assert': return this.execAssert(node, env);
    default: return this.eval(node, env);
  }
};

Interpreter.prototype.execAssign = function(node, env) {
  var t = node.target;
  var val = this.eval(node.value, env);
  if (t.type === 'Ident') {
    if (node.op === '=') {
      var ok = env.set(t.name, val);
      if (!ok) this.raise('变量 "' + t.name + '" 是 let 不可变变量，不能重新赋值', node);
    } else {
      var old = env.get(t.name);
      var base = node.op[0];
      env.set(t.name, this.binOp(base, old, val, node));
    }
    return val;
  }
  if (t.type === 'Index') {
    var obj = this.eval(t.obj, env);
    var idx = this.eval(t.index, env);
    if (Array.isArray(obj)) {
      var li = idx < 0 ? obj.length + idx : idx;
      obj[li] = val;
    } else if (obj instanceof FluxObject) {
      obj.data.set(String(idx), val);
    } else {
      this.raise('不支持对该类型进行索引赋值', node);
    }
    return val;
  }
  this.raise('赋值目标无效', node);
};

Interpreter.prototype.execWhile = function(node, env) {
  while (truthy(this.eval(node.test, env))) {
    this.check(node);
    try { for (var i = 0; i < node.body.length; i++) this.exec(node.body[i], env); }
    catch (e) {
      if (e instanceof BreakSig) break;
      if (e instanceof ContinueSig) continue;
      throw e;
    }
  }
  return null;
};

Interpreter.prototype.execFor = function(node, env) {
  var iter = this.eval(node.iter, env);
  var items = this.toIterArray(iter, node);
  for (var i = 0; i < items.length; i++) {
    this.check(node);
    env.define(node.varName, items[i], false);
    try { for (var j = 0; j < node.body.length; j++) this.exec(node.body[j], env); }
    catch (e) {
      if (e instanceof BreakSig) break;
      if (e instanceof ContinueSig) continue;
      throw e;
    }
  }
  return null;
};

Interpreter.prototype.toIterArray = function(iter, node) {
  if (Array.isArray(iter)) return iter;
  if (typeof iter === 'string') return iter.split('');
  if (iter instanceof FluxRange) {
    var arr = [];
    for (var i = iter.start; iter.inclusive ? (i <= iter.end) : (i < iter.end); i++) arr.push(i);
    return arr;
  }
  if (iter instanceof FluxObject) return Array.from(iter.data.keys());
  this.raise('无法迭代该类型: ' + typeName(iter), node);
};

Interpreter.prototype.execAssert = function(node, env) {
  var cond = this.eval(node.cond, env);
  if (!truthy(cond)) {
    var msg = node.msg ? this.eval(node.msg, env) : '断言失败';
    this.raise(toStr(msg), node);
  }
  return null;
};

/* ---- 表达式求值 ---- */
Interpreter.prototype.eval = function(node, env) {
  if (!node) return null;
  switch (node.type) {
    case 'Num': return node.value;
    case 'Str': return node.value;
    case 'Bool': return node.value;
    case 'Null': return null;
    case 'Ident':
      var v = env.get(node.name);
      if (v === undefined && !env.has(node.name)) this.raise('未定义变量 "' + node.name + '"', node);
      return v;
    case 'Array':
      return node.elems.map(function(e) { return this.eval(e, env); }, this);
    case 'Object':
      var obj = new FluxObject();
      for (var p = 0; p < node.pairs.length; p++)
        obj.data.set(node.pairs[p].key, this.eval(node.pairs[p].value, env));
      return obj;
    case 'Interp':
      var s = '';
      for (var ip = 0; ip < node.parts.length; ip++) {
        var part = node.parts[ip];
        s += part.type === 'Str' ? part.value : toStr(this.eval(part, env));
      }
      return s;
    case 'Range':
      var a = this.eval(node.left, env), b = this.eval(node.right, env);
      return new FluxRange(a, b, node.op === '..=');
    case 'Binary': return this.binOp(node.op, this.eval(node.left, env), this.eval(node.right, env), node);
    case 'Logical': return this.evalLogical(node, env);
    case 'Unary': return this.evalUnary(node, env);
    case 'Index':
      var objV = this.eval(node.obj, env);
      var idxV = this.eval(node.index, env);
      return this.getIndex(objV, idxV, node);
    case 'Prop':
      return this.getProp(this.eval(node.obj, env), node.prop, node);
    case 'SafeProp':
      var sv = this.eval(node.obj, env);
      if (sv === null || sv === undefined) return null;
      return this.getProp(sv, node.prop, node);
    case 'NullCoalesce':
      var lv = this.eval(node.left, env);
      return (lv === null || lv === undefined) ? this.eval(node.right, env) : lv;
    case 'Pipe':
      return this.evalPipe(node, env);
    case 'IfExpr':
      return this.evalIfExpr(node, env);
    case 'Match':
      return this.evalMatch(node, env);
    case 'ArrowFn':
      return new FluxFn(null, node.params, node.body, env, node.isExpr);
    case 'Call':
      return this.evalCall(node, env);
    case 'FnDecl':
      env.define(node.name, new FluxFn(node.name, node.params, node.body, env, false), true);
      return null;
    default:
      return this.exec(node, env);
  }
};

Interpreter.prototype.evalLogical = function(node, env) {
  var l = this.eval(node.left, env);
  if (node.op === 'and') return truthy(l) ? this.eval(node.right, env) : l;
  if (node.op === 'or') return truthy(l) ? l : this.eval(node.right, env);
  return truthy(l);
};

Interpreter.prototype.evalUnary = function(node, env) {
  var v = this.eval(node.arg, env);
  if (node.op === '-') return -v;
  if (node.op === 'not') return !truthy(v);
  return v;
};

Interpreter.prototype.evalPipe = function(node, env) {
  // left |> right  =>  right(left)
  var leftVal = this.eval(node.left, env);
  var rightNode = node.right;
  // 如果右侧是函数调用，将 leftVal 作为第一个参数插入
  if (rightNode.type === 'Call') {
    var callee = this.eval(rightNode.callee, env);
    var args = rightNode.args.map(function(a) { return this.eval(a, env); }, this);
    args.unshift(leftVal); // 管道值作为第一个参数
    return this.callValue(callee, args, node);
  }
  // 右侧是函数引用
  var fn = this.eval(rightNode, env);
  return this.callValue(fn, [leftVal], node);
};

Interpreter.prototype.evalIfExpr = function(node, env) {
  if (truthy(this.eval(node.test, env))) {
    return this.execBlockVal(node.then, env);
  } else if (node.els) {
    if (node.els.type === 'IfExpr') return this.evalIfExpr(node.els, env);
    return this.execBlockVal(node.els, env);
  }
  return null;
};

Interpreter.prototype.execBlockVal = function(body, env) {
  var blockEnv = new Env(env);
  var last = null;
  for (var i = 0; i < body.length; i++) {
    if (body[i].type === 'ExprStmt') last = this.eval(body[i].expr, blockEnv);
    else { this.exec(body[i], blockEnv); last = null; }
  }
  return last;
};

Interpreter.prototype.evalMatch = function(node, env) {
  var subj = this.eval(node.subj, env);
  for (var i = 0; i < node.cases.length; i++) {
    var c = node.cases[i];
    if (c.isDefault) {
      return this.execBlockVal(c.body, new Env(env));
    }
    var patVal = this.eval(c.pattern, env);
    if (this.equal(subj, patVal)) {
      return this.execBlockVal(c.body, new Env(env));
    }
  }
  return null;
};

Interpreter.prototype.evalCall = function(node, env) {
  var callee = this.eval(node.callee, env);
  var args = node.args.map(function(a) { return this.eval(a, env); }, this);
  return this.callValue(callee, args, node);
};

Interpreter.prototype.callValue = function(callee, args, node) {
  if (callee instanceof BoundMethod) {
    return callee.method.call(this, callee.self, args, this, node);
  }
  if (typeof callee === 'function') {
    var r = callee.call(this, args, node, this);
    return r === undefined ? null : r;
  }
  if (callee instanceof FluxFn) {
    var fnEnv = new Env(callee.env);
    for (var p = 0; p < callee.params.length; p++)
      fnEnv.define(callee.params[p], p < args.length ? args[p] : null, false);
    try {
      if (callee.isExpr) {
        return this.eval(callee.body, fnEnv);
      } else {
        var last = null;
        for (var i = 0; i < callee.body.length; i++) {
          if (callee.body[i].type === 'ExprStmt') {
            last = this.eval(callee.body[i].expr, fnEnv);
          } else {
            this.exec(callee.body[i], fnEnv);
          }
        }
        return last;
      }
    } catch (e) {
      if (e instanceof ReturnSig) return e.value;
      throw e;
    }
  }
  this.raise('"' + toStr(callee) + '" 不可调用', node);
};

// 公开方法（供 arrMethods 等使用）
Interpreter.prototype.callFn = function(fn, args) {
  return this.callValue(fn, args, { line: 0, col: 0 });
};

/* ---- 二元运算 ---- */
Interpreter.prototype.binOp = function(op, a, b, node) {
  switch (op) {
    case '+':
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
      return toStr(a) + toStr(b);
    case '-': return a - b;
    case '*':
      if (typeof a === 'number' && typeof b === 'number') return a * b;
      if (typeof a === 'string' && typeof b === 'number') return a.repeat(b);
      if (typeof a === 'number' && typeof b === 'string') return b.repeat(a);
      this.raise('无法相乘: ' + typeName(a) + ' * ' + typeName(b), node);
    case '/':
      if (b === 0) this.raise('除以零错误', node);
      return a / b;
    case '%':
      if (b === 0) this.raise('除以零错误', node);
      return ((a % b) + b) % b;
    case '**':
      return Math.pow(a, b);
    case '==': return this.equal(a, b);
    case '!=': return !this.equal(a, b);
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    default: this.raise('不支持的运算符 "' + op + '"', node);
  }
};

Interpreter.prototype.equal = function(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!this.equal(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof FluxObject && b instanceof FluxObject) {
    if (a.data.size !== b.data.size) return false;
    var ok = true; var self = this;
    a.data.forEach(function(v, k) { if (!b.data.has(k) || !self.equal(v, b.data.get(k))) ok = false; });
    return ok;
  }
  return a === b;
};

/* ---- 索引 / 属性 ---- */
Interpreter.prototype.getIndex = function(obj, idx, node) {
  if (Array.isArray(obj)) {
    var li = idx < 0 ? obj.length + idx : idx;
    if (li < 0 || li >= obj.length) this.raise('数组越界: ' + idx + '（长度 ' + obj.length + '）', node);
    return obj[li];
  }
  if (typeof obj === 'string') {
    var si = idx < 0 ? obj.length + idx : idx;
    if (si < 0 || si >= obj.length) this.raise('字符串越界: ' + idx, node);
    return obj[si];
  }
  if (obj instanceof FluxObject) {
    var k = String(idx);
    if (!obj.data.has(k)) this.raise('对象中不存在键 "' + k + '"', node);
    return obj.data.get(k);
  }
  this.raise('不支持索引访问: ' + typeName(obj), node);
};

Interpreter.prototype.getProp = function(obj, prop, node) {
  if (obj === null || obj === undefined) this.raise('不能访问 null 的属性 "' + prop + '"', node);
  if (Array.isArray(obj)) {
    if (prop === 'length') return obj.length;
    if (arrMethods[prop]) return new BoundMethod(obj, arrMethods[prop]);
    this.raise('数组没有方法 "' + prop + '"', node);
  }
  if (typeof obj === 'string') {
    if (prop === 'length') return obj.length;
    if (strMethods[prop]) return new BoundMethod(obj, strMethods[prop]);
    this.raise('字符串没有方法 "' + prop + '"', node);
  }
  if (obj instanceof FluxObject) {
    if (obj.data.has(prop)) return obj.data.get(prop);
    this.raise('对象中不存在属性 "' + prop + '"', node);
  }
  if (obj instanceof FluxRange) {
    if (prop === 'length') return obj.length;
    if (prop === 'start') return obj.start;
    if (prop === 'end') return obj.end;
    this.raise('range 没有属性 "' + prop + '"', node);
  }
  if (obj instanceof FluxModule) {
    if (obj.funcs.has(prop)) return obj.funcs.get(prop);
    if (prop === 'name') return obj.name;
    this.raise('模块 "' + obj.name + '" 没有成员 "' + prop + '"', node);
  }
  this.raise('类型 "' + typeName(obj) + '" 不支持属性访问', node);
};

/* ===========================================================================
 * 内置库
 * ===========================================================================*/
Interpreter.prototype.installBuiltins = function() {
  var g = this.global, self = this;

  function B(name, fn) { fn._name = name; return fn; }

  g.define('print', B('print', function(args) { return self.print.apply(self, args); }), true);
  g.define('input', B('input', function(args) { return self.inputFn(args[0]||''); }), true);
  g.define('len', B('len', function(args, node) {
    var v = args[0];
    if (typeof v === 'string' || Array.isArray(v)) return v.length;
    if (v instanceof FluxObject) return v.data.size;
    if (v instanceof FluxRange) return v.length;
    self.raise('len 不支持 ' + typeName(v), node);
  }), true);
  g.define('type', B('type', function(args) { return typeName(args[0]); }), true);
  g.define('str', B('str', function(args) { return toStr(args[0]); }), true);
  g.define('int', B('int', function(args, node) {
    var v = args[0];
    if (typeof v === 'number') return Math.trunc(v);
    if (typeof v === 'string') { var f = parseInt(v, 10); if (isNaN(f)) self.raise('无法转为整数: "' + v + '"', node); return f; }
    self.raise('int 只接受数字或字符串', node);
  }), true);
  g.define('float', B('float', function(args, node) {
    var v = args[0];
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { var f = parseFloat(v); if (isNaN(f)) self.raise('无法转为浮点: "' + v + '"', node); return f; }
    self.raise('float 只接受数字或字符串', node);
  }), true);
  g.define('abs', B('abs', function(args) { return Math.abs(args[0]); }), true);
  g.define('min', B('min', function(args) {
    var a = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return Math.min.apply(null, a);
  }), true);
  g.define('max', B('max', function(args) {
    var a = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return Math.max.apply(null, a);
  }), true);
  g.define('sum', B('sum', function(args, node) {
    var a = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s;
  }), true);
  g.define('round', B('round', function(args) {
    var p = Math.pow(10, args[1]||0);
    return Math.round(args[0]*p)/p;
  }), true);
  g.define('range', B('range', function(args) {
    var s = 0, e = 0, inc = true;
    if (args.length === 1) e = args[0];
    else { s = args[0]; e = args[1]; }
    return new FluxRange(s, e, true);
  }), true);

  // math 模块
  var math = new FluxModule('math');
  math.funcs.set('sqrt', B('sqrt', function(a){return Math.sqrt(a[0]);}));
  math.funcs.set('sin', B('sin', function(a){return Math.sin(a[0]);}));
  math.funcs.set('cos', B('cos', function(a){return Math.cos(a[0]);}));
  math.funcs.set('tan', B('tan', function(a){return Math.tan(a[0]);}));
  math.funcs.set('exp', B('exp', function(a){return Math.exp(a[0]);}));
  math.funcs.set('log', B('log', function(a){return a[1]!=null?Math.log(a[0])/Math.log(a[1]):Math.log(a[0]);}));
  math.funcs.set('log10', B('log10', function(a){return Math.log10(a[0]);}));
  math.funcs.set('pow', B('pow', function(a){return Math.pow(a[0], a[1]);}));
  math.funcs.set('floor', B('floor', function(a){return Math.floor(a[0]);}));
  math.funcs.set('ceil', B('ceil', function(a){return Math.ceil(a[0]);}));
  math.funcs.set('pi', Math.PI);
  math.funcs.set('e', Math.E);
  g.define('math', math, true);

  // random 模块
  var rnd = new FluxModule('random');
  rnd.funcs.set('random', B('random', function(){return Math.random();}));
  rnd.funcs.set('randint', B('randint', function(a){return a[0]+Math.floor(Math.random()*(a[1]-a[0]+1));}));
  rnd.funcs.set('uniform', B('uniform', function(a){return a[0]+Math.random()*(a[1]-a[0]);}));
  rnd.funcs.set('choice', B('choice', function(a, node){
    if (!Array.isArray(a[0])||a[0].length===0) self.raise('choice 需要非空数组', node);
    return a[0][Math.floor(Math.random()*a[0].length)];
  }));
  rnd.funcs.set('shuffle', B('shuffle', function(a){
    var arr=a[0]; for(var i=arr.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=arr[i];arr[i]=arr[j];arr[j]=t;} return arr;
  }));
  g.define('random', rnd, true);

  // draw 模块
  g.define('draw', this.buildDraw(), true);
};

Interpreter.prototype.buildDraw = function() {
  var ctx = this.drawing;
  var COLORS = {red:'#e5484d',green:'#30a46c',blue:'#3e63dd',yellow:'#f5d90a',black:'#000',white:'#fff',gray:'#8d8d8d',orange:'#f76808',purple:'#8e4ec6',cyan:'#00b2c9'};
  function col(c){ if(c==null) return '#000'; if(typeof c==='string') return c; if(typeof c==='number'){var g=Math.round(c*255);return 'rgb('+g+','+g+','+g+')';} return '#000'; }
  function W(name, fn) { return { _name: name, call: function(self, args, interp, node) {
    if (!ctx) return null;
    fn(args, node);
    return null;
  }};}
  // BoundMethod 期望 method 是 function(self, args, interp, node)
  // 但模块函数通过 callValue 调用时是 function(args, node, interp)
  // 所以 draw 模块的函数用普通 function
  function D(name, fn) { fn._name = name; return fn; }
  var draw = new FluxModule('draw');
  draw.funcs.set('clear', D('clear', function(){ if(ctx){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();} return null; }));
  draw.funcs.set('background', D('background', function(a){ if(ctx){ctx.fillStyle=col(a[0]);ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);} return null; }));
  draw.funcs.set('point', D('point', function(a){ if(ctx){ctx.fillStyle=col(a[2]);ctx.beginPath();ctx.arc(a[0],a[1],a[3]||2,0,Math.PI*2);ctx.fill();} return null; }));
  draw.funcs.set('line', D('line', function(a){ if(ctx){ctx.strokeStyle=col(a[4]);ctx.lineWidth=a[5]||1;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);ctx.stroke();} return null; }));
  draw.funcs.set('circle', D('circle', function(a){ if(ctx){ctx.strokeStyle=col(a[3]);ctx.lineWidth=a[4]||1;ctx.beginPath();ctx.arc(a[0],a[1],a[2],0,Math.PI*2);ctx.stroke();} return null; }));
  draw.funcs.set('fill_circle', D('fill_circle', function(a){ if(ctx){ctx.fillStyle=col(a[3]);ctx.beginPath();ctx.arc(a[0],a[1],a[2],0,Math.PI*2);ctx.fill();} return null; }));
  draw.funcs.set('rect', D('rect', function(a){ if(ctx){ctx.strokeStyle=col(a[4]);ctx.lineWidth=a[5]||1;ctx.strokeRect(a[0],a[1],a[2],a[3]);} return null; }));
  draw.funcs.set('fill_rect', D('fill_rect', function(a){ if(ctx){ctx.fillStyle=col(a[4]);ctx.fillRect(a[0],a[1],a[2],a[3]);} return null; }));
  draw.funcs.set('text', D('text', function(a){ if(ctx){ctx.fillStyle=col(a[3]);ctx.font=(a[4]||16)+'px sans-serif';ctx.fillText(toStr(a[0]),a[1],a[2]);} return null; }));
  draw.funcs.set('plot', D('plot', function(a, node){ if(ctx){var xs=a[0],ys=a[1];if(!Array.isArray(xs)||!Array.isArray(ys))self.raise('plot 需要两个数组',node);ctx.strokeStyle=col(a[2]);ctx.lineWidth=a[3]||1;ctx.beginPath();for(var i=0;i<xs.length;i++){if(i===0)ctx.moveTo(xs[i],ys[i]);else ctx.lineTo(xs[i],ys[i]);}ctx.stroke();} return null; }));
  for (var k in COLORS) draw.funcs.set(k, COLORS[k]);
  var self = this;
  return draw;
};

/* ===========================================================================
 * 运行入口
 * ===========================================================================*/
function run(source, options) {
  options = options || {};
  var tokens = tokenize(source);
  var ast = parse(tokens);
  var it = new Interpreter(options);
  var output = [];
  it.printFn = function(s) { output.push(s); if (options.print) options.print(s); };
  it.execute(ast, it.global);
  return { output: output, result: null };
}

// 给 Interpreter 添加 execute 方法（= exec for Program）
Interpreter.prototype.execute = function(node, env) { return this.exec(node, env); };

return {
  version: '0.1.0',
  tokenize: tokenize,
  parse: parse,
  run: run,
  Interpreter: Interpreter,
  toStr: toStr,
  _T: T
};
});