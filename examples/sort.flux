// 冒泡排序 + assert 断言验证
fn bubble_sort(arr) {
  var n = arr.len()
  for i in 0..<n {
    for j in 0..<n - i - 1 {
      if arr[j] > arr[j + 1] {
        var t = arr[j]
        arr[j] = arr[j + 1]
        arr[j + 1] = t
      }
    }
  }
  return arr
}

let data = [64, 34, 25, 12, 22, 11, 90]
print("排序前:", data)
let sorted = bubble_sort(data)
print("排序后:", sorted)

// 内置断言 - 自动验证结果
assert sorted == [11, 12, 22, 25, 34, 64, 90], "排序结果不正确"
assert sorted[0] == 11, "最小值应该是 11"
assert sorted.last() == 90, "最大值应该是 90"
print("所有断言通过!")