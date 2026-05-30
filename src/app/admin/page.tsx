// /admin → 枠管理(A-02) へ。admin の既定画面。
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/slots");
}
