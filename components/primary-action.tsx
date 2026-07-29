/** The one fixed, bottom-right, unmissable action a screen is allowed. Same position everywhere. */
export default function PrimaryAction({ children }: { children: React.ReactNode }) {
  return <div className="fixed bottom-5 right-5 z-40 sm:bottom-8 sm:right-8">{children}</div>;
}
