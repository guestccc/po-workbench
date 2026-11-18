import { describe, expect, it } from 'vitest'
import { parseDetailPage, parseListContent, parsePrintContent } from '../dspt/parse'

// 以下夹具均为手工构造的匿名数据，不包含任何真实订单或个人信息

const LIST_HTML = `
<div>共 25 条记录，共 3 页</div>
<table>
  <tbody>
    <tr class="total">
      <td><input type="checkbox" value="2026111800001" data-id="1001"></td>
      <td colspan="11">
        下单时间：：11-18 10:05
        共2件商品
        支付方式：在线支付
        收货人：张三
        电话：13800000001
        地址：测试省测试市测试路 1 号
        订单备注：请勿拆箱
        订单金额：100.50元
        运费：6.00元
      </td>
    </tr>
    <tr class="first">
      <td>1</td>
      <td>测试商品甲</td>
      <td>折扣价：¥10.00 商城价：¥12.00</td>
      <td>2</td>
      <td>测试供应商</td>
      <td>测试机构</td>
      <td>test_account</td>
      <td>SUP-001</td>
      <td>SUB-001</td>
      <td>已发货</td>
      <td>物流配送</td>
      <td>已审核</td>
      <td><a href="order.php?act=info&order_id=1001">详情</a></td>
    </tr>
    <tr class="first">
      <td>2</td>
      <td>测试商品乙</td>
      <td>折扣价：¥20.00 商城价：¥22.00</td>
      <td>1</td>
      <td>测试供应商</td>
      <td>测试机构</td>
      <td>test_account</td>
      <td>SUP-002</td>
      <td>SUB-002</td>
      <td>待发货</td>
      <td>物流配送</td>
      <td>未审核</td>
      <td></td>
    </tr>
  </tbody>
</table>
`

const DETAIL_HTML = `
<div class="detail-tit">基本信息</div>
<div>
  <ul class="info-con">
    <li>订单号：2026111800001</li>
    <li>购货人：测试采购员</li>
    <li>支付方式：在线支付</li>
    <li>下单时间：2026-11-18 10:05:00</li>
    <li>发货时间：待发货</li>
    <li>订单状态：已确认,待发货</li>
    <li>配送方式：物流配送</li>
    <li>付款时间：2026-11-18 10:06:00</li>
    <li>审核时间：2026-11-18 10:07:00</li>
    <li>发货单号：SN-001</li>
    <li>分类：代理金融</li>
    <li>用途：办公用品</li>
  </ul>
  <select class="professional"><option>其他</option><option selected>代理金融</option></select>
  <select class="usefor"><option selected>办公用品</option></select>
</div>
<div class="detail-tit">收货人信息</div>
<div>
  <ul class="info-con">
    <li>收货人：张三</li>
    <li>手机号码：138****0001</li>
    <li>送货时间：工作日</li>
    <li>收货地址：测试省测试市测试路 1 号</li>
    <li>电子邮件：test@example.com</li>
    <li>电话号码：010-00000000</li>
    <li>邮政编码：100000</li>
    <li>单位名称：测试单位</li>
  </ul>
</div>
<div class="detail-tit">审核人信息</div>
<div>
  <ul class="info-con">
    <li>审核人：审核员甲（已审核）</li>
    <li>所属机构：测试机构</li>
    <li>机构编码：51136161</li>
    <li>联系人：李四</li>
    <li>手机号码：139****0002</li>
  </ul>
</div>
<div>
  <ul class="info-con">
    <li>审核人：审核员乙（待审核）</li>
    <li>所属机构：测试机构</li>
    <li>机构编码：51136161</li>
    <li>联系人：王五</li>
    <li>手机号码：137****0003</li>
  </ul>
</div>
<div class="detail-tit">商品信息</div>
<div>
  <table>
    <tbody>
      <tr>
        <td>测试商品甲 [测试品牌] 货号：SKU-001</td>
        <td>测试供应商</td>
        <td>10.00</td>
        <td>2</td>
      </tr>
      <tr>
        <td>测试商品乙 [测试品牌] 货号：SKU-002</td>
        <td>测试供应商</td>
        <td>20.00</td>
        <td>1</td>
      </tr>
    </tbody>
  </table>
  <div class="total">合计：40.00 运费：0.00</div>
</div>
<div class="detail-tit">操作信息</div>
<div>
  <table>
    <thead>
      <tr>
        <th>操作者</th><th>操作时间</th><th>订单状态</th><th>付款状态</th>
        <th>发货状态</th><th>审核状态</th><th>备注</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>系统</td><td>2026-11-18 10:05:00</td><td>已确认</td><td>已付款</td><td>未发货</td><td>待审核</td><td>创建订单</td></tr>
    </tbody>
  </table>
</div>
`

