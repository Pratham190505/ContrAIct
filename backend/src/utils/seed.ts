// Run: npm run db:seed
// Seeds a test user so you can log in immediately during dev

import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db";

async function seed() {
  console.log("🌱 Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      name: "Test User",
      email: "test@example.com",
      passwordHash,
    },
  });

  console.log(`✅ Seed user created: ${user.email}`);
  console.log(`   Password: password123`);
  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
