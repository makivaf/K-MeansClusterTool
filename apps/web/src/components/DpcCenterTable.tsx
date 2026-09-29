type DpcCenter = {
  center: number;
  candidateId?: string;
  rho: number;
  delta: number;
  gamma: number;
};

// Candidate IDs are not RIDs. Simulation results supply only center order.
export const DpcCenterTable = ({ centers }: { centers: readonly DpcCenter[] }) => <div
  className="overflow-x-auto" role="region" aria-label="Selected DPC centers" tabIndex={0}>
  <table className="research-table dpc-center-table">
    <colgroup><col style={{ width: "14%" }} /><col style={{ width: "26%" }} /><col style={{ width: "16%" }} /><col style={{ width: "22%" }} /><col style={{ width: "22%" }} /></colgroup>
    <thead><tr><th scope="col">Center</th><th scope="col">{centers.some(center => center.candidateId) ? "Candidate ID" : "RID"}</th><th scope="col">ρ</th><th scope="col">δ</th><th scope="col">γ = ρ × δ</th></tr></thead>
    <tbody>{centers.map(center => <tr key={center.center}>
      <th scope="row"><span className="dpc-center-star" aria-hidden="true">★</span><span className="sr-only">Selected center </span>{center.center}</th>
      <td>{center.candidateId ?? <span className="text-muted">Unavailable</span>}</td>
      <td>{center.rho.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
      <td>{center.delta.toFixed(4)}</td><td className="dpc-center-gamma">{center.gamma.toFixed(4)}</td>
    </tr>)}</tbody>
  </table>
</div>;
