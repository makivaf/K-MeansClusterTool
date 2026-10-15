import type { MethodResult } from "../../../../packages/shared/src/methodExecution";
import { CommonSpaceValidation } from "./CommonSpaceValidation";
export function ControlledSopEvidence({ standard, enhanced, comparison, sop }: {
  standard: MethodResult; enhanced: MethodResult; comparison: MethodResult; sop: "sop1" | "sop2" | "sop3";
}) {
  if (sop === "sop2" || !standard.standard || !enhanced.enhanced) return null;
  return <section className="sop-support-card">
    <CommonSpaceValidation comparison={comparison} standardK={standard.standard.selectedK} enhancedK={enhanced.enhanced.selectedK} experiment={sop} />
  </section>;
}
