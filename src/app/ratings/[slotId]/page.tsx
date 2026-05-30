"use client";

// U-15 相互評価（1イベント分・S8 3軸 + ドタキャン報告）— wireframes.md U-15, design-system §4.7 D / §8。
// 同席した相手を **3軸の星（また会いたい / 会話 / マナー 各1〜5）** ＋ 任意コメントで評価し、
// 各人を POST /api/ratings で送信する（spec 要望4）。各同席者に「来なかった」報告も付けられる（要望5）。
//
// 設計の肝（誠実・安心 / 煽らない）:
// - 先頭に caption で「任意です／相手に個別開示されません／運営のみ確認」を明示（§4.7 D / §6）。
// - 星はタップ44pt+・accent.500、色のみに依存せず点数ラベル併記（StarInput / §5）。3軸とも同じ作法。
// - ランキング/競争/「また会いたい人を選ぼう！」等の煽り・FOMO は出さない（§8）。
// - 「来なかった」報告は事実ベースの控えめ表現。罰金は煽らず、対象になる旨だけ静かに添える（要望5）。
// - 送信後は received サマリ（3軸）を取得して静かに反映（煽らない）。
// - 409(二重)/400(範囲外)/403(非同席) は責めない日本語に変換して該当カードに表示。
//
// 同席者リストは GET /api/ratings/pending（未評価の人だけ残る）から該当 slot を引く。
// done を作る導線が無い MOCK 環境でも FALLBACK で画面が成立する。

import { use, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState, LoadingState } from "@/components/States";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Surface";
import { CheckboxRow } from "@/components/ui/Consent";
import { TextArea } from "@/components/ui/Field";
import { StarInput, MultiAxisSummary } from "@/components/ui/Stars";
import {
  fetchPendingRatings,
  fetchReceivedSummary,
  ratingErrorMessage,
  submitRating,
  type PendingMemberDTO,
  type PendingRatingDTO,
  type ReceivedSummary,
} from "@/app/_lib/api-rating";
import { formatDateShort, formatTime } from "@/app/_lib/datetime";
import { areaLabel } from "@/app/_lib/slots-ui";

const COMMENT_MAX = 300;

// 1名分のローカル入力状態（S8: 3軸 + no-show 報告）。
interface MemberDraft {
  scoreAgain: number; // 0 = 未選択
  scoreTalk: number;
  scoreManner: number;
  noShow: boolean; // この方は来なかった、の報告
  comment: string;
  sending: boolean;
  done: boolean; // 送信成功
  error: string | null; // ユーザー向け文言
}

function emptyDraft(): MemberDraft {
  return {
    scoreAgain: 0,
    scoreTalk: 0,
    scoreManner: 0,
    noShow: false,
    comment: "",
    sending: false,
    done: false,
    error: null,
  };
}

// 通常評価として送れる状態か（3軸すべてに星が付いている）。
function axesComplete(d: MemberDraft): boolean {
  return d.scoreAgain >= 1 && d.scoreTalk >= 1 && d.scoreManner >= 1;
}

