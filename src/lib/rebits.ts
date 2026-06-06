import { prisma } from "@/lib/prisma";
import { ensureDevUser } from "@/lib/bits";

/**
 * 현재(dev) 유저가 Bit를 Rebit한다.
 * 이미 Rebit한 경우 upsert로 멱등 처리한다 (중복 생성 없음).
 * 자기 글 Rebit도 허용한다 (차단 로직 없음, spec D3).
 */
export async function addRebit(bitId: string): Promise<void> {
  const user = await ensureDevUser();
  await prisma.rebit.upsert({
    where: { userId_bitId: { userId: user.id, bitId } },
    update: {},
    create: { userId: user.id, bitId },
  });
}

/**
 * 현재(dev) 유저의 Rebit를 취소한다.
 * deleteMany를 써서 Rebit가 없어도 에러 없이 no-op으로 끝낸다.
 */
export async function removeRebit(bitId: string): Promise<void> {
  const user = await ensureDevUser();
  await prisma.rebit.deleteMany({
    where: { userId: user.id, bitId },
  });
}
