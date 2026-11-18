import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import type {
  OrderItemRecord,
  OrderLogRecord,
  OrderRecord,
  OrderReviewerRecord,
  ParsedOrderBundle,
} from '../../shared/types'

const clean = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  return text || null
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function normalizeLabel(value: string | null): string {
  return (value || '').replace(/[：:\s]/g, '')
}

function splitLabelValue(text: string): { label: string; value: string | null } {
  const index = text.search(/[：:]/)
  if (index < 0) return { label: normalizeLabel(text), value: null }
  const label = normalizeLabel(text.slice(0, index))
  const value = clean(text.slice(index + 1).replace(/^[：:\s]+/, ''))
  return { label, value }
}

function inferOrderTime(orderSn: string | null, shortTime: string | null): string | null {
  if (!shortTime) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(shortTime)) return shortTime
  if (!orderSn || !/^\d{8}/.test(orderSn)) return shortTime
  const year = orderSn.slice(0, 4)
  const month = orderSn.slice(4, 6)
  const day = orderSn.slice(6, 8)
  const time = shortTime.replace(/^\d{2}-\d{2}\s+/, '')
  // 列表只精确到分钟，统一补上秒，保证与详情/导出的时间格式一致
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time
  return `${year}-${month}-${day} ${normalizedTime}`
}

function itemKeyOf(item: OrderItemRecord, index: number): string {
  return (
    clean(item.subOrderSn) ||
    clean(item.supplierOrderSn) ||
    clean(item.sku) ||
    clean(item.productName) ||
    `line-${index + 1}`
  ) as string
}

// ---------------------------------------------------------------------------
// 列表页
// ---------------------------------------------------------------------------

export interface ParsedListPage {
  orders: ParsedOrderBundle[]
  total: number | null
  pages: number | null
}

export function parseListContent(html: string): ParsedListPage {
  const $ = cheerio.load(html || '')
  const bundles: ParsedOrderBundle[] = []
  let current: ParsedOrderBundle | null = null
  let itemIndex = 0

  const bodyText = clean($('body').text()) || ''
  const totalMatch = bodyText.match(/共\s*([\d,]+)\s*条记录/)
  const pagesMatch = bodyText.match(/共\s*([\d,]+)\s*页/)

  $('tr.total, tr.first').each((_, tr) => {
    const $tr = $(tr)
    const text = clean($tr.text()) || ''

    if ($tr.hasClass('total')) {
      const checkbox = $tr.find('input[type=checkbox]').first()
      const orderSn = clean(checkbox.attr('value'))
      const orderId = clean(checkbox.attr('data-id'))
      if (!orderSn) return

      const shortTime = clean(text.match(/下单时间：：([0-9-]+\s+[0-9:]+)/)?.[1])
      const order: OrderRecord = {
        orderSn,
        orderId,
        orderTime: inferOrderTime(orderSn, shortTime),
        itemCount: toNumber(text.match(/共(\d+)件商品/)?.[1]),
        payMethod: clean(text.match(/支付方式：(.*?)(?=收货人：|$)/)?.[1]),
        consignee: clean(text.match(/收货人：(.*?)(?=电话：|$)/)?.[1]),
        phone: clean(text.match(/电话：(.*?)(?=地址：|$)/)?.[1]),
        address: clean(text.match(/地址：(.*?)(?=订单备注：|$)/)?.[1]),
        remark: clean(text.match(/订单备注：(.*?)(?=订单金额：|$)/)?.[1]),
        orderAmount: toNumber(text.match(/订单金额：([\d.,]+)元/)?.[1]),
        shippingFee: toNumber(text.match(/运费：([\d.,]+)元/)?.[1]),
      }
      current = { order, items: [], reviewers: [], logs: [] }
      bundles.push(current)
      itemIndex = 0
      return
    }

    if (!current || !$tr.hasClass('first')) return
    const cells = $tr.find('td').toArray().map(td => clean($(td).text()))
    if (cells.length < 3) return

    const productText = cells[1] || ''
    const priceText = cells[2] || ''
    const detailHref =
      $tr.find('a[href*="order_id="]').first().attr('href') ||
      $tr.find('input[data-id]').first().attr('data-id') ||
      null
    if (detailHref && !current.order.orderId) {
      const match = detailHref.match(/order_id=(\d+)/)
      if (match) current.order.orderId = match[1]
    }

    const discountPrice = toNumber(priceText.match(/折扣价：\s*¥?\s*([\d.,]+)/)?.[1])
    const mallPrice = toNumber(priceText.match(/商城价：\s*¥?\s*([\d.,]+)/)?.[1])
    const item: OrderItemRecord = {
      itemKey: '',
      lineNo: itemIndex + 1,
      subOrderSn: cells[8] || null,
      supplierOrderSn: cells[7] || null,
      productName: productText || null,
      supplierName: cells[4] || null,
      orgName: cells[5] || null,
      account: cells[6] || null,
      quantity: toNumber(cells[3]),
      discountPrice,
      mallPrice,
      status: cells[9] || null,
      logistics: cells[10] || null,
      reviewStatus: cells[11] || null,
    }
    item.itemKey = itemKeyOf(item, itemIndex)
    current.items.push(item)
    itemIndex++

    if (!current.order.reviewStatus && item.reviewStatus) {
      current.order.reviewStatus = item.reviewStatus
    }
    if (!current.order.logistics && item.logistics) {
      current.order.logistics = item.logistics
    }
    if (!current.order.purchaserOrg && item.orgName) {
      current.order.purchaserOrg = item.orgName
    }
  })

  return {
    orders: bundles,
    total: totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : null,
    pages: pagesMatch ? Number(pagesMatch[1].replace(/,/g, '')) : null,
  }
}

