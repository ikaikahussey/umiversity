import { AuthView } from "@neondatabase/auth/react/ui";
import { authViewPaths } from "@neondatabase/auth/react/ui/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({ params }: PageProps<"/auth/[path]">) {
  const { path } = await params;
  return (
    <main className="mx-auto flex max-w-md flex-col items-center p-6">
      <AuthView path={path} />
    </main>
  );
}
