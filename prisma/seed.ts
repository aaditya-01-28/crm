import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Textora Engage database...");

  // 1. Create organization
  const org = await prisma.organization.upsert({
    where: { subdomain: "textora-internal" },
    update: {},
    create: {
      name: "Textora Technologies Pvt Ltd",
      subdomain: "textora-internal",
      planTier: "internal",
    },
  });
  console.log(`✅ Organization: ${org.name} (${org.id})`);

  // 2. Create users
  const users = [
    {
      fullName: "Aaditya (Admin)",
      email: "aaditya@textorasms.com",
      password: "Admin@1234",
      role: "super_admin",
      phoneNumber: "9902101007",
    },
    {
      fullName: "Sales Manager",
      email: "manager@textorasms.com",
      password: "Manager@1234",
      role: "sales_manager",
    },
    {
      fullName: "Sales Rep 1",
      email: "rep1@textorasms.com",
      password: "Rep@1234",
      role: "sales_rep",
    },
    {
      fullName: "Sales Rep 2",
      email: "rep2@textorasms.com",
      password: "Rep@1234",
      role: "sales_rep",
    },
    {
      fullName: "Accounts Ops",
      email: "accounts@textorasms.com",
      password: "Accounts@1234",
      role: "accounts_ops",
    },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        tenantId: org.id,
        fullName: u.fullName,
        email: u.email,
        passwordHash: hash,
        role: u.role,
        phoneNumber: u.phoneNumber || null,
      },
    });
    console.log(`✅ User: ${user.fullName} <${user.email}> [${user.role}]`);
  }

  // 3. Create some sample leads for the dialer
  const repUser = await prisma.user.findUnique({
    where: { email: "rep1@textorasms.com" },
  });

  if (repUser) {
    const sampleLeads = [
      {
        phoneNumber: "9876543210",
        contactName: "Rajesh Kumar",
        companyName: "HealthPlus Pathlab",
        businessVertical: "Pathlab",
        source: "Vendor Cold List",
      },
      {
        phoneNumber: "9988776655",
        contactName: "Priya Sharma",
        companyName: "GreenLeaf Realty",
        businessVertical: "Real Estate",
        source: "Vendor Cold List",
      },
      {
        phoneNumber: "9123456780",
        contactName: "Amit Patel",
        companyName: "FitZone Gym",
        businessVertical: "Gym",
        source: "Vendor Cold List",
      },
      {
        phoneNumber: "9000112233",
        contactName: "Neha Singh",
        companyName: "StudyPro EdTech",
        businessVertical: "EdTech",
        source: "Inbound Inquiry",
      },
      {
        phoneNumber: "9555667788",
        companyName: "QuickMart Retail",
        businessVertical: "Retail",
        source: "Vendor Cold List",
      },
    ];

    for (const lead of sampleLeads) {
      await prisma.lead.upsert({
        where: {
          idx_leads_phone: { phoneNumber: lead.phoneNumber },
        } as never,
        update: {},
        create: {
          tenantId: org.id,
          assignedRepId: repUser.id,
          ...lead,
          status: "new",
        },
      }).catch(async () => {
        // upsert by phone not supported — try create
        const existing = await prisma.lead.findFirst({
          where: { tenantId: org.id, phoneNumber: lead.phoneNumber },
        });
        if (!existing) {
          await prisma.lead.create({
            data: {
              tenantId: org.id,
              assignedRepId: repUser.id,
              ...lead,
              status: "new",
            },
          });
        }
      });
    }
    console.log(`✅ Created ${sampleLeads.length} sample leads`);
  }

  console.log("\n🎉 Seed complete!");
  console.log("\n📋 Login credentials:");
  console.log("  Admin:    aaditya@textorasms.com  / Admin@1234");
  console.log("  Manager:  manager@textorasms.com  / Manager@1234");
  console.log("  Rep 1:    rep1@textorasms.com     / Rep@1234");
  console.log("  Rep 2:    rep2@textorasms.com     / Rep@1234");
  console.log("  Accounts: accounts@textorasms.com / Accounts@1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
