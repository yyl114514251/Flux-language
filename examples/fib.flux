// 斐波那契 - Flux 风格
fn fib(n) {
  if n < 2 { return n }
  return fib(n - 1) + fib(n - 2)
}

print("前 12 项斐波那契:")
for i in 0..<12 {
  print(f"fib(${i}) = ${fib(i)}")
}