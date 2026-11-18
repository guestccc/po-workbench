import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  DatabaseOutlined,
  PrinterOutlined,
  ReloadOutlined,
  ShoppingCartOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useNavigate } from 'react-router-dom'
import { api, errorMessage } from '@/api/client'
import type { DashboardStats, OrderRecord } from '../../../shared/types'
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatText,
  orderStatusColor,
} from '@/utils/format'

const { Title, Text } = Typography

const ORDER_COLUMNS: ColumnsType<OrderRecord> = [
  {
    title: '订单编号',
    dataIndex: 'orderSn',
    width: 160,
    render: (value: string) => <Link to={`/orders/${value}`}>{value}</Link>,
  },
  {
    title: '下单时间',
    dataIndex: 'orderTime',
    width: 160,
    render: (value: string | null) => formatText(value),
  },
  {
    title: '收货人',
    dataIndex: 'consignee',
    width: 100,
    render: (value: string | null) => formatText(value),
  },
  {
    title: '订单金额',
    dataIndex: 'orderAmount',
    width: 120,
    align: 'right',
    render: (value: number | null) => formatMoney(value),
  },
  {
    title: '订单状态',
    dataIndex: 'orderStatus',
    width: 140,
    render: (value: string | null) =>
      value ? <Tag color={orderStatusColor(value)}>{value}</Tag> : '-',
  },
  {
    title: '采购机构',
    dataIndex: 'purchaserOrg',
    ellipsis: true,
    render: (value: string | null) => formatText(value),
  },
]

/** 工作台概览：真实统计 + 最近入库订单 + 快捷入口 */
export default function DashboardPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextStats, orders] = await Promise.all([
        api.getDashboard(),
        api.listOrders({ page: 1, pageSize: 10 }),
      ])
      setStats(nextStats)
      setRecent(orders.data)
    } catch (err) {
      const text = errorMessage(err)
      setError(text)
      message.error(text)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const detailPercent =
    stats && stats.totalOrders > 0
      ? Math.round((stats.detailSynced / stats.totalOrders) * 100)
      : 0

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            工作台概览
          </Title>
          <Text type="secondary">集中查看采购订单采集进度与入库情况。</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/collection')}>
            前往订单采集
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert
          type="error"
          showIcon
          title="无法读取本地采集服务"
          description={`${error}。请确认已通过 npm run dev 启动后端。`}
          action={
            <Button size="small" onClick={() => void load()}>
              重试
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Flex align="center" justify="space-between">
              <Statistic title="订单总数" value={stats?.totalOrders ?? 0} suffix="单" />
              <StatIcon color="#2563eb" icon={<ShoppingCartOutlined />} />
            </Flex>
            <Tag style={{ marginTop: 12 }} color="blue">
              今日新增 {formatNumber(stats?.todayOrders ?? 0)} 单
            </Tag>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Flex align="center" justify="space-between">
              <Statistic title="商品明细" value={stats?.totalItems ?? 0} suffix="行" />
              <StatIcon color="#7c3aed" icon={<DatabaseOutlined />} />
            </Flex>
            <Tag style={{ marginTop: 12 }} color="purple">
              主订单 + 子订单明细
            </Tag>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Flex align="center" justify="space-between">
              <Statistic title="已补详情" value={stats?.detailSynced ?? 0} suffix="单" />
              <StatIcon color="#16a34a" icon={<CheckCircleOutlined />} />
            </Flex>
            <Progress
              percent={detailPercent}
              size="small"
              style={{ marginTop: 12 }}
              format={(value) => `${value}%`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Flex align="center" justify="space-between">
              <Statistic title="列表已同步" value={stats?.listSynced ?? 0} suffix="单" />
              <StatIcon color="#d97706" icon={<SyncOutlined />} />
            </Flex>
            <Text type="secondary" style={{ fontSize: 12 }}>
              最近同步：{formatDateTime(stats?.lastSyncAt)}
            </Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title="最近入库订单"
            extra={<Link to="/orders">查看全部</Link>}
            style={{ height: '100%' }}
          >
            <Table<OrderRecord>
              rowKey="orderSn"
              size="small"
              loading={loading}
              columns={ORDER_COLUMNS}
              dataSource={recent}
              pagination={false}
              scroll={{ x: 800 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="还没有订单数据，请先执行采集"
                  />
                ),
              }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="采集通道" style={{ height: '100%' }}>
            <Flex vertical gap={12}>
              <QuickItem
                icon={<DatabaseOutlined />}
                title="列表全量扫描"
                description="补订单备注、物流、审核状态"
                onClick={() => navigate('/collection?tab=list_backfill')}
              />
              <QuickItem
                icon={<CloudDownloadOutlined />}
                title="详情全量补全"
                description="补审核人链、操作日志等"
                onClick={() => navigate('/collection?tab=detail_backfill')}
              />
              <QuickItem
                icon={<PrinterOutlined />}
                title="打印预览补全"
                description="补完整手机号、含税价"
                onClick={() => navigate('/collection?tab=print_backfill')}
              />
              <QuickItem
                icon={<SyncOutlined />}
                title="增量更新"
                description="手动拉取最近 7 天订单"
                onClick={() => navigate('/collection?tab=incremental')}
              />
            </Flex>
          </Card>
        </Col>
      </Row>
    </Flex>
  )
}

function StatIcon({ color, icon }: { color: string; icon: ReactNode }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: `${color}14`,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
      }}
    >
      {icon}
    </div>
  )
}

function QuickItem({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <Button
      type="text"
      block
      onClick={onClick}
      style={{ height: 'auto', padding: '10px 12px', textAlign: 'left' }}
    >
      <Flex align="center" gap={12} style={{ width: '100%' }}>
        <span style={{ fontSize: 18, color: '#2563eb' }}>{icon}</span>
        <span style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {description}
          </Text>
        </span>
        <ArrowRightOutlined style={{ color: '#94a3b8' }} />
      </Flex>
    </Button>
  )
}
