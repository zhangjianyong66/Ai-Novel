export type ChangePasswordForm = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function validateChangePasswordForm(form: ChangePasswordForm): string | null {
  if (!form.oldPassword) return "请输入当前密码";
  if (form.newPassword.length < 8) return "新密码至少 8 位";
  if (form.newPassword !== form.confirmPassword) return "两次输入的新密码不一致";
  return null;
}
