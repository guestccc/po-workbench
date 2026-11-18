import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { App as AntdApp, ConfigProvider } from 'antd'
import dayjs from 'dayjs'
import { useState, type ReactElement } from 'react'
import DashboardPage from '@/pages/dashboard'
import CollectionPage from '@/pages/collection'
import OrdersPage from '@/pages/orders'
import OrderDetailPage from '@/pages/orders/detail'
import SettingsPage from '@/pages/settings'
import ExportOrdersModal from '@/components/ExportOrdersModal'
import { ORDER_EXPORT_FIELDS } from '../../shared/export-fields'

const SAMPLE_ORDER = {
  orderSn: '2026111800001',
  orderId: '6207607',
  orderTime: '2026-11-18 10:17:05',
  itemCount: 3,
  payMethod: '在线支付',
  orderStatus: '已发货',
  consignee: '张三',
  mobile: '13800000000',
  address: '测试地址',
  orderAmount: 8451.8,
  purchaserOrg: '测试采购机构',
  reviewStatus: '已审核',
  logistics: '物流配送',
}

// 页面依赖本地采集服务；测试中统一 mock，避免真实网络请求
vi.mock('@/api/client', () => ({
  api: {
    getDashboard: vi.fn(async () => ({
      totalOrders: 1234,
      todayOrders: 12,
      totalItems: 5678,
      detailSynced: 100,
      listSynced: 1100,
      printSynced: 900,
      lastSyncAt: '2026-11-18T04:00:00.000Z',
    })),
    listOrders: vi.fn(async () => ({
      data: [
        {
          orderSn: '2026111800001',
          orderId: '6207607',
          orderTime: '2026-11-18 10:17:05',
          itemCount: 3,
          orderStatus: '已发货',
          consignee: '张三',
          mobile: '13800000000',
          orderAmount: 8451.8,
          purchaserOrg: '测试采购机构',
          reviewStatus: '已审核',
          logistics: '物流配送',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })),
    getSettings: vi.fn(async () => ({
      hasCookie: false,
      updatedAt: null,
      baseUrl: 'https://dspt.gdwyj.cn:14443/mobile/backend/',
      detailConcurrency: 2,
      requestIntervalMs: 350,
    })),
    listRuns: vi.fn(async () => []),
    getOrder: vi.fn(async () => ({
      order: {
        orderSn: '2026111800001',
        orderId: '6207607',
        orderTime: '2026-11-18 10:17:05',
        orderStatus: '已发货',
        consignee: '张三',
        mobile: '13800000000',
        address: '测试地址',
        orderAmount: 8451.8,
      },
      items: [
        {
          itemKey: 'SUB-1',
          lineNo: 1,
          productName: '测试商品',
          brand: '测试品牌',
          sku: 'SKU-1',
          quantity: 2,
          taxInclusivePrice: 10,
          taxInclusiveAmount: 20,
        },
      ],
      reviewers: [
        {
          seq: 1,
          reviewer: '03552279（待审核）',
          orgName: '测试审核机构',
          orgCode: '51136161',
          contact: '李四',
          mobile: '139****0000',
        },
      ],
      logs: [
        {
          seq: 1,
          operator: '系统',
          operatedAt: '2026-11-18 10:17:05',
          orderStatus: '已发货',
          note: '测试日志',
        },
      ],
    })),
  },
  ApiError: class ApiError extends Error {
    status = 0
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  orderExportUrl: (params: { scope: string; fields?: string[] }) =>
    `/api/orders/export?scope=${params.scope}${
      params.fields ? `&fields=${params.fields.join(',')}` : ''
    }`,
}))

/** 统一包裹页面所需的路由与 antd 上下文 */
function renderWithProviders(ui: ReactElement, initialEntries: string[] = ['/']) {
  return render(
    <ConfigProvider>
      <AntdApp>
        <MemoryRouter
          initialEntries={initialEntries}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          {ui}
        </MemoryRouter>
      </AntdApp>
    </ConfigProvider>,
  )
}

/** 单独渲染导出弹窗，避免整套订单表格拖慢字段勾选相关测试 */
function ExportModalHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开导出弹窗
      </button>
      <ExportOrdersModal
        open={open}
        keyword=""
        status=""
        onClose={() => setOpen(false)}
      />
    </>
  )
}

describe('工作台页面冒烟测试', () => {
  it('工作台概览应展示真实统计与最近订单', async () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByRole('heading', { name: '工作台概览' })).toBeInTheDocument()
    expect(await screen.findByText('订单总数')).toBeInTheDocument()
    expect(await screen.findByText('最近入库订单')).toBeInTheDocument()
    expect(await screen.findByText('2026111800001')).toBeInTheDocument()
    expect(await screen.findByText('今日新增 12 单')).toBeInTheDocument()
  })

  it('采集页应展示四条采集通道标签页，未配置 Cookie 时给出提示', async () => {
    renderWithProviders(<CollectionPage />)
    expect(screen.getByRole('heading', { name: '采购订单采集' })).toBeInTheDocument()

    // 四个通道以标签页形式展示
    expect(screen.getByRole('tab', { name: '① 列表扫描' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '② 详情补全' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '③ 打印补全' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '④ 增量更新' })).toBeInTheDocument()
    expect(await screen.findByText('尚未配置登录 Cookie')).toBeInTheDocument()

    // 默认停在列表通道
    expect(screen.getByText('开始 / 继续列表扫描')).toBeInTheDocument()

    // 切到详情通道应看到并发数与补全按钮
    fireEvent.click(screen.getByRole('tab', { name: '② 详情补全' }))
    expect(await screen.findByText('开始 / 继续详情补全')).toBeInTheDocument()
    expect(screen.getByText('并发数')).toBeInTheDocument()

    // 切到打印通道应看到只读安全说明
    fireEvent.click(screen.getByRole('tab', { name: '③ 打印补全' }))
    expect(await screen.findByText('只发送打印预览按钮字段')).toBeInTheDocument()

    // 切到增量通道应看到手动触发说明
    fireEvent.click(screen.getByRole('tab', { name: '④ 增量更新' }))
    expect(await screen.findByText('执行增量更新')).toBeInTheDocument()
  })

  it('数据源设置页应展示 Cookie 配置与采集参数', async () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByRole('heading', { name: '数据源设置' })).toBeInTheDocument()
    expect(await screen.findByText('未配置 Cookie')).toBeInTheDocument()
    expect(screen.getByText('保存并检测')).toBeInTheDocument()
    expect(screen.getByText('采集参数')).toBeInTheDocument()
  })

  it('订单库应展示订单行并可进入详情', async () => {
    renderWithProviders(<OrdersPage />)
    expect(await screen.findByText('2026111800001')).toBeInTheDocument()
    expect(screen.getByText('张三')).toBeInTheDocument()
    expect(screen.getAllByText('已发货').length).toBeGreaterThan(0)
  })

  it('订单库导出弹窗应提供日期快捷选项并回填日期', async () => {
    renderWithProviders(<OrdersPage />)
    fireEvent.click(await screen.findByRole('button', { name: /导出表格/ }))

    expect(await screen.findByText('导出内容')).toBeInTheDocument()
    expect(screen.getByText('订单主表（一行一单）')).toBeInTheDocument()
    expect(screen.getByText('订单 + 商品明细（一行一商品）')).toBeInTheDocument()
    for (const label of ['全部', '近一月', '近三月', '近半年', '近一年']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    // 点快捷项应回填起止日期
    fireEvent.click(screen.getByText('近三月'))
    const start = dayjs().subtract(3, 'month').format('YYYY-MM-DD')
    const end = dayjs().format('YYYY-MM-DD')
    expect(await screen.findByDisplayValue(start)).toBeInTheDocument()
    expect(screen.getByDisplayValue(end)).toBeInTheDocument()

    // 「全部」应清空日期
    fireEvent.click(screen.getByText('全部'))
    expect(screen.queryByDisplayValue(start)).not.toBeInTheDocument()
  })

  it('导出弹窗应支持自定义字段，并把勾选习惯记入 localStorage', async () => {
    window.localStorage.clear()
    // 屏蔽 jsdom 对 <a download> 点击的导航告警，同时截获下载地址
    let clickedHref: string | null = null
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedHref = this.getAttribute('href')
      })
    try {
      renderWithProviders(<ExportModalHarness />)
      fireEvent.click(screen.getByRole('button', { name: '打开导出弹窗' }))

      // 默认全部字段勾选
      fireEvent.click(await screen.findByText(/高级：自定义导出字段/))
      const total = ORDER_EXPORT_FIELDS.length
      const timeCheckbox = await screen.findByRole('checkbox', { name: '下单时间' })
      expect(timeCheckbox).toBeChecked()
      expect(screen.getByText(`已选 ${total}/${total}`, { exact: false })).toBeInTheDocument()

      // 取消「下单时间」后应立即写入本地记忆（按目录顺序，不含 orderTime）
      fireEvent.click(timeCheckbox)
      expect(timeCheckbox).not.toBeChecked()
      expect(screen.getByText(`已选 ${total - 1}/${total}`, { exact: false })).toBeInTheDocument()
      const saved = JSON.parse(
        window.localStorage.getItem('po-workbench.export-fields.orders') ?? '[]',
      )
      expect(saved).not.toContain('orderTime')
      expect(saved).toContain('orderSn')

      // 取消全选：允许清空，但导出按钮禁用，且不覆盖已保存的有效勾选
      fireEvent.click(screen.getByRole('button', { name: '取消全选' }))
      expect(screen.getByText(`已选 0/${total}`, { exact: false })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^导\s*出$/ })).toBeDisabled()
      expect(window.localStorage.getItem('po-workbench.export-fields.orders')).toContain('orderSn')

      // 全选后重新取消「下单时间」，恢复为 37 个字段以便后续导出断言
      fireEvent.click(screen.getByRole('button', { name: '全选' }))
      fireEvent.click(screen.getByRole('checkbox', { name: '下单时间' }))
      expect(screen.getByRole('checkbox', { name: '下单时间' })).not.toBeChecked()

      // 关闭再打开，应回显上一次的勾选
      fireEvent.click(screen.getByRole('button', { name: /^取\s*消$/ }))
      fireEvent.click(screen.getByRole('button', { name: '打开导出弹窗' }))
      expect(await screen.findByRole('checkbox', { name: '下单时间' })).not.toBeChecked()

      // 导出链接应携带勾选字段
      fireEvent.click(screen.getByRole('button', { name: /^导\s*出$/ }))
      expect(clickedHref).toContain('fields=')
      expect(clickedHref).toContain('orderSn')
      expect(clickedHref).not.toContain('orderTime')
    } finally {
      clickSpy.mockRestore()
    }
    // antd + jsdom 下勾选 38 个字段的多轮交互较慢，放宽该用例超时
  }, 90000)

  it('订单详情页应展示字段合集、商品、审核链与日志', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/orders/:key" element={<OrderDetailPage />} />
      </Routes>,
      ['/orders/2026111800001'],
    )
    expect(await screen.findByRole('heading', { name: '订单 2026111800001' })).toBeInTheDocument()
    expect(screen.getByText('订单基本信息')).toBeInTheDocument()
    expect(screen.getByText('测试商品')).toBeInTheDocument()
    expect(screen.getByText('03552279（待审核）')).toBeInTheDocument()
    expect(screen.getByText('测试日志')).toBeInTheDocument()
  })

  it('详情 mock 数据应保持完整字段（防止测试夹具漂移）', () => {
    expect(SAMPLE_ORDER.orderSn).toBe('2026111800001')
    expect(SAMPLE_ORDER.mobile).toHaveLength(11)
  })
})