// ---------------------------------------------------------------------------
// 打印预览页（order.php?act=operate + printing=打印订单）
// ---------------------------------------------------------------------------

export interface ParsedPrintContent {
  orders: ParsedOrderBundle[]
  /** 返回的打印分块数量；每个子订单一块 */
  blockCount: number
}

/**
 * 解析批量打印预览返回的 HTML 片段。
 * 每个子订单是一个 div#printall 块，字段通过 p.p-float 的「标签：值」提取；
 * 同一主订单的多个子订单块会合并成一个 bundle。
 */
/**
 * 把打印预览按「订单信息」标题切分为独立的订单块。
 * 每个块是 h3 及其后续兄弟节点；同名 h3 出现即开始新块。
 */
function printOrderBlocks($: cheerio.CheerioAPI): Element[][] {
  const blocks: Element[][] = []
  $('div#printall').each((_, container) => {
    let current: Element[] | null = null
    for (const node of $(container).children().toArray()) {
      const element = $(node)
      if (element.is('h3') && (clean(element.text()) || '').includes('订单信息')) {
        current = [node]
        blocks.push(current)
        continue
      }
      if (current) current.push(node)
    }
  })
  return blocks
}

export function parsePrintContent(html: string): ParsedPrintContent {
  const $ = cheerio.load(html || '')
  // 目标系统把整批订单放在同一个 div#printall 里，每个订单以 <h3>订单信息</h3>
  // 开头，后面跟着若干 <div> 字段、商品 <table> 与 <div>合计</div>，订单之间没有外层容器。
  // 因此按 h3 标题切分订单块；页尾的「订单支付金额」h3 不是订单块，会被自然排除。
  const blocks = printOrderBlocks($)
  const bundles = new Map<string, ParsedOrderBundle>()
  let fallbackLine = 0

  for (const block of blocks) {
    const root = $(block)
    const fields = new Map<string, string | null>()
    root.find('p.p-float').each((_, element) => {
      const { label, value } = splitLabelValue(clean($(element).text()) || '')
      if (label) fields.set(label, value)
    })

    const subOrderSn = fields.get('订单编号') || null
    // 未拆分子订单时「父订单编号」为空，此时订单编号就是主订单编号
    const orderSn = fields.get('父订单编号') || subOrderSn
    if (!orderSn) continue

    let bundle = bundles.get(orderSn)
    if (!bundle) {
      bundle = { order: { orderSn }, items: [], reviewers: [], logs: [] }
      bundles.set(orderSn, bundle)
    }
    const order = bundle.order

    const statusText = fields.get('订单状态') || ''
    const statusTokens = statusText
      .split(/[,，]/)
      .map(token => token.trim())
      .filter(Boolean)
    const reviewTokens = statusTokens.filter(token => token.includes('审核'))
    const orderTokens = statusTokens.filter(token => !token.includes('审核'))

    // 同一主订单的多个子订单块字段一致，取第一个非空值即可
    order.orderTime = order.orderTime ?? fields.get('下单时间') ?? null
    order.orderStatus = order.orderStatus ?? (orderTokens.join(',') || null)
    order.reviewStatus = order.reviewStatus ?? (reviewTokens.join(',') || null)
    order.consignee = order.consignee ?? fields.get('收货人') ?? null
    order.mobile = order.mobile ?? fields.get('收货人手机') ?? null
    order.address = order.address ?? fields.get('收货地址') ?? null
    order.buyerAccount = order.buyerAccount ?? fields.get('下单账号') ?? null
    order.buyerName = order.buyerName ?? fields.get('下单人姓名') ?? null
    order.buyerContact = order.buyerContact ?? fields.get('联系方式') ?? null
    order.purchaserOrg = order.purchaserOrg ?? fields.get('机构名称') ?? null

    root.find('table tr').each((_, tr) => {
      const cells = $(tr).find('td').toArray().map(td => clean($(td).text()))
      // 打印表格固定 6 列：序号 / 商品编号 / 商品名称 / 商品单价 / 数量 / 小计
      if (cells.length < 6) return
      // 真实响应的表头行也在 tbody 内，必须跳过，否则会被当成一条空商品
      if (normalizeLabel(cells[0]) === '序号' || normalizeLabel(cells[1]) === '商品编号') return
      const item: OrderItemRecord = {
        itemKey: '',
        lineNo: toNumber(cells[0]),
        subOrderSn,
        supplierOrderSn: fields.get('供应商单号') ?? null,
        sku: cells[1] || null,
        productName: cells[2] || null,
        supplierName: fields.get('供应商名称') ?? null,
        orgName: fields.get('机构名称') ?? null,
        account: fields.get('下单账号') ?? null,
        // 打印页单价与小计均为含税价，可与历史导出字段合并
        taxInclusivePrice: toNumber(cells[3]),
        quantity: toNumber(cells[4]),
        taxInclusiveAmount: toNumber(cells[5]),
      }
      item.itemKey = clean(item.sku) || clean(item.productName) || `line-${++fallbackLine}`
      bundle!.items.push(item)
    })
  }

  return { orders: [...bundles.values()], blockCount: blocks.length }
}

