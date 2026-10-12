import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const role = request.headers.get("x-user-role")!;

  if (!["super_admin", "sales_manager"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
      role: true,
      language: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          assignedLeads: true,
          callLogs: true,
          deals: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const role = request.headers.get("x-user-role")!;

  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { fullName, email, password, role: userRole, phoneNumber } = body;

    if (!fullName || !email || !password || !userRole) {
      return NextResponse.json(
        { error: "fullName, email, password, and role are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName,
        email,
        passwordHash,
        role: userRole,
        phoneNumber: phoneNumber || null,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("[TEAM POST]", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
