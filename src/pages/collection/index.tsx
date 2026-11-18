import {
  CloudDownloadOutlined,
  DatabaseOutlined,
  ImportOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Empty, Flex, Space, Steps, Tag, Typography } from 'antd'

const { Title, Text } = Typography

/** 采集流程占位配置：采集方式确定后再补充各步骤的交互逻辑 */
const COLLECT_STEPS = [
  {
    title: '配置数据源',
    content: '确定采集渠道（接口 / 文件 / 页面）',
    icon: <SettingOutlined />,
  },
  {
    title: '获取订单数据',
    content: '按企业维度拉取采购订单',
    icon: <CloudDownloadOutlined />,
  },
  {
    title: '数据校验',
    content: '字段完整性与金额一致性检查',
    icon: <SafetyCertificateOutlined />,
  },
  {
    title: '写入订单库',
    content: '去重后落库并进入待处理队列',
    icon: <DatabaseOutlined />,
  },
]

/** 采购订单采集页（占位）：展示规划中的采集流程与入口 */
export default function CollectionPage() {
  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            采购订单采集
          </Title>
          <Text type="secondary">配置采集渠道，将企业采购订单统一汇聚到工作台。</Text>
        </div>
        <Tag color="processing">规划中</Tag>
      </Flex>

      <Alert
        type="info"
        showIcon
        title="采集功能正在建设中"
        description="当前为占位页面。采集方式（接口对接 / 文件导入 / 页面抓取）将在需求确认后实现，届时在此页面完成配置与执行。"
      />

      <Card title="采集流程">
        <Steps items={COLLECT_STEPS} />
      </Card>

      <Card title="采集入口">
        <Flex vertical align="center" gap={16} style={{ padding: '32px 0' }}>
          <Empty description="采集入口待开发，敬请期待" />
          <Space wrap>
            <Button type="primary" icon={<CloudDownloadOutlined />} disabled>
              开始采集
            </Button>
            <Button icon={<ImportOutlined />} disabled>
              导入 Excel
            </Button>
            <Button icon={<SettingOutlined />} disabled>
              配置数据源
            </Button>
          </Space>
          <Text type="secondary">按钮当前为占位状态，功能上线后启用。</Text>
        </Flex>
      </Card>
    </Flex>
  )
}
