import { getSignedCookies } from '@aws-sdk/cloudfront-signer';
import { env } from '../config/env.js';

/**
 * HLS playback = one playlist + hundreds of segments, so we use CloudFront *signed cookies*
 * (one signature covers the whole prefix) instead of per-URL signed URLs.
 *
 * The custom policy limits the cookies to hls/<lessonId>/* – a student who may watch lesson A
 * cannot use the same cookies to fetch lesson B, nor the raw uploads under raw/*.
 */
export function signedCookiesForPrefix(prefix) {
  const { domain, keyPairId, privateKey, cookieTtlSec } = env.cloudfront;
  const expires = Math.floor(Date.now() / 1000) + cookieTtlSec;
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: `https://${domain}/${prefix}*`,
        Condition: { DateLessThan: { 'AWS:EpochTime': expires } },
      },
    ],
  });
  return { cookies: getSignedCookies({ keyPairId, privateKey, policy }), expires };
}
