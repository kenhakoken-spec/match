# rendez 画面遷移ボード（レビュー用 / Figma代替）

> **このページの見方**: ① まず下の「画面遷移図」（GitHub上で図として描画されます）で全体の流れと**制限ゲート**を把握 → ② その下の「実画面ギャラリー」で各画面の実物を遷移順に確認 → ③ FBは [SPEC.md](SPEC.md) の各画面チェック欄へ。
> スマホ縦（LIFF）が主。adminはPC。**赤い菱形＝通過制限（ゲート）**です。

---

## 1. 画面遷移図（全体・コアループ0〜9）

```mermaid
flowchart TD
    classDef screen fill:#FBF7F0,stroke:#C2703D,color:#2B2622;
    classDef admin fill:#ECEEF2,stroke:#3F5168,color:#2B2622;
    classDef gate fill:#F6E7DC,stroke:#B0463C,color:#2B2622;
    classDef noti fill:#E7EDE6,stroke:#5E7A57,color:#2B2622;

    U00["U-00 LINEログイン"]:::screen
    U01["U-01 オンボ＋規約同意"]:::screen
    U12["U-12 本人認証 提出<br/>(身分証/承認後削除)"]:::screen
    U13["U-13 審査中/承認/却下"]:::screen
    A09{"A-09 運営審査<br/>承認/却下"}:::admin
    G_ID{"🔒ゲート①<br/>本人認証 承認済?<br/>(18歳以上)"}:::gate
    U02["U-02 プロフィール登録<br/>(性別/生年月日/写真/エリア)"]:::screen
    U04["U-04 枠一覧<br/>(条件バッジ/充足/料金)"]:::screen
    U05["U-05 枠詳細"]:::screen
    G_COND{"🔒ゲート②<br/>参加条件<br/>20代限定/優良バッジ限定/性別空き"}:::gate
    U06["U-06 応募確認<br/>(男性に料金/初回無料予告)"]:::screen
    NG["U-E 応募不可<br/>(理由提示・淡色)"]:::screen
    U07["U-07 マイ応募状況"]:::screen
    FORM{{"成立判定<br/>男3・女3 充足"}}:::admin
    G_PAY{"🔒ゲート③<br/>性別/初回判定"}:::gate
    U14["U-14 決済 ¥2,000<br/>(初回無料/女性無料)"]:::screen
    A04["A-04 成立確認"]:::admin
    A05["A-05 会場入力＆通知送信<br/>(店名/予約URL/予約名/集合)"]:::admin
    NOTI(("📨 6名へLINE通知<br/>会場情報")):::noti
    U08["U-08 成立詳細<br/>(会場/メンバー6名)"]:::screen
    EVENT["当日集合（オフライン・チャット無し）"]:::screen
    DONE["A-05 開催完了"]:::admin
    RNOTI(("📨 評価のお願い")):::noti
    U15["U-15 相互評価<br/>(星1-5/任意/匿名)"]:::screen
    BADGE{{"優良バッジ判定<br/>平均4.0&件数5&参加2回"}}:::admin
    U10["U-10 マイページ<br/>(評価/優良バッジ)"]:::screen

    U00 --> U01 --> U12 --> U13
    U13 -.提出.-> A09
    A09 -->|承認| G_ID
    A09 -->|却下/理由| U12
    G_ID -->|OK| U02
    U02 --> U04 --> U05 --> G_COND
    G_COND -->|条件OK| U06 --> U07
    G_COND -->|条件NG| NG --> U04
    U07 -.エントリー.-> FORM
    FORM ==>|成立| G_PAY
    G_PAY -->|男性・2回目以降| U14 --> A04
    G_PAY -->|男性初回/女性=無料| A04
    A04 --> A05 ==> NOTI --> U08
    U08 --> EVENT --> DONE
    DONE ==> RNOTI --> U15 ==> BADGE
    BADGE -.付与.-> U10
    U15 -->|完了| U04
```

---

## 2. 制限（ゲート）早見 — 仕様の肝

