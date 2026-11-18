import { config } from '../config'
import type { LoginCheckResult } from '../../shared/types'
import { parseListContent, type ParsedListPage } from './parse'

// Origin 必须与目标系统同源，跟随 DSPT_BASE_URL 配置，避免部署其他实例时请求头不匹配
const TARGET_ORIGIN = new URL(config.dsptBaseUrl).origin

export class LoginExpiredError extends Error {
  constructor(message = '目标系统登录态已失效，请重新保存 Cookie') {
    super(message)
    this.name = 'LoginExpiredError'
  }
}

export interface ListQueryOptions {
  page?: number
  sortOrder?: 'ASC' | 'DESC'
  startTime?: string
  endTime?: string
  recordCount?: number
  pageCount?: number
}

class RateLimiter {
  private nextAt = 0

  constructor(private readonly intervalMs: number) {}

  async wait() {
    const now = Date.now()
    const target = Math.max(now, this.nextAt)
    this.nextAt = target + this.intervalMs
    if (target > now) await new Promise(resolve => setTimeout(resolve, target - now))
  }
}

function parseCookieHeader(cookie: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of cookie.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    map.set(trimmed.slice(0, index).trim(), trimmed.slice(index + 1).trim())
  }
  return map
}

/**
 * 邮政内部采购系统客户端。
 * 只负责只读请求：登录态检测、列表查询、详情。
 */
export class DsptClient {
  private readonly cookies: Map<string, string>
  private readonly limiter: RateLimiter

  constructor(cookie: string, intervalMs = config.requestIntervalMs) {
    this.cookies = parseCookieHeader(cookie)
    this.limiter = new RateLimiter(intervalMs)
  }

  get cookieHeader(): string {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
  }

  private absorbCookies(headers: Headers) {
    const setCookies =
      typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
    for (const setCookie of setCookies) {
      const first = setCookie.split(';')[0]
      const index = first.indexOf('=')
      if (index < 0) continue
      const name = first.slice(0, index).trim()
      const value = first.slice(index + 1).trim()
      if (!value || /deleted/i.test(setCookie)) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    await this.limiter.wait()
    const url = path.startsWith('http') ? path : config.dsptBaseUrl + path
    const headers = new Headers(init.headers)
    headers.set('Cookie', this.cookieHeader)
    headers.set('User-Agent', config.userAgent)
    if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'zh-CN,zh;q=0.9')
    if (!headers.has('Accept')) {
      headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    }
    const response = await fetch(url, {
      ...init,
      headers,
      redirect: 'manual',
    })
    this.absorbCookies(response.headers)
    return response
  }

  private isLoginRedirect(response: Response): boolean {
    const location = response.headers.get('location') || ''
    return response.status >= 300 && response.status < 400 && location.includes('privilege.php')
  }

  async getListPage(): Promise<{ status: number; html: string; location: string | null }> {
    const response = await this.request('order.php?act=list&type=child_list', {
      headers: { Referer: config.dsptBaseUrl + 'index.php' },
    })
    const html = await response.text()
    return {
      status: response.status,
      html,
      location: response.headers.get('location'),
    }
  }

  async checkLogin(): Promise<LoginCheckResult> {
    const checkedAt = new Date().toISOString()
    try {
      const page = await this.getListPage()
      if (page.status >= 300 && page.status < 400 && page.location?.includes('privilege.php')) {
        return { valid: false, message: '登录态已失效：页面跳转到登录页', httpStatus: page.status, checkedAt }
      }
      if (page.status !== 200) {
        return {
          valid: false,
          message: `列表页返回异常状态 ${page.status}`,
          httpStatus: page.status,
          checkedAt,
        }
      }
      const result = await this.queryList({ page: 1, sortOrder: 'DESC' })
      if (result.error !== 0) {
        return {
          valid: false,
          message: result.message || '查询接口返回权限错误',
          httpStatus: 200,
          checkedAt,
        }
      }
      return {
        valid: true,
        message: '登录态有效',
        httpStatus: 200,
        totalOrders: result.total,
        checkedAt,
      }
    } catch (error) {
      if (error instanceof LoginExpiredError) {
        return { valid: false, message: error.message, checkedAt }
      }
      return {
        valid: false,
        message: `检测失败：${error instanceof Error ? error.message : String(error)}`,
        checkedAt,
      }
    }
  }

