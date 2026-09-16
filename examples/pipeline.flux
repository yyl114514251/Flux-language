// 管道式数据处理 - Flux 的核心特色
let data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// 传统写法: sum(map(f, filter(g, data)))
// Flux 管道: 数据像流水一样流动
let result = data
  |> fn(arr) { arr.filter(fn(x) { x % 2 == 0 }) }
  |> fn(arr) { arr.map(fn(x) { x * x }) }
  |> fn(arr) { arr.reduce(fn(a, b) { a + b }, 0) }

print(f"偶数的平方和: ${result}")

// 表达式 if - 直接返回值
let score = 85
let grade = if score >= 90 { "A" }
             else if score >= 80 { "B" }
             else if score >= 60 { "C" }
             else { "D" }
print(f"成绩 ${score} -> 等级 ${grade}")

// match 模式匹配
let day = "Mon"
let mood = match day {
  "Mon" => { "糟糕" }
  "Fri" => { "兴奋" }
  "Sat" => { "放松" }
  "Sun" => { "放松" }
  _ => { "一般" }
}
print(f"${day} 的心情: ${mood}")

// let 不可变 vs var 可变
let pi = 3.14159
var count = 0
count += 1
count += 1
print(f"pi = ${pi}, count = ${count}")