// ---------------------------------------------------------------------------
// 详情页
// ---------------------------------------------------------------------------

interface DetailSection {
  title: string
  nodes: cheerio.Cheerio<Element>[]
}

function detailSections($: cheerio.CheerioAPI): DetailSection[] {
  const result: DetailSection[] = []
  $('.detail-tit').each((_, titleEl) => {
    const title = normalizeLabel(clean($(titleEl).text()))
    const nodes: cheerio.Cheerio<Element>[] = []
    let node = $(titleEl).next()
    while (node.length && !node.hasClass('detail-tit')) {
      nodes.push(node)
      node = node.next()
    }
    result.push({ title, nodes })
  })
  return result
}

function infoPairs($: cheerio.CheerioAPI, node: cheerio.Cheerio<Element>) {
  const pairs: Array<{ label: string; value: string | null }> = []
  node.find('li').each((_, li) => {
    const text = clean($(li).text())
    if (!text) return
    pairs.push(splitLabelValue(text))
  })
  return pairs
}

function pairsToMap(pairs: Array<{ label: string; value: string | null }>) {
  const map = new Map<string, string | null>()
  for (const pair of pairs) if (!map.has(pair.label)) map.set(pair.label, pair.value)
  return map
}

function parseProductDetail(text: string): { productName: string | null; brand: string | null; sku: string | null } {
  const brandMatch = text.match(/\[([^\]]+)\]/)
  const skuMatch = text.match(/货号[：:]\s*([A-Za-z0-9_-]+)/)
  let productName = text
  if (brandMatch) productName = productName.replace(brandMatch[0], ' ')
  if (skuMatch) productName = productName.replace(skuMatch[0], ' ')
  return {
    productName: clean(productName),
    brand: clean(brandMatch?.[1]),
    sku: clean(skuMatch?.[1]),
  }
}

