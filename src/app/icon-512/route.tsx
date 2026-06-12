import { ImageResponse } from "next/og";
import { checkCardIcon } from "@/lib/pwaIcon";

const SIZE = 512;

export async function GET() {
  return new ImageResponse(checkCardIcon(SIZE), { width: SIZE, height: SIZE });
}
