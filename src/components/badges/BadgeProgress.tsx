import type { BadgeProgressDTO } from "@/app/_lib/api-badge";
import { PREMIUM_CRITERIA } from "@/app/_lib/api-badge";

// 優良バッジ 未取得時の進捗表示 (design-system §4.7 E / §8)。
//   - 事実の進捗のみ。「高評価の参加 N/M 回」のように現状を淡々と示す。
//   - FOMO / 煽り / カウントダウン演出はしない (信頼感重視)。
//   - 状態は色だけに頼らず、ドット形状 (●=達成分 / ○=残り) + ラベル文字で表す (§1.6)。
//   - trust 系の控えめなトーン。金ピカ・グラデ・光彩は使わない。
//
// 進捗の各行: ラベル + 現在値/目標 + 達成/未達成のドット列。
// 達成済みの基準には小さな「達成」マークを付す (responsibility: 静かに伝える)。

// ドット列を「達成済みは ● / 残りは ○」で描く。比率は現在値/目標でクランプ。
function DotMeter({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const filled = Math.max(0, Math.min(target, Math.round(current)));
  const dots = Array.from({ length: target }, (_, i) => i < filled);
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {dots.map((on, i) => (
        <span
          key={i}
          className={[
            "text-[11px] leading-none",
            on ? "text-trust-600" : "text-line-200",
          ].join(" ")}
        >
          {on ? "●" : "○"}
        </span>
      ))}
    </span>
  );
}

function ProgressRow({
  label,
  currentText,
  current,
  target,
  met,
  showDots = true,
}: {
  label: string;
  currentText: string;
  current: number;
  target: number;
  met: boolean;
  showDots?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 font-sans text-[13px] text-ink-700">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {showDots ? <DotMeter current={current} target={target} /> : null}
        <span className="font-sans text-[13px] tabular-nums text-ink-700">
          {currentText}
        </span>
        {met ? (
          <span className="font-sans text-[11px] font-semibold text-trust-600">
            達成
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function BadgeProgress({
  progress,
  "data-testid": testId,
}: {
  progress: BadgeProgressDTO;
  "data-testid"?: string;
}) {
  const { ratingAvg, ratingCount, attendedCount, remaining } = progress;
  const c = PREMIUM_CRITERIA;

  return (
    <div
      data-testid={testId}
      className="rounded-md border border-line-200 bg-bg-surface p-4"
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-[12px] text-trust-600">
          {"◆"}
        </span>
        <h3 className="font-sans text-[14px] font-bold text-ink-900">
          優良バッジまであと少し
        </h3>
      </div>
      <p className="mt-1 font-sans text-[12px] leading-relaxed text-ink-500">
        高評価での参加を重ねた方にお渡ししています。現在の状況です。
      </p>

      <ul className="mt-2 divide-y divide-line-100">
        {/* 高評価の参加回数 (attendedCount / 2) — 主役の事実進捗。 */}
        <ProgressRow
          label="高評価での参加"
          currentText={`${attendedCount}/${c.attendedCount}回`}
          current={attendedCount}
          target={c.attendedCount}
          met={remaining.attendedCount <= 0}
        />
        {/* 評価の件数 (ratingCount / 5)。 */}
        <ProgressRow
          label="受け取った評価"
          currentText={`${ratingCount}/${c.ratingCount}件`}
          current={ratingCount}
          target={c.ratingCount}
          met={remaining.ratingCount <= 0}
        />
        {/* 平均評価は連続値なのでドットを出さず、数値 + 達成可否のみ (誤解防止)。 */}
        <ProgressRow
          label="平均評価"
          currentText={`${ratingAvg.toFixed(1)} / ${c.ratingAvg.toFixed(1)}`}
          current={ratingAvg}
          target={c.ratingAvg}
          met={remaining.ratingAvg <= 0}
          showDots={false}
        />
      </ul>
    </div>
  );
}
