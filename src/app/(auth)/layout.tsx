export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <span>🔁</span>
          <span>リピトル</span>
        </div>
        <p className="text-sm text-muted-foreground">
          飲食店のリピーターを増やすLINE CRM
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