const PRINT_HTML = `
<div id="printall">
  <h3>订单信息</h3>
  <div>
    <p class="p-float">订单编号：2026111800001</p>
    <p class="p-float">父订单编号：2026111800000</p>
    <p class="p-float">供应商单号：SUP-P-001</p>
  </div>
  <div>
    <p class="p-float">下单账号：test_account</p>
    <p class="p-float">下单人姓名：测试采购员</p>
    <p class="p-float">联系方式：13800000001</p>
  </div>
  <div>
    <p class="p-float">机构名称：测试机构</p>
    <p class="p-float">供应商名称：测试供应商</p>
    <p class="p-float">订单审核人账号：reviewer_account</p>
  </div>
  <div>
    <p class="p-float">下单时间：2026-11-18 10:05:00</p>
    <p class="p-float">订单状态：已确认,审核通过,已完成</p>
    <p class="p-float">收货人：张三</p>
  </div>
  <div>
    <p class="p-float">收货人手机：13800000001</p>
    <p class="p-float">收货地址：测试省测试市测试路 1 号</p>
  </div>
  <table>
    <tbody>
      <tr><td>序号</td><td>商品编号</td><td>商品名称</td><td>商品单价</td><td>数量</td><td>小计</td></tr>
      <tr><td>1</td><td>SKU-001</td><td>测试商品甲</td><td>21.60</td><td>1</td><td>21.60</td></tr>
      <tr><td>2</td><td>SKU-002</td><td>测试商品乙</td><td>2.88</td><td>2</td><td>5.76</td></tr>
    </tbody>
  </table>
  <h3>订单信息</h3>
  <div>
    <p class="p-float">订单编号：2026111800002</p>
    <p class="p-float">父订单编号：2026111800000</p>
    <p class="p-float">供应商单号：SUP-P-002</p>
  </div>
  <div>
    <p class="p-float">下单账号：test_account</p>
    <p class="p-float">下单人姓名：测试采购员</p>
    <p class="p-float">联系方式：13800000001</p>
  </div>
  <div>
    <p class="p-float">机构名称：测试机构</p>
    <p class="p-float">供应商名称：测试供应商</p>
  </div>
  <div>
    <p class="p-float">下单时间：2026-11-18 10:05:00</p>
    <p class="p-float">订单状态：已确认,审核通过,已完成</p>
    <p class="p-float">收货人：张三</p>
  </div>
  <div>
    <p class="p-float">收货人手机：13800000001</p>
    <p class="p-float">收货地址：测试省测试市测试路 1 号</p>
  </div>
  <table>
    <tbody>
      <tr><td>序号</td><td>商品编号</td><td>商品名称</td><td>商品单价</td><td>数量</td><td>小计</td></tr>
      <tr><td>1</td><td>SKU-003</td><td>测试商品丙</td><td>48.72</td><td>1</td><td>48.72</td></tr>
    </tbody>
  </table>
  <h3>订单支付金额：￥76.08元</h3>
</div>
`

