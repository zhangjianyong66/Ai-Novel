import { KeyRound, RotateCcw, Save } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useToast } from "../components/ui/toast";
import { ApiError } from "../services/apiClient";
import { changeOwnPassword } from "../services/accountSecurityApi";
import { validateChangePasswordForm, type ChangePasswordForm } from "./accountSecurity";

const emptyForm: ChangePasswordForm = {
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
};

function passwordChangeErrorMessage(error: ApiError | null): string {
  if (!error) return "密码修改失败";
  if (error.status === 401 && error.message !== "旧密码错误") return "当前账号没有本地密码，不能在这里修改";
  return `${error.message} (${error.code})`;
}

export function AccountSecurityPage() {
  const toast = useToast();
  const [form, setForm] = useState<ChangePasswordForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const validationError = useMemo(() => validateChangePasswordForm(form), [form]);
  const canSubmit = !saving && validationError === null;

  const reset = useCallback(() => {
    setForm(emptyForm);
    setInlineError(null);
  }, []);

  const submit = useCallback(async () => {
    const nextValidationError = validateChangePasswordForm(form);
    if (nextValidationError) {
      setInlineError(nextValidationError);
      return;
    }

    setSaving(true);
    setInlineError(null);
    try {
      await changeOwnPassword({ oldPassword: form.oldPassword, newPassword: form.newPassword });
      setForm(emptyForm);
      toast.toastSuccess("密码已修改");
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      const message = passwordChangeErrorMessage(err);
      setInlineError(message);
      toast.toastError(message, err?.requestId);
    } finally {
      setSaving(false);
    }
  }, [form, toast]);

  return (
    <div className="grid gap-4">
      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <div className="flex items-center gap-2 font-content text-xl">
              <KeyRound size={20} />
              账户安全
            </div>
            <div className="text-xs text-subtext">修改当前登录用户的本地密码。修改成功后当前会话继续有效。</div>
          </div>
        </div>
      </section>

      <section className="panel max-w-2xl p-6">
        <div className="grid gap-1">
          <div className="font-content text-lg">修改密码</div>
          <div className="text-xs text-subtext">需要输入当前密码；新密码至少 8 位。</div>
        </div>

        <form
          className="mt-4 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="grid gap-1">
            <span className="text-xs text-subtext">当前密码</span>
            <input
              className="input"
              name="current_password"
              type="password"
              autoComplete="current-password"
              value={form.oldPassword}
              onChange={(e) => setForm((v) => ({ ...v, oldPassword: e.target.value }))}
              placeholder="请输入当前密码"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-subtext">新密码</span>
            <input
              className="input"
              name="new_password"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => setForm((v) => ({ ...v, newPassword: e.target.value }))}
              placeholder="请输入新密码"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-subtext">确认新密码</span>
            <input
              className="input"
              name="confirm_new_password"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setForm((v) => ({ ...v, confirmPassword: e.target.value }))}
              placeholder="请再次输入新密码"
            />
          </label>

          {inlineError ? (
            <div className="callout-danger text-sm" role="alert">
              {inlineError}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn btn-secondary" type="button" onClick={reset} disabled={saving}>
              <RotateCcw size={16} />
              清空
            </button>
            <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
              <Save size={16} />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
