import { redirectSignedInUser } from "@/lib/auth/route-guards";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export default async function AuthLayout({ children }: AuthLayoutProps) {
  await redirectSignedInUser();

  return children;
}
