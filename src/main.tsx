import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntdApp, ConfigProvider } from 'antd'
import type { ThemeConfig } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/global.css'

/** 全局主题配置：统一主色、圆角与工作台基础背景 */
const THEME: ThemeConfig = {
  token: {
    colorPrimary: '#2563eb',
    borderRadius: 8,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#ffffff',
    },
    Menu: {
      itemBorderRadius: 8,
    },
  },
}

const container = document.getElementById('root')

// 根节点缺失时直接抛出明确错误，避免出现白屏且难以排查
if (!container) {
  throw new Error('未找到 #root 挂载节点，请检查 index.html')
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={THEME}>
      {/* antd App 组件提供 message / notification 的上下文，后续接入接口时会用到 */}
      <AntdApp>
        <ErrorBoundary>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
)
