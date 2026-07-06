import { apiJson } from "./apiClient";

export type ChangeOwnPasswordInput = {
  oldPassword: string;
  newPassword: string;
};

export async function changeOwnPassword(input: ChangeOwnPasswordInput): Promise<void> {
  await apiJson<Record<string, never>>("/api/auth/password/change", {
    method: "POST",
    body: JSON.stringify({
      old_password: input.oldPassword,
      new_password: input.newPassword,
    }),
  });
}
