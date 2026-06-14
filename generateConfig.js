const fs = require('fs')
const path = require('path')
const { register_anonimous } = require('./main')
const { cookieToJson, generateRandomChineseIP } = require('./util/index')
const { getXeapiPublicKey } = require('./util/xeapiKey')
const tmpPath = require('os').tmpdir()
const logger = require('./util/logger')

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(err) {
  const msg = (err && err.message) || ''
  const status =
    (err && err.status) || (err && err.response && err.response.status)
  if (
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('socket hang up') ||
    msg.includes('request timeout') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('Network')
  ) {
    return true
  }
  if (status && status >= 500) {
    return true
  }
  return false
}

/** @returns {{ success: boolean, error?: Error }} */
async function fetchAnonymousToken() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await register_anonimous()
      const cookie = res.body.cookie
      if (cookie) {
        const cookieObj = cookieToJson(cookie)
        fs.writeFileSync(
          path.resolve(tmpPath, 'anonymous_token'),
          cookieObj.MUSIC_A,
          'utf-8',
        )
        logger.success('[generateConfig] 匿名 token 注册成功')
        return { success: true }
      }
      // 返回了但没有 cookie，视为异常但不再重试
      logger.warn(
        `[generateConfig] 匿名注册返回了空 cookie (attempt ${attempt})`,
      )
      return {
        success: false,
        error: new Error('empty cookie from anonymous register'),
      }
    } catch (err) {
      if (isRetryableError(err) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        logger.warn(
          `[generateConfig] 获取匿名 token 失败 (attempt ${attempt}/${MAX_RETRIES}), ${delay}ms 后重试...`,
        )
        await sleep(delay)
        continue
      }
      // 不可重试 或 已达最大次数
      if (attempt >= MAX_RETRIES) {
        logger.error(
          `[generateConfig] 获取匿名 token 已达最大重试次数 (${MAX_RETRIES}):`,
          err.message,
        )
      } else {
        logger.error(
          `[generateConfig] 获取匿名 token 失败 (不可重试):`,
          err.message,
        )
      }
      return { success: false, error: err }
    }
  }
  return { success: false, error: new Error('unreachable') }
}

/**
 * 获取 xeapi public key，带重试
 * @returns {{ success: boolean, error?: Error }}
 */
async function fetchXeapiPublicKey() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      let currentPublicKey = {}
      try {
        currentPublicKey = JSON.parse(
          fs.readFileSync(path.resolve(tmpPath, 'xeapi_public_key'), 'utf-8'),
        )
      } catch (_) {
        // 本地无缓存文件，用空对象正常请求
      }
      const publicKey = await getXeapiPublicKey(
        currentPublicKey,
        global.deviceId,
      )
      fs.writeFileSync(
        path.resolve(tmpPath, 'xeapi_public_key'),
        JSON.stringify(publicKey),
        'utf-8',
      )
      logger.success('[generateConfig] xeapi public key 获取成功')
      return { success: true }
    } catch (err) {
      if (isRetryableError(err) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        logger.warn(
          `[generateConfig] 获取 xeapi public key 失败 (attempt ${attempt}/${MAX_RETRIES}), ${delay}ms 后重试...`,
        )
        await sleep(delay)
        continue
      }
      if (attempt >= MAX_RETRIES) {
        logger.error(
          `[generateConfig] 获取 xeapi public key 已达最大重试次数 (${MAX_RETRIES}):`,
          err.message,
        )
      } else {
        logger.error(
          `[generateConfig] 获取 xeapi public key 失败 (不可重试):`,
          err.message,
        )
      }
      return { success: false, error: err }
    }
  }
  return { success: false, error: new Error('unreachable') }
}

/**
 * 生成配置（匿名 token + xeapi public key），带容错重试
 * @returns {{ tokenOk: boolean, keyOk: boolean }}
 */
async function generateConfig() {
  global.cnIp = generateRandomChineseIP()

  // 两个任务并行执行，互不影响喵~
  const [tokenResult, keyResult] = await Promise.all([
    fetchAnonymousToken(),
    fetchXeapiPublicKey(),
  ])

  if (!tokenResult.success) {
    logger.warn('[generateConfig] 匿名 token 获取失败')
  }
  if (!keyResult.success) {
    logger.warn('[generateConfig] xeapi public key 获取失败')
  }

  if (tokenResult.success && keyResult.success) {
    logger.success('[generateConfig] 配置初始化完成')
  }

  return {
    tokenOk: tokenResult.success,
    keyOk: keyResult.success,
  }
}
module.exports = generateConfig
