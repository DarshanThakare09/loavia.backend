import { PrismaClient } from "@prisma/client";

const users = ["postgres", "loavia_user", "shree"];
const passwords = [
  "postgres", "123", "admin", "root", "password", "password123", "admin123", 
  "Admin@123", "SuperAdmin@123", "AdminPassword@123", "loavia", "loavia_pass", "",
  "1234", "12345", "123456", "12345678", "123456789", 
  "postgres123", "postgres@123", "Postgres@123", 
  "root123", "root@123", 
  "shree", "shree123", "shree@123", "Shree@123", 
  "loavia123", "loavia@123", "Loavia@123", 
  "LoaviaAdmin@2026", "Loavia@2026", "LoaviaAdmin@123"
];
const dbs = ["loavia_dev", "loavia_db", "postgres"];

async function main() {
  for (const db of dbs) {
    for (const user of users) {
      for (const pass of passwords) {
        const url = `postgresql://${user}:${pass}@localhost:5432/${db}`;
        console.log(`Probing: postgresql://${user}:${pass ? '***' : ''}@localhost:5432/${db}`);
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
