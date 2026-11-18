import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  CollectionMode,
  CollectionRun,
  CollectionStatus,
  DashboardStats,
  OrderDetailResponse,
  OrderItemRecord,
  OrderListResponse,
  OrderLogRecord,
  OrderRecord,
  OrderReviewerRecord,
  ParsedOrderBundle,
  SyncSource,
} from '../shared/types'

export type Db = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  order_sn TEXT PRIMARY KEY,
  order_id TEXT UNIQUE,
  order_time TEXT,
  item_count INTEGER,
  pay_method TEXT,
  order_status TEXT,
  consignee TEXT,
  phone TEXT,
  mobile TEXT,
  address TEXT,
  remark TEXT,
  order_amount REAL,
  shipping_fee REAL,
  category TEXT,
  purpose TEXT,
  shipping_method TEXT,
  shipping_time TEXT,
  shipping_sn TEXT,
  buyer TEXT,
  pay_time TEXT,
  review_time TEXT,
  buyer_account TEXT,
  buyer_name TEXT,
  buyer_contact TEXT,
  purchaser_org TEXT,
  upper_org TEXT,
  ea_string TEXT,
  email TEXT,
  telephone TEXT,
  zipcode TEXT,
  unit_name TEXT,
  delivery_time TEXT,
  reconciliation_status TEXT,
  invoice_status TEXT,
  receipt_status TEXT,
  review_status TEXT,
  logistics TEXT,
  detail_total REAL,
  extra_json TEXT,
  list_synced_at TEXT,
  print_synced_at TEXT,
  detail_synced_at TEXT,
  export_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_time ON orders(order_time);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_detail_synced ON orders(detail_synced_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_sn TEXT NOT NULL REFERENCES orders(order_sn) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  line_no INTEGER,
  sub_order_sn TEXT,
  supplier_order_sn TEXT,
  product_name TEXT,
  brand TEXT,
  sku TEXT,
  product_category TEXT,
  supplier_name TEXT,
  org_name TEXT,
  account TEXT,
  quantity REAL,
  discount_price REAL,
  mall_price REAL,
  tax_exclusive_price REAL,
  tax_exclusive_amount REAL,
  tax_amount REAL,
  tax_rate TEXT,
  tax_inclusive_price REAL,
  tax_inclusive_amount REAL,
  status TEXT,
  logistics TEXT,
  review_status TEXT,
  extra_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(order_sn, item_key)
);

CREATE INDEX IF NOT EXISTS idx_items_order_sn ON order_items(order_sn);
CREATE INDEX IF NOT EXISTS idx_items_sub_order ON order_items(sub_order_sn);
CREATE INDEX IF NOT EXISTS idx_items_sku ON order_items(sku);

CREATE TABLE IF NOT EXISTS order_reviewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_sn TEXT NOT NULL REFERENCES orders(order_sn) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  reviewer TEXT,
  org_name TEXT,
  org_code TEXT,
  contact TEXT,
  mobile TEXT,
  extra_json TEXT,
  UNIQUE(order_sn, seq)
);

CREATE TABLE IF NOT EXISTS order_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_sn TEXT NOT NULL REFERENCES orders(order_sn) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  operator TEXT,
  operated_at TEXT,
  order_status TEXT,
  pay_status TEXT,
  shipping_status TEXT,
  review_status TEXT,
  note TEXT,
  extra_json TEXT,
  UNIQUE(order_sn, seq)
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  cursor TEXT,
  config_json TEXT,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_created ON collection_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
