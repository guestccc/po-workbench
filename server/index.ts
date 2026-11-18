import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { config, projectRoot } from './config'
import {
  dashboardStats,
  getRun,
  listOrders,
  listRuns,
  openDb,
  getOrderDetail,
} from './db'
import { clearCookie, cookieStatus, getCookie, saveCookie } from './cookie-store'
import { DsptClient } from './dspt/client'
import { PreconditionError, SyncManager } from './dspt/sync'
import { createOrdersCsvStream, exportFilename } from './orders-export'

const db = openDb(config.dbPath)
const sync = new SyncManager(db)
const app = express()

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }

function makeClient() {
  const cookie = getCookie(db)
  if (!cookie) throw new Error('尚未保存 Cookie')
  return new DsptClient(cookie)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.get('/api/dashboard', (_req, res) => {
  res.json(dashboardStats(db))
})

app.get('/api/settings', (_req, res) => {
  res.json({
    ...cookieStatus(db),
    baseUrl: config.dsptBaseUrl,
    detailConcurrency: config.detailConcurrency,
    requestIntervalMs: config.requestIntervalMs,
  })
})

app.put(
  '/api/settings/cookie',
  asyncHandler(async (req, res) => {
    const cookie = typeof req.body?.cookie === 'string' ? req.body.cookie : ''
    if (!cookie.trim()) {
      res.status(400).json({ message: 'Cookie 不能为空' })
      return
    }
    try {
      saveCookie(db, cookie)
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : String(error) })
      return
    }
    const login = await makeClient().checkLogin()
    res.json({ saved: true, login })
  }),
)

app.delete('/api/settings/cookie', (_req, res) => {
  clearCookie(db)
  res.json({ saved: false })
})

app.post(
  '/api/settings/check-login',
  asyncHandler(async (_req, res) => {
    const login = await makeClient().checkLogin()
    res.json(login)
  }),
)

app.get('/api/collection/runs', (_req, res) => {
  res.json(listRuns(db))
})

app.get('/api/collection/runs/:id', (req, res) => {
  const run = getRun(db, req.params.id)
  if (!run) {
    res.status(404).json({ message: '任务不存在' })
    return
  }
  res.json(run)
})

app.post(
  '/api/collection/list',
  asyncHandler(async (req, res) => {
    res.json(sync.startListBackfill({ force: Boolean(req.body?.force) }))
  }),
)

app.post(
  '/api/collection/print',
  asyncHandler(async (req, res) => {
    const batchSize = Number(req.body?.batchSize) || undefined
    res.json(sync.startPrintBackfill({ batchSize }))
  }),
)

app.post(
  '/api/collection/detail',
  asyncHandler(async (req, res) => {
    const concurrency = Number(req.body?.concurrency) || undefined
    res.json(sync.startDetailBackfill({ concurrency }))
  }),
)

app.post(
  '/api/collection/incremental',
  asyncHandler(async (req, res) => {
    const days = Number(req.body?.days) || undefined
    const startTime = typeof req.body?.startTime === 'string' ? req.body.startTime : undefined
    const endTime = typeof req.body?.endTime === 'string' ? req.body.endTime : undefined
    const refetchDetail = req.body?.refetchDetail !== false
    res.json(sync.startIncremental({ days, startTime, endTime, refetchDetail }))
  }),
)

app.post('/api/collection/runs/:id/pause', (req, res) => {
  try {
    res.json(sync.pause(req.params.id))
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/collection/runs/:id/resume', (req, res) => {
  try {
    res.json(sync.resume(req.params.id))
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/orders', (req, res) => {
  res.json(
    listOrders(db, {
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      keyword: typeof req.query.keyword === 'string' ? req.query.keyword : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    }),
  )
})

// 注意：本路由必须注册在 /api/orders/:key 之前，否则 export 会被当成订单号
app.get('/api/orders/export', (req, res, next) => {
  const params = {
    keyword: typeof req.query.keyword === 'string' ? req.query.keyword : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
    endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
  }
  const scope = req.query.scope === 'items' ? 'items' : 'orders'
  // fields=orderSn,consignee,...；未知键由 normalizeExportFieldKeys 过滤，空值回退全部字段
  const fields =
    typeof req.query.fields === 'string'
      ? req.query.fields
          .split(',')
          .map(key => key.trim())
          .filter(Boolean)
      : undefined
  try {
    const stream = createOrdersCsvStream(db, params, scope, fields)
    const filename = exportFilename(params, scope)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="orders-export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    )
    res.setHeader('Cache-Control', 'no-store')

    stream.on('error', error => {
      console.error('[export]', error)
      // 响应头已发出时无法再改状态码，只能中断连接避免浏览器拿到半截文件
      if (res.headersSent) res.destroy(error)
      else res.status(500).json({ message: '导出失败，请稍后重试' })
    })
    // 用户取消下载或连接中断时，及时释放 SQLite 游标
    res.on('close', () => {
      if (!res.writableEnded) stream.destroy()
    })
    stream.pipe(res)
  } catch (error) {
    next(error)
  }
})

app.get('/api/orders/:key', (req, res) => {
  const detail = getOrderDetail(db, req.params.key)
  if (!detail) {
    res.status(404).json({ message: '订单不存在' })
    return
  }
  res.json(detail)
})

// 生产构建后由本地服务直接托管前端；开发时由 Vite 代理 /api。
const distDir = path.join(projectRoot, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : String(error)
  // 前置条件不满足属于用户可修正的问题，返回 400，避免前端把正常提示当成服务端故障
  const status = error instanceof PreconditionError ? 400 : 500
  console.error('[api]', message)
  res.status(status).json({ message })
})

const server = app.listen(config.port, config.host, () => {
  console.log(`[po-workbench] API 已启动：http://${config.host}:${config.port}`)
  console.log(`[po-workbench] 数据库：${config.dbPath}`)
})

function shutdown() {
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
