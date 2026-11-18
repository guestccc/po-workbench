/** 前端展示用的轻量格式化工具，统一空值与金额的呈现方式 */

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return `¥ ${value.toFixed(2)}`
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return value.toLocaleString('zh-CN')
}

export function formatText(value: string | null | undefined): string {
  if (value === null || value === undefined) return '-'
  const text = String(value).trim()
  return text || '-'
}

/**
 * 订单/商品状态 → antd Tag 颜色。
 * 目标系统存在「已确认,待发货」这类组合状态，因此按关键字匹配，且异常态优先。
 */
export function orderStatusColor(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  if (!text) return 'default'
  if (/(取消|关闭|退货|退款)/.test(text)) return 'red'
  if (/(完成|收货)/.test(text)) return 'green'
  if (/(待发货|待收货|待付款|待确认|未确认|待审核|待处理)/.test(text)) return 'orange'
  if (/(已发货|已分单|已确认|已付款|已审核)/.test(text)) return 'blue'
  return 'default'
}

/** 审核状态 → antd Tag 颜色 */
export function reviewStatusColor(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  if (!text) return 'default'
  if (/(不通过|驳回|拒绝)/.test(text)) return 'red'
  if (/部分/.test(text)) return 'orange'
  if (/通过|已审核/.test(text)) return 'green'
  if (/(未审核|待审核)/.test(text)) return 'gold'
  return 'default'
}

/** 把 ISO 时间转成 YYYY-MM-DD HH:mm:ss，解析失败时原样返回 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
