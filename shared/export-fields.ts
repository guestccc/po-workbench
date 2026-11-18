import type { OrderExportScope } from './types'

/**
 * 可导出字段目录（前后端共用）。
 *
 * key 是稳定标识：前端用它做 localStorage 记忆，服务端用它映射取值函数，
 * 一旦发布就不要改名，否则用户已保存的勾选习惯会失效。
 */
export interface ExportFieldMeta {
  key: string
  title: string
}

/**
 * 订单主表可导出字段（顺序即 CSV 列顺序）。
 * 覆盖订单详情页的全部单值字段；phone 是「手机优先、回退电话」的合并列，
 * 需要单独区分时请勾选 mobile / telephone。
 */
export const ORDER_EXPORT_FIELDS: ExportFieldMeta[] = [
  { key: 'orderSn', title: '主订单号' },
  { key: 'orderId', title: '内部订单 ID' },
  { key: 'orderTime', title: '下单时间' },
  { key: 'orderStatus', title: '订单状态' },
  { key: 'reviewStatus', title: '审核状态' },
  { key: 'payMethod', title: '支付方式' },
  { key: 'payTime', title: '付款时间' },
  { key: 'reviewTime', title: '审核时间' },
  { key: 'consignee', title: '收货人' },
  { key: 'phone', title: '电话/手机' },
  { key: 'mobile', title: '手机号码' },
  { key: 'telephone', title: '电话号码' },
  { key: 'email', title: '电子邮件' },
  { key: 'address', title: '收货地址' },
  { key: 'zipcode', title: '邮政编码' },
  { key: 'unitName', title: '单位名称' },
  { key: 'buyer', title: '购货人' },
  { key: 'buyerAccount', title: '下单人账号' },
  { key: 'buyerName', title: '下单人姓名' },
  { key: 'buyerContact', title: '下单人联系方式' },
  { key: 'purchaserOrg', title: '采购机构' },
  { key: 'upperOrg', title: '上级单位' },
  { key: 'category', title: '订单类别' },
  { key: 'purpose', title: '用途分类' },
  { key: 'orderAmount', title: '订单金额' },
  { key: 'detailTotal', title: '详情合计' },
  { key: 'shippingFee', title: '运费' },
  { key: 'itemCount', title: '商品件数' },
  { key: 'reconciliationStatus', title: '对帐状态' },
  { key: 'invoiceStatus', title: '开票状态' },
  { key: 'receiptStatus', title: '收款状态' },
  { key: 'eaString', title: 'EA 串' },
  { key: 'shippingMethod', title: '配送方式' },
  { key: 'shippingTime', title: '发货时间' },
  { key: 'shippingSn', title: '发货单号' },
  { key: 'logistics', title: '物流信息' },
  { key: 'deliveryTime', title: '送货时间' },
  { key: 'remark', title: '订单备注' },
]

/**
 * 仅商品行才有的字段。
 * 注意：订单级已有 logistics / reviewStatus，商品级用 itemLogistics /
 * itemReviewStatus 区分，避免同名键在两种粒度下含义不一致。
 */
const ITEM_ONLY_FIELDS: ExportFieldMeta[] = [
  { key: 'lineNo', title: '行号' },
  { key: 'subOrderSn', title: '子订单号' },
  { key: 'supplierOrderSn', title: '供应商订单号' },
  { key: 'productName', title: '商品名称' },
  { key: 'brand', title: '品牌' },
  { key: 'sku', title: '货号' },
  { key: 'productCategory', title: '商品分类' },
  { key: 'supplierName', title: '供应商' },
  { key: 'orgName', title: '机构' },
  { key: 'account', title: '下单账号' },
  { key: 'quantity', title: '数量' },
  { key: 'discountPrice', title: '折扣价' },
  { key: 'mallPrice', title: '商城价' },
  { key: 'taxExclusivePrice', title: '不含税单价' },
  { key: 'taxExclusiveAmount', title: '不含税金额' },
  { key: 'taxAmount', title: '税额' },
  { key: 'taxRate', title: '税率' },
  { key: 'taxInclusivePrice', title: '含税单价' },
  { key: 'taxInclusiveAmount', title: '含税金额' },
  { key: 'status', title: '商品状态' },
  { key: 'itemLogistics', title: '商品物流' },
  { key: 'itemReviewStatus', title: '商品审核状态' },
]

/**
 * 订单 + 商品明细可导出字段（顺序即 CSV 列顺序）。
 * 先完整输出订单字段，再输出商品行字段：明细表同样支持订单的全部信息，
 * 不会比订单主表少列。
 */
export const ITEM_EXPORT_FIELDS: ExportFieldMeta[] = [...ORDER_EXPORT_FIELDS, ...ITEM_ONLY_FIELDS]

export const EXPORT_FIELDS: Record<OrderExportScope, ExportFieldMeta[]> = {
  orders: ORDER_EXPORT_FIELDS,
  items: ITEM_EXPORT_FIELDS,
}

/** 默认导出全部字段 */
export function defaultExportFieldKeys(scope: OrderExportScope): string[] {
  return EXPORT_FIELDS[scope].map(field => field.key)
}

/**
 * 把外部传入的字段键（localStorage / 查询参数）归一化为合法字段列表：
 * - 过滤未知键，自动忽略不同粒度混入的键
 * - 按目录顺序排列，保证 CSV 列顺序稳定
 * - 为空或全部非法时回退到全部字段，避免导出空表头
 */
export function normalizeExportFieldKeys(scope: OrderExportScope, keys: unknown): string[] {
  if (!Array.isArray(keys)) return defaultExportFieldKeys(scope)
  const wanted = new Set(keys.filter((key): key is string => typeof key === 'string'))
  const selected = EXPORT_FIELDS[scope]
    .filter(field => wanted.has(field.key))
    .map(field => field.key)
  return selected.length ? selected : defaultExportFieldKeys(scope)
}
