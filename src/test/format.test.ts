import { describe, expect, it } from 'vitest'
import { orderStatusColor, reviewStatusColor } from '@/utils/format'

describe('状态颜色映射', () => {
  it('组合订单状态应按优先级取色：异常 > 完成 > 待处理 > 进行中', () => {
    expect(orderStatusColor('已确认,待发货')).toBe('orange')
    expect(orderStatusColor('已确认,已完成')).toBe('green')
    expect(orderStatusColor('已分单,已完成')).toBe('green')
    expect(orderStatusColor('取消,待发货')).toBe('red')
    expect(orderStatusColor('退货,已完成')).toBe('red')
    expect(orderStatusColor('未确认,待发货')).toBe('orange')
    expect(orderStatusColor('已发货')).toBe('blue')
  })

  it('空状态应回退为默认色', () => {
    expect(orderStatusColor('')).toBe('default')
    expect(orderStatusColor(null)).toBe('default')
    expect(reviewStatusColor(undefined)).toBe('default')
  })

  it('审核状态应区分通过、部分、不通过与未审核', () => {
    expect(reviewStatusColor('审核通过')).toBe('green')
    expect(reviewStatusColor('部分审核')).toBe('orange')
    expect(reviewStatusColor('审核不通过')).toBe('red')
    expect(reviewStatusColor('未审核')).toBe('gold')
  })
})
