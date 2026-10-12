import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
export const T = { teal: "#0F766E", slate: "#64748B", negative: "#9A3412", zero: "#F8FAFC", positive: "#155E75", c0: "#3B6EA8", c1: "#E58A00" };
export function MethodPill({ kind, children }: { kind: "standard" | "enhanced" | "intermediate"; children?: ReactNode }) {
  return <span className={`final-pill ${kind}`}>{children ?? (kind === "standard" ? "Standard K-Means" : kind === "enhanced" ? "Enhanced K-Means" : "PCA + random")}</span>;
}
export function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="final-dialog final-ui" aria-label={title} onCancel={event => { event.preventDefault(); close(); }} onClose={close}>
    <header><h3>{title}</h3><button type="button" aria-label="Close" onClick={close}><X size={18} /></button></header>{children}
  </dialog>;
}
export function Panel({ title, kind, children, expand = true }: { title: string; kind?: "standard" | "enhanced" | "intermediate"; children: ReactNode; expand?: boolean }) {
  const [opened, setOpened] = useState(false);
  return <section className="final-card"><header><div>{kind && <MethodPill kind={kind} />}<h3>{title}</h3></div>
    {expand && <button type="button" className="final-expand" aria-label={`Expand ${title}`} onClick={() => setOpened(true)}><Maximize2 size={16} /></button>}</header>
    {children}{opened && <Dialog title={title} close={() => setOpened(false)}><div style={{ minWidth: "min(760px,80vw)" }}>{children}</div></Dialog>}
  </section>;
}
