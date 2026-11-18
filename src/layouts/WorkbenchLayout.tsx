import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppstoreOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ShoppingCartOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Breadcrumb, Button, Flex, Layout, Menu, Tag, Typography, theme } from 'antd'

const { Sider, Header, Content, Footer } = Layout
const { Text } = Typography

/** 侧边栏菜单配置：key 与路由路径保持一致，便于高亮状态同步 */
const MENU_ITEMS = [
  { key: '/dashboard', icon: <AppstoreOutlined />, label: '工作台概览' },
  { key: '/collection', icon: <ShoppingCartOutlined />, label: '采购订单采集' },
  { key: '/orders', icon: <UnorderedListOutlined />, label: '订单库' },
  { key: '/settings', icon: <SettingOutlined />, label: '数据源设置' },
]

/** 路由标题映射，用于顶部面包屑展示 */
const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': '工作台概览',
  '/collection': '采购订单采集',
  '/orders': '订单库',
  '/settings': '数据源设置',
}

/** 工作台基础布局：左侧菜单 + 顶部信息栏 + 内容区 */
export default function WorkbenchLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  /** 根据当前路径计算菜单高亮项 */
  const selectedKeys = useMemo(() => {
    const matched = MENU_ITEMS.find((item) => location.pathname.startsWith(item.key))
    return matched ? [matched.key] : ['/dashboard']
  }, [location.pathname])

  const currentTitle =
    ROUTE_TITLES[location.pathname] ??
    (location.pathname.startsWith('/orders/') ? '订单详情' : '页面')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={232}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'auto',
        }}
      >
        {/* Logo 区域：收起时仅保留图形图标 */}
        <Flex
          align="center"
          gap={10}
          style={{ height: 56, padding: collapsed ? '0 20px' : '0 16px', overflow: 'hidden' }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #2563eb, #60a5fa)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            <ShoppingCartOutlined />
          </div>
          {!collapsed && (
            <div style={{ lineHeight: 1.25, whiteSpace: 'nowrap' }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: token.colorText }}>
                采购订单工作台
              </div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                Procurement Workbench
              </div>
            </div>
          )}
        </Flex>

        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none', padding: '8px 8px 0' }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: '0 24px',
            height: 56,
            lineHeight: '56px',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Flex align="center" justify="space-between" style={{ height: '100%' }}>
            <Flex align="center" gap={12}>
              <Button
                type="text"
                aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((value) => !value)}
              />
              <Breadcrumb items={[{ title: '采购工作台' }, { title: currentTitle }]} />
            </Flex>

            <Flex align="center" gap={12}>
              <Tag color="blue">本机运行</Tag>
              <Flex align="center" gap={8}>
                <Avatar
                  size="small"
                  icon={<UserOutlined />}
                  style={{ background: token.colorPrimary }}
                />
                <Text>采购员</Text>
              </Flex>
            </Flex>
          </Flex>
        </Header>

        <Content style={{ padding: 24 }}>
          {/* 限制内容最大宽度，避免超宽屏下内容过度拉伸 */}
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <Outlet />
          </div>
        </Content>

        <Footer style={{ textAlign: 'center', color: token.colorTextTertiary, background: 'transparent' }}>
          企业采购订单采集工作台 · 本机版 v0.2.0
        </Footer>
      </Layout>
    </Layout>
  )
}