`

let cachedDb: Db | null = null

export function openDb(file = process.env.PO_WORKBENCH_DB || 'data/workbench.db'): Db {
  if (cachedDb) return cachedDb
  const db = new Database(file)
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  if (file !== ':memory:') {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
  }
  db.exec(SCHEMA)
  // 兼容旧库：CREATE TABLE IF NOT EXISTS 不会补列，这里按需 ALTER TABLE
  ensureColumn(db, 'orders', 'buyer_contact', 'TEXT')
  ensureColumn(db, 'orders', 'print_synced_at', 'TEXT')
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_print_synced ON orders(print_synced_at)')
  cachedDb = db
  return db
}

/** 为已存在的表补充新列（SQLite 不支持 ADD COLUMN IF NOT EXISTS） */
function ensureColumn(db: Db, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(item => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function closeDb() {
  cachedDb?.close()
  cachedDb = null
}

export function nowIso() {
  return new Date().toISOString()
}

// ---------- SQL 语句缓存 ----------

const statementCache = new WeakMap<Db, Map<string, Database.Statement>>()

function stmt(db: Db, sql: string) {
  let cache = statementCache.get(db)
  if (!cache) {
    cache = new Map()
    statementCache.set(db, cache)
  }
  let s = cache.get(sql)
  if (!s) {
    s = db.prepare(sql)
    cache.set(sql, s)
  }
  return s
}

// ---------- 订单写入 ----------

const ORDER_FIELDS: Array<[Exclude<keyof OrderRecord, 'extra'>, string]> = [
  ['orderId', 'order_id'],
  ['orderTime', 'order_time'],
  ['itemCount', 'item_count'],
  ['payMethod', 'pay_method'],
  ['orderStatus', 'order_status'],
  ['consignee', 'consignee'],
  ['phone', 'phone'],
  ['mobile', 'mobile'],
  ['address', 'address'],
  ['remark', 'remark'],
  ['orderAmount', 'order_amount'],
  ['shippingFee', 'shipping_fee'],
  ['category', 'category'],
  ['purpose', 'purpose'],
  ['shippingMethod', 'shipping_method'],
  ['shippingTime', 'shipping_time'],
  ['shippingSn', 'shipping_sn'],
  ['buyer', 'buyer'],
  ['payTime', 'pay_time'],
  ['reviewTime', 'review_time'],
  ['buyerAccount', 'buyer_account'],
  ['buyerName', 'buyer_name'],
  ['buyerContact', 'buyer_contact'],
  ['purchaserOrg', 'purchaser_org'],
  ['upperOrg', 'upper_org'],
  ['eaString', 'ea_string'],
  ['email', 'email'],
  ['telephone', 'telephone'],
  ['zipcode', 'zipcode'],
  ['unitName', 'unit_name'],
  ['deliveryTime', 'delivery_time'],
  ['reconciliationStatus', 'reconciliation_status'],
  ['invoiceStatus', 'invoice_status'],
  ['receiptStatus', 'receipt_status'],
  ['reviewStatus', 'review_status'],
  ['logistics', 'logistics'],
  ['detailTotal', 'detail_total'],
]

const ORDER_SYNC_COLUMNS: Record<SyncSource, string> = {
  export: 'export_synced_at',
  list: 'list_synced_at',
  print: 'print_synced_at',
  detail: 'detail_synced_at',
}

function upsertOrder(db: Db, order: OrderRecord, source: SyncSource) {
  if (!order.orderSn) throw new Error('订单号为空，无法写入')
  const now = nowIso()
  const row: Record<string, unknown> = { order_sn: order.orderSn }
  for (const [key, column] of ORDER_FIELDS) {
    row[column] = order[key] ?? null
  }
  row.extra_json = order.extra ? JSON.stringify(order.extra) : null
  row[ORDER_SYNC_COLUMNS[source]] = now
  row.created_at = now
  row.updated_at = now

  const columns = Object.keys(row)
  const values = columns.map(c => `@${c}`).join(', ')
  const updates = columns
    .filter(c => c !== 'order_sn' && c !== 'created_at')
    .map(c => {
      if (c === 'extra_json') {
        return 'extra_json = COALESCE(excluded.extra_json, orders.extra_json)'
      }
      if (c === 'updated_at' || c.endsWith('_synced_at')) {
        return `${c} = excluded.${c}`
      }
      // 详情页手机号/电话是打码的（如 138****1234），导出的才是完整号码。
      // 合并规则：新值为空保留旧值；新值打码而旧值完整时保留旧值；其余情况新值优先。
      if (c === 'mobile' || c === 'phone') {
        return `${c} = CASE
          WHEN excluded.${c} IS NULL THEN orders.${c}
          WHEN excluded.${c} LIKE '%*%' AND orders.${c} IS NOT NULL AND orders.${c} NOT LIKE '%*%'
            THEN orders.${c}
          ELSE excluded.${c} END`
      }
      return `${c} = COALESCE(excluded.${c}, orders.${c})`
    })
    .join(', ')

  stmt(
    db,
    `INSERT INTO orders (${columns.join(', ')}) VALUES (${values})
     ON CONFLICT(order_sn) DO UPDATE SET ${updates}`,
  ).run(row)
}

const ITEM_FIELDS: Array<[Exclude<keyof OrderItemRecord, 'itemKey' | 'extra'>, string]> = [
  ['lineNo', 'line_no'],
  ['subOrderSn', 'sub_order_sn'],
  ['supplierOrderSn', 'supplier_order_sn'],
  ['productName', 'product_name'],
  ['brand', 'brand'],
  ['sku', 'sku'],
  ['productCategory', 'product_category'],
  ['supplierName', 'supplier_name'],
  ['orgName', 'org_name'],
  ['account', 'account'],
  ['quantity', 'quantity'],
  ['discountPrice', 'discount_price'],
  ['mallPrice', 'mall_price'],
  ['taxExclusivePrice', 'tax_exclusive_price'],
  ['taxExclusiveAmount', 'tax_exclusive_amount'],
  ['taxAmount', 'tax_amount'],
  ['taxRate', 'tax_rate'],
  ['taxInclusivePrice', 'tax_inclusive_price'],
  ['taxInclusiveAmount', 'tax_inclusive_amount'],
  ['status', 'status'],
  ['logistics', 'logistics'],
  ['reviewStatus', 'review_status'],
]

function upsertItem(db: Db, orderSn: string, item: OrderItemRecord) {
  const now = nowIso()
  const row: Record<string, unknown> = {
    order_sn: orderSn,
    item_key: item.itemKey || item.subOrderSn || item.supplierOrderSn || item.sku || '1',
    extra_json: item.extra ? JSON.stringify(item.extra) : null,
    created_at: now,
    updated_at: now,
  }
  for (const [key, column] of ITEM_FIELDS) {
    row[column] = item[key] ?? null
  }
  const columns = Object.keys(row)
  const values = columns.map(c => `@${c}`).join(', ')
  const updates = columns
    .filter(c => c !== 'order_sn' && c !== 'item_key' && c !== 'created_at')
    .map(c => {
      if (c === 'extra_json') {
        return 'extra_json = COALESCE(excluded.extra_json, order_items.extra_json)'
      }
      if (c === 'updated_at') return 'updated_at = excluded.updated_at'
      return `${c} = COALESCE(excluded.${c}, order_items.${c})`
    })
    .join(', ')

  stmt(
    db,
    `INSERT INTO order_items (${columns.join(', ')}) VALUES (${values})
     ON CONFLICT(order_sn, item_key) DO UPDATE SET ${updates}`,
  ).run(row)
}

function replaceReviewers(db: Db, orderSn: string, reviewers: OrderReviewerRecord[]) {
  db.prepare('DELETE FROM order_reviewers WHERE order_sn = ?').run(orderSn)
  const insert = db.prepare(
    `INSERT INTO order_reviewers
      (order_sn, seq, reviewer, org_name, org_code, contact, mobile, extra_json)
     VALUES (@order_sn, @seq, @reviewer, @org_name, @org_code, @contact, @mobile, @extra_json)`,
  )
  for (const r of reviewers) {
    insert.run({
      order_sn: orderSn,
      seq: r.seq,
      reviewer: r.reviewer ?? null,
      org_name: r.orgName ?? null,
      org_code: r.orgCode ?? null,
      contact: r.contact ?? null,
      mobile: r.mobile ?? null,
      extra_json: r.extra ? JSON.stringify(r.extra) : null,
    })
  }
}

function replaceLogs(db: Db, orderSn: string, logs: OrderLogRecord[]) {
  db.prepare('DELETE FROM order_logs WHERE order_sn = ?').run(orderSn)
  const insert = db.prepare(
    `INSERT INTO order_logs
      (order_sn, seq, operator, operated_at, order_status, pay_status, shipping_status, review_status, note, extra_json)
     VALUES (@order_sn, @seq, @operator, @operated_at, @order_status, @pay_status, @shipping_status, @review_status, @note, @extra_json)`,
  )
  for (const l of logs) {
    insert.run({
      order_sn: orderSn,
      seq: l.seq,
      operator: l.operator ?? null,
      operated_at: l.operatedAt ?? null,
      order_status: l.orderStatus ?? null,
      pay_status: l.payStatus ?? null,
      shipping_status: l.shippingStatus ?? null,
      review_status: l.reviewStatus ?? null,
      note: l.note ?? null,
      extra_json: l.extra ? JSON.stringify(l.extra) : null,
    })
  }
}

interface ExistingItemRow {
  item_key: string
  sub_order_sn: string | null
  supplier_order_sn: string | null
  sku: string | null
  product_name: string | null
  quantity: number | null
}

/**
 * 跨通道对齐商品行的 itemKey。
 * 导出/列表以子订单号为主键，详情页没有子订单号（只有货号/商品名），
 * 若直接按各自规则写入，同一商品会出现两行。这里优先复用已存在行的 itemKey：
 * 子订单号 → 供应商订单号 → 货号 → 商品名 + 数量，保证三个通道合并到同一行。
 */
function alignItemKeys(db: Db, orderSn: string, items: OrderItemRecord[]) {
  if (!items.length) return
  const existing = db
    .prepare(
      `SELECT item_key, sub_order_sn, supplier_order_sn, sku, product_name, quantity
       FROM order_items WHERE order_sn = ?`,
    )
    .all(orderSn) as ExistingItemRow[]
  const used = new Set<string>()

  items.forEach((item, index) => {
    const match = existing.find(
      row =>
        !used.has(row.item_key) &&
        ((row.item_key && row.item_key === item.itemKey) ||
          (item.subOrderSn && row.sub_order_sn === item.subOrderSn) ||
          (item.supplierOrderSn && row.supplier_order_sn === item.supplierOrderSn) ||
          (item.sku && row.sku === item.sku) ||
          (item.productName &&
            row.product_name === item.productName &&
            (item.quantity == null ||
              row.quantity == null ||
              Number(row.quantity) === Number(item.quantity)))),
    )

    let key = match?.item_key ?? item.itemKey
    // 同一订单内可能出现重复货号，追加行号避免被 upsert 合并掉
    if (!key || used.has(key)) key = `${key || item.productName || 'line'}#${index + 1}`
    item.itemKey = key
    used.add(key)
  })
}

