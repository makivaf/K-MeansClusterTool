import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
export function ExpandPanel({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (expanded) dialog.current?.showModal(); }, [expanded]);
  const close = () => { setExpanded(false); button.current?.focus(); };
  return <div className="expand-panel">
    <button ref={button} type="button" className="expand-panel-button" aria-label="Expand" title={`Expand ${title}`} onClick={() => setExpanded(true)}><Maximize2 size={16} aria-hidden="true" /></button>
    {children}
    <dialog ref={dialog} className="expanded-panel-dialog" aria-label={title} onClose={close} onCancel={close}>
      {expanded && <><header><h2 className="section-title">{title}</h2><button type="button" aria-label="Close" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button></header><div className="expanded-panel-content">{children}</div></>}
    </dialog>
  </div>;
}
