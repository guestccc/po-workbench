import pLimit from 'p-limit'
import type { Db } from '../db'
import {
  createRun,
  getRun,
  getSyncState,
  nowIso,
  pauseInterruptedRuns,
  saveBundle,
  setSyncState,
  updateRun,
  type RunPatch,
} from '../db'
import { getCookie } from '../cookie-store'
import { config } from '../config'
import type { CollectionMode, CollectionRun } from '../../shared/types'
import { DsptClient, LoginExpiredError } from './client'
import { parseDetailPage, parsePrintContent, type ParsedListPage } from './parse'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function formatLocalDateTime(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function subtractDaysFromDateTime(value: string, days: number): string {
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) throw new Error(`时间格式不正确：${value}`)
  date.setDate(date.getDate() - days)
  return formatLocalDateTime(date)
}

interface Controller {
  paused: boolean
}

interface PrintBackfillOptions {
  /** 单次打印请求包含的主订单数，默认 20（实测 20 单可完整返回） */
  batchSize?: number
}

interface DetailBackfillOptions {
  concurrency?: number
  batchSize?: number
}

interface IncrementalOptions {
  days?: number
  startTime?: string
  endTime?: string
  refetchDetail?: boolean
}

/** 前置条件不满足（例如缺少上游数据），用于返回 400 而不是 500 */
export class PreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PreconditionError'
  }
}

export class SyncManager {
  private readonly controllers = new Map<string, Controller>()

  constructor(private readonly db: Db) {
    pauseInterruptedRuns(db)
  }

  private get running(): boolean {
    for (const controller of this.controllers.values()) {
      if (!controller.paused) return true
    }
    return false
  }

  private assertIdle() {
    if (this.running) throw new Error('已有采集任务在运行，请先暂停或等待完成')
  }

  private makeClient(): DsptClient {
    const cookie = getCookie(this.db)
    if (!cookie) throw new Error('尚未保存 Cookie，请先到“数据源设置”保存')
    return new DsptClient(cookie)
  }

  private isPaused(runId: string): boolean {
    return this.controllers.get(runId)?.paused === true
  }

  private patch(runId: string, patch: RunPatch) {
    updateRun(this.db, runId, patch)
  }

