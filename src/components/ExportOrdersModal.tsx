import { useEffect, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  DatePicker,
  Flex,
  Modal,
  Radio,
  Space,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { api, errorMessage, orderExportUrl } from '@/api/client'
import { formatNumber } from '@/utils/format'
import {
  EXPORT_FIELDS,
  defaultExportFieldKeys,
  normalizeExportFieldKeys,
} from '../../shared/export-fields'
import type { OrderExportScope } from '../../shared/types'

const { RangePicker } = DatePicker
const { Text } = Typography

/** 按导出粒度分别记忆用户勾选的字段，key 一旦发布不要改 */
const FIELD_STORAGE_PREFIX = 'po-workbench.export-fields.'

/** 读取本地保存的字段勾选；无记录、解析失败或全部非法时回退为全部字段 */
function loadSavedFieldKeys(scope: OrderExportScope): string[] {
  try {
    const raw = window.localStorage.getItem(FIELD_STORAGE_PREFIX + scope)
    if (!raw) return defaultExportFieldKeys(scope)
    return normalizeExportFieldKeys(scope, JSON.parse(raw))
  } catch {
    return defaultExportFieldKeys(scope)
  }
}

/** 保存勾选习惯；隐私模式/配额不足时静默失败，不影响导出本身 */
function persistFieldKeys(scope: OrderExportScope, keys: string[]) {
  try {
    window.localStorage.setItem(FIELD_STORAGE_PREFIX + scope, JSON.stringify(keys))
  } catch {
    // localStorage 不可用时忽略
  }
}

/** 快捷日期选项：全部不传日期；其余按“今天往前 N 个自然月”计算 */
type PresetKey = 'all' | '1m' | '3m' | '6m' | '1y' | 'custom'

const PRESETS: Array<{ value: Exclude<PresetKey, 'custom'>; label: string; months?: number }> = [
  { value: 'all', label: '全部' },
  { value: '1m', label: '近一月', months: 1 },
  { value: '3m', label: '近三月', months: 3 },
  { value: '6m', label: '近半年', months: 6 },
  { value: '1y', label: '近一年', months: 12 },
]

function presetRange(months: number): [Dayjs, Dayjs] {
  return [dayjs().subtract(months, 'month').startOf('day'), dayjs().endOf('day')]
}

export interface ExportOrdersModalProps {
  open: boolean
  /** 页面当前的关键词/状态筛选，导出时沿用 */
  keyword?: string
  status?: string
  onClose: () => void
}

/**
 * 订单表格导出弹窗。
 * 日期支持快捷范围（全部/近一月/近三月/近半年/近一年）或手动选择；
 * 导出沿用页面当前的关键词与状态筛选，服务端流式生成 CSV。
 */
export default function ExportOrdersModal({
  open,
  keyword,
  status,
  onClose,
}: ExportOrdersModalProps) {
  const { message } = App.useApp()
  const [scope, setScope] = useState<OrderExportScope>('orders')
  const [preset, setPreset] = useState<PresetKey>('all')
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)
  const [selectedFields, setSelectedFields] = useState<string[]>(() =>
    defaultExportFieldKeys('orders'),
  )

  const fieldMetas = EXPORT_FIELDS[scope]
  const startDate = range?.[0]?.format('YYYY-MM-DD')
  const endDate = range?.[1]?.format('YYYY-MM-DD')

  // 每次打开重置为默认的「全部时间 / 订单主表」
  useEffect(() => {
    if (open) {
      setPreset('all')
      setRange(null)
      setTotal(null)
    }
  }, [open])

  // 打开或切换粒度时，恢复该粒度下用户上次勾选的字段
  useEffect(() => {
    if (open) setSelectedFields(loadSavedFieldKeys(scope))
  }, [open, scope])

  // 统计匹配单数，让用户在导出前对文件规模有预期
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCounting(true)
    const timer = setTimeout(() => {
      api
        .listOrders({
          page: 1,
          pageSize: 1,
          keyword: keyword?.trim() || undefined,
          status: status?.trim() || undefined,
          startDate,
          endDate,
        })
        .then(result => {
          if (!cancelled) setTotal(result.total)
        })
        .catch(error => {
          if (!cancelled) {
            setTotal(null)
            message.error(errorMessage(error))
          }
        })
        .finally(() => {
          if (!cancelled) setCounting(false)
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, keyword, status, startDate, endDate, message])

  function applyPreset(key: Exclude<PresetKey, 'custom'>) {
    setPreset(key)
    const months = PRESETS.find(item => item.value === key)?.months
    setRange(months ? presetRange(months) : null)
  }

  /**
   * 字段勾选变化：按字段目录顺序归一化后记入本地。
   * 允许清空（此时导出按钮禁用）；空选择只是临时状态，不覆盖已保存的有效习惯。
   */
  function handleFieldsChange(keys: string[]) {
    const normalized = keys.length ? normalizeExportFieldKeys(scope, keys) : []
    setSelectedFields(normalized)
    if (normalized.length) persistFieldKeys(scope, normalized)
  }

  function handleSelectAllFields() {
    const all = defaultExportFieldKeys(scope)
    setSelectedFields(all)
    persistFieldKeys(scope, all)
  }

  function handleClearAllFields() {
    setSelectedFields([])
  }

  function handleExport() {
    const url = orderExportUrl({
      scope,
      keyword: keyword?.trim() || undefined,
      status: status?.trim() || undefined,
      startDate,
      endDate,
      fields: selectedFields,
    })
    // 用隐藏链接触发浏览器下载：大文件不经过 JS 内存，错误由服务端日志兜底
    const link = document.createElement('a')
    link.href = url
    link.download = ''
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    message.success('已开始导出，文件较大时请稍候')
    onClose()
  }

  return (
    <Modal
      title="导出订单表格"
      open={open}
      onCancel={onClose}
      onOk={handleExport}
      okText="导出"
      cancelText="取消"
      width={560}
      // 没有勾选任何字段时无法导出
      okButtonProps={{ disabled: selectedFields.length === 0 }}
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text strong>导出内容</Text>
          <Radio.Group
            value={scope}
            onChange={event => setScope(event.target.value as OrderExportScope)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
          >
            <Radio value="orders">订单主表（一行一单）</Radio>
            <Radio value="items">订单 + 商品明细（一行一商品）</Radio>
          </Radio.Group>
        </div>

        <div>
          <Text strong>日期范围</Text>
          <div style={{ margin: '8px 0' }}>
            <Radio.Group
              value={preset}
              onChange={event => applyPreset(event.target.value as Exclude<PresetKey, 'custom'>)}
              optionType="button"
              buttonStyle="solid"
              options={PRESETS.map(item => ({ value: item.value, label: item.label }))}
            />
          </div>
          <RangePicker
            value={range}
            allowClear
            style={{ width: '100%' }}
            placeholder={['开始日期', '结束日期']}
            onChange={value => {
              const next = value && value[0] && value[1] ? ([value[0], value[1]] as [Dayjs, Dayjs]) : null
              setRange(next)
              setPreset('custom')
            }}
          />
        </div>

        <Collapse
          size="small"
          items={[
            {
              key: 'fields',
              label: `高级：自定义导出字段（已选 ${selectedFields.length}/${fieldMetas.length}）`,
              children: (
                <div>
                  <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                    <Text
                      type={selectedFields.length ? 'secondary' : 'warning'}
                      style={{ fontSize: 12 }}
                    >
                      {selectedFields.length
                        ? '勾选需要导出的列，选择会保存在本机，下次自动沿用。'
                        : '请至少勾选一个导出字段。'}
                    </Text>
                    <Space size={4}>
                      <Button
                        type="link"
                        size="small"
                        onClick={handleSelectAllFields}
                        disabled={selectedFields.length === fieldMetas.length}
                      >
                        全选
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        onClick={handleClearAllFields}
                        disabled={selectedFields.length === 0}
                      >
                        取消全选
                      </Button>
                    </Space>
                  </Flex>
                  <Checkbox.Group
                    value={selectedFields}
                    onChange={values => handleFieldsChange(values as string[])}
                    options={fieldMetas.map(field => ({ value: field.key, label: field.title }))}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      rowGap: 8,
                      columnGap: 12,
                      // 字段较多时弹窗不会无限变高，超出部分在面板内滚动
                      maxHeight: 280,
                      overflowY: 'auto',
                      paddingRight: 4,
                    }}
                  />
                </div>
              ),
            },
          ]}
        />

        <Text type="secondary">
          {counting
            ? '正在统计匹配数量…'
            : total === null
              ? '按当前筛选条件导出'
              : `将导出 ${formatNumber(total)} 单${scope === 'items' ? '的订单商品明细' : ''}。`}
          {keyword?.trim() || status?.trim() ? ' 页面当前的关键词/状态筛选会一并生效。' : ''}
        </Text>

        {preset === 'all' && total !== null && total > 30000 ? (
          <Alert
            type="warning"
            showIcon
            message="全部时间范围的订单较多，导出文件可能较大且耗时较长。"
            description="建议先选择「近一年」等较短范围；需要全量数据时可继续导出。"
          />
        ) : null}
      </Space>
    </Modal>
  )
}
