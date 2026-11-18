import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// antd 的响应式组件依赖 matchMedia，jsdom 未实现，这里补充最小可用的 mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

// antd 的 Table / Steps 等组件依赖 ResizeObserver，jsdom 未实现，这里补充空实现
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

// jsdom 不支持 ::-webkit-scrollbar 等伪元素查询，rc-table 测量滚动条宽度时会报未实现，
// 这里忽略伪元素参数，直接返回元素的计算样式
const originalGetComputedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = ((element: Element) =>
  originalGetComputedStyle(element)) as typeof window.getComputedStyle
