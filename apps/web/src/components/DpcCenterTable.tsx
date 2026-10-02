import { formatContinuous, formatInteger } from "../utils/numberFormatting";
type DpcCenter = {
  center: number;
  candidateId?: string;
  rid?: string;
  rho: number;
  delta: number;
  gamma: number;
};

// Use a verified RID when supplied; never interpret candidate rank as an RID.
export const DpcCenterTable = ({ centers }: { centers: readonly DpcCenter[] }) => <div
  className="overflow-x-auto" role="region" aria-label="Selected DPC centers" tabIndex={0}>
  <table className="research-table dpc-center-table">
    <colgroup><col style={{ width: "14%" }} /><col style={{ width: "26%" }} /><col style={{ width: "16%" }} /><col style={{ width: "22%" }} /><col style={{ width: "22%" }} /></colgroup>
    <thead><tr><th scope="col">Center</th><th scope="col">{centers.some(center => center.rid) ? "RID" : centers.some(center => center.candidateId) ? "Candidate ID" : "RID"}</th><th scope="col">ρ</th><th scope="col">δ</th><th scope="col">γ = ρ × δ</th></tr></thead>
    <tbody>{centers.map(center => <tr key={center.center}>
      <th scope="row"><span className="dpc-center-star" aria-hidden="true">★</span><span className="sr-only">Selected center </span>{center.center}</th>
      <td>{center.rid ?? center.candidateId ?? <span className="text-muted">Unavailable</span>}</td>
      <td>{Number.isInteger(center.rho) ? formatInteger(center.rho) : formatContinuous(center.rho)}</td>
      <td>{formatContinuous(center.delta)}</td><td className="dpc-center-gamma">{formatContinuous(center.gamma)}</td>
    </tr>)}</tbody>
  </table>
</div>;
