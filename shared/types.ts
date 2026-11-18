// 前后端共享的订单数据结构。
// 这里只放“解析后的结构化字段”，不存在原始 HTML。

export type SyncSource = 'export' | 'list' | 'detail'

export interface OrderRecord {
  /** 主订单编号，业务主键 */
  orderSn: string
  /** 详情页内部订单 ID，列表页 data-id */
  orderId?: string | null
  /** 下单时间，尽量补全为 YYYY-MM-DD HH:mm:ss */
  orderTime?: string | null
  /** 商品件数 */
  itemCount?: number | null
  payMethod?: string | null
  orderStatus?: string | null
  consignee?: string | null
  /** 电话，可能来自列表/详情（掩码）或导出（完整） */
  phone?: string | null
  /** 手机，可能来自列表/详情（掩码）或导出（完整） */
  mobile?: string | null
  address?: string | null
  /** 订单备注，列表独有 */
  remark?: string | null
  orderAmount?: number | null
  shippingFee?: number | null
  /** 订单类别/分类 */
  category?: string | null
  /** 用途分类 */
  purpose?: string | null
  shippingMethod?: string | null
  shippingTime?: string | null
  shippingSn?: string | null
  /** 购货人，详情独有 */
  buyer?: string | null
  payTime?: string | null
  reviewTime?: string | null
  buyerAccount?: string | null
  buyerName?: string | null
  /** 采购方机构名称 */
  purchaserOrg?: string | null
  upperOrg?: string | null
  eaString?: string | null
  email?: string | null
  telephone?: string | null
  zipcode?: string | null
  unitName?: string | null
  deliveryTime?: string | null
  reconciliationStatus?: string | null
  invoiceStatus?: string | null
  receiptStatus?: string | null
  /** 订单级审核状态，列表独有 */
  reviewStatus?: string | null
  /** 物流/单号，列表独有 */
  logistics?: string | null
  /** 详情页合计金额 */
  detailTotal?: number | null
  /** 仅保存结构化附加字段，不保存 HTML */
  extra?: Record<string, unknown> | null
}

export interface OrderItemRecord {
  /** 订单内稳定的行标识：子订单号 > 供应商订单号 > 货号 > 行号 */
  itemKey: string
  lineNo?: number | null
  subOrderSn?: string | null
  supplierOrderSn?: string | null
  productName?: string | null
  brand?: string | null
  sku?: string | null
  productCategory?: string | null
  supplierName?: string | null
  orgName?: string | null
  account?: string | null
  quantity?: number | null
  discountPrice?: number | null
  mallPrice?: number | null
  taxExclusivePrice?: number | null
  taxExclusiveAmount?: number | null
  taxAmount?: number | null
  taxRate?: string | null
  taxInclusivePrice?: number | null
  taxInclusiveAmount?: number | null
  status?: string | null
  logistics?: string | null
  reviewStatus?: string | null
  extra?: Record<string, unknown> | null
}

export interface OrderReviewerRecord {
  seq: number
  reviewer?: string | null
  orgName?: string | null
  orgCode?: string | null
  contact?: string | null
  mobile?: string | null
  extra?: Record<string, unknown> | null
}

export interface OrderLogRecord {
  seq: number
  operator?: string | null
  operatedAt?: string | null
  orderStatus?: string | null
  payStatus?: string | null
  shippingStatus?: string | null
  reviewStatus?: string | null
  note?: string | null
  extra?: Record<string, unknown> | null
}

export interface ParsedOrderBundle {
  order: OrderRecord
  items: OrderItemRecord[]
  reviewers: OrderReviewerRecord[]
  logs: OrderLogRecord[]
}

export type CollectionMode =
  | 'export_backfill'
  | 'list_backfill'
  | 'detail_backfill'
  | 'incremental'

export type CollectionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed'

export interface CollectionRun {
  id: string
  mode: CollectionMode
  status: CollectionStatus
  stage: string | null
  total: number
  processed: number
  failed: number
  cursor: string | null
  config: Record<string, unknown> | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
}

export interface ExportTaskRecord {
  id: string
  monthStart: string
  monthEnd: string
  status: string
  progress: string | null
  fileSize: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
  downloadedAt: string | null
  parsedAt: string | null
}

export interface LoginCheckResult {
  valid: boolean
  message: string
  httpStatus?: number
  totalOrders?: number | null
  checkedAt: string
}

export interface DashboardStats {
  totalOrders: number
  todayOrders: number
  totalItems: number
  detailSynced: number
  exportSynced: number
  lastSyncAt: string | null
}

export interface OrderListResponse {
  data: OrderRecord[]
  total: number
  page: number
  pageSize: number
}

export interface OrderDetailResponse {
  order: OrderRecord
  items: OrderItemRecord[]
  reviewers: OrderReviewerRecord[]
  logs: OrderLogRecord[]
}
