import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Card, Col, Empty, Flex, Row, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'

const { Title, Text } = Typography

/** 统计卡片配置：当前为占位数据，采集功能接入后替换为真实指标 */
const STAT_CARDS = [
  { key: 'today', title: '今日采集订单', value: 0, suffix: '单', icon: <SyncOutlined />, color: '#2563eb' },
  { key: 'pending', title: '待审核订单', value: 0, suffix: '单', icon: <ClockCircleOutlined />, color: '#d97706' },
  { key: 'finished', title: '已入库订单', value: 0, suffix: '单', icon: <CheckCircleOutlined />, color: '#16a34a' },
  { key: 'error', title: '异常订单', value: 0, suffix: '单', icon: <WarningOutlined />, color: '#dc2626' },
]

interface OrderRow {
  id: string
  supplier: string
  amount: number
  status: string
  createdAt: string
}

/** 最近订单表格列定义（暂无数据，采集功能接入后填充真实数据） */
const ORDER_COLUMNS: ColumnsType<OrderRow> = [
  { title: '订单编号', dataIndex: 'id', width: 180 },
  { title: '供应商', dataIndex: 'supplier' },
  {
    title: '订单金额',
    dataIndex: 'amount',
    width: 160,
    render: (value: number) => `¥ ${value.toFixed(2)}`,
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 120,
    render: (status: string) => <Tag>{status}</Tag>,
  },
  { title: '创建时间', dataIndex: 'createdAt', width: 180 },
]

const EMPTY_ORDER_ROWS: OrderRow[] = []

/** 工作台概览页：展示核心指标、采集入口与最近订单 */
export default function DashboardPage() {
  const navigate = useNavigate()

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            工作台概览
          </Title>
          <Text type="secondary">集中查看采购订单采集进度与处理情况。</Text>
        </div>
        <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/collection')}>
          前往订单采集
        </Button>
      </Flex>

      {/* 核心指标区：当前为占位数据 */}
      <Row gutter={[16, 16]}>
        {STAT_CARDS.map((item) => (
          <Col key={item.key} xs={24} sm={12} xl={6}>
            <Card>
              <Flex align="center" justify="space-between">
                <Statistic title={item.title} value={item.value} suffix={item.suffix} />
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `${item.color}14`,
                    color: item.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                  }}
                >
                  {item.icon}
                </div>
              </Flex>
              <Tag style={{ marginTop: 12 }} variant="filled">
                占位数据
              </Tag>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="采集任务" style={{ height: '100%' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无采集任务，采集功能上线后可在此启动任务"
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="采集趋势" style={{ height: '100%' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无趋势数据，等待采集功能接入"
            />
          </Card>
        </Col>
      </Row>

      <Card title="最近订单" extra={<Text type="secondary">最新 10 条</Text>}>
        <Table<OrderRow>
          rowKey="id"
          columns={ORDER_COLUMNS}
          dataSource={EMPTY_ORDER_ROWS}
          pagination={false}
          scroll={{ x: 720 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无订单数据，采集功能上线后可在此查看"
              />
            ),
          }}
        />
      </Card>
    </Flex>
  )
}
