// 获取广告
// 基于逆向网易云音乐 v9.5.45 RN Hermes 源码:
//   - adService.getAd() → Network.nativeRequest → /api/ad/get
//   - 需要 X-antiCheatToken 易盾反作弊头
//   - 使用 xeapi 加密
//
// 返回 extra.reqId 可用于 ad_listening_rights_gain 的 reqUid
//
const createOption = require('../util/option.js')

module.exports = async (query, request) => {
  const data = {
    type_ids: query.type_ids || '["400002_0"]',
  }

  const option = createOption(query, 'xeapi')
  option.checkToken = true

  const res = await request(`/api/ad/get`, data, option)
  const raw = res.body

  // 提取广告中的 req_id (用于领取权益)
  let reqId = ''
  try {
    if (raw?.ads) {
      const ad = Object.values(raw.ads)[0]
      if (ad?.extJson) {
        const ext = JSON.parse(ad.extJson)
        reqId = ext?.contextInfo?.req_id || ''
      }
    }
  } catch (_) {}

  return {
    status: 200,
    body: {
      code: 200,
      ads: raw?.ads || null,
      message: raw?.message || null,
      extra: { reqId },
    },
  }
}
