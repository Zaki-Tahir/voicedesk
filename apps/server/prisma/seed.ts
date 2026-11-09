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

  if (process.argv.includes("--demo")) await seedDemoActivity(business.id);
}

/** Sample calls and bookings so the dashboard isn't empty in a demo. Times are relative to now. */
async function seedDemoActivity(businessId: string) {
  if ((await db.call.count({ where: { businessId } })) > 0) return console.log("Demo activity already present");

  const services = await db.service.findMany({ where: { businessId } });
  const svc = (name: string) => services.find((s) => s.name === name)!;
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  const daysAhead = (d: number, hour: number, minute = 0) => {
    const t = new Date();
    t.setDate(t.getDate() + d);
    t.setHours(hour, minute, 0, 0);
    return t;
  };
  const line = (role: "caller" | "agent", text: string, at: Date) => ({ role, text, at: at.toISOString() });

  const demos = [
    {
      from: "+12015550143",
      start: minutesAgo(42),
      seconds: 96,
      summary: "Marcus Reed booked a haircut and beard for Thursday at 5:30 PM.",
      transcript: [
        ["agent", "Thanks for calling Fade Factory, this is the front desk. How can I help?"],
        ["caller", "Hey, can I get a cut and beard this week, ideally after work?"],
        ["agent", "Sure. Thursday we're open until eight. I have five thirty or six fifteen. Do either work?"],
        ["caller", "Five thirty is perfect."],
        ["agent", "Great, can I get your first and last name?"],
        ["caller", "Marcus Reed."],
        ["agent", "Got it, Marcus: haircut and beard, Thursday at five thirty. Shall I book it?"],
        ["caller", "Yes please."],
        ["agent", "You're all set. You'll get a text confirmation in a moment. See you Thursday!"],
      ],
      booking: { service: "Haircut and Beard", name: "Marcus Reed", at: daysAhead(3, 17, 30) },
    },
    {
      from: "+19735550188",
      start: minutesAgo(130),
      seconds: 41,
      summary: "Caller asked about parking and whether walk-ins are accepted. No booking.",
      transcript: [
        ["agent", "Thanks for calling Fade Factory, this is the front desk. How can I help?"],
        ["caller", "Do you take walk-ins? And is there parking?"],
        ["agent", "Walk-ins are welcome, though appointments get priority. There's street parking on Broadway."],
        ["caller", "Cool, thanks."],
      ],
    },
    {
      from: "+12015550121",
      start: minutesAgo(60 * 26),
      seconds: 118,
      summary: "Priya Shah booked a kids cut for her son on Saturday at 10:00 AM.",
      transcript: [
        ["agent", "Thanks for calling Fade Factory, this is the front desk. How can I help?"],
        ["caller", "I'd like to book a kids cut for my son on Saturday morning."],
        ["agent", "Saturday morning I have ten o'clock or ten thirty. Which is better?"],
        ["caller", "Ten works. The name is Priya Shah."],
        ["agent", "Booked: kids cut on Saturday at ten under Priya Shah. You'll get a text shortly."],
      ],
      booking: { service: "Kids Cut", name: "Priya Shah", at: daysAhead(5, 10) },
    },
  ] as const;

  for (const d of demos) {
    const end = new Date(d.start.getTime() + d.seconds * 1000);
    const step = (d.seconds * 1000) / d.transcript.length;
    const call = await db.call.create({
      data: {
        businessId,
        twilioSid: `CA_demo_${d.from.slice(-4)}`,
        fromNumber: d.from,
        status: "COMPLETED",
        startedAt: d.start,
        endedAt: end,
        summary: d.summary,
        transcript: d.transcript.map(([role, text], i) => line(role, text, new Date(d.start.getTime() + i * step))),
      },
    });
    if ("booking" in d) {
      const service = svc(d.booking.service);
      await db.appointment.create({
        data: {
          businessId,
          serviceId: service.id,
          callId: call.id,
          customerName: d.booking.name,
          customerPhone: d.from,
          startsAt: d.booking.at,
          endsAt: new Date(d.booking.at.getTime() + service.durationMin * 60_000),
          status: "CONFIRMED",
        },
      });
    }
  }
  console.log(`Added ${demos.length} demo calls`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