/**
 * 事务写入一个订单及其子表。
 * 同一订单可能来自列表、打印预览、详情等多个来源，字段用 COALESCE 合并，后到的非空值覆盖旧值。
 */
export function saveBundle(db: Db, bundle: ParsedOrderBundle, source: SyncSource) {
  const fn = db.transaction((b: ParsedOrderBundle) => {
    upsertOrder(db, b.order, source)
    alignItemKeys(db, b.order.orderSn, b.items)
    for (const item of b.items) upsertItem(db, b.order.orderSn, item)
    if (source === 'detail') {
      replaceReviewers(db, b.order.orderSn, b.reviewers)
      replaceLogs(db, b.order.orderSn, b.logs)
    }
  })
  fn(bundle)
}

// ---------- 订单读取 ----------

function parseJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function rowToOrder(row: Record<string, unknown>): OrderRecord {
  const order: OrderRecord = { orderSn: String(row.order_sn) }
  for (const [key, column] of ORDER_FIELDS) {
    const value = row[column]
    ;(order as unknown as Record<string, unknown>)[key] = value ?? null
  }
  order.extra = parseJson(row.extra_json)
  return order
}

function rowToItem(row: Record<string, unknown>): OrderItemRecord {
  const item = { itemKey: String(row.item_key) } as OrderItemRecord
  for (const [key, column] of ITEM_FIELDS) {
    ;(item as unknown as Record<string, unknown>)[key] = row[column] ?? null
  }
  item.extra = parseJson(row.extra_json)
  return item
}