export function parseDetailPage(html: string, fallbackOrderId?: string | null): ParsedOrderBundle {
  const $ = cheerio.load(html || '')
  const sections = detailSections($)
  const order: OrderRecord = {
    orderSn: '',
    orderId: fallbackOrderId ? String(fallbackOrderId) : null,
  }
  const items: OrderItemRecord[] = []
  const reviewers: OrderReviewerRecord[] = []
  const logs: OrderLogRecord[] = []

  const section = (name: string) => sections.find(s => s.title === name)

  const basic = section('基本信息')
  if (basic) {
    const pairs = basic.nodes.flatMap(node => infoPairs($, node))
    const map = pairsToMap(pairs)
    order.orderSn = map.get('订单号') || ''
    order.buyer = map.get('购货人') ?? null
    order.payMethod = map.get('支付方式') ?? null
    order.orderTime = map.get('下单时间') ?? null
    order.shippingTime = map.get('发货时间') ?? null
    order.orderStatus = map.get('订单状态') ?? null
    order.shippingMethod = map.get('配送方式') ?? null
    order.payTime = map.get('付款时间') ?? null
    order.reviewTime = map.get('审核时间') ?? null
    order.shippingSn = map.get('发货单号') ?? null
    order.category = map.get('分类') ?? null
    order.purpose = map.get('用途') ?? null
    const categorySelect = basic.nodes.find(node => node.find('select.professional').length > 0)
    if (categorySelect) {
      const selected = categorySelect.find('select.professional option:selected').first().text()
      if (clean(selected)) order.category = clean(selected)
    }
    const purposeSelect = basic.nodes.find(node => node.find('select.usefor').length > 0)
    if (purposeSelect) {
      const selected = purposeSelect.find('select.usefor option:selected').first().text()
      if (clean(selected) && clean(selected) !== '暂无可选项') order.purpose = clean(selected)
    }
  }

  const consignee = section('收货人信息')
  if (consignee) {
    const map = pairsToMap(consignee.nodes.flatMap(node => infoPairs($, node)))
    order.consignee = map.get('收货人') ?? null
    order.mobile = map.get('手机号码') ?? null
    order.deliveryTime = map.get('送货时间') ?? null
    order.address = map.get('收货地址') ?? null
    order.email = map.get('电子邮件') ?? null
    order.telephone = map.get('电话号码') ?? null
    order.zipcode = map.get('邮政编码') ?? null
    order.unitName = map.get('单名名称') ?? map.get('单位名称') ?? null
  }

  const reviewerSection = section('审核人信息')
  if (reviewerSection) {
    let seq = 0
    for (const node of reviewerSection.nodes) {
      if (!node.find('li').length) continue
      const map = pairsToMap(infoPairs($, node))
      seq++
      reviewers.push({
        seq,
        reviewer: map.get('审核人') ?? null,
        orgName: map.get('所属机构') ?? null,
        orgCode: map.get('机构编码') ?? null,
        contact: map.get('联系人') ?? null,
        mobile: map.get('手机号码') ?? null,
      })
    }
  }

  // 目标页面可能把 table 直接挂在小节下，也可能再包一层 div，两种结构都要兼容
  const findWithin = (
    nodes: cheerio.Cheerio<Element>[],
    predicate: (node: cheerio.Cheerio<Element>) => boolean,
    selector: string,
  ) =>
    nodes
      .map(node => (predicate(node) ? node : node.find(selector).first()))
      .find(node => node.length > 0)

  const productSection = section('商品信息')
  if (productSection) {
    const table = findWithin(productSection.nodes, node => node.is('table'), 'table')
    if (table) {
      table.find('tbody tr').each((index, tr) => {
        const cells = $(tr).find('td').toArray().map(td => clean($(td).text()))
        if (cells.length < 4) return
        const parsed = parseProductDetail(cells[0] || '')
        const item: OrderItemRecord = {
          itemKey: '',
          lineNo: index + 1,
          productName: parsed.productName,
          brand: parsed.brand,
          sku: parsed.sku,
          supplierName: cells[1] || null,
          discountPrice: toNumber(cells[2]),
          quantity: toNumber(cells[3]),
        }
        item.itemKey = itemKeyOf(item, index)
        items.push(item)
      })
      const totalNode = findWithin(productSection.nodes, node => node.hasClass('total'), '.total')
      if (totalNode) {
        const text = clean(totalNode.text()) || ''
        order.detailTotal = toNumber(text.match(/合计[：:]\s*¥?\s*([\d.,]+)/)?.[1])
        order.shippingFee = toNumber(text.match(/运费[：:]\s*([\d.,]+)/)?.[1])
      }
    }
  }

  const logSection = section('操作信息')
  if (logSection) {
    const table = findWithin(logSection.nodes, node => node.is('table'), 'table')
    if (table) {
      const headers = table
        .find('thead th')
        .toArray()
        .map(th => normalizeLabel(clean($(th).text())))
      table.find('tbody tr').each((index, tr) => {
        const cells = $(tr).find('td').toArray().map(td => clean($(td).text()))
        if (!cells.length) return
        const record: Record<string, string | null> = {}
        headers.forEach((header, i) => {
          record[header] = cells[i] ?? null
        })
        logs.push({
          seq: index + 1,
          operator: record['操作者'] ?? null,
          operatedAt: record['操作时间'] ?? null,
          orderStatus: record['订单状态'] ?? null,
          payStatus: record['付款状态'] ?? null,
          shippingStatus: record['发货状态'] ?? null,
          reviewStatus: record['审核状态'] ?? null,
          note: record['备注'] ?? null,
        })
      })
    }
  }

  if (!order.orderSn) {
    const pageText = clean($('body').text()) || ''
    const match = pageText.match(/订单号[：:]\s*([0-9]+)/)
    if (match) order.orderSn = match[1]
  }

  order.itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0) || null
  order.orderAmount = order.detailTotal ?? null

  return { order, items, reviewers, logs }
}
