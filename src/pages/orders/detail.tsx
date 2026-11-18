import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Result,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { DescriptionsProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, errorMessage } from '@/api/client'
import type {
  OrderDetailResponse,
  OrderItemRecord,
  OrderLogRecord,
  OrderRecord,
  OrderReviewerRecord,
} from '../../../shared/types'
import {
  formatMoney,
  formatNumber,
  formatText,
  orderStatusColor,
  reviewStatusColor,
} from '@/utils/format'

const { Title, Text } = Typography

/** 单值字段配置：订单级字段非常多，用表驱动避免大段重复 JSX */
const ORDER_FIELDS: Array<[keyof OrderRecord, string]> = [
  ['orderSn', '主订单编号'],
  ['orderId', '内部订单 ID'],
  ['orderTime', '下单时间'],
  ['orderStatus', '订单状态'],
  ['reviewStatus', '审核状态'],
  ['payMethod', '支付方式'],
  ['payTime', '付款时间'],
  ['reviewTime', '审核时间'],
  ['buyer', '购货人'],
  ['buyerAccount', '下单人账号'],
  ['buyerName', '下单人姓名'],
  ['buyerContact', '下单人联系方式'],
  ['purchaserOrg', '采购机构'],
  ['upperOrg', '上级单位'],
  ['category', '订单类别'],
  ['purpose', '用途分类'],
  ['orderAmount', '订单金额'],
  ['detailTotal', '详情合计'],
  ['shippingFee', '运费'],
  ['itemCount', '商品件数'],
  ['reconciliationStatus', '对帐状态'],
  ['invoiceStatus', '开票状态'],
  ['receiptStatus', '收款状态'],
  ['eaString', 'EA 串'],
  ['shippingMethod', '配送方式'],
  ['shippingTime', '发货时间'],
  ['shippingSn', '发货单号'],
  ['logistics', '物流信息'],
  ['deliveryTime', '送货时间'],
  ['remark', '订单备注'],
  ['consignee', '收货人'],
  ['mobile', '手机号码'],
  ['phone', '电话'],
  ['telephone', '电话号码'],
  ['email', '电子邮件'],
  ['zipcode', '邮政编码'],
  ['unitName', '单位名称'],
  ['address', '收货地址'],
]

function renderValue(key: keyof OrderRecord, value: OrderRecord[keyof OrderRecord]) {
  if (key === 'orderAmount' || key === 'detailTotal' || key === 'shippingFee') {
    return formatMoney(typeof value === 'number' ? value : null)
  }
  if (key === 'itemCount') {
    return formatNumber(typeof value === 'number' ? value : null)
  }
  const text =
    typeof value === 'string' || typeof value === 'number' ? String(value) : null
  // 状态类字段用彩色 Tag，异常态一眼可见
  if (key === 'orderStatus' && text) {
    return <Tag color={orderStatusColor(text)}>{text}</Tag>
  }
  if (key === 'reviewStatus' && text) {
    return <Tag color={reviewStatusColor(text)}>{text}</Tag>
  }
  return formatText(text)
}

function itemColumns(): ColumnsType<OrderItemRecord> {
  return [
    { title: '#', dataIndex: 'lineNo', width: 50 },
    { title: '商品名称', dataIndex: 'productName', width: 220, ellipsis: true, render: (v: string | null) => formatText(v) },
    { title: '品牌', dataIndex: 'brand', width: 100, render: (v: string | null) => formatText(v) },
    { title: '货号', dataIndex: 'sku', width: 150, render: (v: string | null) => formatText(v) },
    { title: '子订单号', dataIndex: 'subOrderSn', width: 170, render: (v: string | null) => formatText(v) },
    { title: '供应商订单号', dataIndex: 'supplierOrderSn', width: 170, render: (v: string | null) => formatText(v) },
    { title: '商品分类', dataIndex: 'productCategory', width: 120, render: (v: string | null) => formatText(v) },
    { title: '供应商', dataIndex: 'supplierName', width: 160, ellipsis: true, render: (v: string | null) => formatText(v) },
    { title: '机构', dataIndex: 'orgName', width: 160, ellipsis: true, render: (v: string | null) => formatText(v) },
    { title: '数量', dataIndex: 'quantity', width: 80, align: 'right', render: (v: number | null) => formatNumber(v) },
    { title: '折扣价', dataIndex: 'discountPrice', width: 100, align: 'right', render: (v: number | null) => formatMoney(v) },
    { title: '商城价', dataIndex: 'mallPrice', width: 100, align: 'right', render: (v: number | null) => formatMoney(v) },
    { title: '不含税单价', dataIndex: 'taxExclusivePrice', width: 110, align: 'right', render: (v: number | null) => formatMoney(v) },
    { title: '不含税金额', dataIndex: 'taxExclusiveAmount', width: 110, align: 'right', render: (v: number | null) => formatMoney(v) },
    { title: '税率', dataIndex: 'taxRate', width: 80, render: (v: string | null) => formatText(v) },
    { title: '税额', dataIndex: 'taxAmount', width: 100, align: 'right', render: (v: number | null) => formatMoney(v) },
    { title: '含税单价', dataIndex: 'taxInclusivePrice', width: 110, align: 'right', render: (v: number | null) => formatMoney(v) },
    { title: '含税金额', dataIndex: 'taxInclusiveAmount', width: 110, align: 'right', render: (v: number | null) => formatMoney(v) },
    { title: '状态', dataIndex: 'status', width: 130, render: (v: string | null) => (v ? <Tag color={orderStatusColor(v)}>{v}</Tag> : '-') },
    { title: '物流', dataIndex: 'logistics', width: 140, render: (v: string | null) => formatText(v) },
    { title: '审核状态', dataIndex: 'reviewStatus', width: 110, render: (v: string | null) => formatText(v) },
  ]
}

