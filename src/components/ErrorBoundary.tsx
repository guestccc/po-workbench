import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button, Result } from 'antd'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 全局错误边界：捕获页面渲染阶段的异常，避免整页白屏。
 * 后续可在此处接入前端监控上报（如 Sentry）。
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录异常堆栈，方便开发阶段定位问题
    console.error('[ErrorBoundary] 页面渲染异常:', error, errorInfo)
  }

  /** 重置错误状态并回到工作台首页 */
  handleReset = () => {
    this.setState({ error: null })
    window.location.href = '/'
  }

  render() {
    const { error } = this.state

    if (error) {
      return (
        <Result
          status="500"
          title="页面出错了"
          subTitle={error.message || '发生未知错误，请稍后重试'}
          extra={
            <Button type="primary" onClick={this.handleReset}>
              返回工作台
            </Button>
          }
        />
      )
    }

    return this.props.children
  }
}
