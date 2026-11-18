import { afterAll, describe, expect, it } from 'vitest'
import {
  closeDb,
  dashboardStats,
  getOrderDetail,
  listOrders,
  openDb,
  saveBundle,
} from '../db'
import type { ParsedOrderBundle } from '../../shared/types'

const db = openDb(':memory:')

afterAll(() => {
  closeDb()
})

function bundle(orderSn: string, extra: Partial<ParsedOrderBundle['order']> = {}): ParsedOrderBundle {
  return {
    order: { orderSn, ...extra },
    items: [],
    reviewers: [],
    logs: [],
  }
}

describe('订单入库与多通道字段合并', () => {
  it('先写详情打码手机号，再写导出的完整手机号，应保留完整值', () => {
    const orderSn = 'TEST-EXPORT-WINS'
    saveBundle(db, bundle(orderSn, { orderId: '9001', mobile: '138****0001' }), 'detail')
    saveBundle(db, bundle(orderSn, { mobile: '13800000001', buyer: '采购员甲' }), 'export')

    const detail = getOrderDetail(db, orderSn)
    expect(detail?.order.mobile).toBe('13800000001')
    expect(detail?.order.buyer).toBe('采购员甲')
  })

  it('先写导出完整手机号，再写详情打码值，不应被打码覆盖', () => {
    const orderSn = 'TEST-DETAIL-KEEPS'
    saveBundle(db, bundle(orderSn, { orderId: '9002', mobile: '13800000002' }), 'export')
    saveBundle(db, bundle(orderSn, { mobile: '138****0002', telephone: '010-00000002' }), 'detail')

    const detail = getOrderDetail(db, orderSn)
    expect(detail?.order.mobile).toBe('13800000002')
    expect(detail?.order.telephone).toBe('010-00000002')
  })

  it('打印预览应覆盖列表打码手机号，并补齐下单人联系方式与商品含税价', () => {
    const orderSn = 'TEST-PRINT'
    saveBundle(
      db,
      {
        order: { orderSn, mobile: '138****0004' },
        items: [{ itemKey: 'SKU-P', sku: 'SKU-P', productName: '打印商品', quantity: 1 }],
        reviewers: [],
        logs: [],
      },
      'list',
    )
    saveBundle(
      db,
      {
        order: {
          orderSn,
          mobile: '13800000004',
          consignee: '张三',
          buyerName: '采购员丙',
          buyerContact: '13800000004',
        },
        items: [
          {
            itemKey: 'SKU-P',
            sku: 'SKU-P',
            productName: '打印商品',
            quantity: 1,
            taxInclusivePrice: 12.5,
            taxInclusiveAmount: 12.5,
          },
        ],
        reviewers: [],
        logs: [],
      },
      'print',
    )

    const detail = getOrderDetail(db, orderSn)
    expect(detail?.order.mobile).toBe('13800000004')
    expect(detail?.order.buyerName).toBe('采购员丙')
    expect(detail?.order.buyerContact).toBe('13800000004')
    expect(detail?.items).toHaveLength(1)
    expect(detail?.items[0]).toMatchObject({
      taxInclusivePrice: 12.5,
      taxInclusiveAmount: 12.5,
    })
  })

  it('列表、导出、详情的非空字段应合并成一条订单', () => {
    const orderSn = 'TEST-MERGE'
    saveBundle(
      db,
      bundle(orderSn, {
        orderId: '9003',
        remark: '列表备注',
        logistics: '物流配送',
        reviewStatus: '已审核',
        orderAmount: 100,
      }),
      'list',
    )
    saveBundle(
      db,
      bundle(orderSn, {
        mobile: '13800000003',
        reconciliationStatus: '已对帐',
        orderAmount: 120,
      }),
      'export',
    )
    saveBundle(
      db,
      bundle(orderSn, {
        buyer: '采购员乙',
        payTime: '2026-11-18 10:00:00',
        reviewTime: '2026-11-18 10:05:00',
      }),
      'detail',
    )

    const detail = getOrderDetail(db, orderSn)
    expect(detail?.order).toMatchObject({
      orderSn,
      orderId: '9003',
      remark: '列表备注',
      logistics: '物流配送',
      reviewStatus: '已审核',
      mobile: '13800000003',
      reconciliationStatus: '已对帐',
      buyer: '采购员乙',
      payTime: '2026-11-18 10:00:00',
      reviewTime: '2026-11-18 10:05:00',
      orderAmount: 120,
    })
  })

  it('重复写入详情时应整组替换审核人和操作日志，避免残留旧数据', () => {
    const orderSn = 'TEST-REPLACE'
    const first: ParsedOrderBundle = {
      order: { orderSn, orderId: '9004' },
      items: [],
      reviewers: [{ seq: 1, reviewer: '旧审核人' }],
      logs: [{ seq: 1, operator: '旧操作者' }],
    }
    saveBundle(db, first, 'detail')
    expect(getOrderDetail(db, orderSn)?.reviewers).toHaveLength(1)

    const second: ParsedOrderBundle = {
      order: { orderSn, orderId: '9004' },
      items: [],
      reviewers: [
        { seq: 1, reviewer: '新审核人甲' },
        { seq: 2, reviewer: '新审核人乙' },
      ],
      logs: [],
    }
    saveBundle(db, second, 'detail')

    const detail = getOrderDetail(db, orderSn)
    expect(detail?.reviewers.map((r) => r.reviewer)).toEqual(['新审核人甲', '新审核人乙'])
    expect(detail?.logs).toHaveLength(0)
  })

  it('同一订单的商品行应按 itemKey 幂等更新，而不是重复插入', () => {
    const orderSn = 'TEST-ITEMS'
    saveBundle(
      db,
      {
        order: { orderSn },
        items: [{ itemKey: 'SUB-1', productName: '商品甲', quantity: 1 }],
        reviewers: [],
        logs: [],
      },
      'list',
    )
    saveBundle(
      db,
      {
        order: { orderSn },
        items: [{ itemKey: 'SUB-1', productName: '商品甲', quantity: 1, taxRate: '13.00' }],
        reviewers: [],
        logs: [],
      },
      'export',
    )

    const detail = getOrderDetail(db, orderSn)
    expect(detail?.items).toHaveLength(1)
    expect(detail?.items[0].taxRate).toBe('13.00')
  })

  it('详情商品行应按货号/商品名合并到导出的同一行，而不是产生重复行', () => {
    const orderSn = 'TEST-DETAIL-ITEMS'
    saveBundle(
      db,
      {
        order: { orderSn },
        items: [
          {
            itemKey: 'SUB-101',
            subOrderSn: 'SUB-101',
            sku: 'SKU-101',
            productName: '测试商品甲',
            quantity: 2,
            taxRate: '13.00',
          },
        ],
        reviewers: [],
        logs: [],
      },
      'export',
    )
    saveBundle(
      db,
      {
        order: { orderSn },
        items: [
          {
            itemKey: 'SKU-101',
            sku: 'SKU-101',
            productName: '测试商品甲',
            brand: '测试品牌',
            quantity: 2,
            supplierName: '详情供应商',
          },
        ],
        reviewers: [],
        logs: [],
      },
      'detail',
    )

    const detail = getOrderDetail(db, orderSn)
    expect(detail?.items).toHaveLength(1)
    expect(detail?.items[0]).toMatchObject({
      subOrderSn: 'SUB-101',
      sku: 'SKU-101',
      brand: '测试品牌',
      taxRate: '13.00',
      supplierName: '详情供应商',
    })
  })

  it('详情先入库、导出后补时，也应复用详情行的 itemKey 完成合并', () => {
    const orderSn = 'TEST-DETAIL-FIRST'
    saveBundle(
      db,
      {
        order: { orderSn },
        items: [
          {
            itemKey: 'SKU-201',
            sku: 'SKU-201',
            productName: '测试商品乙',
            brand: '测试品牌乙',
            quantity: 1,
          },
        ],
        reviewers: [],
        logs: [],
      },
      'detail',
    )
    saveBundle(
      db,
      {
        order: { orderSn },
        items: [
          {
            itemKey: 'SUB-201',
            subOrderSn: 'SUB-201',
            supplierOrderSn: 'SUP-201',
            sku: 'SKU-201',
            productName: '测试商品乙',
            quantity: 1,
            taxInclusiveAmount: 30,
          },
        ],
        reviewers: [],
        logs: [],
      },
      'export',
    )

    const detail = getOrderDetail(db, orderSn)
    expect(detail?.items).toHaveLength(1)
    expect(detail?.items[0]).toMatchObject({
      subOrderSn: 'SUB-201',
      supplierOrderSn: 'SUP-201',
      brand: '测试品牌乙',
      taxInclusiveAmount: 30,
    })
  })

  it('应按订单号或内部 ID 查询，并支持列表过滤与统计', () => {
    const orderSn = 'TEST-QUERY'
    saveBundle(
      db,
      {
        order: {
          orderSn,
          orderId: '9010',
          orderTime: '2026-11-18 09:00:00',
          orderStatus: '已发货',
          consignee: '查询测试',
          purchaserOrg: '测试机构',
          orderAmount: 88,
        },
        items: [{ itemKey: 'SUB-Q', productName: '查询商品', quantity: 1 }],
        reviewers: [],
        logs: [],
      },
      'list',
    )

    expect(getOrderDetail(db, orderSn)?.order.orderSn).toBe(orderSn)
    expect(getOrderDetail(db, '9010')?.order.orderSn).toBe(orderSn)

    const result = listOrders(db, { page: 1, pageSize: 10, keyword: '查询商品' })
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.data.some((row) => row.orderSn === orderSn)).toBe(true)

    const byStatus = listOrders(db, { page: 1, pageSize: 10, status: '已发货' })
    expect(byStatus.data.some((row) => row.orderSn === orderSn)).toBe(true)

    const stats = dashboardStats(db)
    expect(stats.totalOrders).toBeGreaterThanOrEqual(1)
    expect(stats.listSynced).toBeGreaterThanOrEqual(1)
  })
})