function rowToReviewer(row: Record<string, unknown>): OrderReviewerRecord {
  return {
    seq: Number(row.seq),
    reviewer: (row.reviewer as string) ?? null,
    orgName: (row.org_name as string) ?? null,
    orgCode: (row.org_code as string) ?? null,
    contact: (row.contact as string) ?? null,
    mobile: (row.mobile as string) ?? null,
    extra: parseJson(row.extra_json),
  }
}

function rowToLog(row: Record<string, unknown>): OrderLogRecord {
  return {
    seq: Number(row.seq),
    operator: (row.operator as string) ?? null,
    operatedAt: (row.operated_at as string) ?? null,
    orderStatus: (row.order_status as string) ?? null,
    payStatus: (row.pay_status as string) ?? null,
    shippingStatus: (row.shipping_status as string) ?? null,
    reviewStatus: (row.review_status as string) ?? null,
    note: (row.note as string) ?? null,
    extra: parseJson(row.extra_json),
  }
}

export function getOrderDetail(db: Db, key: string): OrderDetailResponse | null {
  const row = db
    .prepare('SELECT * FROM orders WHERE order_sn = ? OR order_id = ? LIMIT 1')
    .get(key, key) as Record<string, unknown> | undefined
  if (!row) return null
  const order = rowToOrder(row)
  const items = db
    .prepare('SELECT * FROM order_items WHERE order_sn = ? ORDER BY COALESCE(line_no, 999999), id')
    .all(order.orderSn) as Record<string, unknown>[]
  const reviewers = db
    .prepare('SELECT * FROM order_reviewers WHERE order_sn = ? ORDER BY seq, id')
    .all(order.orderSn) as Record<string, unknown>[]
  const logs = db
    .prepare('SELECT * FROM order_logs WHERE order_sn = ? ORDER BY seq, id')
    .all(order.orderSn) as Record<string, unknown>[]
  return {
    order,
    items: items.map(rowToItem),
    reviewers: reviewers.map(rowToReviewer),
    logs: logs.map(rowToLog),
  }
}

