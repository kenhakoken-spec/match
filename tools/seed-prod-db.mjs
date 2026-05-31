// 本番Neon DBへ初期データを投入するワンショット seed（実DB用）。
// memory.ts の seed は in-memory 専用で実DBには効かないため別途用意。
// 使い方: DATABASE_URL=... DIRECT_URL=... node tools/seed-prod-db.mjs
//   - admin 1名（role=admin）
//   - 水/金/土 19:30 集合の「誰でもOK」枠を 恵比寿/池袋/銀座 に各1 ＋ 20代限定1 ＋ 優良バッジ限定1
// 冪等: Slot が既に1件以上あれば枠投入はスキップ（多重実行で増殖しない）。
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 指定曜日(0=日..6=土) JST hh:mm の「現在より未来で最も近い」UTC日時。
function nextWeekdayAtJst(weekday, hh, mm) {
  const JST = 9 * 60 * 60 * 1000;
  const now = Date.now();
  const jstNow = new Date(now + JST);
  let target =
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), hh, mm, 0, 0) - JST;
  const day = 24 * 60 * 60 * 1000;
  while (new Date(target + JST).getUTCDay() !== weekday || target <= now) target += day;
  return new Date(target);
}

async function main() {
  const out = { admin: null, slots: 0, skipped: false };

  const admin = await prisma.user.upsert({
    where: { lineUserId: "Uadmin0000000000000000000000seed" },
    update: { role: "admin" },
    create: {
      lineUserId: "Uadmin0000000000000000000000seed",
      displayName: "運営アドミン",
      role: "admin",
      status: "active",
    },
  });
  out.admin = admin.id;

  const existing = await prisma.slot.count();
  if (existing > 0) {
    out.skipped = true;
    console.log(JSON.stringify({ ...out, existingSlots: existing }));
    return;
  }

  const WED = 3, FRI = 5, SAT = 6;
  const slots = [
    { area: "ebisu", dt: nextWeekdayAtJst(WED, 19, 30), note: "水 19:30 恵比寿（誰でもOK）" },
    { area: "ikebukuro", dt: nextWeekdayAtJst(FRI, 19, 30), note: "金 19:30 池袋（誰でもOK）" },
    { area: "ginza", dt: nextWeekdayAtJst(SAT, 19, 30), note: "土 19:30 銀座（誰でもOK）" },
    { area: "ebisu", dt: nextWeekdayAtJst(FRI, 19, 30), note: "金 19:30 恵比寿（20代限定）", minAge: 20, maxAge: 29 },
    { area: "ginza", dt: nextWeekdayAtJst(SAT, 19, 30), note: "土 19:30 銀座（優良バッジ限定）", requiresBadge: true },
  ];
  for (const s of slots) {
    await prisma.slot.create({
      data: {
        datetimeStart: s.dt,
        area: s.area,
        capacityPerGender: 3,
        status: "open",
        minAge: s.minAge ?? null,
        maxAge: s.maxAge ?? null,
        requiresBadge: s.requiresBadge ?? false,
        feeMale: 2000,
        note: s.note,
      },
    });
    out.slots++;
  }
  console.log(JSON.stringify(out));
}

main()
  .catch((e) => { console.error("SEED_ERR " + String(e.message || e).split("\n")[0]); process.exit(1); })
  .finally(() => prisma.$disconnect());
