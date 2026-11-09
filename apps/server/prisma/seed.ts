import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** A demo barbershop so the dashboard and a test call have something to work with. */
async function main() {
  const phoneNumber = process.env.SEED_PHONE_NUMBER ?? "+12015550100";
  const weekday = [["09:00", "18:00"]];

  const business = await db.business.upsert({
    where: { phoneNumber },
    update: {},
    create: {
      name: "Fade Factory Barbershop",
      phoneNumber,
      timezone: "America/New_York",
      greeting: "Thanks for calling Fade Factory, this is the front desk.",
      notes: "Walk-ins welcome but appointments get priority. Street parking on Broadway. Cash and card accepted.",
      hours: { mon: [], tue: weekday, wed: weekday, thu: [["09:00", "20:00"]], fri: [["09:00", "20:00"]], sat: [["08:00", "16:00"]], sun: [] },
      services: {
        create: [
          { name: "Haircut", durationMin: 30, priceCents: 3500 },
          { name: "Haircut and Beard", durationMin: 45, priceCents: 5000 },
          { name: "Beard Trim", durationMin: 15, priceCents: 1500 },
          { name: "Kids Cut", durationMin: 30, priceCents: 2500 },
        ],
      },
    },
  });
  console.log(`Seeded ${business.name} (${business.id}) on ${business.phoneNumber}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
