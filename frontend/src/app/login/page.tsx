import { AuthForm } from "@/features/profile/auth-form";
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return <AuthForm mode="login" sessionExpired={query.reason === "session-expired"} />;
}
