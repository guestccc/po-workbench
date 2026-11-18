import { Readable } from 'node:stream'
import { buildOrderWhere, type Db, type ListOrdersParams } from './db'
import {
  EXPORT_FIELDS,
  defaultExportFieldKeys,
  normalizeExportFieldKeys,
} from '../shared/export-fields'
import type { OrderExportScope } from '../shared/types'

/**
 * 订单表格导出：把筛选结果流式写成 CSV。
 *
 * 为什么流式：库内订单可达数十万行，一次性 SELECT * + 拼字符串会让服务端内存
 * 涨到几百 MB。这里用 better-sqlite3 的 iterate() 逐行读取，按 64KB 分块产出，
 * 内存占用与订单量无关。
 */

export interface CsvColumn {
  title: string
  /** 从数据库行取值；需要合并多列的字段（如电话/手机）在这里处理 */
  value: (row: Record<string, unknown>) => unknown
}

type RowValue = (row: Record<string, unknown>) => unknown

/**
 * 字段键 → 取值函数。键必须与 shared/export-fields.ts 的目录保持一致；
 * 首列「主订单号」对应 orders.order_sn（打印通道取「父订单编号」，
 * 未拆单时等于订单编号）。电话与页面一致：手机优先，没有手机时回退到电话。
 */
const ORDER_FIELD_VALUES: Record<string, RowValue> = {
  orderSn: row => row.order_sn,
  orderId: row => row.order_id,
  orderTime: row => row.order_time,
  orderStatus: row => row.order_status,
  reviewStatus: row => row.review_status,
  payMethod: row => row.pay_method,
  payTime: row => row.pay_time,
  reviewTime: row => row.review_time,
  consignee: row => row.consignee,
  phone: row => row.mobile || row.phone,
  mobile: row => row.mobile,
  telephone: row => row.telephone,
  email: row => row.email,
  address: row => row.address,
  zipcode: row => row.zipcode,
  unitName: row => row.unit_name,
  buyer: row => row.buyer,
  buyerAccount: row => row.buyer_account,
  buyerName: row => row.buyer_name,
  buyerContact: row => row.buyer_contact,
  purchaserOrg: row => row.purchaser_org,
  upperOrg: row => row.upper_org,
  category: row => row.category,
  purpose: row => row.purpose,
  orderAmount: row => row.order_amount,
  detailTotal: row => row.detail_total,
  shippingFee: row => row.shipping_fee,
  itemCount: row => row.item_count,
  reconciliationStatus: row => row.reconciliation_status,
  invoiceStatus: row => row.invoice_status,
  receiptStatus: row => row.receipt_status,
  eaString: row => row.ea_string,
  shippingMethod: row => row.shipping_method,
  shippingTime: row => row.shipping_time,
  shippingSn: row => row.shipping_sn,
  logistics: row => row.logistics,
  deliveryTime: row => row.delivery_time,
  remark: row => row.remark,
}

/**
 * 订单 + 商品明细：一行一商品，商品为空的订单也保留一行（LEFT JOIN）。
 * 订单级字段与订单主表完全一致，商品级字段用 itemLogistics / itemReviewStatus
 * 与订单级的 logistics / reviewStatus 区分。
 */
const ITEM_FIELD_VALUES: Record<string, RowValue> = {
  ...ORDER_FIELD_VALUES,
  lineNo: row => row.line_no,
  subOrderSn: row => row.sub_order_sn,
  supplierOrderSn: row => row.supplier_order_sn,
  productName: row => row.product_name,
  brand: row => row.brand,
  sku: row => row.sku,
  productCategory: row => row.product_category,
  supplierName: row => row.supplier_name,
  orgName: row => row.org_name,
  account: row => row.account,
  quantity: row => row.quantity,
  discountPrice: row => row.discount_price,
  mallPrice: row => row.mall_price,
  taxExclusivePrice: row => row.tax_exclusive_price,
  taxExclusiveAmount: row => row.tax_exclusive_amount,
  taxAmount: row => row.tax_amount,
  taxRate: row => row.tax_rate,
  taxInclusivePrice: row => row.tax_inclusive_price,
  taxInclusiveAmount: row => row.tax_inclusive_amount,
  status: row => row.status,
  itemLogistics: row => row.item_logistics,
  itemReviewStatus: row => row.item_review_status,
}

/**
 * 按用户勾选生成导出列：非法/未知字段被忽略，空选择回退为全部字段。
 * 列顺序始终按字段目录排列，保证同一套勾选导出的列顺序稳定。
 */
export function resolveExportColumns(scope: OrderExportScope, fields?: string[]): CsvColumn[] {
  const values = scope === 'items' ? ITEM_FIELD_VALUES : ORDER_FIELD_VALUES
  const selected = fields?.length
    ? normalizeExportFieldKeys(scope, fields)
    : defaultExportFieldKeys(scope)
  // 防御：目录里新增字段但忘记补取值函数时，跳过该列而不是在流式输出中途抛错
  return selected
    .filter(key => typeof values[key] === 'function')
    .map(key => ({
      title: EXPORT_FIELDS[scope].find(field => field.key === key)?.title ?? key,
      value: values[key],
    }))
}