  private async runInBackground(runId: string, runner: () => Promise<void>) {
    const controller = this.controllers.get(runId)!
    try {
      await runner()
      if (!controller.paused) {
        this.patch(runId, {
          status: 'completed',
          stage: '已完成',
          finishedAt: nowIso(),
          error: null,
        })
      }
    } catch (error) {
      if (controller.paused) return
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof LoginExpiredError) {
        this.patch(runId, { status: 'paused', stage: '登录态失效', error: message })
      } else {
        this.patch(runId, { status: 'failed', stage: '失败', error: message, finishedAt: nowIso() })
      }
      console.error(`[collection ${runId}]`, error)
    } finally {
      this.controllers.delete(runId)
    }
  }

  startListBackfill(options: { force?: boolean } = {}): CollectionRun {
    this.assertIdle()
    if (options.force) setSyncState(this.db, 'list_page_cursor', '1')
    const run = createRun(this.db, 'list_backfill', options)
    this.controllers.set(run.id, { paused: false })
    void this.runInBackground(run.id, () => this.runListBackfill(run.id))
    return getRun(this.db, run.id)!
  }

  startPrintBackfill(options: PrintBackfillOptions = {}): CollectionRun {
    this.assertIdle()
    const total = this.countPendingPrint()
    if (!total) {
      throw new PreconditionError(
        '订单库中没有待补打印的订单。若订单库为空，请先运行「列表全量扫描」。',
      )
    }
    const run = createRun(this.db, 'print_backfill', { ...options })
    this.controllers.set(run.id, { paused: false })
    void this.runInBackground(run.id, () => this.runPrintBackfill(run.id, options))
    return getRun(this.db, run.id)!
  }

  private countPendingPrint(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM orders WHERE print_synced_at IS NULL')
      .get() as { c: number }
    return Number(row.c || 0)
  }

  startDetailBackfill(options: DetailBackfillOptions = {}): CollectionRun {
    this.assertIdle()
    // 前置校验：没有任何带 order_id 的待补订单时直接拦截，避免出现“已完成 0/0”的迷惑结果
    const runnable = this.db
      .prepare(
        'SELECT COUNT(*) AS c FROM orders WHERE order_id IS NOT NULL AND detail_synced_at IS NULL',
      )
      .get() as { c: number }
    const missing = this.db
      .prepare(
        'SELECT COUNT(*) AS c FROM orders WHERE order_id IS NULL AND detail_synced_at IS NULL',
      )
      .get() as { c: number }
    if (!Number(runnable.c || 0) && Number(missing.c || 0) > 0) {
      throw new PreconditionError(
        `有 ${missing.c} 条订单缺少内部订单ID，无法请求详情。内部订单ID只能由「列表全量扫描」写入，请先跑列表扫描，再回来跑详情补全。`,
      )
    }
    const run = createRun(this.db, 'detail_backfill', { ...options })
    this.controllers.set(run.id, { paused: false })
    void this.runInBackground(run.id, () => this.runDetailBackfill(run.id, options))
    return getRun(this.db, run.id)!
  }

  startIncremental(options: IncrementalOptions = {}): CollectionRun {
    this.assertIdle()
    const run = createRun(this.db, 'incremental', { ...options })
    this.controllers.set(run.id, { paused: false })
    void this.runInBackground(run.id, () => this.runIncremental(run.id, options))
    return getRun(this.db, run.id)!
  }

  pause(runId: string) {
    const run = getRun(this.db, runId)
    if (!run) throw new Error('任务不存在')
    const controller = this.controllers.get(runId)
    if (controller) controller.paused = true
    this.patch(runId, { status: 'paused', stage: '已暂停' })
    return getRun(this.db, runId)
  }

  resume(runId: string): CollectionRun {
    this.assertIdle()
    const run = getRun(this.db, runId)
    if (!run) throw new Error('任务不存在')
    if (run.status === 'completed') throw new Error('任务已完成，无需续跑')
    const record = run
    this.patch(runId, { status: 'running', stage: '续跑中', error: null })
    this.controllers.set(runId, { paused: false })
    const runConfig = (record.config || {}) as Record<string, unknown>
    void this.runInBackground(runId, async () => {
      switch (record.mode) {
        case 'list_backfill':
          return this.runListBackfill(runId)
        case 'print_backfill':
          return this.runPrintBackfill(runId, runConfig as PrintBackfillOptions)
        case 'detail_backfill':
          return this.runDetailBackfill(runId, runConfig as DetailBackfillOptions)
        case 'incremental':
          return this.runIncremental(runId, runConfig as IncrementalOptions)
        default:
          throw new Error(`未知任务类型：${record.mode}`)
      }
    })
    return getRun(this.db, runId)!
  }

  // -------------------------------------------------------------------------
  // 列表全量扫描（ASC，稳定分页）
  // -------------------------------------------------------------------------

  private async applyListPage(runId: string, result: ParsedListPage) {
    for (const bundle of result.orders) {
      saveBundle(this.db, bundle, 'list')
    }
    this.patch(runId, { stage: `列表第 ${result.orders.length} 单已写入` })
  }

  private async runListBackfill(runId: string) {
    const client = this.makeClient()
    let page = Math.max(1, Number(getSyncState(this.db, 'list_page_cursor') || 1))
    this.patch(runId, { stage: `扫描列表第 ${page} 页` })

    const first = await client.queryList({ page, sortOrder: 'ASC' })
    let totalPages = first.pages || Math.ceil((first.total || 0) / 10)
    // 断点续跑时，前 page-1 页已在之前的任务里处理过。
    // processed 必须按「绝对已完成页数」累计，才能和「列表 page/totalPages」保持一致。
    let processed = Math.min(page - 1, totalPages)
    this.patch(runId, { total: totalPages, processed })
    await this.applyListPage(runId, first)
    processed++
    setSyncState(this.db, 'list_page_cursor', String(page + 1))
    this.patch(runId, { processed, stage: `列表 ${page}/${totalPages}` })
    page++

    // 用页码作为循环边界，避免续跑时因 processed 从 1 重新计数而多扫到尾部之后
    while (page <= totalPages) {
      if (this.isPaused(runId)) return
      const result = await client.queryList({
        page,
        sortOrder: 'ASC',
        recordCount: totalPages,
        pageCount: totalPages,
      })
      await this.applyListPage(runId, result)
      if (result.pages && result.pages > totalPages) totalPages = result.pages
      processed = page
      setSyncState(this.db, 'list_page_cursor', String(page + 1))
      this.patch(runId, {
        total: totalPages,
        processed,
        stage: `列表 ${page}/${totalPages}`,
      })
      page++
    }
    setSyncState(this.db, 'list_page_cursor', '1')
  }

  // -------------------------------------------------------------------------
  // 打印预览补全（批量 20 单/次，补完整手机号、收货地址与含税价）
  // -------------------------------------------------------------------------

  private async runPrintBackfill(runId: string, options: PrintBackfillOptions) {
    const client = this.makeClient()
    // 实测 20 单可完整返回；上限 50，防止单次响应过大
    const batchSize = Math.max(1, Math.min(50, Number(options.batchSize) || 20))
    const total = this.countPendingPrint()
    this.patch(runId, { total, processed: 0, stage: `待补打印 ${total} 单` })
    if (!total) return

    let processed = 0
    while (true) {
      if (this.isPaused(runId)) return
      const rows = this.db
        .prepare(
          `SELECT order_sn FROM orders
           WHERE print_synced_at IS NULL
           ORDER BY order_sn
           LIMIT ?`,
        )
        .all(batchSize) as Array<{ order_sn: string }>
      if (!rows.length) break

      const batch = rows.map(row => row.order_sn)
      const before = this.countPendingPrint()
      const html = await client.printOrders(batch)
      const parsed = parsePrintContent(html)
      if (!parsed.blockCount) {
        throw new Error('打印接口没有返回订单预览，可能登录态失效或账号没有权限')
      }
      for (const bundle of parsed.orders) {
        saveBundle(this.db, bundle, 'print')
      }

      const after = this.countPendingPrint()
      processed = total - after
      this.patch(runId, { processed, stage: `打印补全 ${processed}/${total}` })

      // 本批没有任何订单被补全时停止，避免对同一批失败订单无限重试
      if (after >= before) {
        this.patch(runId, {
          stage: `打印补全停止：${after} 单未返回数据，可稍后重试`,
        })
        return
      }
    }

    const remaining = this.countPendingPrint()
    if (remaining > 0) {
      this.patch(runId, {
        stage: `打印补全完成；仍有 ${remaining} 单未返回数据，可再次运行`,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 详情全量补全
  // -------------------------------------------------------------------------

  private async runDetailBackfill(runId: string, options: DetailBackfillOptions) {
    const client = this.makeClient()
    const concurrency = Math.max(
      1,
      Math.min(4, options.concurrency || config.detailConcurrency),
    )
    const batchSize = Math.max(10, Math.min(500, options.batchSize || 100))
    const limit = pLimit(concurrency)

    const totalRow = this.db
      .prepare(
        'SELECT COUNT(*) AS c FROM orders WHERE order_id IS NOT NULL AND detail_synced_at IS NULL',
      )
      .get() as { c: number }
    const total = Number(totalRow.c || 0)
    // 详情接口只认内部 order_id；缺 ID 的订单必须先跑列表扫描
    const missingIdRow = this.db
      .prepare(
        'SELECT COUNT(*) AS c FROM orders WHERE order_id IS NULL AND detail_synced_at IS NULL',
      )
      .get() as { c: number }
    const missingId = Number(missingIdRow.c || 0)

    this.patch(runId, { total, processed: 0, stage: `待补详情 ${total} 单` })
    if (!total) {
      if (missingId > 0) {
        throw new PreconditionError(
          `有 ${missingId} 条订单缺少内部订单ID，无法请求详情。内部订单ID只能由「列表全量扫描」写入，请先跑列表扫描，再回来跑详情补全。`,
        )
      }
      return // 所有订单的详情都已完成
    }

    let processed = 0
    let failed = 0
    let cursor = ''

    while (true) {
      if (this.isPaused(runId)) return
      const rows = this.db
        .prepare(
          `SELECT order_sn, order_id FROM orders
           WHERE order_id IS NOT NULL
             AND detail_synced_at IS NULL
             AND CAST(order_id AS INTEGER) > CAST(? AS INTEGER)
           ORDER BY CAST(order_id AS INTEGER) ASC
           LIMIT ?`,
        )
        .all(cursor, batchSize) as Array<{ order_sn: string; order_id: string }>
      if (!rows.length) break

      await Promise.all(
        rows.map(row =>
          limit(async () => {
            if (this.isPaused(runId)) return
            try {
              const html = await client.getDetail(row.order_id)
              const bundle = parseDetailPage(html, row.order_id)
              if (!bundle.order.orderSn) throw new Error('详情页未解析到订单号')
              saveBundle(this.db, bundle, 'detail')
              processed++
            } catch (error) {
              if (error instanceof LoginExpiredError) throw error
              failed++
              console.error(`[detail ${row.order_sn}]`, error)
            }
          }),
        ),
      )
      cursor = rows[rows.length - 1].order_id
      this.patch(runId, {
        processed,
        failed,
        stage: `详情 ${processed}/${total}，失败 ${failed}`,
      })
    }

    // 本轮只处理了有 order_id 的订单；缺 ID 的仍在库里，明确提示前置操作
    const remainingRow = this.db
      .prepare(
        'SELECT COUNT(*) AS c FROM orders WHERE order_id IS NULL AND detail_synced_at IS NULL',
      )
      .get() as { c: number }
    const remaining = Number(remainingRow.c || 0)
    if (remaining > 0) {
      this.patch(runId, {
        stage: `详情补全完成；另有 ${remaining} 单缺内部订单ID，需先运行「列表全量扫描」`,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 增量更新
  // -------------------------------------------------------------------------

  private async runIncremental(runId: string, options: IncrementalOptions) {
    const client = this.makeClient()
    const days = options.days || 7
    const endTime = options.endTime || formatLocalDateTime()
    const startTime = options.startTime || subtractDaysFromDateTime(endTime, days)
    const refetchDetail = options.refetchDetail !== false

    this.patch(runId, { stage: `增量窗口 ${startTime} ~ ${endTime}` })
    const first = await client.queryList({
      page: 1,
      sortOrder: 'DESC',
      startTime,
      endTime,
    })
    const totalPages = first.pages || Math.ceil((first.total || 0) / 10)
    this.patch(runId, { total: totalPages, processed: 0, stage: `增量列表 1/${totalPages}` })

    const orderSns = new Set<string>()
    for (const bundle of first.orders) {
      saveBundle(this.db, bundle, 'list')
      orderSns.add(bundle.order.orderSn)
    }
    let processedPages = 1

    for (let page = 2; page <= totalPages; page++) {
      if (this.isPaused(runId)) return
      const result = await client.queryList({
        page,
        sortOrder: 'DESC',
        startTime,
        endTime,
        recordCount: totalPages,
        pageCount: totalPages,
      })
      for (const bundle of result.orders) {
        saveBundle(this.db, bundle, 'list')
        orderSns.add(bundle.order.orderSn)
      }
      processedPages++
      this.patch(runId, {
        total: totalPages + orderSns.size,
        processed: processedPages,
        stage: `增量列表 ${page}/${totalPages}`,
      })
    }

    if (!refetchDetail || !orderSns.size) return

    const placeholders = [...orderSns].map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT order_sn, order_id FROM orders
         WHERE order_sn IN (${placeholders}) AND order_id IS NOT NULL
         ORDER BY CAST(order_id AS INTEGER) ASC`,
      )
      .all(...orderSns) as Array<{ order_sn: string; order_id: string }>

    const limit = pLimit(config.detailConcurrency)
    let detailProcessed = 0
    let detailFailed = 0
    this.patch(runId, {
      total: totalPages + rows.length,
      processed: processedPages,
      stage: `增量详情 0/${rows.length}`,
    })

    const batchSize = 100
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      if (this.isPaused(runId)) return
      const batch = rows.slice(offset, offset + batchSize)
      await Promise.all(
        batch.map(row =>
          limit(async () => {
            if (this.isPaused(runId)) return
            try {
              const html = await client.getDetail(row.order_id)
              const bundle = parseDetailPage(html, row.order_id)
              if (!bundle.order.orderSn) throw new Error('详情页未解析到订单号')
              saveBundle(this.db, bundle, 'detail')
              detailProcessed++
            } catch (error) {
              if (error instanceof LoginExpiredError) throw error
              detailFailed++
              console.error(`[incremental detail ${row.order_sn}]`, error)
            }
          }),
        ),
      )
      this.patch(runId, {
        processed: processedPages + detailProcessed,
        failed: detailFailed,
        stage: `增量详情 ${detailProcessed}/${rows.length}`,
      })
    }
  }
}

export type { CollectionMode }
