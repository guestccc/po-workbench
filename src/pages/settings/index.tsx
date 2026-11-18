import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  LockOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Flex,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { api, errorMessage, type SettingsResponse } from '@/api/client'
import type { LoginCheckResult } from '../../../shared/types'
import { formatDateTime } from '@/utils/format'

const { Title, Text, Paragraph } = Typography

/**
 * 数据源设置页。
 * Cookie 只提交给本机服务并加密落盘，前端任何时候都不回显已保存的 Cookie。
 */
export default function SettingsPage() {
  const { message, modal } = App.useApp()
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [cookieInput, setCookieInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [login, setLogin] = useState<LoginCheckResult | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      setSettings(await api.getSettings())
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    const cookie = cookieInput.trim()
    if (!cookie) {
      message.warning('请先粘贴 Cookie')
      return
    }
    setSaving(true)
    try {
      const result = await api.saveCookie(cookie)
      setLogin(result.login)
      setCookieInput('')
      await loadSettings()
      if (result.login.valid) {
        message.success('Cookie 已加密保存，登录态有效')
      } else {
        message.warning(`Cookie 已保存，但登录检测未通过：${result.login.message}`)
      }
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const handleCheck = async () => {
    setChecking(true)
    try {
      const result = await api.checkLogin()
      setLogin(result)
      if (result.valid) message.success('登录态有效')
      else message.warning(result.message)
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      setChecking(false)
    }
  }

  const handleClear = () => {
    modal.confirm({
      title: '清除已保存的 Cookie？',
      content: '清除后所有采集任务都无法启动，需要重新粘贴 Cookie。',
      okText: '清除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.clearCookie()
          setLogin(null)
          await loadSettings()
          message.success('已清除本地 Cookie')
        } catch (error) {
          message.error(errorMessage(error))
        }
      },
    })
  }

  const loginTag = login ? (
    login.valid ? (
      <Tag color="success" icon={<CheckCircleOutlined />}>
        登录态有效
      </Tag>
    ) : (
      <Tag color="error" icon={<CloseCircleOutlined />}>
        登录态失效
      </Tag>
    )
  ) : null

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            数据源设置
          </Title>
          <Text type="secondary">
            配置邮政内部采购系统的登录 Cookie，供本机采集服务只读访问订单数据。
          </Text>
        </div>
        {loginTag}
      </Flex>

      <Alert
        type="warning"
        showIcon
        title="Cookie 等同于登录凭据，请勿分享"
        description="Cookie 使用 AES-256-GCM 加密后保存在本机 data 目录，前端不会回显。采集过程只执行只读查询，不会修改目标系统的任何数据。"
      />

      <Card
        title={
          <Space>
            <LockOutlined />
            <span>登录凭据</span>
          </Space>
        }
        loading={loading}
        extra={
          <Space wrap>
            <Tag color={settings?.hasCookie ? 'success' : 'default'}>
              {settings?.hasCookie ? '已保存 Cookie' : '未配置 Cookie'}
            </Tag>
            {settings?.updatedAt && (
              <Text type="secondary">更新于 {formatDateTime(settings.updatedAt)}</Text>
            )}
          </Space>
        }
      >
        <Flex vertical gap={16}>
          <div>
            <Text strong>粘贴新的 Cookie</Text>
            <Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
              在浏览器登录目标系统后，打开开发者工具 → Network，任选一个
              order.php 请求，复制请求头里的完整 Cookie 值（需包含 ECSCP_ID）。
            </Paragraph>
            <Input.TextArea
              value={cookieInput}
              onChange={(event) => setCookieInput(event.target.value)}
              placeholder="ECSCP[page_size]=10; ...; ECSCP_ID=..."
              autoSize={{ minRows: 3, maxRows: 6 }}
              spellCheck={false}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              保存时不会回显旧 Cookie；粘贴新值并保存即可覆盖。
            </Text>
          </div>

          <Space wrap>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
              disabled={!cookieInput.trim()}
            >
              保存并检测
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={checking}
              onClick={handleCheck}
              disabled={!settings?.hasCookie}
            >
              检验登录态
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={handleClear} disabled={!settings?.hasCookie}>
              清除 Cookie
            </Button>
          </Space>

          {login && (
            <Alert
              type={login.valid ? 'success' : 'error'}
              showIcon
              title={login.valid ? '登录态检测通过' : '登录态检测未通过'}
              description={
                <Space direction="vertical" size={2}>
                  <Text>{login.message}</Text>
                  <Text type="secondary">
                    检测时间：{formatDateTime(login.checkedAt)}
                    {login.totalOrders != null
                      ? ` · 可访问订单 ${login.totalOrders.toLocaleString('zh-CN')} 单`
                      : ''}
                  </Text>
                </Space>
              }
            />
          )}
        </Flex>
      </Card>

      <Card title="采集参数">
        <Spin spinning={loading}>
          <Descriptions
            column={{ xs: 1, sm: 2 }}
            items={[
              { key: 'baseUrl', label: '目标系统地址', children: settings?.baseUrl ?? '-' },
              {
                key: 'concurrency',
                label: '详情并发数',
                children: settings ? `${settings.detailConcurrency} 路` : '-',
              },
              {
                key: 'interval',
                label: '请求间隔',
                children: settings ? `${settings.requestIntervalMs} ms` : '-',
              },
            ]}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            以上参数可通过环境变量调整：DSPT_DETAIL_CONCURRENCY、DSPT_REQUEST_INTERVAL_MS。
          </Text>
        </Spin>
      </Card>
    </Flex>
  )
}