| ゲート | 条件 | 通らないと | 該当画面 |
|--------|------|-----------|----------|
| 🔒① 本人認証 | 公的身分証→運営承認（18歳以上確認） | **応募不可**。未認証は U-05 の応募ボタンが無効 | U-12/U-13/A-09 |
| 🔒② 参加条件 | 性別の空き＋（20代限定なら年齢20-29）＋（優良バッジ限定ならバッジ保有） | 応募不可UI（淡色＋理由・赤エラーにしない） | U-04/U-05 |
| 🔒③ 決済 | 男性2回目以降は¥2,000／女性・男性初回は無料／不成立は非課金 | 男性2回目以降は未決済だと参加確定しない | U-14 |

> すべて**サーバ側で再判定**（クライアント表示を信用しない）。応募の不可理由コード: `identity_required / profile_required / age_out_of_range / badge_required / gender_full / already_applied / slot_closed`

---

## 3. 実画面ギャラリー（遷移順・スマホ縦）

> 画像は実際にビルドしたアプリのスクリーンショットです（モックデータ）。

### STEP 0｜ログイン → 本人認証
| U-00 ログイン | U-01 オンボ＋規約 | U-12 本人認証提出 |
|---|---|---|
| ![U-00](screens/U-00_login.png) | ![U-01](screens/U-01_onboarding_slide1.png) | ![U-12](screens/U-12_identity_upload.png) |

| U-13 審査中 | U-13 承認 | U-13 却下（再提出） |
|---|---|---|
| ![pending](screens/U-13_identity_pending.png) | ![approved](screens/U-13_identity_approved.png) | ![rejected](screens/U-13_identity_rejected.png) |

### STEP 1-3｜プロフィール → 枠一覧 → 応募
| U-02 プロフィール登録 | U-04 枠一覧（条件/充足/料金） | U-05 枠詳細（応募可） |
|---|---|---|
| ![U-02](screens/U-02_profile_new.png) | ![U-04](screens/U-04_browse.png) | ![U-05ok](screens/u05-detail-eligible.png) |

| U-05 応募不可（条件不足） | U-06 応募確認 | U-07 マイ応募状況 |
|---|---|---|
| ![U-05ng](screens/u05-detail-ineligible.png) | ![U-06](screens/u06-apply-confirm.png) | ![U-07](screens/U-07_applications.png) |

### STEP 5-9｜決済 → 成立詳細 → 評価 → バッジ
| U-10 マイページ（優良バッジ表示） |
|---|
| ![U-10](screens/U-10_mypage.png) |

> **U-14 決済 / U-08 成立詳細 / U-15 相互評価** の実画面スクショは未取得（ブラウザ自動撮影が本環境(WSL)で不安定なため）。
> レイアウトは [wireframes.md](design/wireframes.md)（U-14/U-08/U-15）、規約は [design-system.md](design/design-system.md) §4.7C(決済UI)・§4.7D(星評価) を参照。実装は完了済み（tsc/test/build green）。

### 運営admin（PC）
| A-02 枠作成（参加条件設定） |
|---|
| ![A-02](screens/a02-admin-slots.png) |

> **A-04 成立確認 / A-05 会場入力＆通知 / A-10 バッジ付与状況** の実画面スクショは未取得。レイアウトは [wireframes.md](design/wireframes.md)（A-04/A-05/A-10）を参照。実装は完了済み。

---

## 4. デザインの方向（“AIっぽさ”を排した編集的トーン）
- 生成りのオフホワイト地＋テラコッタ1アクセント、明朝見出し×ゴシック本文、細ボーダー主体。
- 避ける: 紫グラデ/ネオン/絵文字過多/量産SaaS構図/煽りコピー。
- 状態は色だけに頼らずラベル＋形状を併記（アクセシビリティ）。
- 詳細: [design/design-system.md](design/design-system.md)

---

## 5. FBの出し方
- 画面IDを添えて（例: 「U-05 の応募不可文言を変えたい」「A-05 に予約確認の再送ボタンが欲しい」）。
- 遷移・制限の変更（例: 本人認証を任意に／課金額変更／エリア追加／チャット追加）は [SPEC.md](SPEC.md) 末尾にまとめて。
