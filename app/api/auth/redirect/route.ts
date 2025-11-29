import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");

    // Default to frontend home
    let target = process.env.FRONTEND_URL || "http://localhost:3000";

    if (error) {
        target += `?error=${encodeURIComponent(error)}`;
    }

    // If we are here for signIn (which shouldn't happen often as we initiate from frontend), send to frontend

    return NextResponse.redirect(target);
}
