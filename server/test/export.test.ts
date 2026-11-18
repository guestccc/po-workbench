import { afterAll, describe, expect, it } from 'vitest'
import type { Readable } from 'node:stream'
import { closeDb, listOrders, openDb, saveBundle } from '../db'
import { createOrdersCsvStream, csvCell, exportFilename } from '../orders-export'
import { ORDER_EXPORT_FIELDS } from '../../shared/export-fields'
import type { OrderExportScope, ParsedOrderBundle } from '../../shared/types'

const db = openDb(':memory:')

afterAll(() => {
  closeDb()
})

/** 把导出流读成完整字符串，模拟浏览器下载后的文件内容 */
async function collect(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function seed(
  orderSn: string,
  order: Partial<ParsedOrderBundle['order']> = {},
  items: ParsedOrderBundle['items'] = [],
) {
  saveBundle(db, { order: { orderSn, ...order }, items, reviewers: [], logs: [] }, 'list')
}

describe('CSV 单元格序列化', () => {
  it('应转义逗号、引号与换行', () => {
    expect(csvCell('张三,李四')).toBe('"张三,李四"')
    expect(csvCell('机构"甲"')).toBe('"机构""甲"""')
    expect(csvCell('第一行\n第二行')).toBe('"第一行\n第二行"')
  })

  it('长数字应包成文本公式，避免 Excel 科学计数法丢精度', () => {
    expect(csvCell('20261118020744403193')).toBe('="20261118020744403193"')
  })

  it('公式开头的文本应转义，防止 CSV 注入', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+86 13800000000')).toBe("'+86 13800000000")
    // 数值本身不受影响
    expect(csvCell(-12.5)).toBe('-12.5')
  })

  it('空值输出空字符串', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
})

describe('订单 CSV 导出', () => {
  it('应包含 BOM 与表头，并按日期范围过滤（含结束当天）', async () => {
    seed(
      '2026111800000000001',
      {
        orderTime: '2026-11-18 23:59:59',
        consignee: '张三, 李四',
        purchaserOrg: '机构"甲"',
        mobile: '13800000001',
        orderAmount: 100.5,
        orderStatus: '已发货',
      },
      [],
    )
    // 次日零点整，必须被 endDate=2026-11-18 排除
    seed('2026111800000000002', { orderTime: '2026-11-19 00:00:00', consignee: '王五' })
    // 日期-only 的时间也要包含在当天范围内
    seed('2026111800000000003', { orderTime: '2026-11-18', consignee: '赵六' })

    const text = await collect(
      createOrdersCsvStream(db, { startDate: '2026-11-18', endDate: '2026-11-18' }, 'orders'),
    )

    expect(text.startsWith('\ufeff主订单号,内部订单 ID,下单时间')).toBe(true)
    expect(text).toContain('="2026111800000000001"')
    expect(text).toContain('="2026111800000000003"')
    expect(text).not.toContain('2026111800000000002')
    expect(text).toContain('"张三, 李四"')
    expect(text).toContain('"机构""甲"""')
    expect(text).toContain('13800000001')
  })

  it('列表查询与导出应使用相同的结束日期边界', () => {
    const result = listOrders(db, { startDate: '2026-11-18', endDate: '2026-11-18' })
    const sns = result.data.map(row => row.orderSn)
    expect(sns).toContain('2026111800000000001')
    expect(sns).toContain('2026111800000000003')
    expect(sns).not.toContain('2026111800000000002')
  })

  it('明细粒度应按商品展开，无商品的订单保留一行', async () => {
    seed(
      '2026111800000000100',
      { orderTime: '2026-11-18 10:00:00', consignee: '孙七' },
      [
        { itemKey: 'SUB-1', lineNo: 1, subOrderSn: 'SUB-1', productName: '商品甲', quantity: 2 },
        { itemKey: 'SUB-2', lineNo: 2, subOrderSn: 'SUB-2', productName: '商品乙', quantity: 1 },
      ],
    )
    seed('2026111800000000101', { orderTime: '2026-11-18 11:00:00', consignee: '周八' }, [])

    const text = await collect(
      createOrdersCsvStream(
        db,
        { keyword: '202611180000000010', startDate: '2026-11-18', endDate: '2026-11-18' },
        'items',
      ),
    )
    const lines = text.split('\r\n').filter(Boolean)

    // 表头 + 1 个无商品订单行（11:00 排在前）+ 2 个商品行
    expect(lines).toHaveLength(4)
    expect(lines[1]).toContain('="2026111800000000101"')
    expect(lines[2]).toContain('商品甲')
    expect(lines[3]).toContain('商品乙')
  })

  it('无匹配数据时仍应输出 BOM 与表头', async () => {
    const text = await collect(createOrdersCsvStream(db, { keyword: '完全不存在的关键词' }, 'orders'))
    const lines = text.split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    expect(text.startsWith('\ufeff主订单号')).toBe(true)
  })
})

describe('自定义导出字段', () => {
  it('应按勾选字段输出，且列顺序遵循字段目录', async () => {
    // 传入顺序与目录相反，导出仍应按目录（主订单号在前）排列
    const text = await collect(
      createOrdersCsvStream(db, { keyword: '2026111800000000001' }, 'orders', [
        'consignee',
        'orderSn',
      ]),
    )
    const lines = text.split('\r\n').filter(Boolean)
    expect(lines[0]).toBe('\ufeff主订单号,收货人')
    expect(lines[1]).toBe('="2026111800000000001","张三, 李四"')
  })

  it('未知字段应被忽略，全部非法时回退为全部字段', async () => {
    const partial = await collect(
      createOrdersCsvStream(db, { keyword: '2026111800000000001' }, 'orders', [
        'orderSn',
        'notExist',
      ]),
    )
    expect(partial.split('\r\n')[0]).toBe('\ufeff主订单号')

    const fallback = await collect(
      createOrdersCsvStream(db, { keyword: '2026111800000000001' }, 'orders', ['notExist']),
    )
    // 回退表头应与共享字段目录完全一致（新增字段时无需改测试）
    expect(fallback.split('\r\n')[0]).toBe(
      `\ufeff${ORDER_EXPORT_FIELDS.map(field => field.title).join(',')}`,
    )
  })

  it('详情页扩展字段（地址/电话/付款等）应能导出', async () => {
    seed('2026111800000000200', {
      orderTime: '2026-11-18 12:00:00',
      address: '广东省广州市测试路 1 号',
      telephone: '020-12345678',
      payMethod: '在线支付',
      payTime: '2026-11-18 12:01:00',
      remark: '尽快发货',
    })
    const text = await collect(
      createOrdersCsvStream(db, { keyword: '2026111800000000200' }, 'orders', [
        'address',
        'telephone',
        'payMethod',
        'payTime',
        'remark',
      ]),
    )
    const lines = text.split('\r\n').filter(Boolean)
    expect(lines[0]).toBe('\ufeff支付方式,付款时间,电话号码,收货地址,订单备注')
    expect(lines[1]).toBe(
      '在线支付,2026-11-18 12:01:00,020-12345678,广东省广州市测试路 1 号,尽快发货',
    )
  })

  it('明细粒度应包含订单全部字段，且商品物流/审核与订单级字段不混淆', async () => {
    seed(
      '2026111800000000300',
      { orderTime: '2026-11-18 13:00:00', logistics: '订单物流信息' },
      [
        {
          itemKey: 'SUB-X',
          lineNo: 1,
          productName: '商品丙',
          logistics: '商品物流信息',
          reviewStatus: '商品已审核',
        },
      ],
    )
    const text = await collect(
      createOrdersCsvStream(db, { keyword: '2026111800000000300' }, 'items', [
        'logistics',
        'itemLogistics',
        'itemReviewStatus',
        'productName',
      ]),
    )
    const lines = text.split('\r\n').filter(Boolean)
    // 目录顺序：订单物流 → 商品名称 → 商品物流 → 商品审核状态
    expect(lines[0]).toBe('\ufeff物流信息,商品名称,商品物流,商品审核状态')
    expect(lines[1]).toBe('订单物流信息,商品丙,商品物流信息,商品已审核')
  })

  it('明细粒度也支持自定义字段', async () => {
    const text = await collect(
      createOrdersCsvStream(db, { keyword: '202611180000000010' }, 'items', [
        'productName',
        'orderSn',
        'subOrderSn',
      ]),
    )
    expect(text.split('\r\n')[0]).toBe('\ufeff主订单号,子订单号,商品名称')
  })
})

describe('导出文件名', () => {
  it('应包含粒度与日期范围，并使用本地时间戳', () => {
    const filename = exportFilename(
      { startDate: '2026-08-18', endDate: '2026-11-18' },
      'orders' as OrderExportScope,
      new Date(2026, 10, 18, 11, 30, 45),
    )
    expect(filename).toBe('订单列表_2026-08-18至2026-11-18_20261118-113045.csv')
  })

  it('未选日期时应标记为全部', () => {
    const filename = exportFilename({}, 'items', new Date(2026, 10, 18, 9, 5, 0))
    expect(filename).toBe('订单明细_全部_20261118-090500.csv')
  })
})