export interface ListOrdersParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: string
  startDate?: string
  endDate?: string
}

export interface OrderWhere {
  whereSql: string
  values: Record<string, unknown>
}

/** 日期字符串（YYYY-MM-DD）加天数；解析失败时原样返回，避免把非法输入变成 nextIso 崩溃 */
function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

/**
 * 订单筛选条件（列表查询与导出共用，保证两边口径一致）。
 * 所有列都带 orders. 前缀，便于导出时与 order_items 联表查询。
 *
 * 日期边界说明：order_time 存的是「YYYY-MM-DD HH:mm:ss」，而用户选择的是日期。
 * 若直接用 `order_time <= '2026-11-18'`，当天 00:00:00 之后的数据都会被漏掉，
 * 因此 endDate 换算成「次日 00:00:00 之前」做不含比较，保证包含结束当天全天。
 */
export function buildOrderWhere(params: ListOrdersParams): OrderWhere {
  const where: string[] = []
  const values: Record<string, unknown> = {}

  if (params.keyword?.trim()) {
    // 关键词同时匹配订单级字段与商品明细，方便按商品名称/子订单号反查订单
    where.push(
      `(orders.order_sn LIKE @keyword OR orders.order_id LIKE @keyword
        OR orders.consignee LIKE @keyword OR orders.buyer_name LIKE @keyword
        OR orders.buyer_account LIKE @keyword OR orders.purchaser_org LIKE @keyword
        OR orders.unit_name LIKE @keyword OR orders.address LIKE @keyword
        OR EXISTS (
          SELECT 1 FROM order_items i
          WHERE i.order_sn = orders.order_sn
            AND (i.product_name LIKE @keyword OR i.sku LIKE @keyword
              OR i.sub_order_sn LIKE @keyword OR i.supplier_order_sn LIKE @keyword)
        ))`,
    )
    values.keyword = `%${params.keyword.trim()}%`
  }
  if (params.status?.trim()) {
    where.push('orders.order_status LIKE @status')
    values.status = `%${params.status.trim()}%`
  }
  if (params.startDate?.trim()) {
    // 只传日期时，'2026-11-18' <= '2026-11-18 10:00:00' 成立，天然包含当天全天
    where.push('orders.order_time >= @startDate')
    values.startDate = params.startDate.trim()
  }
  if (params.endDate?.trim()) {
    const endDate = params.endDate.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      where.push('orders.order_time < @endDateNext')
      values.endDateNext = `${addDays(endDate, 1)} 00:00:00`
    } else {
      where.push('orders.order_time <= @endDate')
      values.endDate = endDate
    }
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', values }
}

export function listOrders(db: Db, params: ListOrdersParams): OrderListResponse {
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Math.min(200, Number(params.pageSize) || 20))
  const { whereSql, values } = buildOrderWhere(params)

  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS c FROM orders ${whereSql}`).get(values) as { c: number }).c,
  )
  const rows = db
    .prepare(
      `SELECT * FROM orders ${whereSql}
       ORDER BY COALESCE(order_time, order_sn) DESC, order_sn DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...values, limit: pageSize, offset: (page - 1) * pageSize }) as Record<string, unknown>[]

  return { data: rows.map(rowToOrder), total, page, pageSize }
}