  async queryList(options: ListQueryOptions = {}): Promise<
    ParsedListPage & { error: number; message: string; contentLength: number }
  > {
    const page = Math.max(1, options.page || 1)
    const params = new URLSearchParams({
      act: 'query',
      order_sn: '',
      suppliers_id: '0',
      coagent_id: '0',
      consignee: '',
      email: '',
      address: '',
      zipcode: '',
      tel: '',
      mobile: '0',
      country: '0',
      province: '0',
      city: '0',
      district: '0',
      shipping_id: '0',
      pay_id: '0',
      order_status: '-1',
      shipping_status: '-1',
      pay_status: '-1',
      user_id: '0',
      user_name: '',
      composite_status: '-1',
      group_buy_id: '0',
      sort_by: 'order_id',
      sort_order: options.sortOrder || 'DESC',
      start_time: options.startTime || '',
      end_time: options.endTime || '',
      search_type: '0',
      search: '',
      keywords_type: '0',
      keywords: '',
      search_by_pay: '',
      type: 'child_list',
      role_id: '0',
      check_status: '0',
      is_error: '0',
      salesman: '0',
      record_count: String(options.recordCount || 0),
      page_count: String(options.pageCount || 0),
      page: String(page),
      start: String((page - 1) * 10),
    })

    const response = await this.request('order.php?is_ajax=1', {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: TARGET_ORIGIN,
        Referer: config.dsptBaseUrl + 'order.php?act=list&type=child_list',
      },
      body: params.toString(),
    })
    if (this.isLoginRedirect(response)) throw new LoginExpiredError()
    const text = await response.text()
    let json: { error?: number; message?: string; content?: string }
    try {
      json = JSON.parse(text)
    } catch {
      throw new LoginExpiredError('查询接口返回了非 JSON 内容，登录态可能已失效')
    }
    if (json.error !== 0) {
      const message = json.message || '查询失败'
      if (message.includes('权限') || message.includes('登录')) throw new LoginExpiredError(message)
      throw new Error(message)
    }
    const parsed = parseListContent(json.content || '')
    return {
      ...parsed,
      error: Number(json.error || 0),
      message: json.message || '',
      contentLength: (json.content || '').length,
    }
  }

  /**
   * 批量获取「打印订单」预览。
   *
   * 注意：目标系统把打印预览挂在 act=operate 这个批量操作入口下，按钮字段为 printing。
   * 这里只发送 printing=打印订单，绝不发送 cancel/remove/confirm 等操作按钮，避免产生写操作。
   * 实测同一订单打印前后详情页（含操作日志）完全一致，返回的只是可打印 HTML。
   *
   * @param orderSns 主订单编号数组，单批建议不超过 20 个
   */
  async printOrders(orderSns: string[]): Promise<string> {
    const ids = [...new Set(orderSns.map(id => id.trim()).filter(Boolean))]
    if (!ids.length) throw new Error('打印补全需要至少一个订单号')
    if (ids.length > 50) throw new Error('单次打印补全最多 50 个订单号')
    if (ids.some(id => !/^\d{6,}$/.test(id))) {
      throw new Error('打印补全只接受数字主订单编号')
    }

    const params = new URLSearchParams()
    for (const id of ids) params.append('checkboxes', id)
    params.set('printing', '打印订单')
    params.set('batch', '1')
    params.set('order_id', ids.join(','))

    const response = await this.request('order.php?act=operate', {
      method: 'POST',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: TARGET_ORIGIN,
        Referer: config.dsptBaseUrl + 'order.php?act=list&type=child_list',
      },
      body: params.toString(),
    })
    if (this.isLoginRedirect(response)) throw new LoginExpiredError()
    const html = await response.text()
    if (/privilege\.php\?act=login|请先登录/.test(html)) throw new LoginExpiredError()
    if (/您没有权限操作此订单|没有执行此项操作的权限/.test(html)) {
      throw new Error('目标系统拒绝了打印请求：当前账号没有权限操作这些订单')
    }
    return html
  }

  async getDetail(orderId: string): Promise<string> {
    const response = await this.request(
      `order.php?act=info&order_id=${encodeURIComponent(orderId)}`,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: config.dsptBaseUrl + 'order.php?act=list&type=child_list',
        },
      },
    )
    if (this.isLoginRedirect(response)) throw new LoginExpiredError()
    if (response.status !== 200) throw new Error(`详情页返回 HTTP ${response.status}`)
    const html = await response.text()
    if (/privilege\.php\?act=login/.test(html) || /请先登录/.test(html)) {
      throw new LoginExpiredError()
    }
    return html
  }
}
