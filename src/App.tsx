import { Navigate, Route, Routes } from 'react-router-dom'
import WorkbenchLayout from './layouts/WorkbenchLayout'
import DashboardPage from './pages/dashboard'
import CollectionPage from './pages/collection'
import NotFoundPage from './pages/NotFound'

/**
 * 应用路由表。
 * 所有业务页面共享 WorkbenchLayout（侧边栏 + 顶栏），后续新增页面时在此注册即可。
 */
export default function App() {
  return (
    <Routes>
      <Route element={<WorkbenchLayout />}>
        {/* 根路径重定向到工作台概览 */}
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        {/* 兜底路由：未匹配的地址展示 404 页面 */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
