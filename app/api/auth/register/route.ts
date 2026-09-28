import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgName, email, password, fullName } = body;

    if (!orgName || !email || !password || !fullName) {
      return NextResponse.json(
        { error: "orgName, fullName, email, and password are required" },
        { status: 400 }
      );
    }

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create org + super_admin user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName },
      });
      const user = await tx.user.create({
        data: {
          tenantId: org.id,
          fullName,
          email,
          passwordHash,
          role: "super_admin",
        },
      });
      return { org, user };
    });

    const jwtPayload = {
      sub: result.user.id,
      tenantId: result.org.id,
      role: result.user.role,
      email: result.user.email,
      fullName: result.user.fullName,
    };

    const accessToken = await signAccessToken(jwtPayload);
    const refreshToken = await signRefreshToken(jwtPayload);

    const response = NextResponse.json(
      {
        user: {
          id: result.user.id,
          fullName: result.user.fullName,
          email: result.user.email,
          role: result.user.role,
          tenantName: result.org.name,
        },
      },
      { status: 201 }
    );

    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
