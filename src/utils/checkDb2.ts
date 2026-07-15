import { PrismaClient } from "@prisma/client";

const users = ["postgres", "loavia_user"];
const passwords = ["postgres", "123", "admin", "root", "password", "password123", "admin123", "Admin@123", "SuperAdmin@123", "AdminPassword@123", "loavia", "loavia_pass", ""];
const dbs = ["loavia_dev", "loavia_db", "postgres"];

async function main() {
  for (const db of dbs) {
    for (const user of users) {
      for (const pass of passwords) {
        const url = `postgresql://${user}:${pass}@localhost:5432/${db}`;
        console.log(`Probing: postgresql://${user}:***@localhost:5432/${db}`);
        const prisma = new PrismaClient({
          datasources: {
            db: {
              url: url
            }
          }
        });

        try {
          await prisma.$connect();
          console.log(`🎉 SUCCESS: Connected using postgresql://${user}:${pass}@localhost:5432/${db}`);
          const usersList = await prisma.user.findMany({
            select: { id: true, email: true, role: true }
          });
          console.log("Users in DB:", usersList);
          await prisma.$disconnect();
          return;
        } catch (err: any) {
          await prisma.$disconnect();
        }
      }
    }
  }
  console.log("All connection attempts failed.");
}

main();
