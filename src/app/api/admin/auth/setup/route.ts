import { NextResponse } from "next/server";
import {
  adminSetupAvailable,
  createAdminSession,
  createFirstAdmin,
} from "@/lib/admin-auth";
import { ensureCmsSeed } from "@/lib/cms";

export async function GET() {
  return NextResponse.json({ available: await adminSetupAvailable() });
}

export async function POST(req: Request) {
  try {
    const { name, email, password, confirmPassword } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }
    const user = await createFirstAdmin({ name, email, password });
    await ensureCmsSeed();
    await createAdminSession(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed." },
      { status: 400 },
    );
  }
}
