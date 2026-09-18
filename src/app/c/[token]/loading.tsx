export default function Loading() {
  return (
    <main
      className="flex min-h-svh items-center justify-center bg-grayscale-70 px-5"
      role="status"
    >
      <div className="text-center">
        <div
          className="mx-auto mb-4 size-9 animate-spin rounded-full border-4 border-primary-100 border-t-primary-500"
          aria-hidden="true"
        />
        <p className="text-body-1 text-grayscale-600">
          잠시만요, 체크인을 준비하고 있어요
        </p>
      </div>
    </main>
  );
}
