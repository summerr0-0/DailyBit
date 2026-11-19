import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

// 오너 세션 토큰 — HMAC 서명 + 만료.
// 이전에는 쿠키 값이 "1"인지만 봐서 누구나 `db_auth=1`을 넣으면 오너가 됐다.
// 키는 ADMIN_PASSPHRASE에서 파생한다: 별도 시크릿 없이 동작하고, 패스프레이즈를 바꾸면 기존 세션이 모두 무효가 된다.
// 상태 없는 토큰이라 로그아웃은 브라우저 쿠키만 지운다 — 탈취가 의심되면 패스프레이즈를 바꿔 전체 무효화.

export const SESSION_COOKIE = "db_auth";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;
const VERSION = "v1";

// scrypt로 키를 늘려, 쿠키가 유출돼도 서명으로 패스프레이즈를 오프라인 대입하기 비싸게 만든다.
// 패스프레이즈별로 한 번만 계산해 캐시한다 (요청마다 scrypt를 돌리지 않음).
const keyCache = new Map<string, Buffer>();
function key(passphrase: string): Buffer {
  let k = keyCache.get(passphrase);
  if (!k) {
    k = scryptSync(passphrase, "dailybit-owner-session-v1", 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    keyCache.clear();
    keyCache.set(passphrase, k);
  }
  return k;
}

function sign(payload: string, passphrase: string): string {
  return createHmac("sha256", key(passphrase)).update(payload).digest("base64url");
}

/** `v1.<만료 epoch초>.<서명>` */
export function createSessionToken(passphrase: string, now: Date = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + SESSION_MAX_AGE_SEC;
  const payload = `${VERSION}.${exp}`;
  return `${payload}.${sign(payload, passphrase)}`;
}

export function verifySessionToken(
  token: string | undefined,
  passphrase: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!token || !passphrase) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION || !/^\d+$/.test(parts[1])) return false;

  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, passphrase));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

  return Number(parts[1]) > Math.floor(now.getTime() / 1000);
}
