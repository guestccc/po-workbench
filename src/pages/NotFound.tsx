import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'

/** 404 页面：访问未注册路由时展示 */
export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，你访问的页面不存在。"
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          返回工作台
        </Button>
      }
    />
  )
}