const ORDER_SQL = (whereSql: string) => `
  SELECT order_sn, order_id, order_time, order_status, review_status, pay_method, pay_time,
         review_time, consignee, mobile, phone, telephone, email, address, zipcode,
         unit_name, buyer, buyer_account, buyer_name, buyer_contact, purchaser_org,
         upper_org, category, purpose, order_amount, detail_total, shipping_fee,
         item_count, reconciliation_status, invoice_status, receipt_status, ea_string,
         shipping_method, shipping_time, shipping_sn, logistics, delivery_time, remark
  FROM orders
  ${whereSql}
  ORDER BY COALESCE(order_time, order_sn) DESC, order_sn DESC
`

const ITEM_SQL = (whereSql: string) => `
  SELECT orders.order_sn, orders.order_id, orders.order_time, orders.order_status,
         orders.review_status, orders.pay_method, orders.pay_time, orders.review_time,
         orders.consignee, orders.mobile, orders.phone, orders.telephone, orders.email,
         orders.address, orders.zipcode, orders.unit_name, orders.buyer,
         orders.buyer_account, orders.buyer_name, orders.buyer_contact,
         orders.purchaser_org, orders.upper_org, orders.category, orders.purpose,
         orders.order_amount, orders.detail_total, orders.shipping_fee, orders.item_count,
         orders.reconciliation_status, orders.invoice_status, orders.receipt_status,
         orders.ea_string, orders.shipping_method, orders.shipping_time,
         orders.shipping_sn, orders.logistics, orders.delivery_time, orders.remark,
         i.line_no, i.sub_order_sn, i.supplier_order_sn, i.product_name, i.brand, i.sku,
         i.product_category, i.supplier_name, i.org_name, i.account, i.quantity,
         i.discount_price, i.mall_price, i.tax_exclusive_price, i.tax_exclusive_amount,
         i.tax_amount, i.tax_rate, i.tax_inclusive_price, i.tax_inclusive_amount,
         i.status, i.logistics AS item_logistics, i.review_status AS item_review_status
  FROM orders
  LEFT JOIN order_items i ON i.order_sn = orders.order_sn
  ${whereSql}
  ORDER BY COALESCE(orders.order_time, orders.order_sn) DESC, orders.order_sn DESC,
           COALESCE(i.line_no, 999999), i.id
`

/**
 * CSV 单元格序列化。
 * - 引号/逗号/换行：按 RFC 4180 用双引号包裹并转义内部引号
 * - 超长纯数字（如 19 位订单号）：写成 ="123..."，避免 Excel 转成科学计数丢精度
 * - 文本以 = + - @ 开头：前置单引号，防止被 Excel 当公式执行（CSV 注入）
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string') {
    // 长数字直接返回文本公式，不能继续走引号包裹，否则会把 ="..." 的引号再转义一层
    if (/^\d{12,}$/.test(text)) return `="${text}"`
    if (/^[=+\-@]/.test(text)) text = `'${text}`
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** 把一行数据序列化成 CSV 行（CRLF 行尾，兼容 Excel） */
export function csvLine(cells: unknown[]): string {
  return `${cells.map(csvCell).join(',')}\r\n`
}

function csvHeader(columns: CsvColumn[]): string {
  return csvLine(columns.map(column => column.title))
}

/**
 * 生成导出文件名，例如：订单列表_2026-08-18至2026-11-18_20261118-113045.csv
 * 文件名只用于下载展示，浏览器端会按 RFC 5987 做百分号编码。
 */
export function exportFilename(
  params: ListOrdersParams,
  scope: OrderExportScope,
  now: Date = new Date(),
): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const start = params.startDate?.trim()
  const end = params.endDate?.trim()
  let range = '全部'
  if (start && end) range = `${start}至${end}`
  else if (start) range = `自${start}`
  else if (end) range = `截至${end}`
  const scopeLabel = scope === 'items' ? '订单明细' : '订单列表'
  return `${scopeLabel}_${range}_${stamp}.csv`
}

/**
 * 创建 CSV 导出流。调用方负责把流 pipe 到 HTTP 响应；
 * 客户端断开时应 destroy 本流，generator 的 finally 会关闭 SQLite 游标。
 */
export function createOrdersCsvStream(
  db: Db,
  params: ListOrdersParams,
  scope: OrderExportScope,
  fields?: string[],
): Readable {
  const { whereSql, values } = buildOrderWhere(params)
  const columns = resolveExportColumns(scope, fields)
  const sql = scope === 'items' ? ITEM_SQL(whereSql) : ORDER_SQL(whereSql)
  const rows = db.prepare(sql).iterate(values) as IterableIterator<Record<string, unknown>>

  function* chunks(): Generator<string> {
    // UTF-8 BOM 让 Excel 双击打开时按 UTF-8 解码，中文不乱码
    let buffer = `\ufeff${csvHeader(columns)}`
    try {
      for (const row of rows) {
        buffer += csvLine(columns.map(column => column.value(row)))
        if (buffer.length >= 64 * 1024) {
          yield buffer
          buffer = ''
        }
      }
      if (buffer) yield buffer
    } finally {
      // 中途断流（如客户端取消下载）时释放 SQLite 游标
      rows.return?.()
    }
  }

  return Readable.from(chunks(), { objectMode: false, encoding: 'utf8' })
}
