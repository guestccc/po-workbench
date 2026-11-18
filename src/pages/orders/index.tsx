import { useCallback, useEffect, useState } from 'react'
import {
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShoppingOutlined,
} from '@ant-design/icons'
import {
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Input,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { Link } from 'react-router-dom'
import { api, errorMessage, type OrderQuery } from '@/api/client'
import ExportOrdersModal from '@/components/ExportOrdersModal'
import type { OrderRecord } from '../../../shared/types'
import {
  formatMoney,
  formatNumber,
  formatText,
  orderStatusColor,
  reviewStatusColor,
} from '@/utils/format'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const DEFAULT_PAGE_SIZE = 20

/** 订单库：服务端分页查询，所有字段按采集结果原样展示，不做脱敏 */
export default function OrdersPage() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<OrderRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const load = useCallback(
    async (override?: Partial<OrderQuery>) => {
      const params: OrderQuery = {
        page,
        pageSize,
        keyword: keyword.trim() || undefined,
        status: status.trim() || undefined,
        startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
        endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        ...override,
      }
      setLoading(true)
      try {
        const result = await api.listOrders(params)
        setRows(result.data)
        setTotal(result.total)
        setPage(result.page)
      } catch (error) {
        message.error(errorMessage(error))
      } finally {
        setLoading(false)
      }
    },
    [page, pageSize, keyword, status, dateRange, message],
  )

  useEffect(() => {
    void load()
  }, [load])

  const columns: ColumnsType<OrderRecord> = [
    {
      title: '订单号',
      dataIndex: 'orderSn',
      width: 160,
      fixed: 'left',
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
      title: '电话 / 手机',
      key: 'contact',
      width: 140,
      render: (_, row) => formatText(row.mobile || row.phone),
    },
    {
      title: '订单金额',
      dataIndex: 'orderAmount',
      width: 120,
      align: 'right',
      render: (value: number | null) => formatMoney(value),
    },
    {
      title: '件数',
      dataIndex: 'itemCount',
      width: 80,
      align: 'right',
      render: (value: number | null) => formatNumber(value),
    },
    {
      title: '订单状态',
      dataIndex: 'orderStatus',
      width: 140,
      render: (value: string | null) =>
        value ? <Tag color={orderStatusColor(value)}>{value}</Tag> : '-',
    },
    {
      title: '审核状态',
      dataIndex: 'reviewStatus',
      width: 110,
      render: (value: string | null) =>
        value ? <Tag color={reviewStatusColor(value)}>{value}</Tag> : '-',
    },
    {
      title: '采购机构',
      dataIndex: 'purchaserOrg',
      width: 180,
      ellipsis: true,
      render: (value: string | null) => formatText(value),
    },
    {
      title: '物流',
      dataIndex: 'logistics',
      width: 160,
      ellipsis: true,
      render: (value: string | null) => formatText(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      fixed: 'right',
      render: (_, row) => <Link to={`/orders/${row.orderSn}`}>详情</Link>,
    },
  ]

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            订单库
          </Title>
          <Text type="secondary">
            共 {formatNumber(total)} 单，搜索支持订单号 / 收货人 / 机构 / 商品名称。
          </Text>
        </div>
        <Flex gap={8}>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => setExportOpen(true)}
          >
            导出表格
          </Button>
        </Flex>
      </Flex>

      <Card>
        <Flex wrap gap={12} align="center">
          <Input.Search
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={() => setPage(1)}
            placeholder="订单号 / 收货人 / 机构 / 商品"
            enterButton={<SearchOutlined />}
            allowClear
            style={{ width: 300 }}
          />
          <Input
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            onPressEnter={() => setPage(1)}
            placeholder="订单状态，如：已发货"
            allowClear
            style={{ width: 200 }}
          />
          <RangePicker
            value={dateRange}
            onChange={(value) => {
              setDateRange(value && value[0] && value[1] ? [value[0], value[1]] : null)
              setPage(1)
            }}
            placeholder={['下单开始日期', '下单结束日期']}
          />
          <Button type="primary" onClick={() => setPage(1)}>
            查询
          </Button>
          <Button
            onClick={() => {
              setKeyword('')
              setStatus('')
              setDateRange(null)
              setPage(1)
            }}
          >
            重置
          </Button>
        </Flex>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <Table<OrderRecord>
          rowKey="orderSn"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1500 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (value) => `共 ${formatNumber(value)} 单`,
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage)
              setPageSize(nextSize)
            },
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有订单数据，请先到采集页执行列表扫描"
              />
            ),
          }}
        />
      </Card>

      <Text type="secondary" style={{ fontSize: 12 }}>
        <ShoppingOutlined /> 字段来自列表与详情两个通道的合集；同一字段以最新采集到的非空值为准，早期采集的订单可能保留完整手机号等历史字段。
      </Text>

      <ExportOrdersModal
        open={exportOpen}
        keyword={keyword}
        status={status}
        onClose={() => setExportOpen(false)}
      />
    </Flex>
  )
}
