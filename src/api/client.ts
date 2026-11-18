import type {
  CollectionRun,
  DashboardStats,
  LoginCheckResult,
  OrderDetailResponse,
  OrderExportScope,
  OrderListResponse,
} from '../../shared/types'

/**
 * 本地采集服务 API 客户端。
 * 所有请求都走相对路径 /api，开发时由 Vite 代理到 127.0.0.1:8787，
 * 生产构建后由同一个 Express 服务托管，因此浏览器侧不接触任何目标系统凭据。
 */

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError('无法连接本地采集服务，请确认后端已启动（npm run dev）', 0)
  }

  // 204 或空响应体直接返回 undefined，避免 JSON 解析报错
  if (response.status === 204) return undefined as T

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : `请求失败（HTTP ${response.status}）`
    throw new ApiError(message, response.status)
  }
  return payload as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body ?? {}),
})

export interface SettingsResponse {
  hasCookie: boolean
  updatedAt: string | null
  baseUrl: string
  detailConcurrency: number
  requestIntervalMs: number
}

export interface SaveCookieResponse {
  saved: boolean
  login: LoginCheckResult
}

export interface OrderQuery {
  page?: number
  pageSize?: number
  keyword?: string
  status?: string
  startDate?: string
  endDate?: string
}

export interface IncrementalParams {
  days?: number
  startTime?: string
  endTime?: string
  refetchDetail?: boolean
}

export interface OrderExportQuery {
  scope: OrderExportScope
  keyword?: string
  status?: string
  startDate?: string
  endDate?: string
  /** 要导出的字段键（见 shared/export-fields.ts），不传则导出全部字段 */
  fields?: string[]
}

/**
 * 构造订单导出下载地址。
 * 导出走浏览器直接下载（而非 fetch），大文件不会占用前端内存，
 * 文件名由服务端通过 Content-Disposition 指定。
 */
export function orderExportUrl(params: OrderExportQuery): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (!value.length) continue
      query.set(key, value.join(','))
      continue
    }
    query.set(key, String(value))
  }
  return `/api/orders/export?${query.toString()}`
}

export const api = {
  getDashboard: () => request<DashboardStats>('/api/dashboard'),

  getSettings: () => request<SettingsResponse>('/api/settings'),

  saveCookie: (cookie: string) =>
    request<SaveCookieResponse>('/api/settings/cookie', {
      method: 'PUT',
      body: JSON.stringify({ cookie }),
    }),

  clearCookie: () =>
    request<{ saved: boolean }>('/api/settings/cookie', { method: 'DELETE' }),

  checkLogin: () => request<LoginCheckResult>('/api/settings/check-login', json({})),

  listRuns: () => request<CollectionRun[]>('/api/collection/runs'),

  getRun: (id: string) => request<CollectionRun>(`/api/collection/runs/${id}`),

  startListBackfill: (force = false) =>
    request<CollectionRun>('/api/collection/list', json({ force })),

  startPrintBackfill: (batchSize?: number) =>
    request<CollectionRun>('/api/collection/print', json({ batchSize })),

  startDetailBackfill: (concurrency?: number) =>
    request<CollectionRun>('/api/collection/detail', json({ concurrency })),

  startIncremental: (params: IncrementalParams = {}) =>
    request<CollectionRun>('/api/collection/incremental', json(params)),

  pauseRun: (id: string) =>
    request<CollectionRun>(`/api/collection/runs/${id}/pause`, json({})),

  resumeRun: (id: string) =>
    request<CollectionRun>(`/api/collection/runs/${id}/resume`, json({})),

  listOrders: (params: OrderQuery = {}) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      query.set(key, String(value))
    }
    const suffix = query.toString()
    return request<OrderListResponse>(`/api/orders${suffix ? `?${suffix}` : ''}`)
  },

  getOrder: (key: string) =>
    request<OrderDetailResponse>(`/api/orders/${encodeURIComponent(key)}`),
}

/** 把接口错误统一转成可直接展示的中文文案 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}