describe('打印预览解析', () => {
  it('应按父订单合并子订单块，并解析完整联系方式、含税价与审核状态', () => {
    const result = parsePrintContent(PRINT_HTML)
    expect(result.blockCount).toBe(2)
    expect(result.orders).toHaveLength(1)

    const bundle = result.orders[0]
    expect(bundle.order).toMatchObject({
      orderSn: '2026111800000',
      buyerAccount: 'test_account',
      buyerName: '测试采购员',
      buyerContact: '13800000001',
      consignee: '张三',
      mobile: '13800000001',
      address: '测试省测试市测试路 1 号',
      purchaserOrg: '测试机构',
      orderStatus: '已确认,已完成',
      reviewStatus: '审核通过',
    })

    expect(bundle.items).toHaveLength(3)
    expect(bundle.items[0]).toMatchObject({
      subOrderSn: '2026111800001',
      supplierOrderSn: 'SUP-P-001',
      sku: 'SKU-001',
      productName: '测试商品甲',
      quantity: 1,
      taxInclusivePrice: 21.6,
      taxInclusiveAmount: 21.6,
    })
    expect(bundle.items[2]).toMatchObject({
      subOrderSn: '2026111800002',
      supplierOrderSn: 'SUP-P-002',
      sku: 'SKU-003',
    })
  })

  it('空内容应返回空结果', () => {
    expect(parsePrintContent('')).toEqual({ orders: [], blockCount: 0 })
  })
})

describe('列表页解析', () => {
  it('应解析分页、订单、商品行与列表独有字段', () => {
    const result = parseListContent(LIST_HTML)
    expect(result.total).toBe(25)
    expect(result.pages).toBe(3)
    expect(result.orders).toHaveLength(1)

    const bundle = result.orders[0]
    expect(bundle.order.orderSn).toBe('2026111800001')
    expect(bundle.order.orderId).toBe('1001')
    expect(bundle.order.orderTime).toBe('2026-11-18 10:05:00')
    expect(bundle.order.itemCount).toBe(2)
    expect(bundle.order.payMethod).toBe('在线支付')
    expect(bundle.order.consignee).toBe('张三')
    expect(bundle.order.remark).toBe('请勿拆箱')
    expect(bundle.order.orderAmount).toBe(100.5)
    expect(bundle.order.shippingFee).toBe(6)
    expect(bundle.order.reviewStatus).toBe('已审核')
    expect(bundle.order.logistics).toBe('物流配送')
    expect(bundle.order.purchaserOrg).toBe('测试机构')

    expect(bundle.items).toHaveLength(2)
    expect(bundle.items[0]).toMatchObject({
      itemKey: 'SUB-001',
      subOrderSn: 'SUB-001',
      supplierOrderSn: 'SUP-001',
      quantity: 2,
      discountPrice: 10,
      mallPrice: 12,
      status: '已发货',
    })
    expect(bundle.items[1].itemKey).toBe('SUB-002')
  })

  it('空内容应返回空结果而不是抛错', () => {
    expect(parseListContent('')).toEqual({ orders: [], total: null, pages: null })
  })
})

describe('详情页解析', () => {
  it('应解析基本信息、收货信息、审核链、商品与操作日志', () => {
    const bundle = parseDetailPage(DETAIL_HTML, '1001')
    expect(bundle.order).toMatchObject({
      orderSn: '2026111800001',
      orderId: '1001',
      buyer: '测试采购员',
      category: '代理金融',
      purpose: '办公用品',
      shippingSn: 'SN-001',
      mobile: '138****0001',
      email: 'test@example.com',
      unitName: '测试单位',
      detailTotal: 40,
      shippingFee: 0,
      orderAmount: 40,
      itemCount: 3,
    })

    expect(bundle.items).toHaveLength(2)
    expect(bundle.items[0]).toMatchObject({
      productName: '测试商品甲',
      brand: '测试品牌',
      sku: 'SKU-001',
      supplierName: '测试供应商',
      discountPrice: 10,
      quantity: 2,
    })

    expect(bundle.reviewers).toHaveLength(2)
    expect(bundle.reviewers[0]).toMatchObject({
      reviewer: '审核员甲（已审核）',
      orgName: '测试机构',
      orgCode: '51136161',
      contact: '李四',
      mobile: '139****0002',
    })

    expect(bundle.logs).toHaveLength(1)
    expect(bundle.logs[0]).toMatchObject({
      operator: '系统',
      orderStatus: '已确认',
      payStatus: '已付款',
      reviewStatus: '待审核',
      note: '创建订单',
    })
  })

  it('空内容应返回空订单骨架', () => {
    const bundle = parseDetailPage('', '999')
    expect(bundle.order.orderSn).toBe('')
    expect(bundle.order.orderId).toBe('999')
    expect(bundle.items).toEqual([])
    expect(bundle.reviewers).toEqual([])
    expect(bundle.logs).toEqual([])
  })
})
