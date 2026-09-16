// 蒙特卡洛估算圆周率
let points = 100000
var inside = 0

for i in 0..<points {
  let x = random.uniform(0, 1)
  let y = random.uniform(0, 1)
  if x * x + y * y <= 1 { inside += 1 }
}

let pi_est = 4 * inside / points
print(f"估算圆周率: ${pi_est}")
print(f"真实圆周率: ${math.pi}")
print(f"误差: ${abs(pi_est - math.pi)}")