export function dashboardStats(db: Db): DashboardStats {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM orders) AS total_orders,
        (SELECT COUNT(*) FROM orders WHERE substr(order_time, 1, 10) = date('now', 'localtime')) AS today_orders,
        (SELECT COUNT(*) FROM order_items) AS total_items,
        (SELECT COUNT(*) FROM orders WHERE detail_synced_at IS NOT NULL) AS detail_synced,
        (SELECT COUNT(*) FROM orders WHERE list_synced_at IS NOT NULL) AS list_synced,
        (SELECT COUNT(*) FROM orders WHERE print_synced_at IS NOT NULL) AS print_synced,
        (SELECT MAX(updated_at) FROM orders) AS last_sync_at`,
    )
    .get() as Record<string, unknown>
  return {
    totalOrders: Number(row.total_orders || 0),
    todayOrders: Number(row.today_orders || 0),
    totalItems: Number(row.total_items || 0),
    detailSynced: Number(row.detail_synced || 0),
    listSynced: Number(row.list_synced || 0),
    printSynced: Number(row.print_synced || 0),
    lastSyncAt: (row.last_sync_at as string) ?? null,
  }
}

// ---------- 设置 / 同步状态 ----------

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined
  return row?.value ?? null
}

export function setSetting(db: Db, key: string, value: string | null) {
  stmt(
    db,
    `INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, @updated_at)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run({ key, value, updated_at: nowIso() })
}

export function deleteSetting(db: Db, key: string) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function getSyncState(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined
  return row?.value ?? null
}

export function setSyncState(db: Db, key: string, value: string | null) {
  stmt(
    db,
    `INSERT INTO sync_state (key, value, updated_at) VALUES (@key, @value, @updated_at)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run({ key, value, updated_at: nowIso() })
}

// ---------- 采集任务 ----------

export function createRun(
  db: Db,
  mode: CollectionMode,
  config: Record<string, unknown> | null = null,
  total = 0,
): CollectionRun {
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO collection_runs
      (id, mode, status, stage, total, processed, failed, cursor, config_json, error, started_at, updated_at)
     VALUES (@id, @mode, 'running', @stage, @total, 0, 0, NULL, @config_json, NULL, @started_at, @updated_at)`,
  ).run({
    id,
    mode,
    stage: '初始化',
    total,
    config_json: config ? JSON.stringify(config) : null,
    started_at: now,
    updated_at: now,
  })
  return getRun(db, id)!
}

export interface RunPatch {
  status?: CollectionStatus
  stage?: string | null
  total?: number
  processed?: number
  failed?: number
  cursor?: string | null
  error?: string | null
  finishedAt?: string | null
}

export function updateRun(db: Db, id: string, patch: RunPatch) {
  const columns: string[] = []
  const values: Record<string, unknown> = { id, updated_at: nowIso() }
  const mapping: Array<[keyof RunPatch, string]> = [
    ['status', 'status'],
    ['stage', 'stage'],
    ['total', 'total'],
    ['processed', 'processed'],
    ['failed', 'failed'],
    ['cursor', 'cursor'],
    ['error', 'error'],
    ['finishedAt', 'finished_at'],
  ]
  for (const [key, column] of mapping) {
    if (patch[key] !== undefined) {
      columns.push(`${column} = @${column}`)
      values[column] = patch[key]
    }
  }
  columns.push('updated_at = @updated_at')
  db.prepare(`UPDATE collection_runs SET ${columns.join(', ')} WHERE id = @id`).run(values)
}

function rowToRun(row: Record<string, unknown>): CollectionRun {
  return {
    id: String(row.id),
    mode: row.mode as CollectionMode,
    status: row.status as CollectionStatus,
    stage: (row.stage as string) ?? null,
    total: Number(row.total || 0),
    processed: Number(row.processed || 0),
    failed: Number(row.failed || 0),
    cursor: (row.cursor as string) ?? null,
    config: parseJson(row.config_json),
    error: (row.error as string) ?? null,
    startedAt: (row.started_at as string) ?? null,
    finishedAt: (row.finished_at as string) ?? null,
    updatedAt: String(row.updated_at),
  }
}

export function getRun(db: Db, id: string): CollectionRun | null {
  const row = db.prepare('SELECT * FROM collection_runs WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToRun(row) : null
}

export function listRuns(db: Db, limit = 20): CollectionRun[] {
  const rows = db
    .prepare('SELECT * FROM collection_runs ORDER BY started_at DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[]
  return rows.map(rowToRun)
}

export function pauseInterruptedRuns(db: Db) {
  db.prepare(
    `UPDATE collection_runs
     SET status = 'paused', error = '服务重启，任务已暂停，可手动续跑', updated_at = ?
     WHERE status = 'running'`,
  ).run(nowIso())
}

// 注：早期按月导出通道已移除。orders.export_synced_at 仅用于标记历史导出来源，
// 不再有新的写入；部分存量订单仍保留当时的完整手机号、税额等字段。
