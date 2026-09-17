import { AuthForm } from "@/features/profile/auth-form";
import { loginReturnPath } from "@/features/profile/login-return";
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return <AuthForm mode="login" returnTo={loginReturnPath(query.next)} sessionExpired={query.reason === "session-expired"} />;
}