export default function RatingDetailPage({
  params,
}: {
  params: Promise<{ slotId: string }>;
}) {
  const { slotId } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [event, setEvent] = useState<PendingRatingDTO | null>(null);

  // 同席者ごとの入力。userId をキーに。
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({});
  // 送信反映後の自分の受領サマリ（3軸・誠実に「ありがとうございます」と共に静かに表示）。
  const [summary, setSummary] = useState<ReceivedSummary | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const pending = await fetchPendingRatings();
      const found = pending.find((p) => p.slotId === slotId) ?? null;
      setEvent(found);
      if (found) {
        const init: Record<string, MemberDraft> = {};
        for (const m of found.members) init[m.userId] = emptyDraft();
        setDrafts(init);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotId]);

  function patchDraft(userId: string, patch: Partial<MemberDraft>) {
    setDrafts((prev) => ({ ...prev, [userId]: { ...prev[userId], ...patch } }));
  }

  // 送信できる状態か（3軸そろっている、または「来なかった」報告がある）。
  function isSendable(d: MemberDraft | undefined): boolean {
    if (!d || d.done || d.sending) return false;
    return axesComplete(d) || d.noShow;
  }

  async function sendOne(member: PendingMemberDTO) {
    const draft = drafts[member.userId];
    if (!draft || !isSendable(draft)) return;
    patchDraft(member.userId, { sending: true, error: null });

    // 「来なかった」報告だけで星が未選択のときは、評価軸を送らないと zod が弾く。
    // 来られなかった以上「また会いたい/会話/マナー」は実質最低という扱いにし、未選択軸は 1 で埋める。
    // 通常評価（noShow=false）では axesComplete を満たすボタンしか活性化しないため、ここでの
    // 補完は noShow=true のときだけ効く（事実ベース・煽らない）。
    const scoreAgain = draft.scoreAgain >= 1 ? draft.scoreAgain : 1;
    const scoreTalk = draft.scoreTalk >= 1 ? draft.scoreTalk : 1;
    const scoreManner = draft.scoreManner >= 1 ? draft.scoreManner : 1;

    const outcome = await submitRating({
      slotId,
      rateeId: member.userId,
      scoreAgain,
      scoreTalk,
      scoreManner,
      comment: draft.comment.trim() ? draft.comment.trim() : undefined,
      noShowReport: draft.noShow,
    });
    if (outcome.ok) {
      patchDraft(member.userId, { sending: false, done: true, error: null });
      // 受領サマリ（3軸）を取り直して静かに反映（自分が受けた評価の集計）。
      try {
        setSummary(await fetchReceivedSummary());
      } catch {
        /* サマリ取得失敗は致命的ではない。送信自体は完了している。 */
      }
    } else {
      patchDraft(member.userId, {
        sending: false,
        error: ratingErrorMessage(outcome.errorCode),
      });
    }
  }

  // 送信可能な未送信の人の数（一括送信ボタンの活性判定）。
  const sendableCount = useMemo(
    () => (event ? event.members.filter((m) => isSendable(drafts[m.userId])).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, drafts],
  );

  const allDone = useMemo(
    () => (event ? event.members.every((m) => drafts[m.userId]?.done) : false),
    [event, drafts],
  );

  async function sendAll() {
    if (!event) return;
    for (const m of event.members) {
      if (isSendable(drafts[m.userId])) {
        // eslint-disable-next-line no-await-in-loop
        await sendOne(m);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader title="きのうの会はいかがでしたか？" backHref="/ratings" serif />
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader title="きのうの会はいかがでしたか？" backHref="/ratings" serif />
        <main className="flex-1 px-5 pt-4">
          <ErrorState onRetry={load} />
        </main>
      </div>
    );
  }

  if (!event) {
    // 該当イベント無し（既に全員評価済み等）。責めず、一覧へ戻す。
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader title="評価" backHref="/ratings" serif />
        <main className="flex-1 px-5 pt-8">
          <Card className="space-y-2">
            <p className="font-sans text-[16px] font-semibold text-ink-900">
              この会の評価はすべて完了しています。
            </p>
            <p className="font-sans text-[14px] leading-relaxed text-ink-500">
              ありがとうございました。ほかに評価のお願いがある場合は一覧に表示されます。
            </p>
            <div className="pt-1">
              <ButtonLink href="/ratings" variant="secondary">
                評価の一覧へ戻る
              </ButtonLink>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  const dateLabel = `${formatDateShort(event.datetime)} ${formatTime(event.datetime)}`;
  const firstMemberId = event.members[0]?.userId;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader title="きのうの会はいかがでしたか？" backHref="/ratings" serif />

      <main className="flex-1 px-5 pb-28 pt-4">
        {/* 会の見出し */}
        <header>
          <p className="font-serif text-[20px] text-ink-900">{areaLabel(event.area)}の会</p>
          <p className="mt-0.5 font-sans text-[13px] tabular-nums text-ink-500">{dateLabel}</p>
        </header>

        {/* 任意・匿名性の明示（caption・先頭）。安心して正直に付けられるように（§4.7 D）。 */}
        <div className="mt-4 rounded-md border border-line-200 bg-bg-sunken px-4 py-3">
          <p className="font-sans text-[13px] leading-relaxed text-ink-700">
            ご一緒した方の印象を、3つの観点で教えてください（任意）。
          </p>
          <p className="mt-1 font-sans text-xs leading-relaxed text-ink-500">
            ※ 評価は相手に個別開示されません。いただいた内容は運営のみが確認します。
          </p>
        </div>

        {/* 同席者ごとの評価 */}
        <section className="mt-7">
          <h2 className="font-sans text-[15px] font-bold text-ink-900">ご一緒した方</h2>
          <p className="mt-0.5 font-sans text-xs text-ink-500">
            付けたい方にだけ付けていただいて構いません。
          </p>

          <ul className="mt-3 space-y-3">
            {event.members.map((m) => {
              const draft = drafts[m.userId] ?? emptyDraft();
              const isFirst = firstMemberId === m.userId;
              return (
                <li key={m.userId}>
                  <Card tone={draft.done ? "sunken" : "surface"} className="space-y-3">
                    {/* ◯アバター + 名前（PII最小: displayName のみ） */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-200 bg-bg-base text-ink-300"
                        >
                          ◯
                        </span>
                        <span className="font-sans text-[16px] text-ink-900">
                          {m.displayName}さん
                        </span>
                      </div>
                      {draft.done ? (
                        <span className="inline-flex items-center gap-1 font-sans text-[13px] font-semibold text-secondary-500">
                          <span aria-hidden>✓</span>送信済み
                        </span>
                      ) : null}
                    </div>

                    {draft.done ? (
                      // 送信後は静かに結果を残す（再送はしない）。
                      <p className="font-sans text-[13px] text-ink-500">
                        {draft.noShow
                          ? "「来なかった」として報告しました。ありがとうございます。"
                          : "評価を送信しました。ありがとうございます。"}
                      </p>
                    ) : (
                      <>
                        {/* 3軸の星（spec 要望4）。来なかった報告中は淡色化して評価を主張しすぎない。 */}
                        <div className={draft.noShow ? "space-y-3 opacity-50" : "space-y-3"}>
                          <StarInput
                            legend="また会いたい"
                            name={`again-${m.userId}`}
                            value={draft.scoreAgain}
                            onChange={(scoreAgain) =>
                              patchDraft(m.userId, { scoreAgain, error: null })
                            }
                            testIdPrefix={isFirst ? "rating-axis-again" : undefined}
                          />
                          <StarInput
                            legend="会話（盛り上がり）"
                            name={`talk-${m.userId}`}
                            value={draft.scoreTalk}
                            onChange={(scoreTalk) =>
                              patchDraft(m.userId, { scoreTalk, error: null })
                            }
                            testIdPrefix={isFirst ? "rating-axis-talk" : undefined}
                          />
                          <StarInput
                            legend="マナー（誠実さ）"
                            name={`manner-${m.userId}`}
                            value={draft.scoreManner}
                            onChange={(scoreManner) =>
                              patchDraft(m.userId, { scoreManner, error: null })
                            }
                            testIdPrefix={isFirst ? "rating-axis-manner" : undefined}
                          />
                        </div>

                        <TextArea
                          label="ひとことあれば（任意・運営のみ確認）"
                          name={`comment-${m.userId}`}
                          rows={2}
                          value={draft.comment}
                          maxLength={COMMENT_MAX}
                          counter={{ value: draft.comment.length, max: COMMENT_MAX }}
                          placeholder="楽しい時間でした、など"
                          onChange={(e) => patchDraft(m.userId, { comment: e.target.value })}
                        />

                        {/* 「来なかった」報告（spec 要望5）。事実ベース・控えめ。罰金は煽らず静かに添える。 */}
                        <div className="space-y-1.5">
                          <CheckboxRow
                            checked={draft.noShow}
                            onChange={(noShow) => patchDraft(m.userId, { noShow, error: null })}
                            data-testid={isFirst ? "noshow-report" : undefined}
                          >
                            この方は来ませんでした（無断欠席の報告）
                          </CheckboxRow>
                          {draft.noShow ? (
                            <p className="px-1 font-sans text-xs leading-relaxed text-ink-500">
                              無断欠席は ¥5,000 のお支払い対象になります。複数の方の報告で確認します。
                            </p>
                          ) : null}
                        </div>

                        {draft.error ? (
                          // 責めない注意（warn 系）。danger=赤の強い否定にはしない（§8）。
                          <p
                            role="alert"
                            className="rounded-md border border-state-warn/45 bg-[#F7EFD9] px-3 py-2 font-sans text-[13px] text-state-warn"
                          >
                            {draft.error}
                          </p>
                        ) : null}

                        <Button
                          variant="secondary"
                          disabled={!isSendable(draft)}
                          onClick={() => void sendOne(m)}
                        >
                          {draft.sending
                            ? "送信中…"
                            : draft.noShow && !axesComplete(draft)
                              ? `${m.displayName}さんの報告を送信`
                              : `${m.displayName}さんの評価を送信`}
                        </Button>
                      </>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 送信後の受領サマリ（3軸・静かに・煽らない）。 */}
        {summary && summary.count > 0 ? (
          <div className="mt-6 rounded-md border border-line-200 bg-bg-surface px-4 py-3">
            <p className="mb-2 font-sans text-[13px] text-ink-700">
              ありがとうございます。あなたが受け取った評価
            </p>
            <MultiAxisSummary
              again={summary.again}
              talk={summary.talk}
              manner={summary.manner}
              overall={summary.overall}
              count={summary.count}
            />
          </div>
        ) : null}
      </main>

      {/* フッタ: まとめて送信 / スキップ。一括送信は送信可能な未送信者がいるときのみ活性。 */}
      <div className="sticky bottom-0 space-y-2 border-t border-line-200 bg-bg-surface px-5 py-3 shadow-md">
        {allDone ? (
          <ButtonLink href="/ratings" data-testid="rating-submit">
            評価の一覧へ戻る
          </ButtonLink>
        ) : (
          <>
            <Button
              data-testid="rating-submit"
              disabled={sendableCount === 0}
              onClick={() => void sendAll()}
            >
              {sendableCount > 0 ? `評価を送信する（${sendableCount}名）` : "評価を送信する"}
            </Button>
            <ButtonLink href="/ratings" variant="text">
              スキップ
            </ButtonLink>
          </>
        )}
      </div>
    </div>
  );
}
