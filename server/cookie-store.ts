import crypto from 'node:crypto'
import fs from 'node:fs'
import { config } from './config'
import { deleteSetting, getSetting, setSetting, type Db } from './db'

const COOKIE_KEY = 'dspt_cookie'
const COOKIE_TIME_KEY = 'dspt_cookie_updated_at'

function loadKey(): Buffer {
  if (fs.existsSync(config.secretPath)) {
    const raw = fs.readFileSync(config.secretPath, 'utf8').trim()
    const key = Buffer.from(raw, 'base64')
    if (key.length !== 32) throw new Error('Cookie 加密密钥文件损坏，请删除 data/.cookie-secret 后重新保存 Cookie')
    return key
  }
  const key = crypto.randomBytes(32)
  fs.writeFileSync(config.secretPath, key.toString('base64'), { mode: 0o600 })
  return key
}

export function encryptText(plain: string): string {
  const key = loadKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptText(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Cookie 密文格式不正确')
  const key = loadKey()
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const encrypted = Buffer.from(parts[3], 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function normalizeCookie(input: string): string {
  const cookie = input
    .replace(/^Cookie:\s*/i, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
  if (!cookie) throw new Error('Cookie 不能为空')
  const names = cookie
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.slice(0, Math.max(0, part.indexOf('='))).trim())
    .filter(Boolean)
  if (!names.includes('ECSCP_ID')) {
    throw new Error('Cookie 中缺少 ECSCP_ID，请从浏览器完整复制')
  }
  return cookie
}

export function saveCookie(db: Db, input: string) {
  const cookie = normalizeCookie(input)
  setSetting(db, COOKIE_KEY, encryptText(cookie))
  setSetting(db, COOKIE_TIME_KEY, new Date().toISOString())
}

export function getCookie(db: Db): string | null {
  const encrypted = getSetting(db, COOKIE_KEY)
  if (!encrypted) return null
  try {
    return decryptText(encrypted)
  } catch {
    return null
  }
}

export function clearCookie(db: Db) {
  deleteSetting(db, COOKIE_KEY)
  deleteSetting(db, COOKIE_TIME_KEY)
}

export function cookieStatus(db: Db) {
  const updatedAt = getSetting(db, COOKIE_TIME_KEY)
  return {
    hasCookie: Boolean(getSetting(db, COOKIE_KEY)),
    updatedAt,
  }
}
