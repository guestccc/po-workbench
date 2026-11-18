import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App as AntdApp, ConfigProvider } from 'antd'
import type { ReactElement } from 'react'
import DashboardPage from '@/pages/dashboard'
import CollectionPage from '@/pages/collection'

/** 统一包裹页面所需的路由与 antd 上下文 */
function renderWithProviders(ui: ReactElement) {
  return render(
    <ConfigProvider>
      <AntdApp>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {ui}
        </MemoryRouter>
      </AntdApp>
    </ConfigProvider>,
  )
}

describe('工作台页面冒烟测试', () => {
  it('工作台概览应渲染统计卡片', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByRole('heading', { name: '工作台概览' })).toBeInTheDocument()
    expect(screen.getByText('今日采集订单')).toBeInTheDocument()
    expect(screen.getByText('待审核订单')).toBeInTheDocument()
  })

  it('采集页应展示占位提示与采集流程', () => {
    renderWithProviders(<CollectionPage />)
    expect(screen.getByRole('heading', { name: '采购订单采集' })).toBeInTheDocument()
    expect(screen.getByText('采集功能正在建设中')).toBeInTheDocument()
    // “配置数据源”同时出现在采集流程与占位按钮中，因此使用 getAllByText
    expect(screen.getAllByText('配置数据源').length).toBeGreaterThan(0)
  })
})
