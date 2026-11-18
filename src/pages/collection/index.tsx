import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DatabaseOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  InputNumber,
  Progress,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, errorMessage, type SettingsResponse } from '@/api/client'
import type {
  CollectionMode,
  CollectionRun,
  CollectionStatus,
  DashboardStats,
} from '../../../shared/types'
import { formatDateTime, formatNumber, formatText } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { RangePicker } = DatePicker

const MODE_LABELS: Record<CollectionMode, string> = {
  list_backfill: '列表全量扫描',
  print_backfill: '打印预览补全',
  detail_backfill: '详情全量补全',
  incremental: '增量更新',
}

const STATUS_META: Record<
  CollectionStatus,
  { label: string; color: string }
> = {
  pending: { label: '等待中', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  paused: { label: '已暂停', color: 'warning' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

/** 标签页上的小圆点，用来提示该通道最近一次任务的状态 */
const STATUS_BADGE: Partial<
  Record<CollectionStatus, 'processing' | 'warning' | 'error' | 'success'>
> = {
  pending: 'processing',
  running: 'processing',
  paused: 'warning',
  failed: 'error',
  completed: 'success',
}

function runPercent(run: CollectionRun): number {
  if (!run.total) return run.status === 'completed' ? 100 : 0
  return Math.min(100, Math.round((run.processed / run.total) * 100))
}

/** 采集控制页：列表 / 打印预览 / 详情三条全量通道 + 手动增量，同一时间只允许一个任务运行 */
export default function CollectionPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [runs, setRuns] = useState<CollectionRun[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<string | null>(null)

  const [concurrency, setConcurrency] = useState<number | null>(2)
  const [days, setDays] = useState<number | null>(7)
  const [refetchDetail, setRefetchDetail] = useState(true)
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  // 采集通道用标签页切换，默认展示列表扫描
  const [tab, setTab] = useState<CollectionMode>('list_backfill')

  const activeRun = useMemo(
    () => runs.find((run) => run.status === 'running' || run.status === 'pending') ?? null,
    [runs],
  )
  const hasCookie = settings?.hasCookie === true
  const busy = Boolean(activeRun)

  // 每个通道最近一次任务，用于标签页状态点与该通道的进度
  const latestRuns = useMemo(() => {
    const map = new Map<CollectionMode, CollectionRun>()
    for (const run of runs) if (!map.has(run.mode)) map.set(run.mode, run)
    return map
  }, [runs])

  // 从工作台快捷入口进入时，按 ?tab=xxx 直接打开对应通道
  useEffect(() => {
    const requested = searchParams.get('tab')
    if (requested && requested in MODE_LABELS) setTab(requested as CollectionMode)
  }, [searchParams])

  // 新任务启动后自动切到对应通道，平时不干扰用户手动切换
  const activeRunId = activeRun?.id ?? null
  const activeRunMode = activeRun?.mode ?? null
  useEffect(() => {
    if (activeRunMode) setTab(activeRunMode)
  }, [activeRunId, activeRunMode])

  // 列表扫描通道最近一次任务，用于在标签面板里展示进度
  const listRun = latestRuns.get('list_backfill') ?? null

  const detailPercent =
    stats && stats.totalOrders > 0
      ? Math.round((stats.detailSynced / stats.totalOrders) * 100)
      : 0
  const printPercent =
    stats && stats.totalOrders > 0
      ? Math.round((stats.printSynced / stats.totalOrders) * 100)
      : 0

  /** 生成带状态点的标签文字 */
  const channelLabel = (text: string, mode: CollectionMode) => {
    const run = latestRuns.get(mode)
    const status = run ? STATUS_BADGE[run.status] : undefined
    return (
      <Space size={6}>
        <span>{text}</span>
        {status && <Badge status={status} />}
      </Space>
    )
  }

  const refresh = useCallback(async () => {
    try {
      const [nextRuns, nextStats] = await Promise.all([
        api.listRuns(),
        api.getDashboard(),
      ])
      setRuns(nextRuns)
      setStats(nextStats)
    } catch (error) {
      message.error(errorMessage(error))
    }
  }, [message])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [nextSettings, nextRuns, nextStats] = await Promise.all([
        api.getSettings(),
        api.listRuns(),
        api.getDashboard(),
      ])
      setSettings(nextSettings)
      setRuns(nextRuns)
      setStats(nextStats)
      setConcurrency(nextSettings.detailConcurrency)
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // 有运行中的任务时每 3 秒刷新一次进度；任务结束后自动停止轮询
  useEffect(() => {
    if (!activeRun) return
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => window.clearInterval(timer)
  }, [activeRun, refresh])

  const startAction = async (key: string, runner: () => Promise<CollectionRun>) => {
    setAction(key)
    try {
      const run = await runner()
      message.success(`已启动任务：${MODE_LABELS[run.mode]}`)
      await refresh()
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      setAction(null)
    }
  }

  const handleIncremental = () => {
    const startTime = customRange?.[0]?.format('YYYY-MM-DD HH:mm:ss')
    const endTime = customRange?.[1]?.format('YYYY-MM-DD HH:mm:ss')
    void startAction('incremental', () =>
      api.startIncremental({
        days: customRange ? undefined : days || 7,
        startTime,
        endTime,
        refetchDetail,
      }),
    )
  }

  const handlePause = async () => {
    if (!activeRun) return
    setAction('pause')
    try {
      await api.pauseRun(activeRun.id)
      message.success('任务已暂停')
      await refresh()
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      setAction(null)
    }
  }

  const handleResume = async (run: CollectionRun) => {
    setAction('resume')
    try {
      await api.resumeRun(run.id)
      message.success('任务已续跑')
      await refresh()
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      setAction(null)
    }
  }

  const runColumns: ColumnsType<CollectionRun> = [
    {
      title: '任务',
      dataIndex: 'mode',
      width: 140,
      render: (mode: CollectionMode) => MODE_LABELS[mode] ?? mode,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: CollectionStatus) => (
        <Tag color={STATUS_META[status]?.color}>{STATUS_META[status]?.label ?? status}</Tag>
      ),
    },
    {
      title: '进度',
      key: 'progress',
      width: 180,
      render: (_, run) => (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          <Progress percent={runPercent(run)} size="small" status={run.status === 'failed' ? 'exception' : undefined} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatNumber(run.processed)} / {formatNumber(run.total)}
            {run.failed ? ` · 失败 ${run.failed}` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: '阶段',
      dataIndex: 'stage',
      ellipsis: true,
      render: (stage: string | null, run) => (
        <Tooltip title={run.error ?? stage ?? ''}>
          <span>{formatText(run.error ? `失败：${run.error}` : stage)}</span>
        </Tooltip>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      width: 170,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, run) =>
        run.status === 'paused' || run.status === 'failed' ? (
          <Button
            size="small"
            type="link"
            icon={<PlayCircleOutlined />}
            disabled={busy}
            onClick={() => void handleResume(run)}
          >
            续跑
          </Button>
        ) : null,
    },
  ]

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            采购订单采集
          </Title>
          <Text type="secondary">
            列表全量扫描 → 详情全量补全 → 打印预览补全，增量由你手动触发；所有请求都是只读查询，不会修改目标系统。
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={!loading && busy}>
            刷新状态
          </Button>
          <Button type="primary" icon={<DatabaseOutlined />} onClick={() => navigate('/orders')}>
            查看订单库
          </Button>
        </Space>
      </Flex>

      {!loading && !hasCookie && (
        <Alert
          type="warning"
          showIcon
          title="尚未配置登录 Cookie"
          description="采集任务需要有效的登录态。请先到数据源设置保存 Cookie 并检测登录态。"
          action={
            <Button size="small" type="primary" onClick={() => navigate('/settings')}>
              去设置
            </Button>
          }
        />
      )}

      {activeRun && (
        <Card
          title={
            <Space>
              <SyncOutlined spin style={{ color: '#2563eb' }} />
              <span>当前任务：{MODE_LABELS[activeRun.mode]}</span>
              <Tag color={STATUS_META[activeRun.status].color}>
                {STATUS_META[activeRun.status].label}
              </Tag>
            </Space>
          }
          extra={
            <Button
              danger
              icon={<PauseCircleOutlined />}
              loading={action === 'pause'}
              onClick={() => void handlePause()}
            >
              暂停任务
            </Button>
          }
        >
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} md={10}>
              <Progress
                type="dashboard"
                percent={runPercent(activeRun)}
                size={120}
              />
            </Col>
            <Col xs={24} md={14}>
              <Flex vertical gap={12}>
                <Statistic
                  title="已处理 / 总数"
                  value={activeRun.processed}
                  suffix={`/ ${formatNumber(activeRun.total)}`}
                />
                <div>
                  <Text type="secondary">当前阶段：</Text>
                  <Text>{formatText(activeRun.stage)}</Text>
                </div>
                {activeRun.failed > 0 && (
                  <Text type="danger">失败 {activeRun.failed} 条（详见服务端日志）</Text>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  开始于 {formatDateTime(activeRun.startedAt)}，进度每 3 秒自动刷新。
                </Text>
              </Flex>
            </Col>
          </Row>
        </Card>
      )}

      <Card
        title={
          <Space>
            <DatabaseOutlined style={{ color: '#2563eb' }} />
            <span>采集通道</span>
          </Space>
        }
        extra={<Text type="secondary">同一时间只允许一个采集任务运行</Text>}
      >
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as CollectionMode)}
          items={[
            {
              key: 'list_backfill',
              label: channelLabel('① 列表扫描', 'list_backfill'),
              children: (
                <Flex vertical gap={16} style={{ paddingTop: 4 }}>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    按订单时间升序稳定翻页，逐页解析列表字段，补充订单备注、商城价、商品件数、
                    物流单号、订单级审核状态等列表独有字段。约 5 万页，耗时较长，可随时暂停续跑。
                    这一步还会写入<Text strong>内部订单ID</Text>，是「详情全量补全」的前置步骤。
                  </Paragraph>
                  {listRun && (
                    <div>
                      <Progress
                        percent={runPercent(listRun)}
                        size="small"
                        status={listRun.status === 'failed' ? 'exception' : undefined}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        最近任务：{formatText(listRun.stage)}
                      </Text>
                    </div>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    默认从记录的上次页续跑；点击“从头开始”会重置列表游标。
                  </Text>
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<DatabaseOutlined />}
                      disabled={!hasCookie || busy}
                      loading={action === 'list'}
                      onClick={() => void startAction('list', () => api.startListBackfill(false))}
                    >
                      开始 / 继续列表扫描
                    </Button>
                    <Button
                      disabled={!hasCookie || busy}
                      loading={action === 'list-reset'}
                      onClick={() => void startAction('list-reset', () => api.startListBackfill(true))}
                    >
                      从头开始
                    </Button>
                  </Space>
                </Flex>
              ),
            },
            {
              key: 'detail_backfill',
              label: channelLabel('② 详情补全', 'detail_backfill'),
              children: (
                <Flex vertical gap={16} style={{ paddingTop: 4 }}>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    为订单库中尚未补过详情的订单逐单抓取详情页，补充购货人、付款/审核时间、送货时间、
                    邮箱/电话/邮编、品牌、审核人链与操作日志。约 49.7 万单，默认 2 并发、350ms 间隔。
                    <Text strong>需先完成 ① 列表全量扫描</Text>，否则订单没有内部ID，无法请求详情。
                    打印预览补全可以替代这里的大部分联系方式补全，但审核人链与操作日志仍只能靠详情页。
                  </Paragraph>
                  <div>
                    <Flex justify="space-between" align="center">
                      <Text>详情补全进度</Text>
                      <Text type="secondary">
                        {formatNumber(stats?.detailSynced ?? 0)} / {formatNumber(stats?.totalOrders ?? 0)} 单
                      </Text>
                    </Flex>
                    <Progress percent={detailPercent} size="small" />
                  </div>
                  <Space wrap>
                    <Text>并发数</Text>
                    <InputNumber
                      min={1}
                      max={4}
                      value={concurrency}
                      onChange={setConcurrency}
                      style={{ width: 90 }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      1~4 路，越高越容易被目标系统限流
                    </Text>
                  </Space>
                  <Button
                    type="primary"
                    icon={<HistoryOutlined />}
                    disabled={!hasCookie || busy}
                    loading={action === 'detail'}
                    onClick={() =>
                      void startAction('detail', () =>
                        api.startDetailBackfill(concurrency ?? undefined),
                      )
                    }
                  >
                    开始 / 继续详情补全
                  </Button>
                </Flex>
              ),
            },
            {
              key: 'print_backfill',
              label: channelLabel('③ 打印补全', 'print_backfill'),
              children: (
                <Flex vertical gap={16} style={{ paddingTop: 4 }}>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    按主订单号每批 20 单请求「打印订单」预览，补充完整手机号、下单人姓名/联系方式、
                    完整收货地址，以及商品含税单价与小计。比逐单抓详情快得多，
                    <Text strong>需先有订单号</Text>（列表扫描或增量更新写入）。
                  </Paragraph>
                  <div>
                    <Flex justify="space-between" align="center">
                      <Text>打印补全进度</Text>
                      <Text type="secondary">
                        {formatNumber(stats?.printSynced ?? 0)} / {formatNumber(stats?.totalOrders ?? 0)} 单
                      </Text>
                    </Flex>
                    <Progress percent={printPercent} size="small" />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {stats && stats.totalOrders > stats.printSynced
                        ? `待补 ${formatNumber(stats.totalOrders - stats.printSynced)} 单。`
                        : '已全部补全。'}
                      默认每批 20 单，未返回的订单会留在待补队列，可稍后再次运行；可随时暂停续跑。
                    </Text>
                  </div>
                  <Alert
                    type="info"
                    showIcon
                    title="只发送打印预览按钮字段"
                    description="请求仅包含 printing=打印订单，不发送取消、删除、确认等任何操作字段；实测打印前后订单详情与操作日志一致。"
                  />
                  <Button
                    type="primary"
                    icon={<PrinterOutlined />}
                    disabled={!hasCookie || busy}
                    loading={action === 'print'}
                    onClick={() => void startAction('print', () => api.startPrintBackfill())}
                  >
                    开始 / 继续打印补全
                  </Button>
                </Flex>
              ),
            },
            {
              key: 'incremental',
              label: channelLabel('④ 增量更新', 'incremental'),
              children: (
                <Flex vertical gap={16} style={{ paddingTop: 4 }}>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    按时间窗口拉取最近订单（默认近 7 天），刷新列表字段并重新抓取窗口内订单详情。
                    系统不会自动执行，需要时由你点击启动。
                  </Paragraph>
                  <Space wrap>
                    <Text>默认窗口</Text>
                    <InputNumber
                      min={1}
                      max={365}
                      value={days}
                      onChange={setDays}
                      style={{ width: 90 }}
                      disabled={Boolean(customRange)}
                    />
                    <Text>天</Text>
                    <Text type="secondary">或指定自定义时间范围</Text>
                  </Space>
                  <RangePicker
                    showTime
                    value={customRange}
                    onChange={(value) =>
                      setCustomRange(value && value[0] && value[1] ? [value[0], value[1]] : null)
                    }
                    style={{ width: '100%' }}
                  />
                  <Space>
                    <Switch checked={refetchDetail} onChange={setRefetchDetail} />
                    <Text>同时刷新窗口内订单详情</Text>
                  </Space>
                  <Button
                    type="primary"
                    icon={<SyncOutlined />}
                    disabled={!hasCookie || busy}
                    loading={action === 'incremental'}
                    onClick={handleIncremental}
                  >
                    执行增量更新
                  </Button>
                </Flex>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title="任务历史"
        extra={<Text type="secondary">同一时间只允许一个采集任务运行</Text>}
      >
        <Table<CollectionRun>
          rowKey="id"
          size="small"
          loading={loading}
          columns={runColumns}
          dataSource={runs}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有采集任务" />
            ),
          }}
        />
      </Card>
    </Flex>
  )
}
