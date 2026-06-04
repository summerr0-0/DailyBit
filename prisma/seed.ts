import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "dev@dailybit.dev" },
    update: {},
    create: {
      email: "dev@dailybit.dev",
      nickname: "devuser",
      bio: "DailyBit 개발용 시드 계정",
    },
  });

  await prisma.bit.createMany({
    data: [
      {
        content: "첫 번째 Bit입니다. #dailybit #개발",
        tags: ["dailybit", "개발"],
        authorId: user.id,
      },
      {
        content: "두 번째 Bit. 오늘도 코딩 중. #일상",
        tags: ["일상"],
        authorId: user.id,
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
