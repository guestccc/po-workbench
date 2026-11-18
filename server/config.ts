import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.resolve(here, '..')

export const dataDir = process.env.PO_WORKBENCH_DATA_DIR
  ? path.resolve(process.env.PO_WORKBENCH_DATA_DIR)
  : path.join(projectRoot, 'data')

fs.mkdirSync(dataDir, { recursive: true })

export const config = {
  port: Number(process.env.PO_WORKBENCH_PORT || 8787),
  host: process.env.PO_WORKBENCH_HOST || '127.0.0.1',
  dbPath: process.env.PO_WORKBENCH_DB || path.join(dataDir, 'workbench.db'),
  secretPath: path.join(dataDir, '.cookie-secret'),
  dsptBaseUrl: process.env.DSPT_BASE_URL || 'https://dspt.gdwyj.cn:14443/mobile/backend/',
  userAgent:
    process.env.DSPT_USER_AGENT ||
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  /** 列表页默认请求间隔，避免对目标系统造成压力 */
  requestIntervalMs: Number(process.env.DSPT_REQUEST_INTERVAL_MS || 350),
  /** 详情全量并发数，默认 2；可通过环境变量调整 */
  detailConcurrency: Math.max(1, Math.min(4, Number(process.env.DSPT_DETAIL_CONCURRENCY || 2))),
}

export function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true })
}
