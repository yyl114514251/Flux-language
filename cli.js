#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const Flux = require('./core.js');

function fmtErr(err, src) {
  if (err && err.isFlux) {
    let msg = err.name + ': ' + err.message;
    if (err.line) {
      msg += '\n  第 ' + err.line + ' 行, 第 ' + err.col + ' 列';
      if (src) {
        const lines = src.split('\n');
        if (err.line >= 1 && err.line <= lines.length)
          msg += '\n  ' + err.line + ' | ' + lines[err.line - 1] + '\n  ' + ' '.repeat(String(err.line).length + 3 + (err.col-1)) + '^';
      }
    }
    return msg;
  }
  return err && err.stack ? err.stack : String(err);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  if (process.stdin.isTTY) {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    console.log('Flux ' + Flux.version + ' 交互模式 (exit 退出)');
    rl.setPrompt('flux> ');
    rl.prompt();
    rl.on('line', (line) => {
      if (line.trim() === 'exit' || line.trim() === 'quit') { rl.close(); return; }
      try { Flux.run(line, { print: (s) => console.log(s) }); }
      catch (e) { console.error(fmtErr(e, line)); }
      rl.prompt();
    });
  } else {
    const src = fs.readFileSync(0, 'utf8');
    try { Flux.run(src, { print: (s) => console.log(s) }); } catch (e) { console.error(fmtErr(e, src)); process.exit(1); }
  }
} else if (args[0] === '-e') {
  try { Flux.run(args.slice(1).join(' '), { print: (s) => console.log(s) }); }
  catch (e) { console.error(fmtErr(e, args.slice(1).join(' '))); process.exit(1); }
} else if (args[0] === '-h') {
  console.log('Flux ' + Flux.version + ' | 用法: node cli.js 脚本.flux | -e "代码" | 无参进入 REPL');
} else {
  const src = fs.readFileSync(path.resolve(args[0]), 'utf8');
  const t0 = Date.now();
  try { Flux.run(src, { print: (s) => console.log(s) }); }
  catch (e) { console.error(fmtErr(e, src)); process.exit(1); }
  console.error('\n[完成] ' + (Date.now() - t0) + 'ms');
}