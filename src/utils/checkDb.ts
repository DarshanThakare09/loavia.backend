import { PrismaClient } from "@prisma/client";

const urls = [
  "postgresql://postgres:123@localhost:5432/loavia_dev",
  "postgresql://postgres:postgres@localhost:5432/loavia_dev",
  "postgresql://postgres:admin@localhost:5432/loavia_dev",
  "postgresql://postgres:root@localhost:5432/loavia_dev",
  "postgresql://postgres:@localhost:5432/loavia_dev",
  "postgresql://postgres:123@localhost:5432/loavia_db",
  "postgresql://postgres:postgres@localhost:5432/loavia_db",
  "postgresql://postgres:admin@localhost:5432/loavia_db",
  "postgresql://postgres:root@localhost:5432/loavia_db",
  "postgresql://postgres:@localhost:5432/loavia_db",
  "postgresql://loavia_user:loavia_pass@localhost:5432/loavia_db",
  "postgresql://loavia_user:loavia_pass@localhost:5432/loavia_dev",
];

async function main() {
  for (const url of urls) {
    console.log(`Probing: ${url}...`);
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: url
        }
      }
    });

    try {
      await prisma.$connect();
      console.log(`🎉 SUCCESS: Connected using ${url}`);
      const users = await prisma.user.findMany({
        select: { id: true, email: true, role: true }
      });
      console.log("Users in DB:", users);
      await prisma.$disconnect();
      return;
    } catch (err: any) {
      console.log(`❌ FAILED: ${err.message?.split('\n')[0]}`);
      await prisma.$disconnect();
    }
  }
  console.log("All connection attempts failed.");
}

main();