const REVIEWER_COLUMNS: ColumnsType<OrderReviewerRecord> = [
  { title: '顺序', dataIndex: 'seq', width: 70 },
  { title: '审核人', dataIndex: 'reviewer', width: 180, render: (v: string | null) => formatText(v) },
  { title: '所属机构', dataIndex: 'orgName', render: (v: string | null) => formatText(v) },
  { title: '机构编码', dataIndex: 'orgCode', width: 130, render: (v: string | null) => formatText(v) },
  { title: '联系人', dataIndex: 'contact', width: 120, render: (v: string | null) => formatText(v) },
  { title: '手机号码', dataIndex: 'mobile', width: 140, render: (v: string | null) => formatText(v) },
]

const LOG_COLUMNS: ColumnsType<OrderLogRecord> = [
  { title: '顺序', dataIndex: 'seq', width: 70 },
  { title: '操作者', dataIndex: 'operator', width: 140, render: (v: string | null) => formatText(v) },
  { title: '操作时间', dataIndex: 'operatedAt', width: 170, render: (v: string | null) => formatText(v) },
  { title: '订单状态', dataIndex: 'orderStatus', width: 140, render: (v: string | null) => formatText(v) },
  { title: '付款状态', dataIndex: 'payStatus', width: 120, render: (v: string | null) => formatText(v) },
  { title: '发货状态', dataIndex: 'shippingStatus', width: 120, render: (v: string | null) => formatText(v) },
  { title: '审核状态', dataIndex: 'reviewStatus', width: 120, render: (v: string | null) => formatText(v) },
  { title: '备注', dataIndex: 'note', render: (v: string | null) => formatText(v) },
]

/** 订单详情：展示列表与详情两个通道合并后的全部结构化字段与明细 */
export default function OrderDetailPage() {
  const { key = '' } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<OrderDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      setData(await api.getOrder(key))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [key])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: 320 }}>
        <Spin size="large" />
      </Flex>
    )
  }

  if (notFound) {
    return (
      <Result
        status="404"
        title="订单不存在"
        subTitle="该订单尚未采集入库，或订单号不正确。"
        extra={
          <Space>
            <Button onClick={() => navigate('/orders')}>返回订单库</Button>
            <Button type="primary" onClick={() => void load()}>
              重试
            </Button>
          </Space>
        }
      />
    )
  }

  if (error || !data) {
    return (
      <Alert
        type="error"
        showIcon
        title="加载订单失败"
        description={error ?? '未知错误'}
        action={
          <Button size="small" onClick={() => void load()}>
            重试
          </Button>
        }
      />
    )
  }

  const { order, items, reviewers, logs } = data
  const descriptionItems: DescriptionsProps['items'] = ORDER_FIELDS.map(([field, label]) => ({
    key: field,
    label,
    children: renderValue(field, order[field]),
  }))

  const extraKeys = order.extra ? Object.keys(order.extra) : []
  const extraItems: DescriptionsProps['items'] = extraKeys.map((extraKey) => ({
    key: extraKey,
    label: extraKey,
    children: formatText(
      typeof order.extra?.[extraKey] === 'string'
        ? (order.extra[extraKey] as string)
        : JSON.stringify(order.extra?.[extraKey]),
    ),
  }))

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Space align="center">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            返回
          </Button>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              订单 {order.orderSn}
            </Title>
            <Text type="secondary">
              采集自列表与详情两个通道的字段合集，未做脱敏。
            </Text>
          </div>
        </Space>
        <Space>
          <Link to="/orders">订单库</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
        </Space>
      </Flex>

      {!order.orderId && (
        <Alert
          type="info"
          showIcon
          title="该订单还没有详情数据"
          description="订单号来自列表扫描。执行“详情全量补全”后可看到购货人、付款/审核时间、审核人链与操作日志。"
        />
      )}

      <Card title="订单基本信息">
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2, xl: 3 }}
          items={descriptionItems}
        />
      </Card>

      <Card
        title={`商品明细（${items.length} 行）`}
        extra={<Text type="secondary">空值表示该通道未提供该字段</Text>}
      >
        <Table<OrderItemRecord>
          rowKey="itemKey"
          size="small"
          columns={itemColumns()}
          dataSource={items}
          pagination={false}
          scroll={{ x: 2400 }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无商品明细" />,
          }}
        />
      </Card>

      <Card title={`审核人信息（${reviewers.length} 人）`}>
        <Table<OrderReviewerRecord>
          rowKey={(row) => `${row.seq}`}
          size="small"
          columns={REVIEWER_COLUMNS}
          dataSource={reviewers}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无审核人数据（需采集详情页）"
              />
            ),
          }}
        />
      </Card>

      <Card title={`操作日志（${logs.length} 条）`}>
        <Table<OrderLogRecord>
          rowKey={(row) => `${row.seq}`}
          size="small"
          columns={LOG_COLUMNS}
          dataSource={logs}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无操作日志（需采集详情页）"
              />
            ),
          }}
        />
      </Card>

      {extraItems.length > 0 && (
        <Card title="附加结构化字段">
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={extraItems} />
        </Card>
      )}
    </Flex>
  )
}
